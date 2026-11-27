import { Story } from "@effect/ui/testing";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import {
  Toggle,
  ToggleEvents,
  ToggleGroup,
  ToggleGroupEvents,
  ToggleGroupMessage,
  ToggleGroupModel,
  ToggleMessage,
  ToggleModel,
} from "../src/toggle.ts";
import { storied } from "./story.ts";

const ToggleStory = storied<typeof ToggleModel.Type, typeof ToggleMessage.Type>()(Toggle);
const ToggleGroupStory = storied<typeof ToggleGroupModel.Type, typeof ToggleGroupMessage.Type>()(
  ToggleGroup,
);

// Core asks for a change through `on<Key>Change`, which reaches `update` as a
// `Requested…` message. These send that message, as core would, and read what
// the parts then show, which a render draws.
const press = (pressed: boolean) => ToggleMessage.RequestedPressed({ pressed, reason: "press" });
const pressedEvent = (pressed: boolean) =>
  ToggleEvents.RequestedPressed({ pressed, reason: "press" });

describe("Toggle", () => {
  it.effect("without a pressed prop, it takes a press itself and tells its parent", () =>
    Effect.gen(function* () {
      const story = yield* Story.make(ToggleStory, {});
      assert.isFalse(Story.parts(Toggle, story.current).pressed);
      story.send(press(true)).emitted(pressedEvent(true));
      assert.isTrue(Story.parts(Toggle, story.current).pressed);
    }),
  );

  it.effect("it starts pressed when asked to", () =>
    Effect.gen(function* () {
      const story = yield* Story.make(ToggleStory, { initialPressed: true });
      assert.isTrue(Story.parts(Toggle, story.current).pressed);
    }),
  );

  it.effect(
    "with a pressed prop, a press only asks, and the parent accepts by passing it back",
    () =>
      Effect.gen(function* () {
        const story = yield* Story.make(ToggleStory, { pressed: false });
        story.send(press(true)).emitted(pressedEvent(true));
        assert.isFalse(Story.parts(Toggle, story.current).pressed);
        story.props({ pressed: true });
        assert.isTrue(Story.parts(Toggle, story.current).pressed);
      }),
  );

  it.effect("a parent refuses a press by keeping the prop, and the next press asks again", () =>
    Effect.gen(function* () {
      const story = yield* Story.make(ToggleStory, { pressed: false });
      story.send(press(true)).emitted(pressedEvent(true));
      story.props({ pressed: false });
      assert.isFalse(Story.parts(Toggle, story.current).pressed);
      // A refused press left nothing behind: the toggle asks for the same change.
      story.send(press(true)).emitted(pressedEvent(true));
      assert.isFalse(Story.parts(Toggle, story.current).pressed);
    }),
  );

  it.effect("its attributes say whether it's pressed and disabled, before any element binds", () =>
    Effect.gen(function* () {
      const story = yield* Story.make(ToggleStory, { pressed: true, disabled: true });
      const toggle = Story.parts(Toggle, story.current);
      assert.isTrue(toggle.pressed);
      assert.isTrue(toggle.disabled);
    }),
  );

  const messages = [press(true), press(false), ToggleMessage.ChangedPart()];

  it("in every order of messages, a toggle that keeps its value shows the last one asked for", () => {
    Story.explore(
      ToggleStory,
      {},
      {
        messages,
        // What it shows is what its Model holds, and every request went on to the parent.
        invariant: (story) =>
          Story.parts(Toggle, story).pressed === story.model.pressed &&
          story.emitted.every((event) => event.pressed === story.model.pressed),
        // Core's own changes render again, and change no value.
        transition: ({ before, message, after }) =>
          message._tag === "RequestedPressed"
            ? after.pressed === message.pressed
            : after.pressed === before.pressed,
        depth: 4,
      },
    );
  });

  it("in every order of messages, a toggle whose parent decides never changes by itself", () => {
    Story.explore(
      ToggleStory,
      { pressed: false },
      {
        messages,
        invariant: (story) =>
          !Story.parts(Toggle, story).pressed &&
          // The Model's own value stays where `init` put it.
          !story.model.pressed,
        depth: 4,
      },
    );
  });
});

const value = (value: string[]) =>
  ToggleGroupMessage.RequestedValue({ value, reason: "item-press" });
const valueEvent = (value: string[]) =>
  ToggleGroupEvents.RequestedValue({ value, reason: "item-press" });

describe("ToggleGroup", () => {
  it.effect("without a value prop, it takes a new value itself and tells its parent", () =>
    Effect.gen(function* () {
      const story = yield* Story.make(ToggleGroupStory, { initialValue: ["left"] });
      assert.deepStrictEqual(Story.parts(ToggleGroup, story.current).value, ["left"]);
      story.send(value(["center"])).emitted(valueEvent(["center"]));
      assert.deepStrictEqual(Story.parts(ToggleGroup, story.current).value, ["center"]);
    }),
  );

  it.effect(
    "with a value prop, the parent accepts a new value by passing it back, or refuses by keeping the old",
    () =>
      Effect.gen(function* () {
        const story = yield* Story.make(ToggleGroupStory, { value: ["left"] });
        story.send(value(["right"])).emitted(valueEvent(["right"]));
        assert.deepStrictEqual(Story.parts(ToggleGroup, story.current).value, ["left"]);
        story.props({ value: ["left"] });
        assert.deepStrictEqual(Story.parts(ToggleGroup, story.current).value, ["left"]);
        story.send(value(["center"])).emitted(valueEvent(["center"]));
        story.props({ value: ["center"] });
        assert.deepStrictEqual(Story.parts(ToggleGroup, story.current).value, ["center"]);
      }),
  );
});
