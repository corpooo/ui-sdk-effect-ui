import type { Component } from "@effect/ui";

/**
 * A headless component as `Story` takes one. Story's types ask for a
 * component with a view, and a headless one's type names neither its Model
 * nor its messages, so the caller gives both. Story's engine runs its `init`
 * and `update` as it runs any component's.
 */
export const storied =
  <Model, Msg>() =>
  <Props, Events, Parts>(component: Component.Headless<Props, Events, Parts>) =>
    component as unknown as Component.Members<string, Props, Model, Msg, Events>;
