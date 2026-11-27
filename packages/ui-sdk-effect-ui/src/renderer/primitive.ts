// Renders a UI SDK primitive in Effect UI.
//
// Core keeps a component's behaviour in an instance: a store, an api and
// parts that bind to elements. Effect UI keeps state in a Model, which is
// data, and reaches a host node only from a mount. So an instance lives in
// two places:
//
// - A part's mount makes the live instance, binds the part's element to it
//   and keeps it until the element goes. Mounts run only in a browser.
// - A render reads the live instance when a mount has made one. Before that,
//   on a server and in a test, it reads a detached one made from the same
//   options, which starts nothing outside itself and is collected with the
//   render. Both give the same attributes for the same options, so a
//   hydrated page starts out matching its server HTML.
//
// Core runs every key the component controls as controlled: the component's
// Model or props hold the value, core asks for each change through
// `on<Key>Change`, and `emit` turns that into the component's message.
import { Component, Mount, type View } from "@effect/ui";
import type {
  Attrs,
  OptionsOf,
  Part,
  Primitive,
  PrimitiveInstance,
  PropsOf,
  SlotName,
  StateOf,
} from "@ui-sdk/core";
import {
  attrs,
  bind,
  commit,
  partState,
  present,
  sameValue,
  subscribe,
  unwatched,
} from "@ui-sdk/core/renderer";
import { Effect, Schema, Stream } from "effect";

/**
 * One render's description of an instance: the options this render gives it.
 * `around` is the instance its options read, like a toggle's group, which a
 * mount makes first.
 */
export interface Handle<P extends Primitive = Primitive> {
  readonly id: string;
  readonly primitive: P;
  readonly options: OptionsOf<P>;
  readonly around: Handle | undefined;
}

/** A record's keys that may be left undefined, optional instead. */
type Defined<T> = { [K in keyof T as undefined extends T[K] ? never : K]: T[K] } & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>;
};

/** `record` without the keys left undefined: core's options tell an absent key from an undefined one. */
export const defined = <T extends object>(record: T) =>
  Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as Defined<T>;

/** `id` is an id from `p.id`, the same on the server and the client. */
export const handle = <P extends Primitive>(
  id: string,
  primitive: P,
  options: OptionsOf<P>,
  around?: Handle,
): Handle<P> => ({
  // Prefixed as every adapter's are, so a page using ui-sdk is recognizable from its HTML.
  id: `ui-sdk-${id}`,
  primitive,
  options,
  around,
});

// A live instance, the mounts that hold it, the options it was last handed,
// and where its callbacks send the component's messages.
type Live = {
  readonly instance: PrimitiveInstance;
  options: object;
  uses: number;
  readonly sinks: Set<(message: unknown) => void>;
};

// Written only by mounts, so only in a browser: a server never holds one request's instance for the next.
const live = new Map<string, Live>();
const detached = new WeakMap<Handle, PrimitiveInstance>();

const optionsOf = (handle: Handle) => ({ ...handle.options, id: handle.id });

/** The instance a render reads: the live one, else one detached from the page. */
export function instanceOf<P extends Primitive>(handle: Handle<P>): ReturnType<P> {
  let instance = live.get(handle.id)?.instance ?? detached.get(handle);
  if (!instance) {
    instance = unwatched(() => handle.primitive(optionsOf(handle)));
    detached.set(handle, instance);
  }
  return instance as ReturnType<P>;
}

// Reads what a render shows: the state its options make of the instance's,
// before a mount hands them over, with the instance around it showing its own.
function showing<T>(handle: Handle, read: (state: object) => T): T {
  const own = () => {
    const instance = instanceOf(handle);
    const state = instance.preview(optionsOf(handle)) ?? instance.get();
    return instance.view(state, () => read(state));
  };
  return handle.around ? showing(handle.around, own) : own();
}

/**
 * One part of an instance as a render shows it: its attributes, and the state
 * its slot hands a consumer. The part's mount takes it whole, to bind the part
 * and to tell when core shows something else.
 */
