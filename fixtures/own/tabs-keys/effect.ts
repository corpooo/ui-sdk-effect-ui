// Two tabs for keys dispatched in one task, which upstream's fixtures never
// send: "Kept" keeps its own value, and "Held" gets it from the fixture's
// Model, which takes every request. "Requests" counts what both asked for, so
// a spec can tell keys that went back to the start from keys that did
// nothing. specs/tabs-keys.spec.ts presses them.
import { Tabs, TabsProps } from "@corpooo/ui-sdk-effect-ui/tabs";
import { UiSchema } from "@effect/ui";
import { BrowserHost, Html } from "@effect/ui/html";
import { Effect, Layer, Schema } from "effect";

const values = ["one", "two", "three", "four"];
const label = (value: string) => value[0]!.toUpperCase() + value.slice(1);

const FixtureMessage = UiSchema.TaggedEnum({
  RequestedValueTabs: { held: Schema.Boolean, value: Schema.NullOr(Schema.String) },
});

function fixture() {
  return Html.component({
    name: "TabsKeysFixture",
    model: Schema.Struct({ held: Schema.NullOr(Schema.String), requests: Schema.Number }),
    message: FixtureMessage,
  }).make({
    init: () => ({ held: "one", requests: 0 }),
    update: ($, message) =>
      FixtureMessage.match(message, {
        RequestedValueTabs: ({ held, value }) =>
          $.evolve({ requests: (count) => count + 1, ...(held ? { held: value } : {}) }),
      }),
    view: (h, model) => {
      const tabsNamed = (name: string, props: typeof TabsProps.Type) =>
        Tabs(h, {
          key: name,
          props,
          onEmit: {
            RequestedValue: ({ value }) =>
              FixtureMessage.RequestedValueTabs({ held: name === "Held", value }),
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
