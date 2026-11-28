import { UiSchema, View } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { formatShortcut } from "@ui-sdk/core";
import {
  menu,
  type MenuCheckboxItemProps,
  type MenuContentProps,
  type MenuController,
  type MenuItemProps,
  type MenuOptions,
  type MenuRadioItemProps,
  type MenuTriggerProps,
} from "@ui-sdk/core/menu";
import { menuCheckable } from "@ui-sdk/core/renderer";
import { Schema } from "effect";
import {
  defined,
  drawn,
  emit,
  handle,
  held,
  holding,
  instanceOf,
  reading,
  shown,
  whilePresent,
  type Handle,
  type Shown,
} from "./renderer/primitive.ts";

/** Why a menu asks to open or close, or an item to change: a press, a key, a press outside, or a controller. */
const Reason = Schema.String;

// A controller is a proxy with no shape to check: its methods exist only once it's attached.
const Controller = Schema.declare((u): u is MenuController => typeof u === "object" && u !== null, {
  expected: "MenuController",
});

const Container = Schema.declare(
  (u): u is Element | DocumentFragment => typeof u === "object" && u !== null,
  { expected: "Element" },
);

export const MenuProps = Schema.Struct({
  /** Whether it's open. Pass it to decide: a press then only asks, with `RequestedOpen`. */
  open: Schema.optional(Schema.Boolean),
  /** Whether it starts open, when `open` is left out and the menu keeps the value itself. */
  initialOpen: Schema.optional(Schema.Boolean),
  /** Whether arrow keys wrap from the last item to the first. On by default. */
  loop: Schema.optional(Schema.Boolean),
  /** Milliseconds the pointer rests on a submenu's trigger before the submenu opens. 100 by default. */
  delay: Schema.optional(Schema.Number),
  /** `"sheet"` slides it up from the bottom of the screen, and `"auto"` does on small touch screens. `"popover"` by default. */
  presentation: Schema.optional(Schema.Literals(["popover", "sheet", "auto"])),
  /**
   * `"pointer"`, the default, has a press outside only close the menu. `true`
   * also locks scroll and makes the rest of the page inert. `false` lets a
   * press outside reach what it hits.
   */
  modal: Schema.optional(Schema.Union([Schema.Boolean, Schema.Literal("pointer")])),
  /** Whether Escape and a press outside close it. On by default. */
  dismissible: Schema.optional(Schema.Boolean),
  /**
   * Where the content goes instead of where the view draws it. It has to be
   * inside the element the app is mounted on, where Effect UI hears events.
   * Submenus stay inside their menu, and a sheet stays where it's drawn.
   */
  container: Schema.optional(Container),
  /** Opens and closes it from anywhere, like a shortcut. Make one with `createMenuController()`. */
  controller: Schema.optional(Controller),
});

/**
 * The keys of the submenus from the menu down to the one an item is in, as
 * `menu.sub` takes them, and empty for the menu itself. It tells apart items
 * with the same value in two of them, which are two items.
 */
const Path = Schema.Array(Schema.String);

export const MenuModel = Schema.Struct({
  /** Whether it's open, while the props leave `open` out. */
  open: Schema.Boolean,
  /**
   * Each checkbox item a press has changed, by the menu it is in, as
   * `levelOf` names its path, then by its value. An item given `checked`
   * shows that instead.
   */
  checked: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Boolean)),
  /** Each radio group a press has changed, by the menu it is in, then by its name. A group given `value` shows that instead. */
  values: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.String)),
  /** Counts core's own changes, each of which renders again. */
  revision: Schema.Number,
});

export const MenuMessage = UiSchema.TaggedEnum({
  /** Core asked to open or close the menu. */
  RequestedOpen: { open: Schema.Boolean, reason: Reason },
  /** An item with a value ran, in the menu or one of its submenus. */
  Picked: { value: Schema.String },
  /** Core asked to check or uncheck a checkbox item of the menu at `path`. */
  RequestedChecked: { path: Path, value: Schema.String, checked: Schema.Boolean, reason: Reason },
  /** Core asked for another item of a radio group of the menu at `path`. */
  RequestedValue: { path: Path, group: Schema.String, value: Schema.String, reason: Reason },
  /** Core changed what a part shows on its own, like the highlight, or content that finished leaving. */
  ChangedPart: {},
});

