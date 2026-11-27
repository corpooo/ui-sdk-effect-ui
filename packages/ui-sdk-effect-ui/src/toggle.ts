import { UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { toggle, toggleGroup } from "@ui-sdk/core/toggle";
import { Schema } from "effect";
import { drawn, defined, emit, handle, instanceOf, shown } from "./renderer/primitive.ts";

/** Why a toggle or a group asks to change: a press, or a call of its api. */
const Reason = Schema.String;

export const ToggleProps = Schema.Struct({
  /** Whether it's pressed. Pass it to decide: a press then only asks, with `RequestedPressed`. */
  pressed: Schema.optional(Schema.Boolean),
  /** Whether it starts pressed, when `pressed` is left out and the toggle keeps the value itself. */
  initialPressed: Schema.optional(Schema.Boolean),
  disabled: Schema.optional(Schema.Boolean),
  /** Keeps a disabled toggle in the tab order, with `aria-disabled` instead of the native attribute. */
  focusableWhenDisabled: Schema.optional(Schema.Boolean),
});

export const ToggleModel = Schema.Struct({
  /** The value, while the props leave `pressed` out. */
  pressed: Schema.Boolean,
  /** Counts core's own changes, each of which renders again. */
  revision: Schema.Number,
});

export const ToggleMessage = UiSchema.TaggedEnum({
  /** Core asked to press or unpress it. */
  RequestedPressed: { pressed: Schema.Boolean, reason: Reason },
  /** Core changed what the toggle shows on its own, like once it knows its element. */
  ChangedPart: {},
});

export const ToggleEvents = UiSchema.TaggedEnum({
  /**
   * A press, or an api call, asked to press or unpress it. With `pressed` in
   * the props, pass the new value back to accept it, or keep the old one to
   * refuse. Without, the toggle has already taken it.
   */
  RequestedPressed: { pressed: Schema.Boolean, reason: Reason },
});

/**
 * A button that stays pressed. Headless: apply `toggle.root` to an element of
 * your own, a `button` or any other.
 */
export const Toggle = Html.component({
  name: "Toggle",
  props: ToggleProps,
  model: ToggleModel,
  message: ToggleMessage,
  events: ToggleEvents,
}).make({
  init: ($) => ({ pressed: $.props.initialPressed ?? false, revision: 0 }),
  update: ($, message) =>
    ToggleMessage.match(message, {
      RequestedPressed: (request) =>
        ($.props.pressed === undefined ? $.evolve({ pressed: request.pressed }) : $).emit(
          ToggleEvents.RequestedPressed(request),
        ),
      ChangedPart: () => $.evolve({ revision: (count) => count + 1 }),
    }),
  parts: (p, model) => {
    const { pressed: _, initialPressed: __, ...settings } = p.props;
    const instance = handle(p.id("toggle"), toggle, {
      ...defined(settings),
      pressed: p.props.pressed ?? model.pressed,
      onPressedChange: (pressed, details) =>
        emit(instance, ToggleMessage.RequestedPressed({ pressed, reason: details.reason })),
    });
    const root = shown(instance, "root", {});
    return {
      /** Whether it's pressed, as this render shows it. */
      pressed: root.state.pressed,
      /** Whether it's disabled, by itself or a fieldset around it. */
      disabled: root.state.disabled,
      root: p.part((builder) => drawn(builder, root, ToggleMessage.ChangedPart())),
    };
  },
});

/** One toggle of a group, as the consumer's `view` passes it to `toggleGroup.item`. */
export const ToggleGroupItem = Schema.Struct({
  value: Schema.String,
  disabled: Schema.optional(Schema.Boolean),
});
export type ToggleGroupItem = typeof ToggleGroupItem.Type;

export const ToggleGroupProps = Schema.Struct({
  /** The pressed toggles' values. Pass it to decide: a press then only asks, with `RequestedValue`. */
  value: Schema.optional(Schema.Array(Schema.String)),
  /** The toggles pressed at first, when `value` is left out and the group keeps the value itself. */
  initialValue: Schema.optional(Schema.Array(Schema.String)),
  /** Whether several toggles can be pressed at once. */
  multiple: Schema.optional(Schema.Boolean),
  /** Whether the pressed toggle can be unpressed when only one may be pressed. On by default. */
  deselectable: Schema.optional(Schema.Boolean),
  disabled: Schema.optional(Schema.Boolean),
  orientation: Schema.optional(Schema.Literals(["horizontal", "vertical"])),
  /** Whether arrow keys wrap from the last toggle to the first. On by default. */
  loop: Schema.optional(Schema.Boolean),
});

export const ToggleGroupModel = Schema.Struct({
  /** The value, while the props leave `value` out. */
  value: Schema.Array(Schema.String),
  /** Counts core's own changes, each of which renders again. */
  revision: Schema.Number,
});

export const ToggleGroupMessage = UiSchema.TaggedEnum({
  /** Core asked for another set of pressed toggles. */
  RequestedValue: { value: Schema.Array(Schema.String), reason: Reason },
  /** Core changed what the group or one of its toggles shows on its own, like the tab stop. */
  ChangedPart: {},
});

export const ToggleGroupEvents = UiSchema.TaggedEnum({
  /**
   * A press, or an api call, asked for another set of pressed toggles, in the
   * order the toggles appear. With `value` in the props, pass the new value
   * back to accept it, or keep the old one to refuse. Without, the group has
   * already taken it.
   */
  RequestedValue: { value: Schema.Array(Schema.String), reason: Reason },
});

/**
 * Toggles that share one value, with one tab stop and arrow keys between
 * them. Headless: apply `toggleGroup.group` to the element around them and
 * `toggleGroup.item` to each toggle's.
 */
export const ToggleGroup = Html.component({
  name: "ToggleGroup",
  props: ToggleGroupProps,
  model: ToggleGroupModel,
  message: ToggleGroupMessage,
  events: ToggleGroupEvents,
}).make({
  init: ($) => ({ value: $.props.initialValue ?? [], revision: 0 }),
  update: ($, message) =>
    ToggleGroupMessage.match(message, {
      RequestedValue: (request) =>
        ($.props.value === undefined ? $.evolve({ value: request.value }) : $).emit(
          ToggleGroupEvents.RequestedValue(request),
        ),
      ChangedPart: () => $.evolve({ revision: (count) => count + 1 }),
    }),
  parts: (p, model) => {
    const { value: _, initialValue: __, ...settings } = p.props;
    const instance = handle(p.id("group"), toggleGroup, {
      ...defined(settings),
      value: [...(p.props.value ?? model.value)],
      onValueChange: (value, details) =>
        emit(instance, ToggleGroupMessage.RequestedValue({ value, reason: details.reason })),
    });
    const group = shown(instance, "group", {});
    return {
      /** The pressed toggles' values, as this render shows them. */
      value: group.state.value,
      disabled: group.state.disabled,
      group: p.part((builder) => drawn(builder, group, ToggleGroupMessage.ChangedPart())),
      /** One toggle of the group. Each is a core toggle of its own, which reads the group. */
      item: p.part((builder, item: ToggleGroupItem) => {
        const root = shown(
          handle(
            p.id("item", item.value),
            toggle,
            { ...defined(item), group: () => instanceOf(instance).api },
            instance,
          ),
          "root",
          {},
        );
        return drawn(builder, root, ToggleGroupMessage.ChangedPart());
      }),
    };
  },
});
