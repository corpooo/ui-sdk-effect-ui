import { Component } from "@effect/ui";
import { Html, HtmlServer } from "@effect/ui/html";
import { Story } from "@effect/ui/testing";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import {
  Tabs,
  TabsEvents,
  TabsMessage,
  TabsModel,
  type TabsPanel,
  type TabsProps,
  type TabsTab,
} from "../src/tabs.ts";
import { storied } from "./story.ts";

const TabsStory = storied<typeof TabsModel.Type, typeof TabsMessage.Type>()(Tabs);

const items: TabsTab[] = [
  { value: "billing", disabled: true },
  { value: "account" },
  { value: "password" },
];

// Core asks for another tab through `onValueChange`, which reaches `update`
// as `RequestedValue`. These send that message, as core would, and read which
// tabs the parts then show selected, asked in the order a consumer draws them.
const request = (value: string | null) =>
  TabsMessage.RequestedValue({ value, reason: "item-press" });
const requested = (value: string | null) =>
  TabsEvents.RequestedValue({ value, reason: "item-press" });

const selected = (tabs: Component.Headless.Parts<typeof Tabs>) =>
  items.filter((item) => tabs.tabState(item).selected).map((item) => item.value);

// A page of the tabs, each with a `section` for its panel, as a server renders it.
const rendered = (props: typeof TabsProps.Type, panel: Partial<TabsPanel> = {}) =>
  Effect.gen(function* () {
    const Page = Html.component({ name: "Page", model: Schema.Null, message: Schema.Never }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Tabs(h, {
          props,
          onEmit: { RequestedValue: () => undefined },
          view: (tabs) =>
            tabs.root(h.div).children(
              tabs.list(h.div.attr("aria-label", "Settings")).children(
                items.map((item) =>
                  tabs
                    .tab(h.button.key(item.value), { ...item, id: `${item.value}-tab` })
                    .children(tabs.tabIcon(h.i).children("★"), item.value),
                ),
                tabs.indicator(h.span),
              ),
              items.map(({ value }) =>
                tabs
                  .panel(h.section.key(value).class("panel"), { value, ...panel })
                  ?.children(value),
              ),
            ),
        }),
    });
    const { html } = yield* HtmlServer.renderToHtml(Page, {});
    return {
      html,
      tabs: html.match(/<button[^>]*>/g) ?? [],
      panels: html.match(/<section[^>]*>/g) ?? [],
    };
  });

