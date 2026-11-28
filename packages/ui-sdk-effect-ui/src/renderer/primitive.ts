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
// A key the parent passes runs controlled in core: core asks for each change
// through `on<Key>Change`, `emit` turns that into the component's message, and
// the parent answers with the prop. A key the parent leaves out runs
// uncontrolled, seeded with the Model's value as `default<Key>`: core takes
// each change at once, so two presses in one task both count, and the same
// message keeps the Model in step for the server, hydration and a restore.
//
// A part core says isn't present, like an unselected tab's panel, is left out
// of the page (`whilePresent`), so it has no mount to say when it's back.
// Every render asks it again, and each change that can bring it back renders:
// a change core asks for arrives as the component's message or the parent's
// prop, and one core makes on its own changes what a part in the page shows,
// which that part's mount tells. So a component keeps at least one part in
// the page whose state holds what the left-out ones depend on, as the
// selected value is in the state of a tabs' root.
import { Component, Mount, Subscription, View } from "@effect/ui";
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
import type { Feature } from "@ui-sdk/core/renderer";
import {
  attrs,
  bind,
  commit,
  partState,
  present,
  sameSlotState,
  subscribe,
  takeOwnId,
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
  /** Where messages go while no part is in the page: the subscription that holds the instance. */
  held: ((message: unknown) => void) | undefined;
};

// Written only by mounts, so only in a browser: a server never holds one request's instance for the next.
const live = new Map<string, Live>();
const detached = new WeakMap<Handle, PrimitiveInstance>();

const optionsOf = (handle: Handle) => ({ ...handle.options, id: handle.id });

// Whether a detached instance is being made. The instances its options read
// are then detached too: a submenu made for one render adds itself to the
// menu it reads, and a live menu would keep every render's.
let detaching = false;

/** The instance a render reads: the live one, else one detached from the page. */
export function instanceOf<P extends Primitive>(handle: Handle<P>): ReturnType<P> {
  let instance = (detaching ? undefined : live.get(handle.id)?.instance) ?? detached.get(handle);
  if (!instance) {
    const outer = detaching;
    detaching = true;
    try {
      // Without its controller, which stays with the instance on the page.
      instance = unwatched(() => handle.primitive({ ...optionsOf(handle), controller: undefined }));
    } finally {
      detaching = outer;
    }
    detached.set(handle, instance);
  }
  return instance as ReturnType<P>;
}

// The state a render's options make of the state the instance had then.
const previews = new WeakMap<Handle, { readonly base: object; readonly state: object }>();

// Reads what a render shows: the state its options make of the instance's,
// before a mount hands them over, with the instance around it showing its own.
function showing<T>(handle: Handle, read: (state: object) => T, around?: Around): T {
  const own = () => {
    const instance = instanceOf(handle);
    const base = instance.get();
    // Made once per render and state: every part of the render asks, and
    // options can measure the page to make theirs.
    let preview = previews.get(handle);
    if (preview?.base !== base) {
      preview = { base, state: instance.preview(optionsOf(handle)) ?? base };
      previews.set(handle, preview);
    }
    const { state } = preview;
    return instance.view(state, () => read(state), around);
  };
  return handle.around ? showing(handle.around, own) : own();
}

/** What a render shows of an instance's state, like whether a menu is open. */
export const reading = <P extends Primitive, T>(
  handle: Handle<P>,
  read: (state: ReturnType<ReturnType<P>["get"]>) => T,
): T => showing(handle, read as (state: object) => T);

/**
 * The props this render gives the parts a part reads, by slot, like a radio
 * item its group's. Core reads a part's props as its mount last committed
 * them, which is a render behind for a part drawn in this one.
 */
export type Around = Record<string, object>;

/** What a part's render adds to its slot and props. */
export type Own = {
  /** The id the consumer gives the element, in place of the one core makes. */
  readonly id?: string | undefined;
  /** The feature whose slot this is, for a slot an instance has only once a part asks for it. */
  readonly feature?: Feature | undefined;
  readonly around?: Around | undefined;
};

