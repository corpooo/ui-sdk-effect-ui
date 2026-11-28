// A page whose hydration render differs from the server's in an attribute, a
// text and an element, beside a toggle whose part core binds. It checks the
// harness, not a component: specs/hydration-mismatch.spec.ts reads what
// `fixtures/hydrate.ts` recorded.
import { Toggle } from "@corpooo/ui-sdk-effect-ui/toggle";
import { UiSchema } from "@effect/ui";
import { BrowserHost, Html } from "@effect/ui/html";
import { Effect, Layer, Schema } from "effect";

const FixtureMessage = UiSchema.TaggedEnum({ RequestedPressedBold: {} });

// The server's render is the first, hydration's the second.
let renders = 0;

function fixture() {
  return Html.component({
    name: "HydrationMismatchFixture",
    model: Schema.Null,
    message: FixtureMessage,
  }).make({
    init: () => null,
    update: ($, message) => FixtureMessage.match(message, { RequestedPressedBold: () => $.model }),
    view: (h) => {
      const render = renders++;
      return h.div.children(
        h.button("Before"),
        h.p.attr("data-render", `${render}`).children(`Render ${render}`),
        render === 0 ? h.span("Server only") : h.em("Client only"),
        Toggle(h, {
          props: { initialPressed: false },
          onEmit: { RequestedPressed: () => FixtureMessage.RequestedPressedBold() },
          view: (toggle) => toggle.root(h.button).children("Bold"),
        }),
      );
    },
  });
}

function mount(root: HTMLElement) {
  Layer.launch(BrowserHost.mount(fixture(), {}, root)).pipe(Effect.runFork);
}

export { fixture, mount };
