// Two tabs for keys dispatched in one task, which upstream's fixtures never
// send: "Kept" keeps its own value, and "Held" gets it from the fixture's
// Model, which takes every request. specs/tabs-keys.spec.ts presses them.
import { Tabs, TabsProps } from "@corpooo/ui-sdk-effect-ui/tabs";
import { UiSchema } from "@effect/ui";
import { BrowserHost, Html } from "@effect/ui/html";
import { Effect, Layer, Schema } from "effect";

const values = ["one", "two", "three", "four"];
const label = (value: string) => value[0]!.toUpperCase() + value.slice(1);

const FixtureMessage = UiSchema.TaggedEnum({
  RequestedValueHeld: { value: Schema.NullOr(Schema.String) },
});

function fixture() {
  return Html.component({
    name: "TabsKeysFixture",
    model: Schema.Struct({ held: Schema.NullOr(Schema.String) }),
    message: FixtureMessage,
  }).make({
    init: () => ({ held: "one" }),
    update: ($, message) =>
      FixtureMessage.match(message, {
        RequestedValueHeld: ({ value }) => $.evolve({ held: value }),
      }),
    view: (h, model) => {
      const tabsNamed = (name: string, props: typeof TabsProps.Type) =>
        Tabs(h, {
          key: name,
          props,
          onEmit: {
            RequestedValue: ({ value }) =>
              name === "Held" ? FixtureMessage.RequestedValueHeld({ value }) : undefined,
          },
          view: (tabs) =>
            tabs.root(h.div.class("tabs")).children(
              tabs
                .list(h.div.class("tablist").attr("aria-label", name))
                .children(
                  values.map((value) =>
                    tabs.tab(h.button.key(value).class("tab"), { value }).children(label(value)),
                  ),
                ),
              values.map((value) =>
                tabs
                  .panel(h.div.key(value).class("panel"), { value })
                  ?.children(`${name} ${value}.`),
              ),
            ),
        });
      return h.div
        .class("fixture")
        .children(
          h.button("Before"),
          tabsNamed("Kept", { initialValue: "one" }),
          tabsNamed("Held", { value: model.held }),
          h.button("After"),
        );
    },
  });
}

function mount(root: HTMLElement) {
  Layer.launch(BrowserHost.mount(fixture(), {}, root)).pipe(Effect.runFork);
}

export { fixture, mount };
