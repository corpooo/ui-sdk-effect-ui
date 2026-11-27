// What an `effect-ssr` fixture does, as upstream's `react-ssr` ones do: renders
// the fixture to HTML, shows it, records what the specs read, then hydrates it.
import { HtmlHydrate, HtmlServer } from "@effect/ui/html";
import { Effect } from "effect";

// A component with no props and no requirements, as every fixture is.
type Fixture = Parameters<
  typeof HtmlHydrate.hydrateEffect<string, {}, any, any, never, never, any>
>[0];

type Recorded = Window & { __hydrationErrors: string[]; __serverHtml: string };

/**
 * Resolves once the fixture has adopted the server's HTML. Effect UI reports
 * no mismatch: where a view stops matching the server's nodes, it builds new
 * ones in their place. So every server element that left the page is recorded
 * as one, beside whatever is logged as an error or a warning meanwhile.
 */
async function hydrateFixture(root: HTMLElement, fixture: Fixture) {
  const errors: string[] = [];
  const recorded = window as unknown as Recorded;
  recorded.__hydrationErrors = errors;
  const { html, state } = await Effect.runPromise(HtmlServer.renderToHtml(fixture, {}));
  root.innerHTML = html;
  // What the page shows before hydration.
  recorded.__serverHtml = root.innerHTML;
  const served = [...root.querySelectorAll("*")];
  for (const level of ["warn", "error"] as const) {
    const log = console[level];
    console[level] = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
      log(...args);
    };
  }
  await new Promise<void>((adopted) =>
    Effect.gen(function* () {
      const app = yield* HtmlHydrate.hydrateEffect(fixture, {}, root, state);
      yield* app.adopted;
      adopted();
      return yield* Effect.never;
    }).pipe(Effect.scoped, Effect.runFork),
  );
  for (const element of served) {
    if (!element.isConnected) {
      errors.push(`Hydration built a new <${element.localName}> in place of the server's.`);
    }
  }
}

export { hydrateFixture };
