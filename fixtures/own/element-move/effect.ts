// A toggle that Effect UI moves to another parent, which upstream's fixtures
// never do. The toggle is the root element of a keep-alive child, and Effect
// UI moves a kept child's nodes to wherever the view writes it next. "Move"
// writes it in the other shelf. specs/element-move.spec.ts moves and presses it.
import { Toggle } from "@corpooo/ui-sdk-effect-ui/toggle";
import { UiSchema } from "@effect/ui";
import { BrowserHost, Html } from "@effect/ui/html";
import { Effect, Layer, Schema } from "effect";

const Shelf = Schema.Literals(["First", "Second"]);

const FixtureMessage = UiSchema.TaggedEnum({
  ClickedMove: {},
});

const KeptToggle = Html.component({
  name: "KeptToggle",
  model: Schema.Null,
  message: Schema.Never,
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    Toggle(h, {
      view: (toggle) => toggle.root(h.button.class("toggle")).children("Moved toggle"),
    }),
});

function fixture() {
  return Html.component({
    name: "ElementMoveFixture",
    model: Schema.Struct({ shelf: Shelf }),
    message: FixtureMessage,
  }).make({
    init: () => ({ shelf: "First" as const }),
    update: ($, message) =>
      FixtureMessage.match(message, {
        ClickedMove: () => $.evolve({ shelf: (shelf) => (shelf === "First" ? "Second" : "First") }),
      }),
    view: (h, model) => {
      const shelf = (name: typeof Shelf.Type) =>
        h.section
          .key(name)
          .attr("aria-label", `${name} shelf`)
          .children(model.shelf === name && h.keepAlive((s) => KeptToggle(s, { key: "toggle" })));
      return h.div
        .class("fixture")
        .children(
          h.button("Before"),
          shelf("First"),
          shelf("Second"),
          h.button.on("click", () => FixtureMessage.ClickedMove()).children("Move"),
        );
    },
  });
}

function mount(root: HTMLElement) {
  Layer.launch(BrowserHost.mount(fixture(), {}, root)).pipe(Effect.runFork);
}

export { fixture, mount };
