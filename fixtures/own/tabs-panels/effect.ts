// Two tabs whose panels each hold a text field: "Keyed" gives each panel's
// element a `key`, as AGENTS.md says to, and "Unkeyed" doesn't.
// specs/tabs-panels.spec.ts reads what each does with the elements.
import { Tabs } from "@corpooo/ui-sdk-effect-ui/tabs";
import { BrowserHost, Html } from "@effect/ui/html";
import { Effect, Layer, Schema } from "effect";

const values = ["one", "two"];
const label = (value: string) => value[0]!.toUpperCase() + value.slice(1);

function fixture() {
  return Html.component({
    name: "TabsPanelsFixture",
    model: Schema.Null,
    message: Schema.Never,
  }).make({
    init: () => null,
    update: ($) => $.model,
    view: (h) => {
      const tabsNamed = (name: string, keyed: boolean) =>
        Tabs(h, {
          key: name,
          props: { initialValue: "one" },
          onEmit: { RequestedValue: () => undefined },
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
                  .panel((keyed ? h.div.key(value) : h.div).class("panel"), { value })
                  ?.children(h.label.children(`${name} ${value} `, h.input.attr("type", "text"))),
              ),
            ),
        });
      return h.div
        .class("fixture")
        .children(
          h.button("Before"),
          tabsNamed("Keyed", true),
          tabsNamed("Unkeyed", false),
          h.button("After"),
        );
    },
  });
}

function mount(root: HTMLElement) {
  Layer.launch(BrowserHost.mount(fixture(), {}, root)).pipe(Effect.runFork);
}

export { fixture, mount };
