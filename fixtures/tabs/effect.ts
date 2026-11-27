// The `tabs` fixture, rewritten for Effect UI from UI SDK's
// apps/playground/src/fixtures/tabs/react.tsx (Apache-2.0, see NOTICE).
// Where React's handler cancels a change, the fixture's Model holds the value
// and its `update` decides: with `?cancel`, the tabs get their value as a prop.
// Without it they keep the value themselves, as React's do.
import { createTabsController, Tabs } from "@corpooo/ui-sdk-effect-ui/tabs";
import { Command, UiSchema } from "@effect/ui";
import { BrowserHost, Html } from "@effect/ui/html";
import { Effect, Layer, Schema } from "effect";
import { indicatorOptions, tabsOptions } from "tests/fixtures/page.ts";
import { tabsFixture } from "tests/fixtures/tabs.ts";

const controller = createTabsController();

const FixtureMessage = UiSchema.TaggedEnum({
  RequestedValueTabs: { value: Schema.NullOr(Schema.String) },
  ClickedShowNotifications: {},
});

const FixtureModel = Schema.Struct({
  action: Schema.String,
  // What the tabs show while `?cancel` has the fixture decide.
  value: Schema.NullOr(Schema.String),
});

// A controller selects from outside the tabs, which is work for a Command.
const SelectNotifications = Command.make("SelectNotifications", {}, () =>
  Effect.sync(() => {
    controller.select("notifications");
  }),
);

// The fixture, with the options the page's URL sets. See `tabsOptions`.
function fixture() {
  const { cancel, keepMounted, defaultValue, ...options } = tabsOptions();

  return Html.component({
    name: "TabsFixture",
    model: FixtureModel,
    message: FixtureMessage,
  }).make({
    init: () => ({ action: "", value: defaultValue ?? null }),
    update: ($, message) =>
      FixtureMessage.match(message, {
        RequestedValueTabs: ({ value }) =>
          value === cancel ? $.model : $.evolve({ value, action: value ?? "" }),
        ClickedShowNotifications: () => $.run(SelectNotifications.make({}).pipe(Command.asNoop)),
      }),
    view: (h, model) =>
      h.div.class("fixture").children(
        h.button("Before"),
        Tabs(h, {
          props: {
            controller,
            ...options,
            ...(cancel === null
              ? defaultValue === undefined
                ? {}
                : { initialValue: defaultValue }
              : { value: model.value }),
          },
          onEmit: { RequestedValue: ({ value }) => FixtureMessage.RequestedValueTabs({ value }) },
          view: (tabs) =>
            tabs.root(h.div.class("tabs")).children(
              tabs.list(h.div.class("tablist").attr("aria-label", tabsFixture.label)).children(
                tabsFixture.tabs.map((tab) =>
                  tabs
                    .tab(h.button.key(tab.value).class("tab"), {
                      value: tab.value,
                      ...(tab.disabled === undefined ? {} : { disabled: tab.disabled }),
                    })
                    .children(tab.label),
                ),
                tabs.indicator(h.span.class("indicator"), indicatorOptions()),
              ),
              tabsFixture.tabs.map((tab) =>
                tabs
                  .panel(h.div.key(tab.value).class("panel"), { value: tab.value, keepMounted })
                  ?.children(
                    tab.content,
                    tab.field &&
                      h.label.children(` ${tab.field} `, h.input.attr("type", "password")),
                  ),
              ),
            ),
        }),
        h.button("After"),
        h.output.attrs({ role: "status", "aria-label": "Last action" }).children(model.action),
        h.button
          .on("click", FixtureMessage.ClickedShowNotifications())
          .children("Show notifications"),
      ),
  });
}

function mount(root: HTMLElement) {
  Layer.launch(BrowserHost.mount(fixture(), {}, root)).pipe(Effect.runFork);
}

export { fixture, mount };
