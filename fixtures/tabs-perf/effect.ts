// The `tabs-perf` fixture, rewritten for Effect UI from UI SDK's
// apps/playground/src/fixtures/tabs-perf/react.tsx (Apache-2.0, see NOTICE).
// Many tabs for the counts specs.
import { Tabs } from "@corpooo/ui-sdk-effect-ui/tabs";
import { UiSchema } from "@effect/ui";
import { BrowserHost, Html } from "@effect/ui/html";
import { Effect, Layer, Schema } from "effect";
import { perfItems, perfSize } from "tests/fixtures/perf.ts";

const items = perfItems(perfSize());
const first = items[0]!.value;

// `?controlled` keeps the value in this component, which renders again on
// every change, like an app that shows the selected tab elsewhere.
const controlled = new URLSearchParams(location.search).has("controlled");

const FixtureMessage = UiSchema.TaggedEnum({
  RequestedValueTabs: { value: Schema.NullOr(Schema.String) },
});

const Fixture = Html.component({
  name: "TabsPerfFixture",
  model: Schema.Struct({ value: Schema.String }),
  message: FixtureMessage,
}).make({
  init: () => ({ value: first }),
  update: (_, message) =>
    FixtureMessage.match(message, {
      RequestedValueTabs: ({ value }) => ({ value: value ?? first }),
    }),
  view: (h, model) =>
    h.div.class("fixture").children(
      h.button("Before"),
      Tabs(h, {
        props: controlled ? { value: model.value } : { initialValue: first },
        onEmit: {
          RequestedValue: ({ value }) =>
            controlled ? FixtureMessage.RequestedValueTabs({ value }) : undefined,
        },
        view: (tabs) =>
          tabs.root(h.div.class("tabs")).children(
            tabs
              .list(h.div.class("tablist").attr("aria-label", "Pages").style({ flexWrap: "wrap" }))
              .children(
                items.map((item) =>
                  tabs
                    .tab(h.button.key(item.value).class("tab"), { value: item.value })
                    .children(item.label),
                ),
              ),
            items.map((item) =>
              tabs
                .panel(h.div.key(item.value).class("panel"), { value: item.value })
                ?.children(`${item.label} content.`),
            ),
          ),
      }),
      controlled && h.p(`Showing ${model.value}`),
      h.button("After"),
    ),
});

function mount(root: HTMLElement) {
  Layer.launch(BrowserHost.mount(Fixture, {}, root)).pipe(Effect.runFork);
}

export { mount };
