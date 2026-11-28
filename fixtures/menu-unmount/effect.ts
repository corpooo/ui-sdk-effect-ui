// The `menu-unmount` fixture, rewritten for Effect UI from UI SDK's
// apps/playground/src/fixtures/menu-unmount/react.tsx (Apache-2.0, see
// NOTICE). The fixture holds `open`, and draws the content only while it's open.
import { Menu } from "@corpooo/ui-sdk-effect-ui/menu";
import { UiSchema } from "@effect/ui";
import { BrowserHost, Html } from "@effect/ui/html";
import { Effect, Layer, Schema } from "effect";

const FixtureMessage = UiSchema.TaggedEnum({
  RequestedOpenMenu: { open: Schema.Boolean },
});

const Fixture = Html.component({
  name: "MenuUnmountFixture",
  model: Schema.Struct({ open: Schema.Boolean }),
  message: FixtureMessage,
}).make({
  init: () => ({ open: false }),
  update: (_, message) =>
    FixtureMessage.match(message, { RequestedOpenMenu: ({ open }) => ({ open }) }),
  view: (h, model) =>
    h.div.class("fixture").children(
      h.button("Before"),
      Menu(h, {
        props: { open: model.open },
        onEmit: {
          RequestedOpen: ({ open }) => FixtureMessage.RequestedOpenMenu({ open }),
          Picked: () => undefined,
          RequestedChecked: () => undefined,
          RequestedValue: () => undefined,
        },
        view: (menu) =>
          h.div
            .style({ display: "contents" })
            .children(
              menu.trigger(h.button).children("Actions"),
              model.open &&
                menu
                  .content(h.div.key("content").class("popup fill-in"))
                  ?.children(
                    menu.item(h.div.class("item"), { value: "rename" }).children("Rename"),
                    menu.item(h.div.class("item"), { value: "delete" }).children("Delete"),
                  ),
            ),
      }),
    ),
});

function mount(root: HTMLElement) {
  Layer.launch(BrowserHost.mount(Fixture, {}, root)).pipe(Effect.runFork);
}

export { mount };