/**
 * One part of an instance as a render shows it: its attributes, and the state
 * its slot hands a consumer. The part's mount takes it whole, to bind the part
 * and to tell when core shows something else.
 */
export interface Shown<P extends Primitive = Primitive, S extends SlotName<P> = SlotName<P>> {
  readonly handle: Handle<P>;
  readonly slot: S;
  readonly props: PropsOf<P, S>;
  /** The id the consumer gives the element, in place of the one core makes. */
  readonly id: string | undefined;
  /** The feature the slot comes from, which the live instance takes before it makes the part. */
  readonly feature: Feature | undefined;
  readonly present: boolean;
  readonly attrs: Attrs;
  readonly state: StateOf<P, S>;
}

type Snapshot = Pick<Shown, "present" | "attrs" | "state">;

// What a part shows for `props` and `state`, with the consumer's id over the one core makes.
function snapshot(
  part: Part,
  id: string | undefined,
  props = part.props,
  state = part.store.get(),
) {
  const made = attrs(part, props, state);
  return {
    present: present(part, props, state),
    attrs: id === undefined ? made : { ...made, id },
    state: partState(part, props, state),
  };
}

/**
 * `id` is the id the consumer gives the element. A part takes it as it
 * renders, so the parts drawn after it point at it from their first render,
 * on a server too, as `aria-labelledby` on a tab's panel does. A part drawn
 * before it points at it once its element binds.
 */
export function shown<P extends Primitive, S extends SlotName<P>>(
  handle: Handle<P>,
  slot: S,
  props: PropsOf<P, S>,
  { id, feature, around }: Own = {},
): Shown<P, S> {
  if (feature) {
    instanceOf(handle).use(feature);
  }
  return showing(
    handle,
    (state) => {
      // A render may never commit, so the part keeps its props until a mount commits these.
      const part = instanceOf(handle).part(slot, props, true);
      const shows = snapshot(part, id, props, state);
      // Only a part that is drawn: core keeps each part it names, and a part
      // left out is made again by every render.
      if (shows.present) {
        takeOwnId(part, id);
      }
      return { handle, slot, props, id, feature, ...shows } as Shown<P, S>;
    },
    around,
  );
}

/**
 * Sends the component a message from an option's callback, like
 * `onPressedChange`. Only a live instance's callbacks run, and the message
 * reaches it through the element one of its parts is bound to.
 */
export function emit(handle: Handle, message: unknown) {
  const entry = live.get(handle.id);
  const [sink] = entry?.sinks ?? [];
  (sink ?? entry?.held)?.(message);
}

