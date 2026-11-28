// The hydration recorder in `fixtures/hydrate.ts` must report what hydration
// repaired, or every "hydrates without mismatches" spec passes on nothing.
import { buttonNamed, expect, test } from "../upstream/ui/tests/fixtures.ts";

type Page = Parameters<typeof buttonNamed>[0];

const hydrationErrors = (page: Page) =>
  page.evaluate(() => (window as unknown as { __hydrationErrors: string[] }).__hydrationErrors);

test("hydration records each change to the server's nodes, and none of core's", async ({
  page,
  open,
  framework,
}) => {
  test.skip(!framework.endsWith("-ssr"), "Only for server-rendered fixtures.");
  await open("own-hydration-mismatch");
  const errors = await hydrationErrors(page);
  // The attribute, the text the paragraph holds, and the element in place of the span.
  expect(new Set(errors)).toEqual(
    new Set([
      "Hydration changed data-render on the server's <p>.",
      "Hydration changed the children of the server's <p>.",
      "Hydration changed the children of the server's <div>.",
    ]),
  );
});

test("the page renders and its toggle presses, client-rendered too", async ({ page, open }) => {
  await open("own-hydration-mismatch");
  const toggle = buttonNamed(page, "Bold");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
});
