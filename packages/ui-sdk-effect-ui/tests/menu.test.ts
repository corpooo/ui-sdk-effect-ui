import { Html, HtmlServer } from "@effect/ui/html";
import { Story } from "@effect/ui/testing";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import {
  Menu,
  MenuEvents,
  MenuMessage,
  MenuModel,
  type MenuCheckboxItem,
  type MenuContent,
  type MenuProps,
  type MenuRadioGroup,
} from "../src/menu.ts";
import { storied } from "./story.ts";

const MenuStory = storied<typeof MenuModel.Type, typeof MenuMessage.Type>()(Menu);

// Core asks to open or close through `onOpenChange`, which reaches `update`
// as `RequestedOpen`. These send that message, as core would.
const request = (open: boolean) => MenuMessage.RequestedOpen({ open, reason: "trigger-press" });
const requested = (open: boolean) => MenuEvents.RequestedOpen({ open, reason: "trigger-press" });

const sidebar: MenuCheckboxItem = { value: "sidebar" };
const sort = (group: Partial<MenuRadioGroup> = {}): MenuRadioGroup => ({ name: "sort", ...group });

// A page of a menu with one of each part, as a server renders it.
const rendered = (
  props: typeof MenuProps.Type,
  options: { content?: MenuContent; pinned?: MenuCheckboxItem; group?: MenuRadioGroup } = {},
) =>
  Effect.gen(function* () {
    const pinned = options.pinned ?? { value: "pinned", initialChecked: true };
    const group = options.group ?? sort({ initialValue: "name" });
    const Page = Html.component({ name: "Page", model: Schema.Null, message: Schema.Never }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Menu(h, {
          props,
          onEmit: {
            RequestedOpen: () => undefined,
            Picked: () => undefined,
            RequestedChecked: () => undefined,
            RequestedValue: () => undefined,
          },
          view: (menu) => {
            const share = menu.sub({ key: "share" });
            return h.main.children(
              menu.trigger(h.button).children("File"),
              menu.content(h.section.key("content").class("popup"), options.content)?.children(
                menu
                  .item(h.div.class("item"), { value: "new", shortcut: "mod+n" })
                  .children("New", menu.shortcut(h.kbd, "mod+n")),
                menu.item(h.a.attr("href", "#docs"), { value: "docs", disabled: true }),
                menu.separator(h.hr),
                menu
                  .group(h.div.class("group"), "view")
                  .children(
                    menu.groupLabel(h.h3, "view").children("View"),
                    menu
                      .checkboxItem(h.div.class("checkbox"), pinned)
                      .children(menu.checkboxIndicator(h.i.key("check"), pinned)?.children("✓")),
                    menu
                      .checkboxItem(h.div.class("checkbox"), sidebar)
                      .children(menu.checkboxIndicator(h.i.key("check"), sidebar)?.children("✓")),
                  ),
                menu.radioGroup(h.div.class("radios"), group).children(
                  menu.groupLabel(h.h3, group.name).children("Sort by"),
                  ["name", "date"].map((value) =>
                    menu
                      .radioItem(h.div.key(value).class("radio"), { group, value })
                      .children(
                        menu.radioIndicator(h.b.key("dot"), { group, value })?.children("•"),
                      ),
                  ),
                ),
                share.trigger(h.div.class("sub")).children("Share"),
                share
                  .content(h.section.key("share"))
                  ?.children(share.item(h.div, { value: "email" })),
              ),
            );
          },
        }),
    });
    const { html } = yield* HtmlServer.renderToHtml(Page, {});
    const tags = (pattern: RegExp) => html.match(pattern) ?? [];
    return {
      html,
      trigger: tags(/<button[^>]*>/g)[0] ?? "",
      contents: tags(/<section[^>]*>/g),
      items: tags(/<div class="item"[^>]*>/g),
      checkboxes: tags(/<div class="checkbox"[^>]*>/g),
      radios: tags(/<div class="radio"[^>]*>/g),
    };
  });

const attribute = (tag: string | undefined, name: string) =>
  new RegExp(` ${name}="([^"]*)"`).exec(tag ?? "")?.[1];