function acquire(handle: Handle) {
  let entry = live.get(handle.id);
  if (!entry) {
    const instance = handle.primitive(optionsOf(handle));
    // The render's own options, so its handover finds them taken.
    entry = { instance, options: handle.options, uses: 0, sinks: new Set(), held: undefined };
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

// What keeps a controller's instance: the subscription's hold, and the
// instance it keeps, which the component's first render with the
// controller names. A component's instance keeps its id for life, so a hold
// keeps that one instance, and a render of any other component with the same
// controller, like a server's or another menu's, leaves it alone.
type Hold = {
  handle: Handle | undefined;
  release: () => void;
  readonly sink: (message: unknown) => void;
};

// All a controller has here. `id` numbers it, as a subscription's
// dependencies take only primitives. `unheld` is the handle a component
// rendered while no hold had the controller, which the subscription that
// starts after that render takes. Only in a browser, as `live` is.
type Controlled = { readonly id: number; hold?: Hold | undefined; unheld?: Handle | undefined };
const controllers = new WeakMap<object, Controlled>();
let numbered = 0;
const controlled = (controller: object) => {
  let found = controllers.get(controller);
  if (!found) {
    controllers.set(controller, (found = { id: numbered++ }));
  }
  return found;
};

// Keeps the instance of `handle` from the first render on, and hands it the
// render's options: with no part in the page, no mount does.
function keep(hold: Hold, handle: Handle) {
  if (!hold.handle) {
    const releases = chainOf(handle).map(acquire);
    const entry = live.get(handle.id)!;
    entry.held = hold.sink;
    hold.release = () => {
      if (entry.held === hold.sink) {
        entry.held = undefined;
      }
      releases.reverse().forEach((release) => release());
    };
  }
  hold.handle = handle;
  // As a mount's render does, so a change core reports waits for the render to finish.
  rendering++;
  try {
    chainOf(handle).forEach(handOver);
  } finally {
    rendering--;
  }
}

/**
 * Keeps a component's instance for as long as the component lives, where a
 * part's mount keeps it only while the part is in the page. A controller
 * reaches the instance it is attached to, so a component given one returns
 * this from `subscriptions`, and names the handle its `parts` made with
 * `holding`, which decides the instance kept. Messages go through it while no
 * part is in the page.
 */
export const held = <Msg>(
  controller: object | undefined,
): ReadonlyArray<Subscription.Subscription<Msg>> =>
  controller === undefined
    ? []
    : [
        // Started again for another controller, which the instance then takes.
        Subscription.direct<object, Msg>(
          "HoldInstance",
          controlled(controller).id,
          controller,
          (_, controls) => {
            const hold: Hold = {
              handle: undefined,
              release: () => {},
              sink: (message) => controls.emit(message as Msg),
            };
            const own = controlled(controller);
            own.hold = hold;
            // A render that came first named the handle. One still to come, as
            // for a controller another component just gave up, names it then:
            // a handle another hold had is that component's, with its options.
            controls.enter(() => {
              const handle = own.unheld;
              own.unheld = undefined;
              if (handle) {
                keep(hold, handle);
              }
            });
            return () => {
              if (own.hold === hold) {
                own.hold = undefined;
              }
              hold.release();
            };
          },
        ),
      ];

/** Names the handle this render made for the component `controller` drives. See `held`. */
export function holding(controller: object | undefined, handle: Handle) {
  if (controller === undefined || typeof document === "undefined") {
    return;
  }
  const own = controlled(controller);
  const { hold } = own;
  if (!hold) {
    own.unheld = handle;
  } else if (!hold.handle || hold.handle.id === handle.id) {
    keep(hold, handle);
  }
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

const same = (a: Snapshot, b: Snapshot | undefined) =>
  b !== undefined &&
  a.present === b.present &&
  sameSlotState(a.attrs, b.attrs) &&
  sameSlotState(a.state, b.state);

// A message reaches the component as an event on the part's element, which
// Effect UI's handler below answers with the message. An event is delivered
// before `dispatchEvent` returns, so a press has changed the Model by the time
// its click is over, where a mount's result would arrive a task later.
// Parts of several components can share one element, each with a handler of
// its own, so a message names the instance it is for.
const messageEvent = "ui-sdk-message";
let carried: { readonly to: string; readonly message: unknown } | undefined;
function deliver(node: Element, to: string, message: unknown) {
  const outer = carried;
  carried = { to, message };
  try {
    // It doesn't bubble, so only this element's handler hears it. Inside a
    // shadow tree it has to: Effect UI listens on the element the app is
    // mounted on, which only a composed event reaches, and finds a composed
    // event's own element only when it bubbles. The element's handler still
    // takes it first.
    const shadowed = node.getRootNode() instanceof ShadowRoot;
    node.dispatchEvent(new Event(messageEvent, { bubbles: shadowed, composed: shadowed }));
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
  readonly into: ParentNode | undefined;
};

// Only the spec harness listens, in `fixtures/hydrate.ts`: Effect UI repairs a
// hydration mismatch before any mount runs, and says nothing, so the harness
// counts what changed until core first writes to a part's element.
const bindEvent = "ui-sdk-bind";

function attach(node: Element, first: Handle) {
  const releases = chainOf(first).map(acquire);
  const entry = live.get(first.id)!;
  const sink = (message: unknown) => deliver(node, first.id, message);
  entry.sinks.add(sink);
  let part: Part | undefined;
  let leave = () => {};
  let current: Binding | undefined;
  // Where Effect UI had the element when this mount moved it out, which it
  // goes back to before Effect UI takes it out. Only an element given a
  // container ever moves: Effect UI moves elements too, like a kept child's.
  let home: ParentNode | null = null;
  const place = (into: ParentNode | undefined) => {
    const from = home ?? node.parentNode;
    // Only within one tree: across a shadow root's edge the ids that name and
    // anchor a popup, like `aria-labelledby`, point at nothing.
    if (into && from && into.getRootNode() === from.getRootNode()) {
      if (node.parentNode !== into) {
        home = from;
        into.appendChild(node);
      }
    } else if (home) {
      if (node.parentNode !== home) {
        home.appendChild(node);
      }
      home = null;
    }
  };
  // What core showed when the component last rendered or was last told to.
  let told: Snapshot | undefined;
  // From the props this mount rendered: parts with no key of their own, like
  // tab icons, share one core part, whose props are the last one committed.
  const read = (part: Part): Snapshot =>
    snapshot(part, current?.shown.id, current?.shown.props ?? part.props);
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
        if (shown.feature) {
          entry.instance.use(shown.feature);
        }
        // Props that change a part's key name another part.
        const next = entry.instance.part(shown.slot, shown.props, true);
        commit(next, shown.props);
        // Before it binds, so the parts whose mounts run after it read the consumer's id.
        takeOwnId(next, shown.id);
        // Before it binds too: a popup that moves once core has shown it leaves the top layer.
        place(binding.into);
        if (next !== part) {
          leave();
          part = next;
          node.dispatchEvent(new Event(bindEvent));
          const cleanups = [
            // Typed for HTML, though core binds SVG too, like a tab's icon.
            bind(next, node as HTMLElement, host),
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
      place(undefined);
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
      if (!(node instanceof Element)) {
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
 *
 * `into` is where the element goes instead of where the view has it, like a
 * popup's container. The mount moves it there, and back before Effect UI
 * takes it out, so the part draws it inside an element of its own, which
 * stays. Effect UI hears events on the element the app is mounted on, so
 * `into` has to be inside that one. It also has to be in the element's own
 * tree, a document or a shadow root, or the element stays where it is.
 */
export const drawn = <Msg, P extends Primitive, S extends SlotName<P>>(
  builder: View.ContainerBuilder<Msg>,
  shown: Shown<P, S>,
  onChange: Msg,
  { after, into }: { readonly after?: After; readonly into?: ParentNode | undefined } = {},
) =>
  builder
    // Without the attributes core leaves unset, which would remove the consumer's own.
    .attrs(defined(shown.attrs))
    .on(messageEvent, () =>
      carried?.to === shown.handle.id ? (carried.message as Msg) : undefined,
    )
    .onMount(BindPart({ binding: { shown: shown as unknown as Shown, onChange, after, into } }));

/**
 * A part that is drawn only while core says it's present, like a tab's panel
 * while its tab is selected. `show` makes what `part` draws from the
 * consumer's arguments. Left out, it gives the consumer nothing to chain on:
 * `tabs.panel(h.div.key(value), { value })?.children(...)`. The consumer
 * keys such an element, since Effect UI pairs elements without a key by
 * position, and one that comes and goes shifts the ones after it.
 */
export const whilePresent = <
  Tag extends string,
  Args extends ReadonlyArray<any>,
  P extends Primitive,
  S extends SlotName<P>,
  R,
>(
  part: View.Part<Tag, [Shown<P, S>], R>,
  show: (...args: Args) => Shown<P, S>,
) =>
  View.wrapPart(
    part,
    <B extends View.PartTarget<Tag>>(
      builder: B,
      ...args: Args
    ): ReturnType<B["attr"]> | undefined => {
      const shown = show(...args);
      return shown.present ? part(builder, shown) : undefined;
    },
  );
