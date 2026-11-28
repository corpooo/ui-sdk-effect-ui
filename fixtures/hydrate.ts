// What an `effect-ssr` fixture does, as upstream's `react-ssr` ones do: renders
// the fixture to HTML, shows it, records what the specs read, then hydrates it.
import { HtmlHydrate, HtmlServer } from "@effect/ui/html";
import { Effect } from "effect";

// A component with no props and no requirements, as every fixture is.
type Fixture = Parameters<
  typeof HtmlHydrate.hydrateEffect<string, {}, any, any, never, never, any>
>[0];

type Recorded = Window & {
  __hydrationErrors: string[];
  __serverHtml: string;
  __visibleBeforeHydration: boolean;
};

/**
 * Resolves once the fixture has adopted the server's HTML. Effect UI reports
 * no mismatch: it patches an attribute or text that differs, and builds new
 * nodes where a view stops matching the server's, all before any mount runs.
 * So every change to the server's nodes until a part first binds is recorded
 * as one, beside whatever is logged as an error or a warning meanwhile. Core
 * writes to an element only once it binds, and the renderer announces the
 * first bind with a `ui-sdk-bind` event.
 */
async function hydrateFixture(root: HTMLElement, fixture: Fixture) {
  const errors: string[] = [];
  const recorded = window as unknown as Recorded;
  recorded.__hydrationErrors = errors;
  const { html, state } = await Effect.runPromise(HtmlServer.renderToHtml(fixture, {}));
  root.innerHTML = html;
  // What the page shows before hydration.
  recorded.__serverHtml = root.innerHTML;
  // Whether open content shows before any script runs on it, as server HTML would.
  recorded.__visibleBeforeHydration = !!root
    .querySelector<HTMLElement>('[data-slot$="-content"]')
    ?.checkVisibility();
  const records: MutationRecord[] = [];
  const changes = new MutationObserver((delivered) => records.push(...delivered));
  changes.observe(root, { subtree: true, attributes: true, characterData: true, childList: true });
  const stop = () => {
    records.push(...changes.takeRecords());
    changes.disconnect();
  };
  root.addEventListener("ui-sdk-bind", stop, { capture: true, once: true });
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
  // A page with no parts binds none.
  stop();
  root.removeEventListener("ui-sdk-bind", stop, { capture: true });
  for (const change of records) {
    const node = change.target instanceof Element ? `<${change.target.localName}>` : "text";
    // Effect UI takes its own markers out of the server's HTML.
    const nodes = [...change.addedNodes, ...change.removedNodes];
    if (change.type === "childList" && nodes.every((node) => node instanceof Comment)) {
      continue;
    }
    errors.push(
      change.type === "attributes"
        ? `Hydration changed ${change.attributeName} on the server's ${node}.`
        : change.type === "childList"
          ? `Hydration changed the children of the server's ${node}.`
          : "Hydration changed the server's text.",
    );
  }
}

export { hydrateFixture };
