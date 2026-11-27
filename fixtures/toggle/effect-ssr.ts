// Rewritten for Effect UI from UI SDK's
// apps/playground/src/fixtures/toggle/react-ssr.tsx (Apache-2.0, see NOTICE).
import { hydrateFixture } from "../hydrate.ts";
import { fixture } from "./effect.ts";

// Server renders, then the client hydrates. See `hydrateFixture` for what is recorded.
function mount(root: HTMLElement) {
  return hydrateFixture(root, fixture());
}

export { mount };