export const MenuEvents = UiSchema.TaggedEnum({
  /**
   * A press, a key, a press outside or a controller asked to open or close
   * the menu. With `open` in the props, pass the new value back to accept
   * it, or keep the old one to refuse. Without, the menu has already taken it.
   */
  RequestedOpen: { open: Schema.Boolean, reason: Reason },
  /** A person ran an item, in the menu or one of its submenus. The menu closes, unless the item has `closeOnSelect: false`. */
  Picked: { value: Schema.String },
  /**
   * A person pressed a checkbox item. Pass the item its new `checked` to
   * accept it, or keep the old one to refuse. An item without `checked` has
   * already taken it.
   */
  RequestedChecked: { path: Path, value: Schema.String, checked: Schema.Boolean, reason: Reason },
  /**
   * A person chose an item of a radio group. Pass the group its new `value`
   * to accept it, or keep the old one to refuse. A group without `value` has
   * already taken it.
   */
  RequestedValue: { path: Path, group: Schema.String, value: Schema.String, reason: Reason },
});

/** A menu's button, or the item that opens a submenu, as the consumer's `view` passes it to `menu.trigger`. */
export type MenuTrigger = Pick<MenuTriggerProps, "disabled" | "focusableWhenDisabled" | "shortcut">;

/** A menu's popup, as the consumer's `view` passes it to `menu.content`. */
export type MenuContent = MenuContentProps;

/**
 * An action, as the consumer's `view` passes it to `menu.item`. Its `value`
 * names it among the menu's items and arrives in `Picked`. An item without
 * one takes an `id`, and reports no press. Each is the menu's one item of
 * that name: two items given the same are one item to core.
 */
export type MenuItem = Omit<MenuItemProps, "onSelect" | "value"> &
  (
    | { readonly value: string; readonly id?: string }
    | { readonly value?: undefined; readonly id: string }
  );

/** An item that checks and unchecks an option, as the consumer's `view` passes it to `menu.checkboxItem`. */
export type MenuCheckboxItem = Omit<MenuCheckboxItemProps, "defaultChecked" | "onCheckedChange"> & {
  /** Whether it starts checked, when `checked` is left out and the menu keeps the value itself. */
  readonly initialChecked?: boolean;
};

/** Radio items that share one value, as the consumer's `view` passes them to `menu.radioGroup`, and each of their items its group. */
export type MenuRadioGroup = {
  /** Names the group among the menu's, and arrives in `RequestedValue`. */
  readonly name: string;
  /** The checked item's value, or null for none. Pass it to decide: a press then only asks, with `RequestedValue`. */
  readonly value?: string | null;
  /** The item checked at first, when `value` is left out and the menu keeps the value itself. */
  readonly initialValue?: string | null;
};

/** One item of a radio group, as the consumer's `view` passes it to `menu.radioItem`. */
export type MenuRadioItem = Omit<MenuRadioItemProps, "group"> & { readonly group: MenuRadioGroup };

/** A submenu, as the consumer's `view` passes it to `menu.sub`. It keeps whether it's open itself. */
export type MenuSub = Pick<MenuOptions, "loop" | "delay"> & {
  /** Names the submenu among the ones of its menu. */
  readonly key: string;
};

/** Names the menu at a path, in its instance's id and in the Model. A key may hold any character. */
const levelOf = (path: ReadonlyArray<string>) => JSON.stringify(path);

// A record's own entry, and none from its prototype, for a value like `toString`.
const own = <T>(record: Readonly<Record<string, T>> | undefined, key: string) =>
  record && Object.hasOwn(record, key) ? record[key] : undefined;

/** Whether an indicator stays in the page while its item is unchecked. */
type Indicator = { readonly keepMounted?: boolean };

// An element with `attributes` around the element a part is applied to. No message goes through it.
const inside =
  (attributes: Record<string, string | undefined>, tag: "div" | "span" = "div") =>
  (node: unknown): View.Element<never> =>
    View.build(
      (Html.tags[tag] as unknown as View.ElementBuilder<never, never, unknown, unknown>).attrs(
        attributes,
      ),
      [node as View.Element<never>],
    );

/**
 * A list of actions and options, opened from a button. Headless: apply
 * `menu.trigger` to the button, `menu.content` to the popup's element, and
 * `menu.item`, `menu.checkboxItem` or `menu.radioItem` to each item's.
 *
 * `menu.content` gives nothing while the menu is closed, so chain on it with
 * `?.` and give its element a `key`:
 * `menu.content(h.div.key("content"))?.children(...)`.
 *
 * `menu.sub({ key })` gives a submenu's parts, the same ones: apply its
 * `trigger` to an item of the menu around it, and draw its `content` beside
 * that item. The items of a submenu are its own parts, not the menu's.
 */
