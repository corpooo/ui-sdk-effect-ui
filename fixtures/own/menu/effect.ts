// Menus for what upstream's menu fixtures don't draw: a parent that refuses
// to open one, nested menus closed in one task, content that leaves while
// the menu is open, a menu with no part in the page, and nested menus with
// the same item value or key path at two levels. `?refuse` has the
// parent keep `open` false, `?nested=held` and `?controller=held` have it
// hold `open` for those menus too. specs/menu.spec.ts reads the page.
import { createMenuController, Menu } from "@corpooo/ui-sdk-effect-ui/menu";
import { Command, UiSchema } from "@effect/ui";
import { BrowserHost, Html } from "@effect/ui/html";
import { Effect, Layer, Schema } from "effect";

const params = new URLSearchParams(location.search);
// `?refuse` refuses every request, and `?refuse=close` only the ones to close.
const refuses = (open: boolean) =>
  params.has("refuse") && (params.get("refuse") !== "close" || !open);
const nestedHeld = params.get("nested") === "held";
const controllerHeld = params.get("controller") === "held";
// `?sheet` adds a menu in a container that a touch phone shows as a sheet.
const sheetContainer = params.has("sheet") ? document.createElement("div") : undefined;

const controller = createMenuController();

const FixtureMessage = UiSchema.TaggedEnum({
  RequestedOpenHeld: { open: Schema.Boolean, reason: Schema.String },
  ClickedOpenFromParent: {},
  ClickedCloseFromParent: {},
  RequestedOpenNested: { open: Schema.Boolean },
  PickedUnmountItem: { value: Schema.String },
  ClickedShowContent: {},
  ClickedOpenWithController: {},
  RequestedOpenController: { open: Schema.Boolean },
  ClickedSheetCommands: {},
  ClickedMoveController: {},
  RequestedCheckedNested: { path: Schema.Array(Schema.String), value: Schema.String },
});

// A controller opens the menu from outside it, which is work for a Command.
const OpenMenu = Command.make("OpenMenu", {}, () =>
  Effect.sync(() => {
    void controller.open({ focus: "first" });
  }),
);

const ignored = {
  Picked: () => undefined,
  RequestedOpen: () => undefined,
  RequestedChecked: () => undefined,
  RequestedValue: () => undefined,
};