describe("Tabs", () => {
  it.effect("without a value, the first enabled tab is selected", () =>
    Effect.gen(function* () {
      const story = yield* Story.make(TabsStory, {});
      assert.deepStrictEqual(selected(Story.parts(Tabs, story.current)), ["account"]);
      // Nobody asked for it, so the Model holds no value yet.
      assert.isNull(story.model.value);
    }),
  );

  it.effect("it starts on the tab it's asked to", () =>
    Effect.gen(function* () {
      const story = yield* Story.make(TabsStory, { initialValue: "password" });
      assert.deepStrictEqual(selected(Story.parts(Tabs, story.current)), ["password"]);
    }),
  );

  it.effect("without a value prop, it takes another tab itself and tells its parent", () =>
    Effect.gen(function* () {
      const story = yield* Story.make(TabsStory, { initialValue: "account" });
      story.send(request("password")).emitted(requested("password"));
      assert.deepStrictEqual(selected(Story.parts(Tabs, story.current)), ["password"]);
      assert.strictEqual(Story.parts(Tabs, story.current).value, "password");
    }),
  );

  it.effect(
    "with a value prop, a request only asks, and the parent accepts by passing it back",
    () =>
      Effect.gen(function* () {
        const story = yield* Story.make(TabsStory, { value: "account" });
        story.send(request("password")).emitted(requested("password"));
        assert.deepStrictEqual(selected(Story.parts(Tabs, story.current)), ["account"]);
        story.props({ value: "password" });
        assert.deepStrictEqual(selected(Story.parts(Tabs, story.current)), ["password"]);
      }),
  );

  it.effect("a parent refuses a request by keeping the prop", () =>
    Effect.gen(function* () {
      const story = yield* Story.make(TabsStory, { value: "account" });
      story.send(request("password")).emitted(requested("password"));
      story.props({ value: "account" });
      assert.deepStrictEqual(selected(Story.parts(Tabs, story.current)), ["account"]);
      // The request left nothing behind in the tabs' own value either.
      assert.isNull(story.model.value);
    }),
  );

  it.effect("a parent that passes null selects no tab", () =>
    Effect.gen(function* () {
      const story = yield* Story.make(TabsStory, { value: null });
      assert.deepStrictEqual(selected(Story.parts(Tabs, story.current)), []);
    }),
  );

  it.effect("a server render draws only the selected tab's panel, named by its tab", () =>
    Effect.gen(function* () {
      const { tabs, panels } = yield* rendered({});
      assert.deepStrictEqual(
        tabs.map((tab) => /aria-selected="(\w+)"/.exec(tab)?.[1]),
        ["false", "true", "false"],
      );
      assert.lengthOf(panels, 1);
      for (const attribute of [
        'role="tabpanel"',
        'data-slot="tabs-panel"',
        // The id the tab's author gave it, in place of the one core makes.
        'aria-labelledby="account-tab"',
        "data-selected",
        'class="panel"',
      ]) {
        assert.include(panels[0], attribute);
      }
      assert.include(tabs[1], 'id="account-tab"');
    }),
  );

  it.effect("a server render draws a kept panel hidden while its tab isn't selected", () =>
    Effect.gen(function* () {
      const { panels } = yield* rendered({ initialValue: "password" }, { keepMounted: true });
      assert.deepStrictEqual(
        panels.map((panel) => / hidden/.test(panel)),
        [true, true, false],
      );
    }),
  );

  it.effect(
    "a server render draws a tab's icon hidden from screen readers, and the indicator",
    () =>
      Effect.gen(function* () {
        const { html } = yield* rendered({});
        const icon = /<i[^>]*>/.exec(html)?.[0] ?? "";
        assert.include(icon, 'data-slot="tabs-tab-icon"');
        assert.include(icon, 'aria-hidden="true"');
        const indicator = /<span[^>]*>/.exec(html)?.[0] ?? "";
        assert.include(indicator, 'data-slot="tabs-indicator"');
        assert.include(indicator, 'role="presentation"');
      }),
  );

  it.effect("a server render draws no panel for a parent that selects no tab", () =>
    Effect.gen(function* () {
      const { panels } = yield* rendered({ value: null });
      assert.lengthOf(panels, 0);
    }),
  );

  // What core asks for from a press or a key: a tab that isn't disabled.
  const presses = [request("account"), request("password"), TabsMessage.ChangedPart()];
  // A controller can also ask for no tab. Tabs that keep their value then
  // show none in a page, and the first enabled one where they're made again
  // from the Model, which is all a story reads, so only a parent is asked.
  const messages = [...presses, request(null)];

  it("in every order of requests, tabs that keep their value show exactly one tab selected, never a disabled one", () => {
    Story.explore(
      TabsStory,
      {},
      {
        messages: presses,
        invariant: (story) => {
          const tabs = selected(Story.parts(Tabs, story));
          return (
            tabs.length === 1 &&
            // The tab asked for last, or the first enabled one when none was.
            tabs[0] === (story.model.value ?? "account") &&
            // What went on to the parent is what the tabs took.
            story.emitted.every((event) => event.value === story.model.value)
          );
        },
        // Core's own changes render again, and change no value.
        transition: ({ before, message, after }) =>
          message._tag === "RequestedValue"
            ? after.value === message.value
            : after.value === before.value,
        depth: 4,
      },
    );
  });

  it("in every order of requests, tabs whose parent decides never change by themselves", () => {
    Story.explore(
      TabsStory,
      { value: "password" },
      {
        messages,
        invariant: (story) => {
          const tabs = selected(Story.parts(Tabs, story));
          return (
            tabs.length === 1 &&
            tabs[0] === "password" &&
            // The Model's own value stays where `init` put it.
            story.model.value === null
          );
        },
        depth: 4,
      },
    );
  });
});
