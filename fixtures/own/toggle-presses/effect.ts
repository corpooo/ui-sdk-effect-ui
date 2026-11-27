// Toggles and toggle groups for presses dispatched in one task, which
// upstream's fixtures never send. Each comes twice: "Kept" keeps its own
// value, and "Held" gets it from the fixture's Model, which takes every
// request. "Requests" counts what they all asked for, so a spec can tell
// presses that went back to the start from presses that did nothing.
// specs/toggle-presses.spec.ts presses them.
import { Toggle, ToggleGroup } from "@corpooo/ui-sdk-effect-ui/toggle";
import { UiSchema } from "@effect/ui";
import { BrowserHost, Html } from "@effect/ui/html";
import { Effect, Layer, Schema } from "effect";

const Group = Schema.Literals(["single", "multiple"]);

const FixtureMessage = UiSchema.TaggedEnum({
  RequestedKept: {},
  RequestedPressedHeld: { pressed: Schema.Boolean },
  RequestedValueHeld: { group: Group, value: Schema.Array(Schema.String) },
});

const FixtureModel = Schema.Struct({
  requests: Schema.Number,
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
    init: () => ({ requests: 0, pressed: false, single: [], multiple: [] }),
    update: ($, message) => {
      const requests = (count: number) => count + 1;
      return FixtureMessage.match(message, {
        RequestedKept: () => $.evolve({ requests }),
        RequestedPressedHeld: ({ pressed }) => $.evolve({ requests, pressed }),
        RequestedValueHeld: ({ group, value }) => $.evolve({ requests, [group]: value }),
      });
    },
    view: (h, model) => {
      const toggle = (owner: "Kept" | "Held") =>
        Toggle(h, {
          key: owner,
          props: owner === "Held" ? { pressed: model.pressed } : {},
          onEmit: {
            RequestedPressed: ({ pressed }) =>
              owner === "Held"
                ? FixtureMessage.RequestedPressedHeld({ pressed })
                : FixtureMessage.RequestedKept(),
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
                : FixtureMessage.RequestedKept(),
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
          h.output
            .attrs({ role: "status", "aria-label": "Requests" })
            .children(`${model.requests}`),
        );
    },
  });
}

function mount(root: HTMLElement) {
  Layer.launch(BrowserHost.mount(fixture(), {}, root)).pipe(Effect.runFork);
}

export { fixture, mount };
