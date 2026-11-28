// The `menu-perf` fixture, rewritten for Effect UI from UI SDK's
// apps/playground/src/fixtures/menu-perf/react.tsx (Apache-2.0, see NOTICE).
// A long menu for the counts specs. Every other item shows whether it's
// highlighted, and a checkbox item at the end changes state that only it and
// its indicator show.
//
// React counts each call of an item's `render` function. A headless part has
// none: the view draws every part again, and Effect UI changes only the
// elements that differ. So nothing here counts renders, and the specs' render
// budgets hold without measuring anything. Their DOM budgets still measure.
import { Menu } from "@corpooo/ui-sdk-effect-ui/menu";
import { BrowserHost, Html } from "@effect/ui/html";
import { Effect, Layer, Schema } from "effect";
import { perfItems, perfSize } from "tests/fixtures/perf.ts";

const items = perfItems(perfSize());
const wrap = { value: "wrap" };

const Fixture = Html.component({
  name: "MenuPerfFixture",
  model: Schema.Null,
  message: Schema.Never,
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    h.div.class("fixture").children(
      h.button("Before"),
      Menu(h, {
        onEmit: {
          RequestedOpen: () => undefined,
          Picked: () => undefined,
          RequestedChecked: () => undefined,
          RequestedValue: () => undefined,
        },
        view: (menu) =>
          h.div.style({ display: "contents" }).children(
            menu.trigger(h.button).children("File"),
            menu
              .content(
                h.div.key("content").class("popup").style({ maxHeight: "320px", overflow: "auto" }),
              )
              ?.children(
                items.map((item, index) =>
                  menu
                    .item(h.div.key(item.value).class("item"), { value: item.value })
                    .children(
                      index % 2 && menu.itemState({ value: item.value }).highlighted ? "→ " : "",
                      item.label,
                    ),
                ),
                menu
                  .checkboxItem(h.div.key("wrap").class("item"), wrap)
                  .children(
                    menu.checkboxIndicator(h.span.key("check"), wrap)?.children("✓"),
                    "Wrap lines",
                  ),
              ),
          ),
      }),
      h.button("After"),
    ),
});

function mount(root: HTMLElement) {
  Layer.launch(BrowserHost.mount(Fixture, {}, root)).pipe(Effect.runFork);
}

export { mount };