export const Menu = Html.component({
  name: "Menu",
  props: MenuProps,
  model: MenuModel,
  message: MenuMessage,
  events: MenuEvents,
}).make({
  init: ($) => ({ open: $.props.initialOpen ?? false, checked: {}, values: {}, revision: 0 }),
  update: ($, message) =>
    MenuMessage.match(message, {
      RequestedOpen: (request) =>
        ($.props.open === undefined ? $.evolve({ open: request.open }) : $).emit(
          MenuEvents.RequestedOpen(request),
        ),
      Picked: (picked) => $.emit(MenuEvents.Picked(picked)),
      RequestedChecked: (request) =>
        $.evolve({
          checked: (checked) => {
            const at = levelOf(request.path);
            return { ...checked, [at]: { ...own(checked, at), [request.value]: request.checked } };
          },
        }).emit(MenuEvents.RequestedChecked(request)),
      RequestedValue: (request) =>
        $.evolve({
          values: (values) => {
            const at = levelOf(request.path);
            return { ...values, [at]: { ...own(values, at), [request.group]: request.value } };
          },
        }).emit(MenuEvents.RequestedValue(request)),
      ChangedPart: () => $.evolve({ revision: (count) => count + 1 }),
    }),
  // The instance lives as long as the menu does, so a controller reaches it with no part in the page.
  subscriptions: ($) => held<typeof MenuMessage.Type>($.props.controller),
  parts: (p, model) => {
    const { open, initialOpen: _, container, ...settings } = p.props;
    const changed = MenuMessage.ChangedPart();
    const root: Handle<typeof menu> = handle(p.id("menu"), menu, {
      ...defined(settings),
      ...(open === undefined ? { defaultOpen: model.open } : { open }),
      onOpenChange: (open, details) =>
        emit(root, MenuMessage.RequestedOpen({ open, reason: details.reason })),
      // Core takes a promise an action returns as work the item waits for, so this returns nothing.
      onAction: (value) => {
        emit(root, MenuMessage.Picked({ value }));
      },
    });

    holding(p.props.controller, root);

    // The parts of one menu: the root, or a submenu, whose instance reads the menu around it.
    const level = (instance: Handle<typeof menu>, path: ReadonlyArray<string>) => {
      const nested = path.length > 0;
      // Each menu keeps its own items' values, so the same value in two of them is two items.
      // The item's and the group's own callbacks tell which menu they're in, where the root's would hear every menu's.
      const at = levelOf(path);
      const groupProps = ({ name, value, initialValue }: MenuRadioGroup) => ({
        id: name,
        name,
        ...(value === undefined
          ? defined({ defaultValue: own(own(model.values, at), name) ?? initialValue })
          : { value }),
        onValueChange: (value: string, details: { reason: string }) =>
          emit(
            root,
            MenuMessage.RequestedValue({ path, group: name, value, reason: details.reason }),
          ),
      });
      const checkboxProps = ({ checked, initialChecked, ...props }: MenuCheckboxItem) => ({
        ...defined(props),
        ...(checked === undefined
          ? defined({ defaultChecked: own(own(model.checked, at), props.value) ?? initialChecked })
          : { checked }),
        onCheckedChange: (checked: boolean, details: { reason: string }) =>
          emit(
            root,
            MenuMessage.RequestedChecked({
              path,
              value: props.value,
              checked,
              reason: details.reason,
            }),
          ),
      });
      const radioProps = ({ group, ...props }: MenuRadioItem) => ({
        ...defined(props),
        group: group.name,
      });
      const item = (props: MenuItem) => shown(instance, "item", defined(props));
      const checkboxItem = (item: MenuCheckboxItem) =>
        shown(instance, "checkbox-item", checkboxProps(item), { feature: menuCheckable });
      const radioItem = (item: MenuRadioItem) =>
        shown(instance, "radio-item", radioProps(item), {
          feature: menuCheckable,
          around: { "radio-group": groupProps(item.group) },
        });
      const content = p.part((builder, content: Shown<typeof menu, "content">) => {
        const viewport = nested ? undefined : shown(instance, "viewport", {});
        const sheet = viewport?.present ? viewport : undefined;
        const into = nested || sheet ? undefined : (content.props.container ?? container);
        const popup = drawn(builder, content, changed, { into: into ?? undefined });
        if (sheet) {
          // A sheet sits in a full-screen element, which is what goes to the top layer.
          return popup.forward(inside(defined(sheet.attrs)));
        }
        // The element that stays where Effect UI put it, while the popup is in its container.
        // Not a `div`, which Effect UI would make a sheet's viewport of, with
        // the popup's mount in it, which then never shows the sheet.
        return into ? popup.forward(inside({ style: "display: contents" }, "span")) : popup;
      });
      const indicator = p.part((builder, indicator: Shown<typeof menu, "item-indicator">) =>
        drawn(builder, indicator, changed),
      );
      return {
        /** The button that opens the menu, or the item that opens a submenu. */
        trigger: p.part((builder, trigger: MenuTrigger = {}) =>
          drawn(builder, shown(instance, "trigger", defined(trigger)), changed),
        ),
        /**
         * The popup that holds the items, positioned against its trigger. It
         * gives nothing while the menu is closed, unless `keepMounted`, so
         * chain on it with `?.`.
         */
        content: whilePresent(content, (content: MenuContent = {}) =>
          shown(instance, "content", defined(content)),
        ),
        /** An action. Pressing it emits `Picked` and closes the menu, unless `closeOnSelect` is false. */
        item: p.part((builder, props: MenuItem) => drawn(builder, item(props), changed)),
        /** Whether an item is highlighted, disabled or waiting, as this render shows it. */
        itemState: (props: MenuItem) => item(props).state,
        /** An item that checks and unchecks an option. */
        checkboxItem: p.part((builder, item: MenuCheckboxItem) =>
          drawn(builder, checkboxItem(item), changed),
        ),
        /** Whether a checkbox item is checked, highlighted or disabled, as this render shows it. */
        checkboxItemState: (item: MenuCheckboxItem) => checkboxItem(item).state,
        /** The element around the items of a radio group. */
        radioGroup: p.part((builder, group: MenuRadioGroup) =>
          drawn(
            builder,
            shown(instance, "radio-group", groupProps(group), { feature: menuCheckable }),
            changed,
          ),
        ),
        /** An item of a radio group. Pressing it checks its value. */
        radioItem: p.part((builder, item: MenuRadioItem) =>
          drawn(builder, radioItem(item), changed),
        ),
        /** Whether a radio item is checked, highlighted or disabled, as this render shows it. */
        radioItemState: (item: MenuRadioItem) => radioItem(item).state,
        /**
         * The check inside a checkbox item. It gives nothing while the item
         * is unchecked, unless `keepMounted`, so chain on it with `?.`.
         */
        checkboxIndicator: whilePresent(
          indicator,
          (item: MenuCheckboxItem, { keepMounted }: Indicator = {}) =>
            shown(
              instance,
              "item-indicator",
              defined({
                id: `checkbox-${item.value}`,
                item: "checkbox-item" as const,
                itemKey: item.value,
                keepMounted,
              }),
              { feature: menuCheckable, around: { "checkbox-item": checkboxProps(item) } },
            ),
        ),
        /** The dot inside a radio item. It gives nothing while the item is unchecked, unless `keepMounted`. */
        radioIndicator: whilePresent(
          indicator,
          (item: MenuRadioItem, { keepMounted }: Indicator = {}) =>
            shown(
              instance,
              "item-indicator",
              defined({
                id: `radio-${levelOf([item.group.name, item.value])}`,
                item: "radio-item" as const,
                itemKey: item.value,
                group: item.group.name,
                keepMounted,
              }),
              {
                feature: menuCheckable,
                around: { "radio-item": radioProps(item), "radio-group": groupProps(item.group) },
              },
            ),
        ),
        /** The element around a group of items. `id` names it among the menu's groups, for its label. */
        group: p.part((builder, id: string) =>
          drawn(builder, shown(instance, "group", { id }), changed),
        ),
        /** A group's heading, which names the group: the `id` of a `group`, or the `name` of a `radioGroup`. */
        groupLabel: p.part((builder, group: string) =>
          drawn(builder, shown(instance, "group-label", { id: group, group }), changed),
        ),
        /** A line between items or groups. */
        separator: p.part((builder) =>
          builder.attrs(defined(shown(instance, "separator", {}).attrs)),
        ),
        /** Shows the keys of a shortcut like `"mod+n"` inside an item, as `⌘N` or `Ctrl+N`. Hidden from screen readers. */
        shortcut: p.part((builder, keys: string) =>
          builder.attrs(defined(shown(instance, "shortcut", {}).attrs)).children(
            formatShortcut(
              keys,
              reading(instance, (state) => state.apple),
            ),
          ),
        ),
      };
    };

    type Level = ReturnType<typeof level> & {
      /**
       * The parts of a submenu. Apply its `trigger` to an item of this menu,
       * and its `content` beside that item, inside this menu's content.
       */
      readonly sub: (sub: MenuSub) => Level;
    };
    const withSubs = (instance: Handle<typeof menu>, path: ReadonlyArray<string>): Level => {
      // One handle per submenu and render, however often the view asks for its parts.
      const subs = new Map<string, Level>();
      return {
        ...level(instance, path),
        sub: ({ key, ...options }) => {
          const made = subs.get(key);
          if (made) {
            return made;
          }
          const keys = [...path, key];
          const child: Handle<typeof menu> = handle(
            p.id("sub", levelOf(keys)),
            menu,
            {
              ...defined(options),
              // Read as the instance is made and as it takes each render's
              // options, which is once the menu around it has its own.
              get parent() {
                return instanceOf(instance).api;
              },
            } as MenuOptions,
            instance,
          );
          const parts = withSubs(child, keys);
          subs.set(key, parts);
          return parts;
        },
      };
    };

    return {
      /** Whether the menu is open, as this render shows it. */
      open: reading(root, (state) => state.open),
      ...withSubs(root, []),
    };
  },
});

export { createMenuController, type MenuController } from "@ui-sdk/core/menu";
