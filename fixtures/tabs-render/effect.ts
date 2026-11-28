// The `tabs-render` fixture, rewritten for Effect UI from UI SDK's
// apps/playground/src/fixtures/tabs-render/react.tsx (Apache-2.0, see
// NOTICE). Where React passes `render`, a headless part takes the element,
// and where it hands a function the part's state, `tabs.tabState` reads it.
import { Tabs } from "@corpooo/ui-sdk-effect-ui/tabs";
import { UiSchema } from "@effect/ui";
import { BrowserHost, Html } from "@effect/ui/html";
import { Effect, Layer, Schema } from "effect";
import { tabsOptions } from "tests/fixtures/page.ts";

const FixtureMessage = UiSchema.TaggedEnum({
  RequestedValueTabs: { value: Schema.NullOr(Schema.String), reason: Schema.String },
});

function fixture() {
  const { activation } = tabsOptions();

  return Html.component({
    name: "TabsRenderFixture",
    model: Schema.Struct({ action: Schema.String, reason: Schema.String }),
    message: FixtureMessage,
  }).make({
    init: () => ({ action: "", reason: "" }),
    update: (_, message) =>
      FixtureMessage.match(message, {
        RequestedValueTabs: ({ value, reason }) => ({ action: value ?? "", reason }),
      }),
    view: (h, model) =>
      h.div.class("fixture").children(
        h.button("Before"),
        Tabs(h, {
          props: { initialValue: "overview", ...(activation && { activation }) },
          onEmit: { RequestedValue: (request) => FixtureMessage.RequestedValueTabs(request) },
          view: (tabs) =>
            tabs.root(h.div.class("tabs")).children(
              tabs.list(h.div.class("tablist").attr("aria-label", "Project")).children(
                tabs
                  .tab(h.a.key("overview").class("tab").attr("href", "#overview"), {
                    value: "overview",
                  })
                  .children("Overview"),
                tabs
                  .tab(h.a.key("activity").class("tab").attr("href", "#activity"), {
                    value: "activity",
                  })
                  .children("Activity"),
                tabs
                  .tab(h.button.key("watched").class("tab"), { value: "watched" })
                  .children(
                    "Watched",
                    tabs.tabState({ value: "watched" }).selected &&
                      h.span.attr("aria-hidden", "true").children(" •"),
                  ),
                tabs
                  .tab(
                    h.button
                      .key("plain")
                      .class(
                        `tab ${tabs.tabState({ value: "plain" }).selected ? "is-selected" : "is-unselected"}`,
                      ),
                    { value: "plain" },
                  )
                  .children("Plain"),
              ),
              ["overview", "activity", "watched", "plain"].map((value) =>
                tabs
                  .panel(h.div.key(value).class("panel"), { value })
                  ?.children(`The ${value} panel.`),
              ),
            ),
        }),
        h.button("After"),
        h.output.attrs({ role: "status", "aria-label": "Last action" }).children(model.action),
        h.output.attrs({ role: "status", "aria-label": "Reason" }).children(model.reason),
      ),
  });
}

function mount(root: HTMLElement) {
  Layer.launch(BrowserHost.mount(fixture(), {}, root)).pipe(Effect.runFork);
}

export { mount };
