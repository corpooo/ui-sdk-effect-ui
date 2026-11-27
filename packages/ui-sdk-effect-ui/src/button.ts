import { UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { button, type ButtonApi } from "@ui-sdk/core/button";
import { Schema } from "effect";
import { drawn, defined, emit, handle, shown, type After } from "./renderer/primitive.ts";

export const ButtonProps = Schema.Struct({
  disabled: Schema.optional(Schema.Boolean),
  /** Keeps a disabled button in the tab order, with `aria-disabled` instead of the native attribute. */
  focusableWhenDisabled: Schema.optional(Schema.Boolean),
  /** What a native button does in a form. Ignored when the button is another element. */
  type: Schema.optional(Schema.Literals(["button", "submit", "reset"])),
  /**
   * Whether the work a press started is still running. While it is, the button
   * says it's busy, keeps focus and refuses presses, so a form can't submit twice.
   */
  pending: Schema.optional(Schema.Boolean),
  /** What screen readers hear once it has been pending for a second. "Loading" when left out. */
  pendingAnnouncement: Schema.optional(Schema.String),
});

export const ButtonMessage = UiSchema.TaggedEnum({
  /** Core let a press through: the button was neither disabled nor pending. */
  Pressed: { source: Schema.String },
  /** Core changed what the button shows on its own, like once it knows its element. */
  ChangedPart: {},
});

export const ButtonEvents = UiSchema.TaggedEnum({
  /** The button was pressed. `source` says how, like `"mouse"` or `"keyboard"`. */
  Pressed: { source: Schema.String },
});

// Core makes a button pending for as long as the Promise its action returned
// runs. A message can't return one, so a `pending` prop that turns on runs an
// action whose Promise settles when the prop turns off.
const settles = new WeakMap<object, () => void>();
const pendingWhile =
  (pending: boolean): After =>
  (instance) => {
    const settle = settles.get(instance);
    if (pending && !settle) {
      (instance.api as ButtonApi).internal.press(
        undefined,
        () => new Promise<void>((resolve) => settles.set(instance, resolve)),
      );
    } else if (!pending && settle) {
      settles.delete(instance);
      settle();
    }
  };

/**
 * A button. Headless: apply `button.root` to a `button`, or to a link or any
 * element that should act as one.
 */
export const Button = Html.component({
  name: "Button",
  props: ButtonProps,
  /** Counts core's own changes, each of which renders again. */
  model: Schema.Struct({ revision: Schema.Number }),
  message: ButtonMessage,
  events: ButtonEvents,
}).make({
  init: () => ({ revision: 0 }),
  update: ($, message) =>
    ButtonMessage.match(message, {
      Pressed: (press) => $.emit(ButtonEvents.Pressed(press)),
      ChangedPart: () => $.evolve({ revision: (count) => count + 1 }),
    }),
  parts: (p) => {
    const { pending, ...settings } = p.props;
    const instance = handle(p.id("button"), button, {
      ...defined(settings),
      action: (_event, details) => {
        emit(instance, ButtonMessage.Pressed({ source: details.source }));
      },
    });
    const root = shown(instance, "root", {});
    return {
      disabled: root.state.disabled,
      /** Whether core shows it pending, which follows the `pending` prop a render later. */
      pending: root.state.pending,
      root: p.part((builder) =>
        drawn(builder, root, ButtonMessage.ChangedPart(), pendingWhile(pending === true)),
      ),
    };
  },
});
