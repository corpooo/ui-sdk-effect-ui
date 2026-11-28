// Tabs whose tabs and panels take ids from the consumer, which upstream's
// fixtures never give. specs/tabs-ids.spec.ts reads them, client-rendered and
// hydrated.
import { Tabs } from "@corpooo/ui-sdk-effect-ui/tabs";
import { UiSchema } from "@effect/ui";
import { BrowserHost, Html } from "@effect/ui/html";
import { Effect, Layer, Schema } from "effect";

const values = ["one", "two", "three"];
const label = (value: string) => value[0]!.toUpperCase() + value.slice(1);

const FixtureMessage = UiSchema.TaggedEnum({
  RequestedValueTabs: { value: Schema.NullOr(Schema.String) },
});

function fixture() {
  return Html.component({
    name: "TabsIdsFixture",
    model: Schema.Struct({ action: Schema.String }),
    message: FixtureMessage,
  }).make({
    init: () => ({ action: "" }),
    update: ($, message) =>
      FixtureMessage.match(message, {
        RequestedValueTabs: ({ value }) => $.evolve({ action: value ?? "" }),
      }),
    view: (h, model) =>
      h.div.class("fixture").children(
        h.button("Before"),
        Tabs(h, {
          props: { initialValue: "one" },
          onEmit: { RequestedValue: ({ value }) => FixtureMessage.RequestedValueTabs({ value }) },
          view: (tabs) =>
            tabs.root(h.div.class("tabs")).children(
              tabs
                .list(h.div.class("tablist").attr("aria-label", "Ids"))
                .children(
                  values.map((value) =>
                    tabs
                      .tab(h.button.key(value).class("tab"), { value, id: `author-tab-${value}` })
                      .children(label(value)),
                  ),
                ),
              values.map((value) =>
                tabs
                  .panel(h.div.key(value).class("panel"), { value, id: `author-panel-${value}` })
                  ?.children(`Panel ${value}.`),
              ),
            ),
        }),
        h.button("After"),
        h.output.attrs({ role: "status", "aria-label": "Last action" }).children(model.action),
      ),
  });
}

function mount(root: HTMLElement) {
  Layer.launch(BrowserHost.mount(fixture(), {}, root)).pipe(Effect.runFork);
}

export { fixture, mount };
