# ui-sdk-effect-ui

`@corpooo/ui-sdk-effect-ui` renders Vercel's UI SDK components in Effect UI. Each component is a headless Effect UI component over its `@ui-sdk/core` primitive, and upstream's own Playwright specs decide whether it behaves as `@ui-sdk/react` does.

`upstream/ui` is a submodule of `vercel-labs/ui`. Commit nothing into it. Our code and the specs that check it come from that one commit.

## Checks

Run `pnpm upstream` after a clone and whenever the submodule moves. It installs upstream's dependencies with the pnpm upstream pins, builds core's declarations, which our type check reads, and installs Chromium. Until it has run, the type check in `vp check` fails.

- `vp check` formats, lints and type-checks.
- `vp test` runs the unit tests in `packages/*/tests` and `scripts`.
- `pnpm specs` runs upstream's specs against our fixtures, and our own specs in `specs/`. Arguments go to Playwright, such as `pnpm specs toggle.spec.ts` or `pnpm specs --project=effect -g "tab stop"`.
- `pnpm coverage` reads the last `pnpm specs` run and fails when it covered less than it should, or when arguments narrowed it. It prints passed, skipped, failed and fixme per spec file and project.

CI runs only here, with no hosted runner. `vp run ci` runs every step in order: a frozen-lockfile install, `pnpm upstream`, then the four above. It must pass at the head before every push or merge.

## The spec run

`pnpm specs` symlinks each `fixtures/<name>/effect.ts` and `effect-ssr.ts` to where upstream's playground looks for `<name>/<framework>.ts`, and each `fixtures/own/<name>/` entry to `own-<name>/`. It builds and serves the playground, runs Playwright with the projects from `scripts/playwright.config.ts`, and removes the links. The `effect` and `effect-ssr` projects run upstream's specs. The `own` and `own-ssr` projects run ours, with the same `effect` and `effect-ssr` fixture files. The runner serves the playground from its own process, so the server ends with it, and the run fails when that server can't bind. It serves on port 5300, or `PLAYGROUND_PORT`. The runner removes the links on every way out, a kill or a hangup included. Only a `kill -9` leaves them behind: the next run removes them, as does `pnpm specs --restore`.

A spec skips itself where its fixture is missing, so a green run proves nothing by itself. The coverage gate fails when a spec file that opens a fixture we ship ran no test, when a fixture we ship is opened by no spec file, when a test skipped for want of a fixture we ship, when a fixture `coverage-baseline.json` names for a framework, `effect` or `effect-ssr`, is gone, or when a spec file that opens a fixture we ship skips a test for us by its own rule, like `test.skip` for frameworks outside a list. Such a test goes in that file's `exempt`, with why, by its title path: `file › describe › title`, or the describe block or spec file it is in to exempt all of them. An exemption that skips no test fails the gate too.

Our own specs and fixtures are counted apart, and never stand in for one of upstream's. The gate fails when a spec file of our own ran no test in a project that runs it, unless all its tests are `test.fixme`s, and when a test opens an `own-` fixture we don't have. `coverage-baseline.json` names our own fixtures too, as `own-<name>`, under each framework they have an entry for.

## Adding a spec of our own

Write one where upstream's fixtures don't draw a case, like an id from the consumer or events dispatched in one task.

1. Write the page as `fixtures/own/<name>/effect.ts`, and `effect-ssr.ts` beside it where the case is about hydration. The playground serves it as `own-<name>`, a name no upstream fixture has: the run stops if one ever does. It needs the `Before` button, which `open` waits for. Name it in `coverage-baseline.json` under each framework it has an entry for.
2. Write `specs/<name>.spec.ts`. Import `test`, `expect` and the helpers from `../upstream/ui/tests/fixtures.ts`, and open the page with `open("own-<name>")`, so upstream's page harness serves it. Take `Page` and `Locator` types from a helper, as `Parameters<typeof tabNamed>[0]`, since `@playwright/test` resolves only inside the upstream checkout.
3. Run `pnpm specs --project=own --project=own-ssr <name>`, break the code on purpose, and see the spec fail before you trust it.

`own` runs every spec file in `specs/`, and `own-ssr` each one that opens a fixture with an `effect-ssr.ts`. A test only for the hydrated page skips itself where `framework` has no `-ssr`, so each file also needs a test that runs client-rendered, or `own` ran none of it. A known limit is a plain test that asserts today's wrong outcome, so it fails the run once fixed. Title it a known limit and point at its entry in Known limits, in the title and a comment. Keep a twin on the same page that asserts the right outcome, like the case with a value the component keeps, and check first that the presses arrived. A case planned for a later component is a `test.fixme` with a short description.

## Adding a component