const Fixture = Html.component({
  name: "OwnMenuFixture",
  model: Schema.Struct({
    held: Schema.Boolean,
    // Every request the held menu made, as `open:reason` or `close:reason`.
    requests: Schema.Array(Schema.String),
    // Every check the nested menus asked for, as `path/value`.
    checks: Schema.Array(Schema.String),
    nested: Schema.Boolean,
    hidden: Schema.Boolean,
    controlled: Schema.Boolean,
    sheet: Schema.Boolean,
    // Whether the controller drives the other commands menu.
    moved: Schema.Boolean,
  }),
  message: FixtureMessage,
}).make({
  init: () => ({
    held: false,
    requests: [],
    checks: [],
    nested: false,
    hidden: false,
    controlled: false,
    sheet: false,
    moved: false,
  }),
  update: ($, message) =>
    FixtureMessage.match(message, {
      // With `?refuse` the parent keeps `open` as it is, which is how it says no.
      RequestedOpenHeld: ({ open, reason }) =>
        $.evolve({
          requests: (requests) => [...requests, `${open ? "open" : "close"}:${reason}`],
          held: (held) => (refuses(open) ? held : open),
        }),
      ClickedOpenFromParent: () => $.evolve({ held: true }),
      ClickedCloseFromParent: () => $.evolve({ held: false }),
      RequestedOpenNested: ({ open }) => $.evolve({ nested: open }),
      RequestedCheckedNested: ({ path, value }) =>
        $.evolve({ checks: (checks) => [...checks, [...path, value].join("/")] }),
      PickedUnmountItem: ({ value }) => (value === "hide" ? $.evolve({ hidden: true }) : $.model),
      ClickedShowContent: () => $.evolve({ hidden: false }),
      ClickedOpenWithController: () => $.run(OpenMenu.make({}).pipe(Command.asNoop)),
      RequestedOpenController: ({ open }) => $.evolve({ controlled: open }),
      ClickedSheetCommands: () => $.evolve({ sheet: true }),
      ClickedMoveController: () => $.evolve({ moved: true }),
    }),
  view: (h, model) =>
    h.div.class("fixture").children(
      h.button("Before"),
      Menu(h, {
        key: "held",
        props: { open: model.held },
        onEmit: {
          ...ignored,
          RequestedOpen: ({ open, reason }) => FixtureMessage.RequestedOpenHeld({ open, reason }),
        },
        view: (menu) =>
          h.div
            .style({ display: "contents" })
            .children(
              menu.trigger(h.button).children("Held"),
              menu
                .content(h.div.key("content").class("popup"))
                ?.children(
                  menu.item(h.div.class("item"), { value: "first" }).children("First"),
                  menu.item(h.div.class("item"), { value: "middle" }).children("Middle"),
                  menu.item(h.div.class("item"), { value: "last" }).children("Last"),
                ),
            ),
      }),
      h.button
        .on("click", () => FixtureMessage.ClickedOpenFromParent())
        .children("Open from parent"),
      h.button
        .on("click", () => FixtureMessage.ClickedCloseFromParent())
        .children("Close from parent"),
      h.output
        .attrs({ role: "status", "aria-label": "Requests" })
        .children(model.requests.join(" ")),
      Menu(h, {
        key: "nested",
        props: nestedHeld ? { open: model.nested } : {},
        onEmit: {
          ...ignored,
          RequestedOpen: ({ open }) =>
            nestedHeld ? FixtureMessage.RequestedOpenNested({ open }) : undefined,
          RequestedChecked: ({ path, value }) =>
            FixtureMessage.RequestedCheckedNested({ path, value }),
        },
        view: (menu) => {
          const share = menu.sub({ key: "share" });
          const more = share.sub({ key: "more" });
          // The key path "share/more" spelled as one key: another submenu than `more`.
          const flat = menu.sub({ key: "share/more" });
          return h.div
            .style({ display: "contents" })
            .children(
              menu.trigger(h.button).children("Nested"),
              menu
                .content(h.div.key("content").class("popup"))
                ?.children(
                  menu.item(h.div.class("item"), { value: "copy" }).children("Copy"),
                  share.trigger(h.div.class("item")).children("Share"),
                  share
                    .content(h.div.key("share").class("popup"))
                    ?.children(
                      share.item(h.div.class("item"), { value: "email" }).children("Email"),
                      more.trigger(h.div.class("item")).children("More"),
                      more
                        .content(h.div.key("more").class("popup"))
                        ?.children(
                          more.item(h.div.class("item"), { value: "embed" }).children("Embed"),
                        ),
                      share
                        .checkboxItem(h.div.class("item"), { value: "pinned" })
                        .children("Pinned in Share"),
                    ),
                  menu.checkboxItem(h.div.class("item"), { value: "pinned" }).children("Pinned"),
                  flat.trigger(h.div.class("item")).children("Flat"),
                ),
            );
        },
      }),
      h.output.attrs({ role: "status", "aria-label": "Checks" }).children(model.checks.join(" ")),
      Menu(h, {
        key: "unmount",
        onEmit: {
          ...ignored,
          Picked: ({ value }) => FixtureMessage.PickedUnmountItem({ value }),
        },
        view: (menu) =>
          h.div.style({ display: "contents" }).children(
            menu.trigger(h.button).children("Unmount"),
            // The page stops drawing the content while the menu is still open.
            !model.hidden &&
              menu
                .content(h.div.key("content").class("popup"))
                ?.children(
                  menu
                    .item(h.div.class("item"), { value: "hide", closeOnSelect: false })
                    .children("Hide content"),
                  menu.item(h.div.class("item"), { value: "other" }).children("Other"),
                ),
          ),
      }),
      h.button.on("click", () => FixtureMessage.ClickedShowContent()).children("Show content"),
      // No trigger, and no content while it's closed: every part is absent until the controller opens it.
      Menu(h, {
        key: "controller",
        props: {
          ...(!model.moved && { controller }),
          ...(controllerHeld && { open: model.controlled }),
          ...(model.sheet && { presentation: "sheet" as const }),
        },
        onEmit: {
          ...ignored,
          RequestedOpen: ({ open }) =>
            controllerHeld ? FixtureMessage.RequestedOpenController({ open }) : undefined,
        },
        view: (menu) =>
          h.div
            .style({ display: "contents" })
            .children(
              menu
                .content(h.div.key("content").class("popup").attr("aria-label", "Commands"))
                ?.children(
                  menu.item(h.div.class("item"), { value: "run" }).children("Run"),
                  menu.item(h.div.class("item"), { value: "stop" }).children("Stop"),
                ),
            ),
      }),
      // The menu the controller drives once it moves here.
      Menu(h, {
        key: "other-commands",
        props: model.moved ? { controller } : {},
        onEmit: ignored,
        view: (menu) =>
          h.div
            .style({ display: "contents" })
            .children(
              menu
                .content(h.div.key("content").class("popup").attr("aria-label", "Other commands"))
                ?.children(menu.item(h.div.class("item"), { value: "pause" }).children("Pause")),
            ),
      }),
      h.button
        .on("click", () => FixtureMessage.ClickedOpenWithController())
        .children("Open with controller"),
      h.button
        .on("click", () => FixtureMessage.ClickedMoveController())
        .children("Move controller"),
      h.button
        .on("click", () => FixtureMessage.ClickedSheetCommands())
        .children("Commands as a sheet"),
      sheetContainer &&
        Menu(h, {
          key: "sheet",
          props: { container: sheetContainer, presentation: "auto" },
          onEmit: ignored,
          view: (menu) =>
            h.div
              .style({ display: "contents" })
              .children(
                menu.trigger(h.button).children("Sheet"),
                menu
                  .content(h.div.key("content").class("popup"), { keepMounted: true })
                  ?.children(menu.item(h.div.class("item"), { value: "alpha" }).children("Alpha")),
              ),
        }),
      h.button("After"),
    ),
});

function mount(root: HTMLElement) {
  // Inside the element the app is mounted on, where Effect UI hears events.
  if (sheetContainer) {
    root.append(sheetContainer);
  }
  Layer.launch(BrowserHost.mount(Fixture, {}, root)).pipe(Effect.runFork);
}

export { mount };
