import { UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { tabs, type TabsController } from "@ui-sdk/core/tabs";
import { Schema } from "effect";
import { defined, drawn, emit, handle, shown, whilePresent } from "./renderer/primitive.ts";

/** Why the selection asks to change: a press, an arrow key, find in page, a tab that left, or a controller. */
const Reason = Schema.String;

/** A tab's value, or null for no tab. */
const Value = Schema.NullOr(Schema.String);

// A controller is a proxy with no shape to check: its methods exist only once it's attached.
const Controller = Schema.declare((u): u is TabsController => typeof u === "object" && u !== null, {
  expected: "TabsController",
});

export const TabsProps = Schema.Struct({
  /** The selected tab's value. Pass it to decide: a press then only asks, with `RequestedValue`. */
  value: Schema.optional(Value),
  /**
   * The tab selected at first, when `value` is left out and the tabs keep the
   * value themselves. Left out too, the first enabled tab is selected, which
   * requests nothing.
   */
  initialValue: Schema.optional(Value),
  orientation: Schema.optional(Schema.Literals(["horizontal", "vertical"])),
  /** `"automatic"` selects a tab as soon as arrow keys focus it, the default. `"manual"` waits for Enter or Space. */
  activation: Schema.optional(Schema.Literals(["automatic", "manual"])),
  /** Whether arrow keys wrap from the last tab to the first. On by default. */
  loop: Schema.optional(Schema.Boolean),
  /** Keeps hidden panels in the page as `hidden="until-found"`, so find in page can match their text and select their tab. */
  hiddenUntilFound: Schema.optional(Schema.Boolean),
  /** Selects tabs from anywhere, like a shortcut. Make one with `createTabsController()`. */
  controller: Schema.optional(Controller),
});

export const TabsModel = Schema.Struct({
  /**
   * The value, while the props leave `value` out: `initialValue`, then the
   * tab last asked for. While it's null, tabs made from it show the first
   * enabled tab selected, so tabs asked for no tab start there again once
   * their parts have left the page and come back.
   */
  value: Value,
  /** Counts core's own changes, each of which renders again. */
  revision: Schema.Number,
});

export const TabsMessage = UiSchema.TaggedEnum({
  /** Core asked to select another tab. */
  RequestedValue: { value: Value, reason: Reason },
  /** Core changed what a part shows on its own, like the tab stop, or a panel that finished leaving. */
  ChangedPart: {},
});

export const TabsEvents = UiSchema.TaggedEnum({
  /**
   * A press, an arrow key, find in page, a selected tab that left, or a
   * controller asked for another tab. With `value` in the props, pass the new
   * value back to accept it, or keep the old one to refuse. Without, the tabs
   * have already taken it.
   */
  RequestedValue: { value: Value, reason: Reason },
});

/** One tab, as the consumer's `view` passes it to `tabs.tab`. */
export const TabsTab = Schema.Struct({
  /** Names the tab, and pairs it with the panel of the same value. */
  value: Schema.String,
  /** Keeps the tab focusable and stops it from being selected. */
  disabled: Schema.optional(Schema.Boolean),
  /** An id of your own for the tab's element, which its panel then points at. */
  id: Schema.optional(Schema.String),
});
export type TabsTab = typeof TabsTab.Type;

/** One panel, as the consumer's `view` passes it to `tabs.panel`. */
export const TabsPanel = Schema.Struct({
  /** The value of the tab it belongs to. */
  value: Schema.String,
  /** Whether it stays in the page, hidden, while its tab isn't selected. */
  keepMounted: Schema.optional(Schema.Boolean),
  /** Whether it stays findable with `hidden="until-found"` while its tab isn't selected. Overrides the tabs'. */
  hiddenUntilFound: Schema.optional(Schema.Boolean),
  /** An id of your own for the panel's element, which its tab then points at. */
  id: Schema.optional(Schema.String),
});
export type TabsPanel = typeof TabsPanel.Type;

/**
 * Layered sections of content, one shown at a time. Headless: apply
 * `tabs.root` to the element around everything, `tabs.list` to the one around
 * the tabs, `tabs.tab` to each tab's, and `tabs.panel` to each panel's.
 *
 * Draw the tabs before the panels, and in the order they appear. Until the
 * tabs are in the page, like on a server, tabs without a value show the
 * first enabled tab selected, which is the first one drawn or asked about
 * with `tabs.tabState`.
 *
 * Give each panel's element a `key`. Panels come and go beside each other,
 * and Effect UI pairs elements without a key by position, so one panel
 * would take over another's element.
 */
export const Tabs = Html.component({
  name: "Tabs",
  props: TabsProps,
  model: TabsModel,
  message: TabsMessage,
  events: TabsEvents,
}).make({
  init: ($) => ({ value: $.props.initialValue ?? null, revision: 0 }),
  update: ($, message) =>
    TabsMessage.match(message, {
      RequestedValue: (request) =>
        ($.props.value === undefined ? $.evolve({ value: request.value }) : $).emit(
          TabsEvents.RequestedValue(request),
        ),
      ChangedPart: () => $.evolve({ revision: (count) => count + 1 }),
    }),
  parts: (p, model) => {
    const { value, initialValue: _, ...settings } = p.props;
    const instance = handle(p.id("tabs"), tabs, {
      ...defined(settings),
      ...(value === undefined ? { defaultValue: model.value } : { value }),
      onValueChange: (value, details) =>
        emit(instance, TabsMessage.RequestedValue({ value, reason: details.reason })),
    });
    const changed = TabsMessage.ChangedPart();
    const root = shown(instance, "root", {});
    const list = shown(instance, "list", {});
    const tab = ({ id, ...props }: TabsTab) => shown(instance, "tab", defined(props), { id });
    const panel = p.part((builder, panel: ReturnType<typeof shown<typeof tabs, "panel">>) =>
      drawn(builder, panel, changed),
    );
    return {
      /** The selected tab's value as this render shows it. Null for tabs without a value until they're in the page, while the first enabled tab stands in. */
      value: root.state.value,
      orientation: root.state.orientation,
      /** Which way the last selection moved, on screen. */
      direction: root.state.direction,
      root: p.part((builder) => drawn(builder, root, changed)),
      /** The tab list, with one tab stop and arrow keys between its tabs. */
      list: p.part((builder) => drawn(builder, list, changed)),
      /** A tab: a `button`, a link, or any other element. */
      tab: p.part((builder, item: TabsTab) => drawn(builder, tab(item), changed)),
      /** Whether a tab is selected and whether it's disabled, as this render shows it. */
      tabState: (item: TabsTab) => tab(item).state,
      /** An icon inside a tab, hidden from screen readers. `mirror` flips it in right-to-left text. */
      tabIcon: p.part((builder, icon: { readonly mirror?: boolean } = {}) =>
        drawn(builder, shown(instance, "tab-icon", defined(icon)), changed),
      ),
      /** Marks the selected tab. Its box comes from the `--active-tab-*` variables, measured from the tab list. */
      indicator: p.part((builder, indicator: { readonly followHover?: boolean } = {}) =>
        drawn(builder, shown(instance, "indicator", defined(indicator)), changed),
      ),
      /**
       * The content of the tab with the same value. It gives nothing while
       * its tab isn't selected, so chain on it with `?.`:
       * `tabs.panel(h.div.key(value), { value })?.children(...)`. Pass
       * `keepMounted` to get a hidden element instead.
       */
      panel: whilePresent(panel, ({ id, ...props }: TabsPanel) =>
        shown(instance, "panel", defined(props), { id }),
      ),
    };
  },
});

export { createTabsController, type TabsController } from "@ui-sdk/core/tabs";
