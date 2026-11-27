// Toggles and toggle groups for presses dispatched in one task, which
// upstream's fixtures never send. Each comes twice: "Kept" keeps its own
// value, and "Held" gets it from the fixture's Model, which takes every
// request. specs/toggle-presses.spec.ts presses them.
import { Toggle, ToggleGroup } from "@corpooo/ui-sdk-effect-ui/toggle";
import { UiSchema } from "@effect/ui";
import { BrowserHost, Html } from "@effect/ui/html";
import { Effect, Layer, Schema } from "effect";

const Group = Schema.Literals(["single", "multiple"]);

const FixtureMessage = UiSchema.TaggedEnum({
  RequestedPressedHeld: { pressed: Schema.Boolean },
  RequestedValueHeld: { group: Group, value: Schema.Array(Schema.String) },
});

const FixtureModel = Schema.Struct({
  pressed: Schema.Boolean,
  single: Schema.Array(Schema.String),
  multiple: Schema.Array(Schema.String),
});

function fixture() {
  return Html.component({
    name: "TogglePressesFixture",
    model: FixtureModel,
    message: FixtureMessage,
  }).make({
    init: () => ({ pressed: false, single: [], multiple: [] }),
    update: ($, message) =>
      FixtureMessage.match(message, {
        RequestedPressedHeld: ({ pressed }) => $.evolve({ pressed }),
        RequestedValueHeld: ({ group, value }) => $.evolve({ [group]: value }),
      }),
    view: (h, model) => {
      const toggle = (owner: "Kept" | "Held") =>
        Toggle(h, {
          key: owner,
          props: owner === "Held" ? { pressed: model.pressed } : {},
          onEmit: {
            RequestedPressed: ({ pressed }) =>
              owner === "Held" ? FixtureMessage.RequestedPressedHeld({ pressed }) : undefined,
          },
          view: (toggle) => toggle.root(h.button.class("toggle")).children(`${owner} toggle`),
        });
      const group = (owner: "Kept" | "Held", name: typeof Group.Type) =>
        ToggleGroup(h, {
          key: `${owner} ${name}`,
          props: {
            multiple: name === "multiple",
            ...(owner === "Held" ? { value: model[name] } : {}),
          },
          onEmit: {
            RequestedValue: ({ value }) =>
              owner === "Held"
                ? FixtureMessage.RequestedValueHeld({ group: name, value })
                : undefined,
          },
          view: (toggleGroup) =>
            toggleGroup
              .group(h.div.class("toggle-group").attr("aria-label", `${owner} ${name}`))
              .children(
                ["A", "B"].map((value) =>
                  toggleGroup.item(h.button.key(value).class("toggle"), { value }).children(value),
                ),
              ),
        });
      return h.div
        .class("fixture")
        .children(
          h.button("Before"),
          toggle("Kept"),
          toggle("Held"),
          group("Kept", "single"),
          group("Held", "single"),
          group("Kept", "multiple"),
          group("Held", "multiple"),
          h.button("After"),
        );
    },
  });
}

function mount(root: HTMLElement) {
  Layer.launch(BrowserHost.mount(fixture(), {}, root)).pipe(Effect.runFork);
}

export { fixture, mount };
