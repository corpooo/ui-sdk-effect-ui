// The `menu-render` fixture, rewritten for Effect UI from UI SDK's
// apps/playground/src/fixtures/menu-render/react.tsx (Apache-2.0, see
// NOTICE). Where React passes `render`, a headless part takes the element,
// and a part's state is a value of the parts.
import { Menu } from "@corpooo/ui-sdk-effect-ui/menu";
import { UiSchema } from "@effect/ui";
import { BrowserHost, Html } from "@effect/ui/html";
import { Effect, Layer, Schema } from "effect";

// Counts each time the view reads the watched item's state, where React
// counts the calls of its render function. The plain item has no state the
// view reads, so nothing counts it: the view draws it again all the same,
// and Effect UI leaves its element as it is.
const renders = { watched: 0, plain: 0 };
(window as unknown as { __renders: typeof renders }).__renders = renders;

const FixtureMessage = UiSchema.TaggedEnum({
  PickedMenuItem: { value: Schema.String },
});

const pinned = { value: "pinned" };

const Fixture = Html.component({
  name: "MenuRenderFixture",
  model: Schema.Struct({ action: Schema.String }),
  message: FixtureMessage,
}).make({
  init: () => ({ action: "" }),
  update: (_, message) =>
    FixtureMessage.match(message, { PickedMenuItem: ({ value }) => ({ action: value }) }),
  view: (h, model) =>
    h.div.class("fixture").children(
      h.button("Before"),
      Menu(h, {
        onEmit: {
          Picked: ({ value }) => FixtureMessage.PickedMenuItem({ value }),
          RequestedOpen: () => undefined,
          RequestedChecked: () => undefined,
          RequestedValue: () => undefined,
        },
        view: (menu) => {
          const watched = () => {
            renders.watched++;
            return menu.itemState({ value: "watched" }).highlighted;
          };
          return h.div
            .style({ display: "contents" })
            .children(
              menu.trigger(h.button).children("File"),
              menu
                .content(h.div.key("content").class("popup"))
                ?.children(
                  menu
                    .item(h.a.class("item").attr("href", "#docs"), { value: "docs" })
                    .children("Docs"),
                  menu
                    .item(h.div.class("item"), { value: "watched" })
                    .children(watched() ? "→ " : "", "Watched"),
                  menu.item(h.div.class("item"), { value: "plain" }).children("Plain"),
                  menu
                    .checkboxItem(
                      h.div.class(
                        `item ${menu.checkboxItemState(pinned).checked ? "is-checked" : "is-unchecked"}`,
                      ),
                      pinned,
                    )
                    .children("Pinned"),
                ),
            );
        },
      }),
      h.button("After"),
      h.output.attrs({ role: "status", "aria-label": "Last action" }).children(model.action),
    ),
});

function mount(root: HTMLElement) {
  Layer.launch(BrowserHost.mount(Fixture, {}, root)).pipe(Effect.runFork);
}

export { mount };
