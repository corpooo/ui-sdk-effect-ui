# ui-sdk-effect-ui

`@corpooo/ui-sdk-effect-ui` renders Vercel's UI SDK components in Effect UI. Each component is a headless Effect UI component over its `@ui-sdk/core` primitive, and upstream's own Playwright specs decide whether it behaves as `@ui-sdk/react` does.

`upstream/ui` is a submodule of `vercel-labs/ui`. Commit nothing into it. Our code and the specs that check it come from that one commit.

## Checks

Run `pnpm upstream` after a clone and whenever the submodule moves. It installs upstream's dependencies with the pnpm upstream pins, builds core's declarations, which our type check reads, and installs Chromium. Until it has run, the type check in `vp check` fails.

- `vp check` formats, lints and type-checks.
- `vp test` runs the unit tests in `packages/*/tests` and `scripts`.
- `pnpm specs` runs upstream's specs against our fixtures. Arguments go to Playwright, such as `pnpm specs toggle.spec.ts` or `pnpm specs --project effect -g "tab stop"`.
- `pnpm coverage` reads the last `pnpm specs` run and fails when it covered less than it should, or when arguments narrowed it. It prints passed, skipped and failed per spec file.

CI runs these five in that order, in `.github/workflows/ci.yml`.

## The spec run

`pnpm specs` symlinks each `fixtures/<name>/effect.ts` and `effect-ssr.ts` to where upstream's playground looks for `<name>/<framework>.ts`, builds the playground, runs Playwright with the `effect` and `effect-ssr` projects from `scripts/playwright.config.ts`, and removes the links. A run that was killed leaves links behind. The next run removes them, and so does `pnpm specs --restore`.

A spec skips itself where its fixture is missing, so a green run proves nothing by itself. The coverage gate fails when a spec file that opens a fixture we ship ran no test, or when we ship fewer fixtures than `coverage-baseline.json` says. A spec file that skips every test for us by its own rule goes in that file's `exempt`, with why.

## Adding a component

1. Write `fixtures/<name>/effect.ts` after upstream's `apps/playground/src/fixtures/<name>/react.tsx`. It renders the same page, since labels, values and order are what the specs find. Name the upstream file in a comment at the top, as `NOTICE` promises. Add `effect-ssr.ts` where React has `react-ssr.tsx`.
2. Run `pnpm specs` and see the component's specs fail.
3. Write the component in `packages/ui-sdk-effect-ui/src/<name>.ts`, add its entry to the package's `exports`, and add the core entry it imports to `paths` in `tsconfig.json`.
4. Run `pnpm specs` until every spec file for the fixture passes, then raise `fixtures` in `coverage-baseline.json`.

## How a component renders

`packages/ui-sdk-effect-ui/src/renderer/primitive.ts` is the shared renderer, and its opening comment explains the design. A component that follows `src/toggle.ts` gets these rules from it:

- Core runs every value as controlled. The value is the prop when the parent passes one, and the Model's otherwise. Core asks for a change through `on<Key>Change`, `emit` turns that into the component's message, and `update` passes it on as a `Requested…` event. A parent refuses by keeping the prop.
- A part draws itself with `drawn(builder, shown(handle, slot, props), onChange)`. The view renders every attribute core's `attrs` gives, so server HTML and hydration match. Core writes to an element only after its mount binds it.
- A message from core arrives as a `ui-sdk-message` event on the part's element. Keep it that way: a mount's result arrives a task later, and specs that read the page straight after a click then fail.
- Name props, messages and events as Effect UI's guide says, in `node_modules/@effect/ui/ai-docs`. A seed prop is `initial<Key>`, where React has `default<Key>`.

Known limits:

- A refused change makes core's development build warn a second later that the value stayed. Core expects a refusal as `details.cancel()` inside the callback, which a message can't call.
- Core's state follows the Model one render later, so two presses dispatched in one task both read the old state. Presses from a person arrive in separate tasks.
- An instance's id comes from its component's path. Two roots mounted from one component need distinct `key`s in their mount options, or they share one core instance.

## Moving the pins

Both pins move in a pull request of their own.

- **UI SDK.** Check out the new commit in `upstream/ui`, `git add upstream/ui`, and run `pnpm upstream`. Then run every check. Compare our fixtures with upstream's React ones for what changed since the old commit, with `git -C upstream/ui diff <old> <new> -- apps/playground/src/fixtures/<name> tests/fixtures`.
- **Effect UI.** Change the `@effect/ui` URL in the catalog of `pnpm-workspace.yaml` to the new `pkg.pr.new` commit, and `effect` beside it to the version that build's `peerDependencies` asks for. Run `vp install`, then every check.

Update `lineage.yaml` when a source changes, and the status table in `README.md` when a component lands.
