// The `menu-cases` fixture, rewritten for Effect UI from UI SDK's
// apps/playground/src/fixtures/menu-cases/react.tsx (Apache-2.0, see NOTICE).
// Where React's `onSelect` prevents an item's default, the item has
// `closeOnSelect: false` and the fixture's `update` decides what its `Picked`
// means. Where React holds a value in state, the fixture's Model does.
import { Menu } from "@corpooo/ui-sdk-effect-ui/menu";
import { Subscription, UiSchema } from "@effect/ui";
import { BrowserHost, Html } from "@effect/ui/html";
import { Effect, Layer, Schema, Stream } from "effect";

const closeEvent = "fixture-close-controlled";

const FixtureMessage = UiSchema.TaggedEnum({
  PickedEditItem: { value: Schema.String },
  RequestedValueAlign: { value: Schema.String },
  ClickedAlignRight: {},
  RequestedOpenControlled: { open: Schema.Boolean },
  PickedControlledItem: { value: Schema.String },
  ClosedControlled: {},
});

// Specs close the controlled menu from outside it, with `__closeControlled`.
const closes = Subscription.make(
  "Closes",
  Stream.fromEventListener(document, closeEvent).pipe(
    Stream.map(() => FixtureMessage.ClosedControlled()),
  ),
);

const Fixture = Html.component({
  name: "MenuCasesFixture",
  model: Schema.Struct({
    action: Schema.String,
    selections: Schema.Number,
    align: Schema.String,
    open: Schema.Boolean,
  }),
  message: FixtureMessage,
}).make({
  init: () => ({ action: "", selections: 0, align: "left", open: false }),
  update: ($, message) =>
    FixtureMessage.match(message, {
      // Pin stays out of the last action, as an item whose `onSelect` prevents its default does.
      PickedEditItem: ({ value }) =>
        value === "pin"
          ? $.evolve({ selections: (count) => count + 1 })
          : $.evolve({ action: value }),
      RequestedValueAlign: ({ value }) => $.evolve({ align: value }),
      ClickedAlignRight: () => $.evolve({ align: "right" }),
      RequestedOpenControlled: ({ open }) => $.evolve({ open }),
      PickedControlledItem: ({ value }) => (value === "done" ? $.evolve({ open: false }) : $.model),
      ClosedControlled: () => $.evolve({ open: false }),
    }),
  subscriptions: () => [closes],
  view: (h, model) => {
    const align = { name: "align", value: model.align };
    return h.div.class("fixture").children(
      h.button("Before"),
      Menu(h, {
        key: "edit",
        onEmit: {
          Picked: ({ value }) => FixtureMessage.PickedEditItem({ value }),
          RequestedValue: ({ value }) => FixtureMessage.RequestedValueAlign({ value }),
          RequestedOpen: () => undefined,
          // Pinned keeps its `checked`, which refuses every change.
          RequestedChecked: () => undefined,
        },
        view: (menu) => {
          const share = menu.sub({ key: "share" });
          const more = menu.sub({ key: "more", loop: false });
          return h.div
            .style({ display: "contents" })
            .children(
              menu.trigger(h.button).children("Edit"),
              menu
                .content(h.div.key("content").class("popup"))
                ?.children(
                  menu
                    .item(h.div.class("item"), { value: "pin", closeOnSelect: false })
                    .children("Pin"),
                  menu
                    .item(h.div.class("item"), { value: "zoom", closeOnSelect: false })
                    .children("Zoom in"),
                  menu
                    .item(h.div.class("item"), { value: "erase", shortcut: "mod+backspace" })
                    .children("Erase", menu.shortcut(h.span, "mod+backspace")),
                  menu
                    .item(h.div.class("item"), { value: "window", shortcut: "alt+n" })
                    .children("New window", menu.shortcut(h.span, "alt+n")),
                  menu.separator(h.div.class("separator")),
                  menu
                    .checkboxItem(h.div.class("item"), { value: "autosave", closeOnSelect: true })
                    .children("Autosave"),
                  menu
                    .checkboxItem(h.div.class("item"), { value: "pinned", checked: true })
                    .children("Pinned"),
                  menu
                    .radioGroup(h.div, align)
                    .children(
                      menu.groupLabel(h.div.class("label"), align.name).children("Align"),
                      menu
                        .radioItem(h.div.class("item"), { group: align, value: "left" })
                        .children("Left"),
                      menu
                        .radioItem(h.div.class("item"), { group: align, value: "right" })
                        .children("Right"),
                    ),
                  share.trigger(h.div.class("item"), { disabled: true }).children("Share"),
                  share
                    .content(h.div.key("share").class("popup"))
                    ?.children(
                      share.item(h.div.class("item"), { value: "email" }).children("Email"),
                    ),
                  more.trigger(h.div.class("item")).children("More"),
                  more
                    .content(h.div.key("more").class("popup"))
                    ?.children(
                      more.item(h.div.class("item"), { value: "first" }).children("First"),
                      more.item(h.div.class("item"), { value: "last" }).children("Last"),
                    ),
                ),
            );
        },
      }),
      Menu(h, {
        key: "offsets",
        onEmit: {
          Picked: () => undefined,
          RequestedOpen: () => undefined,
          RequestedChecked: () => undefined,
          RequestedValue: () => undefined,
        },
        view: (menu) =>
          h.div.style({ display: "contents" }).children(
            menu.trigger(h.button).children("Offsets"),
            menu
              .content(h.div.key("content").class("popup"), {
                sideOffset: 8,
                alignOffset: -4,
                collisionPadding: 24,
              })
              ?.children(
                menu.item(h.div.class("item"), { value: "one" }).children("One"),
                menu.item(h.div.class("item"), { value: "two" }).children("Two"),
              ),
          ),
      }),
      Menu(h, {
        key: "controlled",
        props: { open: model.open },
        onEmit: {
          RequestedOpen: ({ open }) => FixtureMessage.RequestedOpenControlled({ open }),
          Picked: ({ value }) => FixtureMessage.PickedControlledItem({ value }),
          RequestedChecked: () => undefined,
          RequestedValue: () => undefined,
        },
        view: (menu) =>
          h.div.style({ display: "contents" }).children(
            menu.trigger(h.button).children("Controlled"),
            menu.content(h.div.key("content").class("popup"))?.children(
              // The fixture closes the menu itself when Done is picked.
              menu
                .item(h.div.class("item"), { value: "done", closeOnSelect: false })
                .children("Done"),
              menu.item(h.div.class("item"), { value: "later" }).children("Later"),
            ),
          ),
      }),
      h.button.on("click", () => FixtureMessage.ClickedAlignRight()).children("Align right"),
      h.button("After"),
      h.output.attrs({ role: "status", "aria-label": "Last action" }).children(model.action),
      h.output
        .attrs({ role: "status", "aria-label": "Selections" })
        .children(String(model.selections)),
    );
  },
});

function mount(root: HTMLElement) {
  (window as unknown as { __closeControlled: () => void }).__closeControlled = () =>
    document.dispatchEvent(new Event(closeEvent));
  Layer.launch(BrowserHost.mount(Fixture, {}, root)).pipe(Effect.runFork);
}

export { mount };
