// The tabs-ids fixture, rendered on the server and then hydrated.
import { hydrateFixture } from "../../hydrate.ts";
import { fixture } from "./effect.ts";

function mount(root: HTMLElement) {
  return hydrateFixture(root, fixture());
}

export { mount };
