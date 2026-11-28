import { separator, type SeparatorOptions } from "@ui-sdk/core/separator";
import type { Attrs } from "@ui-sdk/core";
import { handle, shown } from "./renderer/primitive.ts";

/**
 * A line between groups of content, announced as a separator unless it's
 * `decorative`. A view function: pass the element to draw it on, like `h.div`
 * or `h.hr`, and chain on what it returns.
 *
 * It has no behaviour to bind, so no core instance stays behind it.
 */
export const Separator = <Builder>(
  element: { readonly attrs: (attrs: Attrs) => Builder },
  options: SeparatorOptions = {},
): Builder => element.attrs(shown(handle("separator", separator, options), "root", {}).attrs);

export type { SeparatorOptions, SeparatorOrientation } from "@ui-sdk/core/separator";
