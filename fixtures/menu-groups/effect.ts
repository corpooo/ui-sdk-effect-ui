// The `menu-groups` fixture, rewritten for Effect UI from UI SDK's
// apps/playground/src/fixtures/menu-groups/react.tsx (Apache-2.0, see
// NOTICE). Groups of items the specs reorder while the menu is open.
import { Menu } from "@corpooo/ui-sdk-effect-ui/menu";
import { Subscription, UiSchema } from "@effect/ui";
import { BrowserHost, Html } from "@effect/ui/html";
import { Effect, Layer, Schema, Stream } from "effect";
import { itemsChangeEvent } from "tests/fixtures/items.ts";
import { changedMenuGroups, menuGroups } from "tests/fixtures/menu-groups.ts";

const FixtureMessage = UiSchema.TaggedEnum({
  ChangedItems: { change: Schema.String },
});

// A spec names a change with an event on the document, since a press would close the menu.
const itemChanges = Subscription.make(
  "ItemChanges",
  Stream.fromEventListener<CustomEvent<string>>(document, itemsChangeEvent).pipe(
    Stream.map((event) => FixtureMessage.ChangedItems({ change: event.detail })),
  ),
);

const Fixture = Html.component({
  name: "MenuGroupsFixture",
  model: Schema.Struct({ reversed: Schema.Boolean }),
  message: FixtureMessage,
}).make({
  init: () => ({ reversed: false }),
  update: ($, message) =>
    FixtureMessage.match(message, {
      ChangedItems: ({ change }) => (change === "reversed" ? { reversed: true } : $.model),
    }),
  subscriptions: () => [itemChanges],
  view: (h, model) =>
    h.div.class("fixture").children(
      h.button("Before"),
      Menu(h, {
        onEmit: {
          RequestedOpen: () => undefined,
          Picked: () => undefined,
          RequestedChecked: () => undefined,
          RequestedValue: () => undefined,
        },
        view: (menu) =>
          h.div.style({ display: "contents" }).children(
            menu.trigger(h.button).children("Actions"),
            menu.content(h.div.key("content").class("popup"))?.children(
              (model.reversed ? changedMenuGroups.reversed : menuGroups).map((group) =>
                menu.group(h.div.key(group.label), group.label).children(
                  menu.groupLabel(h.div.class("label"), group.label).children(group.label),
                  group.items.map((item) =>
                    menu
                      .item(h.div.key(item.value).class("item"), { value: item.value })
                      .children(item.label),
                  ),
                ),
              ),
            ),
          ),
      }),
    ),
});

function mount(root: HTMLElement) {
  Layer.launch(BrowserHost.mount(Fixture, {}, root)).pipe(Effect.runFork);
}

export { mount };
