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

That is 5 of upstream's 146 fixtures: `toggle`, `toggle-render`, `tabs`, `tabs-render` and `tabs-perf`.

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

A part that core leaves out of the page gives nothing to chain on. A tab's panel is one while its tab isn't selected, so chain on it with `?.`.

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
        tabs.panel(h.div, { value: "account" })?.children("Your account."),
        tabs.panel(h.div, { value: "billing" })?.children("Your invoices."),
      ),
});
```

## Develop

```sh
git clone --recurse-submodules https://github.com/corpooo/ui-sdk-effect-ui
cd ui-sdk-effect-ui
vp install
pnpm upstream   # upstream's dependencies, core's declarations, Chromium
vp check
vp test
pnpm specs      # upstream's specs against our fixtures
pnpm coverage   # what that run covered
```

`AGENTS.md` says how the spec run works and how to add a component.

## License

MIT. The fixtures under `fixtures/` are rewritten from UI SDK's, which are Apache-2.0. See `NOTICE`.
