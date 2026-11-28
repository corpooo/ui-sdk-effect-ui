// The `menu` fixture, rewritten for Effect UI from UI SDK's
// apps/playground/src/fixtures/menu/react.tsx (Apache-2.0, see NOTICE).
// Where React's menu calls `onAction`, the menu emits `Picked`, and the
// fixture's `update` records the value.
import { createMenuController, Menu } from "@corpooo/ui-sdk-effect-ui/menu";
import { Command, UiSchema } from "@effect/ui";
import { BrowserHost, Html } from "@effect/ui/html";
import { Effect, Layer, Schema } from "effect";
import { menuOptions } from "tests/fixtures/page.ts";

const controller = createMenuController();

const FixtureMessage = UiSchema.TaggedEnum({
  PickedMenuItem: { value: Schema.String },
  ClickedOpenWithController: {},
});

// A controller opens the menu from outside it, which is work for a Command.
const OpenMenu = Command.make("OpenMenu", {}, () =>
  Effect.sync(() => {
    void controller.open({ focus: "first" });
  }),
);

// The fixture, with the options the page's URL sets. See `menuOptions`.
function fixture() {
  const { defaultOpen, container, ...options } = menuOptions();
  const sort = { name: "sort", initialValue: "name" };
  const sidebar = { value: "sidebar", initialChecked: true };

  return Html.component({
    name: "MenuFixture",
    model: Schema.Struct({ action: Schema.String }),
    message: FixtureMessage,
  }).make({
    init: () => ({ action: "" }),
    update: ($, message) =>
      FixtureMessage.match(message, {
        PickedMenuItem: ({ value }) => $.evolve({ action: value }),
        ClickedOpenWithController: () => $.run(OpenMenu.make({}).pipe(Command.asNoop)),
      }),
    view: (h, model) =>
      h.div.class("fixture").children(
        h.button("Before"),
        Menu(h, {
          props: {
            controller,
            ...options,
            ...(defaultOpen && { initialOpen: true }),
            ...(container && { container }),
          },
          onEmit: {
            Picked: ({ value }) => FixtureMessage.PickedMenuItem({ value }),
            RequestedOpen: () => undefined,
            RequestedChecked: () => undefined,
            RequestedValue: () => undefined,
          },
          view: (menu) => {
            const share = menu.sub({ key: "share" });
            const more = share.sub({ key: "more" });
            // A headless child's view is one element, where React's menu renders none of its own.
            return h.div
              .style({ display: "contents" })
              .children(
                menu.trigger(h.button).children("File"),
                menu
                  .content(h.div.key("content").class("popup"))
                  ?.children(
                    menu
                      .item(h.div.class("item"), { value: "new", shortcut: "mod+n" })
                      .children("New file", menu.shortcut(h.span, "mod+n")),
                    menu
                      .item(h.div.class("item"), { value: "open", shortcut: "mod+o" })
                      .children("Open…", menu.shortcut(h.span, "mod+o")),
                    menu
                      .item(h.div.class("item"), { value: "save", disabled: true })
                      .children("Save"),
                    menu.separator(h.div.class("separator")),
                    menu
                      .group(h.div, "view")
                      .children(
                        menu.groupLabel(h.div.class("label"), "view").children("View"),
                        menu.checkboxItem(h.div.class("item"), sidebar).children("Show sidebar"),
                        menu
                          .checkboxItem(h.div.class("item"), { value: "statusbar" })
                          .children("Show status bar"),
                      ),
                    menu.separator(h.div.class("separator")),
                    menu
                      .radioGroup(h.div, sort)
                      .children(
                        menu.groupLabel(h.div.class("label"), sort.name).children("Sort by"),
                        menu
                          .radioItem(h.div.class("item"), { group: sort, value: "name" })
                          .children("Name"),
                        menu
                          .radioItem(h.div.class("item"), { group: sort, value: "date" })
                          .children("Date"),
                        menu
                          .radioItem(h.div.class("item"), { group: sort, value: "size" })
                          .children("Size"),
                      ),
                    menu.separator(h.div.class("separator")),
                    share.trigger(h.div.class("item")).children("Share"),
                    share
                      .content(h.div.key("share").class("popup"))
                      ?.children(
                        share.item(h.div.class("item"), { value: "email" }).children("Email"),
                        share.item(h.div.class("item"), { value: "link" }).children("Copy link"),
                        more.trigger(h.div.class("item")).children("More"),
                        more
                          .content(h.div.key("more").class("popup"))
                          ?.children(
                            more.item(h.div.class("item"), { value: "embed" }).children("Embed"),
                          ),
                      ),
                    menu.item(h.div.class("item"), { value: "delete" }).children("Delete"),
                  ),
              );
          },
        }),
        h.button("After"),
        h.output.attrs({ role: "status", "aria-label": "Last action" }).children(model.action),
        h.button
          .on("click", () => FixtureMessage.ClickedOpenWithController())
          .children("Open with controller"),
      ),
  });
}

function mount(root: HTMLElement) {
  Layer.launch(BrowserHost.mount(fixture(), {}, root)).pipe(Effect.runFork);
}

export { fixture, mount };