1. Write `fixtures/<name>/effect.ts` after upstream's `apps/playground/src/fixtures/<name>/react.tsx`. It renders the same page, since labels, values and order are what the specs find. Name the upstream file in a comment at the top, as `NOTICE` promises. Add `effect-ssr.ts` where React has `react-ssr.tsx`.
2. Run `pnpm specs` and see the component's specs fail.
3. Write the component in `packages/ui-sdk-effect-ui/src/<name>.ts`, add its entry to the package's `exports`, and add the core entry it imports to `paths` in `tsconfig.json`.
4. Run `pnpm specs` until every spec file for the fixture passes, then add its name to each framework's list in `fixtures` in `coverage-baseline.json`.

## How a component renders

`packages/ui-sdk-effect-ui/src/renderer/primitive.ts` is the shared renderer, and its opening comment explains the design. A component that follows `src/toggle.ts` gets these rules from it:

- A value the parent passes runs controlled in core. Core asks for a change through `on<Key>Change`, `emit` turns that into the component's message, and `update` passes it on as a `Requested…` event. A parent refuses by keeping the prop.
- A value the parent leaves out runs uncontrolled in core, seeded with the Model's value as `default<Key>`. Core takes each change at once, and the same `Requested…` message keeps the Model in step, which the server, hydration and a history restore start from. Pass core `<key>` or `default<Key>`, never both.
- A part draws itself with `drawn(builder, shown(handle, slot, props), onChange)`. The view renders every attribute core's `attrs` gives, so server HTML and hydration match. Core writes to an element only after its mount binds it.
- A part core can leave out of the page, like a tab's panel, is wrapped in `whilePresent`. It gives the consumer nothing while it's absent, so the consumer chains on it with `?.` and gives its element a `key`, as Effect UI pairs elements without one by position. Unkeyed, the panel that comes takes over the element of the one that left, with what a person typed in it, as `specs/tabs-panels.spec.ts` shows. An absent part has no mount, so keep a part in the page whose state changes whenever an absent one should come back, as the selected value is in the state of a tabs' root.
- A part whose element can take an id from the consumer takes it as an argument, `tabs.tab(h.button, { value, id })`, and passes it to `shown`. A part can't read the id the consumer set on the builder. The parts drawn after it point at that id from the first render, on a server too. A reference core sets only in a page, like a tab's `aria-controls`, which points only at a panel in the page, comes once hydrated. `specs/tabs-ids.spec.ts` checks both.
- Every part of one core instance comes from one component's `parts`, drawn in the consumer's `view` closure. `around` covers an instance that reads another one of the same component, like a toggle its group. Two components whose instances read each other, like a submenu and its menu, need Effect UI's `shares` and `reads` to carry the outer instance to the inner one. How is open: on a server the inner one has to read the outer render's own detached instance, and in a page it must never hand the outer instance options. No component needs it yet.
- A message from core arrives as a `ui-sdk-message` event on the part's element. Keep it that way: a mount's result arrives a task later, and specs that read the page straight after a click then fail.
- Name props, messages and events as Effect UI's guide says, in `node_modules/@effect/ui/ai-docs`. A seed prop is `initial<Key>`, where React has `default<Key>`.

Known limits:

- A refused change makes core's development build warn a second later that the value stayed. Core expects a refusal as `details.cancel()` inside the callback, which a message can't call.
- For a value the parent holds, core's state follows the prop one render later. Of two requests dispatched in one task, core makes and judges the second from the old value. One that returns to that value is dropped, like tabs moved away and back. One made from it loses the first, like a toggle or a group's toggle pressed twice, which asks to be pressed both times, or two toggles of a multiple group, of which only the second stays pressed. Presses from a person arrive in separate tasks, and a value the component keeps has no such limit. `specs/tabs-keys.spec.ts` and `specs/toggle-presses.spec.ts` assert these outcomes as known limits.
- A parent that passes a value and then leaves it out leaves core on the last value it passed and the Model on the one from before, so a server render or a restore shows the older one. Core's development build warns when a value stops being passed.
- A value a component keeps starts from the Model whenever its parts leave the page and come back. Core can't start uncontrolled tabs on no tab, so tabs asked for none then show the first enabled one.
- Two parts of one component can't share an element: Effect UI keeps one mount per component and element, and both parts would answer each message.
- An instance's id comes from its component's path. Two roots mounted from one component need distinct `key`s in their mount options, or they share one core instance.

## Moving the pins

Both pins move in a pull request of their own.

- **UI SDK.** Check out the new commit in `upstream/ui`, `git add upstream/ui`, and run `pnpm upstream`. Then run every check. Compare our fixtures with upstream's React ones for what changed since the old commit, with `git -C upstream/ui diff <old> <new> -- apps/playground/src/fixtures/<name> tests/fixtures`.
- **Effect UI.** Change the `@effect/ui` URL in the catalog of `pnpm-workspace.yaml` to the new `pkg.pr.new` commit, and `effect` beside it to the version that build's `peerDependencies` asks for. Run `vp install`, then every check.

Update `lineage.yaml` when a source changes, and the status table in `README.md` when a component lands.
