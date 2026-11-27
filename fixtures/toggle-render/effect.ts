// The `toggle-render` fixture, rewritten for Effect UI from UI SDK's
// apps/playground/src/fixtures/toggle-render/react.tsx (Apache-2.0, see
// NOTICE). Where React passes `render`, a headless part takes the element.
// Here the toggle and the group keep their own values.
import { Button } from "@corpooo/ui-sdk-effect-ui/button";
import { Separator } from "@corpooo/ui-sdk-effect-ui/separator";
import { Toggle, ToggleGroup } from "@corpooo/ui-sdk-effect-ui/toggle";
import { UiSchema } from "@effect/ui";
import { BrowserHost, Html } from "@effect/ui/html";
import { Effect, Layer, Schema } from "effect";

const FixtureMessage = UiSchema.TaggedEnum({
  PressedSpan: {},
  RequestedPressedStar: { pressed: Schema.Boolean },
  RequestedValueView: { value: Schema.Array(Schema.String) },
});

const Fixture = Html.component({
  name: "ToggleRenderFixture",
  model: Schema.Struct({ action: Schema.String }),
  message: FixtureMessage,
}).make({
  init: () => ({ action: "" }),
  update: (_, message) =>
    FixtureMessage.match(message, {
      PressedSpan: () => ({ action: "span" }),
      RequestedPressedStar: ({ pressed }) => ({ action: pressed ? "star" : "unstar" }),
      RequestedValueView: ({ value }) => ({ action: value.join(", ") }),
    }),
  view: (h, model) =>
    h.div.class("fixture").children(
      h.button("Before"),
      Button(h, {
        key: "span",
        onEmit: { Pressed: () => FixtureMessage.PressedSpan() },
        view: (button) => button.root(h.span.class("button")).children("Span button"),
      }),
      Button(h, {
        key: "old-docs",
        props: { disabled: true },
        onEmit: { Pressed: () => undefined },
        view: (button) =>
          button.root(h.a.class("button").attr("href", "#old")).children("Old docs"),
      }),
      Toggle(h, {
        onEmit: {
          RequestedPressed: ({ pressed }) => FixtureMessage.RequestedPressedStar({ pressed }),
        },
        // A part's state is a value of the parts, where React hands it to a function.
        view: (toggle) =>
          toggle
            .root(h.button.class(`toggle ${toggle.pressed ? "is-pressed" : "is-unpressed"}`))
            .children(
              h.span.attr("aria-hidden", "true").children(toggle.pressed ? "★" : "☆"),
              " Star",
            ),
      }),
      ToggleGroup(h, {
        props: { initialValue: ["grid"] },
        onEmit: { RequestedValue: ({ value }) => FixtureMessage.RequestedValueView({ value }) },
        view: (toggleGroup) =>
          toggleGroup
            .group(h.div.class("toggle-group").attr("aria-label", "View"))
            .children(
              toggleGroup
                .item(h.span.key("grid").class("toggle"), { value: "grid" })
                .children("Grid"),
              toggleGroup
                .item(h.span.key("list").class("toggle"), { value: "list" })
                .children("List"),
            ),
      }),
      Separator(h.hr.class("rule")),
      h.button("After"),
      h.output.attrs({ role: "status", "aria-label": "Last action" }).children(model.action),
    ),
});

function mount(root: HTMLElement) {
  Layer.launch(BrowserHost.mount(Fixture, {}, root)).pipe(Effect.runFork);
}

export { mount };