export interface Shown<P extends Primitive = Primitive, S extends SlotName<P> = SlotName<P>> {
  readonly handle: Handle<P>;
  readonly slot: S;
  readonly props: PropsOf<P, S>;
  readonly present: boolean;
  readonly attrs: Attrs;
  readonly state: StateOf<P, S>;
}

export function shown<P extends Primitive, S extends SlotName<P>>(
  handle: Handle<P>,
  slot: S,
  props: PropsOf<P, S>,
): Shown<P, S> {
  return showing(handle, (state) => {
    // A render may never commit, so the part keeps its props until a mount commits these.
    const part = instanceOf(handle).part(slot, props, true);
    return {
      handle,
      slot,
      props,
      present: present(part, props, state),
      attrs: attrs(part, props, state),
      state: partState(part, props, state) as StateOf<P, S>,
    };
  });
}

/**
 * Sends the component a message from an option's callback, like
 * `onPressedChange`. Only a live instance's callbacks run, and the message
 * reaches it through the element one of its parts is bound to.
 */
export function emit(handle: Handle, message: unknown) {
  const [sink] = live.get(handle.id)?.sinks ?? [];
  sink?.(message);
}

function acquire(handle: Handle) {
  let entry = live.get(handle.id);
  if (!entry) {
    const options = optionsOf(handle);
    entry = { instance: handle.primitive(options), options, uses: 0, sinks: new Set() };
    live.set(handle.id, entry);
  }
  entry.uses++;
  const held = entry;
  return () => {
    held.uses--;
    // A microtask later, so an element replaced in one commit keeps its instance.
    queueMicrotask(() => {
      if (held.uses === 0 && live.get(handle.id) === held) {
        live.delete(handle.id);
        held.instance.destroy();
      }
    });
  };
}

// Outermost first: an instance is made, and gets its options, after the one it reads.
const chainOf = (handle: Handle): Handle[] =>
  handle.around ? [...chainOf(handle.around), handle] : [handle];

function handOver(handle: Handle) {
  const entry = live.get(handle.id)!;
  // Every part of an instance, and every instance inside it, hands over the same render's options.
  if (entry.options !== handle.options) {
    entry.options = handle.options;
    entry.instance.setOptions(optionsOf(handle));
  }
}

// Core listens for every event itself: an Effect UI handler gets a payload, and core's need the event.
const host = { by: "framework", attaches: [] } as const;

type Snapshot = Pick<Shown, "present" | "attrs" | "state">;

const sameRecord = (a: Record<string, unknown>, b: Record<string, unknown>) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => sameValue(a[key], b[key]));
};
const same = (a: Snapshot, b: Snapshot | undefined) =>
  b !== undefined &&
  a.present === b.present &&
  sameRecord(a.attrs, b.attrs) &&
  sameRecord(a.state, b.state);

// A message reaches the component as an event on the part's element, which
// Effect UI's handler below answers with the message. An event is delivered
// before `dispatchEvent` returns, so a press has changed the Model by the time
// its click is over, where a mount's result would arrive a task later.
// Parts of several components can share one element, each with a handler of
// its own, so a message names the instance it is for.
const messageEvent = "ui-sdk-message";
let carried: { readonly to: string; readonly message: unknown } | undefined;
function deliver(node: HTMLElement, to: string, message: unknown) {
  const outer = carried;
  carried = { to, message };
  try {
    // It doesn't bubble, so only this element's handler hears it.
    node.dispatchEvent(new Event(messageEvent));
  } finally {
    carried = outer;
  }
}

/** What a part's mount runs with the live instance once a render's options are handed over, for what an option can't say. */
export type After = (instance: PrimitiveInstance) => void;

// How many mounts are taking a render's options right now. Those options
// change stores, the parts of other mounts' too, and a part's own mount checks
// what that did once it has taken its render.
let rendering = 0;

/** One part as a render gives it to its element's mount. */
type Binding = {
  readonly shown: Shown;
  /** The component's message for a change core made on its own. */
  readonly onChange: unknown;
  readonly after: After | undefined;
};

