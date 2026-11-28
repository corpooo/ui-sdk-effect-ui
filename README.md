# ui-sdk-effect-ui

Vercel's [UI SDK](https://github.com/vercel-labs/ui) components for [Effect UI](https://github.com/Effect-TS/ui).

Each component is a headless Effect UI component over its `@ui-sdk/core` primitive. Core keeps the behaviour: keyboard handling, focus, ARIA and state rules. Effect UI keeps the state in a Model and draws the markup you write. The aim is the behaviour of `@ui-sdk/react`, and upstream's own Playwright specs check it, unmodified, against fixtures written with this package.

## Status

Early, and not published. Both dependencies are pinned to single commits: UI SDK at `655c279a`, and Effect UI at the `pkg.pr.new` build of `22128c65` with `effect` 4.1.6.

| Component           | Entry                                 | Upstream specs                     |
| ------------------- | ------------------------------------- | ---------------------------------- |
| Toggle, ToggleGroup | `@corpooo/ui-sdk-effect-ui/toggle`    | pass, client-rendered and hydrated |
| Button              | `@corpooo/ui-sdk-effect-ui/button`    | pass, client-rendered and hydrated |
| Separator           | `@corpooo/ui-sdk-effect-ui/separator` | pass, client-rendered and hydrated |
| Tabs                | `@corpooo/ui-sdk-effect-ui/tabs`      | pass, client-rendered and hydrated |
| Menu                | `@corpooo/ui-sdk-effect-ui/menu`      | pass, client-rendered and hydrated |

That is 11 of upstream's 146 fixtures: `toggle`, `toggle-render`, `tabs`, `tabs-render`, `tabs-perf`, `menu`, `menu-cases`, `menu-groups`, `menu-perf`, `menu-render` and `menu-unmount`. The menu's also run with its popup in a container and as a sheet, as upstream runs React's.

Menu takes no `items` yet, so upstream's data menus have no fixture. It has no context trigger, item icon or trigger payload either.

## Use

A component takes your `h` and a `view` that applies its parts to elements of your own.

```ts
import { Toggle } from "@corpooo/ui-sdk-effect-ui/toggle";

// In a view. The toggle keeps its own value and reports each press.
Toggle(h, {
  props: { initialPressed: false },
  onEmit: { RequestedPressed: ({ pressed }) => EditorMessage.ToggledBold({ pressed }) },
  view: (toggle) => toggle.root(h.button.class("tool")).children("Bold"),
});
```

Pass `pressed` in the props to hold the value yourself. A press then only asks, with `RequestedPressed`. Pass the new value back to accept it, or keep the old one to refuse.

A part that core leaves out of the page gives nothing to chain on. A tab's panel is one while its tab isn't selected, so chain on it with `?.`, and give its element a `key`.

```ts
import { Tabs } from "@corpooo/ui-sdk-effect-ui/tabs";

Tabs(h, {
  props: { initialValue: "account" },
  onEmit: { RequestedValue: () => undefined },
  view: (tabs) =>
    tabs
      .root(h.div)
      .children(
        tabs
          .list(h.div.attr("aria-label", "Settings"))
          .children(
            tabs.tab(h.button, { value: "account" }).children("Account"),
            tabs.tab(h.button, { value: "billing" }).children("Billing"),
          ),
        tabs.panel(h.div.key("account"), { value: "account" })?.children("Your account."),
        tabs.panel(h.div.key("billing"), { value: "billing" })?.children("Your invoices."),
      ),
});
```

A menu has no element of its own, and a view is one element, so wrap its trigger and content. `menu.content` gives nothing while the menu is closed. `menu.sub` gives a submenu's parts, the same ones.

```ts
import { Menu } from "@corpooo/ui-sdk-effect-ui/menu";

Menu(h, {
  onEmit: {
    // An item that runs says which. The menu has already closed.
    Picked: ({ value }) => EditorMessage.PickedFileAction({ value }),
    RequestedOpen: () => undefined,
    RequestedChecked: () => undefined,
    RequestedValue: () => undefined,
  },
  view: (menu) => {
    const share = menu.sub({ key: "share" });
    return h.div
      .style({ display: "contents" })
      .children(
        menu.trigger(h.button).children("File"),
        menu
          .content(h.div.key("content").class("popup"))
          ?.children(
            menu
              .item(h.div, { value: "new", shortcut: "mod+n" })
              .children("New", menu.shortcut(h.span, "mod+n")),
            menu.separator(h.div),
            menu
              .checkboxItem(h.div, { value: "sidebar", initialChecked: true })
              .children("Show sidebar"),
            share.trigger(h.div).children("Share"),
            share
              .content(h.div.key("share").class("popup"))
              ?.children(share.item(h.div, { value: "email" }).children("Email")),
          ),
      );
  },
});
```

Pass `open` to hold whether it's open, `checked` to a checkbox item and `value` to a radio group to hold theirs. Each then only asks, with `RequestedOpen`, `RequestedChecked` and `RequestedValue`.

## Develop

```sh
git clone --recurse-submodules https://github.com/corpooo/ui-sdk-effect-ui
cd ui-sdk-effect-ui
vp install
pnpm upstream   # upstream's dependencies, core's declarations, Chromium
vp check
vp test
pnpm specs      # upstream's specs against our fixtures, and our own specs
pnpm coverage   # what that run covered
```

There is no hosted CI. `vp run ci` runs every step above in order, and must pass before a push or merge.

`AGENTS.md` says how the spec run works and how to add a component.

## License

MIT. The fixtures under `fixtures/`, but for `fixtures/own/`, are rewritten from UI SDK's, which are Apache-2.0. See `NOTICE`.