describe("Menu", () => {
  it.effect("it starts closed, and open when asked to", () =>
    Effect.gen(function* () {
      const closed = yield* Story.make(MenuStory, {});
      assert.isFalse(Story.parts(Menu, closed.current).open);
      const open = yield* Story.make(MenuStory, { initialOpen: true });
      assert.isTrue(Story.parts(Menu, open.current).open);
    }),
  );

  it.effect("without an open prop, it takes a request itself and tells its parent", () =>
    Effect.gen(function* () {
      const story = yield* Story.make(MenuStory, {});
      story.send(request(true)).emitted(requested(true));
      assert.isTrue(Story.parts(Menu, story.current).open);
      story.send(request(false)).emitted(requested(false));
      assert.isFalse(Story.parts(Menu, story.current).open);
    }),
  );

  it.effect(
    "with an open prop, a request only asks, and the parent accepts by passing it back",
    () =>
      Effect.gen(function* () {
        const story = yield* Story.make(MenuStory, { open: false });
        story.send(request(true)).emitted(requested(true));
        assert.isFalse(Story.parts(Menu, story.current).open);
        story.props({ open: true });
        assert.isTrue(Story.parts(Menu, story.current).open);
      }),
  );

  it.effect("a parent refuses a request by keeping the prop", () =>
    Effect.gen(function* () {
      const story = yield* Story.make(MenuStory, { open: false });
      story.send(request(true)).emitted(requested(true));
      story.props({ open: false });
      assert.isFalse(Story.parts(Menu, story.current).open);
      // The request left nothing behind in the menu's own value either.
      assert.isFalse(story.model.open);
    }),
  );

  it.effect("an item that ran tells the parent its value", () =>
    Effect.gen(function* () {
      const story = yield* Story.make(MenuStory, {});
      story.send(MenuMessage.Picked({ value: "new" })).emitted(MenuEvents.Picked({ value: "new" }));
    }),
  );

  it.effect("a checkbox item without `checked` takes a press itself and tells the parent", () =>
    Effect.gen(function* () {
      const story = yield* Story.make(MenuStory, {});
      const change = { path: [], value: "sidebar", checked: true, reason: "item-press" };
      story.send(MenuMessage.RequestedChecked(change)).emitted(MenuEvents.RequestedChecked(change));
      const menu = Story.parts(Menu, story.current);
      assert.isTrue(menu.checkboxItemState(sidebar).checked);
      // An item the parent holds shows what the parent passes, whatever was asked of it.
      assert.isFalse(menu.checkboxItemState({ ...sidebar, checked: false }).checked);
    }),
  );

  it.effect("a radio group without `value` takes a choice itself and tells the parent", () =>
    Effect.gen(function* () {
      const story = yield* Story.make(MenuStory, {});
      const change = { path: [], group: "sort", value: "date", reason: "item-press" };
      story.send(MenuMessage.RequestedValue(change)).emitted(MenuEvents.RequestedValue(change));
      const menu = Story.parts(Menu, story.current);
      const checked = (group: MenuRadioGroup) =>
        ["name", "date"].filter((value) => menu.radioItemState({ group, value }).checked);
      assert.deepStrictEqual(checked(sort({ initialValue: "name" })), ["date"]);
      // A group the parent holds shows what the parent passes.
      assert.deepStrictEqual(checked(sort({ value: "name" })), ["name"]);
      assert.deepStrictEqual(checked(sort({ value: null })), []);
    }),
  );

  it.effect("each menu keeps its own values, and only the ones a press set", () =>
    Effect.gen(function* () {
      const story = yield* Story.make(MenuStory, {});
      const check = { path: [], value: "pinned", checked: true, reason: "item-press" };
      story.send(MenuMessage.RequestedChecked(check)).emitted(MenuEvents.RequestedChecked(check));
      const pick = { path: [], group: "sort", value: "date", reason: "item-press" };
      story.send(MenuMessage.RequestedValue(pick)).emitted(MenuEvents.RequestedValue(pick));
      const menu = Story.parts(Menu, story.current);
      assert.isTrue(menu.checkboxItemState({ value: "pinned" }).checked);
      // A submenu keyed "" is another menu than the one around it.
      assert.isFalse(menu.sub({ key: "" }).checkboxItemState({ value: "pinned" }).checked);
      // A name the Model's records inherit, like `constructor`, keeps its seed.
      const group = { name: "constructor", initialValue: "a" };
      assert.isTrue(menu.radioItemState({ group, value: "a" }).checked);
    }),
  );

  it.effect("a server render of a closed menu draws its trigger and no content", () =>
    Effect.gen(function* () {
      const { trigger, contents, html } = yield* rendered({});
      for (const expected of [
        'data-slot="menu-trigger"',
        'aria-haspopup="menu"',
        'aria-expanded="false"',
        'type="button"',
      ]) {
        assert.include(trigger, expected);
      }
      assert.lengthOf(contents, 0);
      assert.notInclude(html, "menuitem");
    }),
  );

  it.effect("a server render of an open menu draws the content, named by its trigger", () =>
    Effect.gen(function* () {
      const { trigger, contents, items, html } = yield* rendered({ initialOpen: true });
      assert.include(trigger, 'aria-expanded="true"');
      // The submenu is closed, so only the menu's own content is drawn.
      assert.lengthOf(contents, 1);
      for (const expected of ['role="menu"', 'data-slot="menu-content"', "data-open", "popup"]) {
        assert.include(contents[0], expected);
      }
      // Core names the content by a trigger only once one is in the page, so a server names none.
      assert.isUndefined(attribute(contents[0], "aria-labelledby"));
      assert.strictEqual(attribute(trigger, "aria-controls"), attribute(contents[0], "id"));
      assert.strictEqual(attribute(items[0], "role"), "menuitem");
      // A server doesn't know the platform, so it shows the Control names.
      assert.strictEqual(attribute(items[0], "aria-keyshortcuts"), "Control+N");
      assert.match(html, /<kbd[^>]*data-slot="menu-shortcut"[^>]*>⁦Ctrl\+N⁩<\/kbd>/);
      // A disabled item stays focusable, and any element can be an item.
      const link = /<a [^>]*>/.exec(html)?.[0];
      assert.strictEqual(attribute(link, "role"), "menuitem");
      assert.strictEqual(attribute(link, "aria-disabled"), "true");
      assert.include(/<hr[^>]*>/.exec(html)?.[0], 'role="separator"');
      // The submenu's trigger is an item of the menu around it.
      const sub = /<div class="sub"[^>]*>/.exec(html)?.[0];
      assert.strictEqual(attribute(sub, "role"), "menuitem");
      assert.strictEqual(attribute(sub, "aria-haspopup"), "menu");
      assert.strictEqual(attribute(sub, "aria-expanded"), "false");
    }),
  );

  it.effect("a server render checks the items their seeds and their props say", () =>
    Effect.gen(function* () {
      const page = yield* rendered({ initialOpen: true });
      assert.deepStrictEqual(
        page.checkboxes.map((item) => attribute(item, "aria-checked")),
        ["true", "false"],
      );
      assert.deepStrictEqual(
        page.radios.map((item) => attribute(item, "aria-checked")),
        ["true", "false"],
      );
      // An indicator is drawn only inside a checked item.
      assert.lengthOf(page.html.match(/<i /g) ?? [], 1);
      assert.lengthOf(page.html.match(/<b /g) ?? [], 1);
      // A group is named by its label once the label is in the page, so a server draws both unlinked.
      for (const group of ["group", "radios"]) {
        const tag = new RegExp(`<div class="${group}"[^>]*>`).exec(page.html)?.[0];
        assert.strictEqual(attribute(tag, "role"), "group");
        assert.isUndefined(attribute(tag, "aria-labelledby"));
      }
      assert.lengthOf(page.html.match(/<h3 data-slot="menu-group-label" id="[^"]+"/g) ?? [], 2);

      const held = yield* rendered(
        { initialOpen: true },
        { pinned: { value: "pinned", checked: false }, group: sort({ value: "date" }) },
      );
      assert.strictEqual(attribute(held.checkboxes[0], "aria-checked"), "false");
      assert.deepStrictEqual(
        held.radios.map((item) => attribute(item, "aria-checked")),
        ["false", "true"],
      );
    }),
  );

  it.effect("a server render keeps content mounted, hidden, when asked to", () =>
    Effect.gen(function* () {
      const { contents } = yield* rendered({}, { content: { keepMounted: true } });
      assert.lengthOf(contents, 1);
      assert.match(contents[0]!, / hidden/);
    }),
  );

  it.effect("content with a container is drawn inside an element that stays in its place", () =>
    Effect.gen(function* () {
      // Any object stands in for the element here: a server moves nothing.
      const container = {} as Element;
      const { html } = yield* rendered({ initialOpen: true, container });
      assert.match(html, /<span style="display: ?contents;?"><section [^>]*role="menu"/);
      const inPlace = yield* rendered({ initialOpen: true });
      assert.notMatch(inPlace.html, /<span style="display: ?contents;?"><section/);
    }),
  );

  it("in every order of requests, a menu that keeps its value is open exactly when last asked to be", () => {
    Story.explore(
      MenuStory,
      {},
      {
        depth: 4,
        messages: [request(true), request(false), MenuMessage.ChangedPart()],
        invariant: (story) => Story.parts(Menu, story).open === story.model.open,
      },
    );
  });

  it("in every order of requests, a menu its parent holds never opens itself", () => {
    Story.explore(
      MenuStory,
      { open: false },
      {
        depth: 4,
        messages: [request(true), request(false), MenuMessage.ChangedPart()],
        invariant: (story) => !Story.parts(Menu, story).open && !story.model.open,
      },
    );
  });
});