function attach(node: HTMLElement, first: Handle) {
  const releases = chainOf(first).map(acquire);
  const entry = live.get(first.id)!;
  const sink = (message: unknown) => deliver(node, first.id, message);
  entry.sinks.add(sink);
  let part: Part | undefined;
  let leave = () => {};
  let current: Binding | undefined;
  // What core showed when the component last rendered or was last told to.
  let told: Snapshot | undefined;
  const read = (part: Part): Snapshot => ({
    present: present(part),
    attrs: attrs(part),
    state: partState(part),
  });
  // Tells the component when core shows something it hasn't rendered.
  const check = (bound: Part) => {
    if (bound !== part) {
      return;
    }
    const now = read(bound);
    if (!same(now, told)) {
      told = now;
      deliver(node, first.id, current?.onChange);
    }
  };
  return {
    id: first.id,
    render(binding: Binding) {
      const { shown } = binding;
      current = binding;
      rendering++;
      try {
        chainOf(shown.handle).forEach(handOver);
        // Props that change a part's key name another part.
        const next = entry.instance.part(shown.slot, shown.props, true);
        commit(next, shown.props);
        if (next !== part) {
          leave();
          part = next;
          const cleanups = [
            bind(next, node, host),
            // A change during a render waits for every mount to take that
            // render, which most changes then turn out to be part of.
            subscribe(next, () => (rendering ? queueMicrotask(() => check(next)) : check(next))),
          ];
          leave = () => cleanups.forEach((cleanup) => cleanup());
        }
        binding.after?.(entry.instance);
      } finally {
        rendering--;
      }
      // A render before the element bound couldn't show what core learns from
      // it, like whether a button is a native one. Told once per state, so a
      // render core disagrees with can't loop.
      const now = read(part!);
      const news = !same(now, shown) && !same(now, told);
      told = now;
      if (news) {
        deliver(node, first.id, binding.onChange);
      }
    },
    detach() {
      leave();
      part = undefined;
      entry.sinks.delete(sink);
      releases.reverse().forEach((release) => release());
    },
  };
}

const isBinding = (u: unknown): u is Binding => typeof u === "object" && u !== null && "shown" in u;

const BindPart = Mount.make(
  "BindPart",
  // Compared by identity, so every render reaches the mount.
  { args: { binding: Schema.declare(isBinding, { expected: "Binding" }) } },
  (node: unknown, { binding }, changes) =>
    Effect.gen(function* () {
      if (!(node instanceof HTMLElement)) {
        return Component.noop;
      }
      const element = yield* Effect.acquireRelease(
        Effect.sync(() => ({ attached: attach(node, binding.shown.handle) })),
        (element) => Effect.sync(() => element.attached.detach()),
      );
      // `changes` starts with the render that started the mount, and ends with the element.
      yield* Stream.runForEach(changes, ({ binding }) =>
        Effect.sync(() => {
          // An element without a key can go to another instance, like a
          // group's first toggle when the item before it leaves.
          if (element.attached.id !== binding.shown.handle.id) {
            element.attached.detach();
            element.attached = attach(node, binding.shown.handle);
          }
          element.attached.render(binding);
        }),
      );
      return Component.noop;
    }),
);

/**
 * Draws a part on the consumer's element: its attributes, the handler that
 * takes core's messages, and the mount that binds the element. `onChange` is
 * the component's message for a change core made on its own. Every other
 * message is one `emit` sent.
 */
export const drawn = <Msg, P extends Primitive, S extends SlotName<P>>(
  builder: View.ContainerBuilder<Msg>,
  shown: Shown<P, S>,
  onChange: Msg,
  after?: After,
) =>
  builder
    // Without the attributes core leaves unset, which would remove the consumer's own.
    .attrs(defined(shown.attrs))
    .on(messageEvent, () =>
      carried?.to === shown.handle.id ? (carried.message as Msg) : undefined,
    )
    .onMount(BindPart({ binding: { shown: shown as unknown as Shown, onChange, after } }));
