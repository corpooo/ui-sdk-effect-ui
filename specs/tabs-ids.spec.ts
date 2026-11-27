import { expect, tabNamed, test } from "../upstream/ui/tests/fixtures.ts";

type Page = Parameters<typeof tabNamed>[0];

// The ids and references of the tabs and panels, as "role id → labelledby /
// controls", read from the page or from the HTML the server sent.
const references = (page: Page, from: "page" | "server") =>
  page.evaluate((from) => {
    const template = document.createElement("template");
    if (from === "server") {
      template.innerHTML = (window as unknown as { __serverHtml: string }).__serverHtml;
    }
    const root = from === "server" ? template.content : document;
    return [...root.querySelectorAll('[role="tab"], [role="tabpanel"]')].map(
      (element) =>
        `${element.getAttribute("role")} ${element.id} → ${element.getAttribute("aria-labelledby") ?? ""} / ${element.getAttribute("aria-controls") ?? ""}`,
    );
  }, from);
const inPage = (page: Page) => references(page, "page");
const onServer = (page: Page) => references(page, "server");

// From the page's first script, every id or reference that took another
// value than the last one it had, as "element attribute old → new", even
// with a removal between. A tab's `aria-controls` comes and goes with its
// panel, which the snapshots check.
const recordRewrites = (page: Page) =>
  page.addInitScript(() => {
    const rewrites: string[] = [];
    const last = new WeakMap<Node, Map<string, string>>();
    Object.assign(window, { __rewrites: rewrites });
    new MutationObserver((records) => {
      for (const { target, attributeName, oldValue } of records) {
        const element = target as Element;
        const seen = last.get(element) ?? new Map<string, string>();
        last.set(element, seen);
        const before = seen.get(attributeName!) ?? oldValue;
        const now = element.getAttribute(attributeName!);
        if (now === null) {
          continue;
        }
        if (before !== null && before !== now) {
          rewrites.push(`${element.localName} ${attributeName} ${before} → ${now}`);
        }
        seen.set(attributeName!, now);
      }
    }).observe(document, {
      subtree: true,
      attributeOldValue: true,
      attributeFilter: ["id", "aria-labelledby", "aria-controls"],
    });
  });

const rewrites = (page: Page) =>
  page.evaluate(() => (window as unknown as { __rewrites: string[] }).__rewrites);
// What `fixtures/hydrate.ts` records, so a page that never hydrated fails.
const hydrationErrors = (page: Page) =>
  page.evaluate(() => (window as unknown as { __hydrationErrors: string[] }).__hydrationErrors);

test.beforeEach(({ page }) => recordRewrites(page));

test("tabs and panels take the author's ids and point at each other by them", async ({
  page,
  open,
  framework,
}) => {
  await open("own-tabs-ids");
  // Polled, since a mount's result can arrive a task after the page is up.
  await expect
    .poll(() => inPage(page))
    .toEqual([
      "tab author-tab-one →  / author-panel-one",
      "tab author-tab-two →  / ",
      "tab author-tab-three →  / ",
      "tabpanel author-panel-one → author-tab-one / ",
    ]);
  await tabNamed(page, "Two").click();
  await expect
    .poll(() => inPage(page))
    .toEqual([
      "tab author-tab-one →  / ",
      "tab author-tab-two →  / author-panel-two",
      "tab author-tab-three →  / ",
      "tabpanel author-panel-two → author-tab-two / ",
    ]);
  expect(await rewrites(page)).toEqual([]);
  if (framework.endsWith("-ssr")) {
    expect(await hydrationErrors(page)).toEqual([]);
  }
});

test("the server's HTML has the author's ids, and hydration keeps them", async ({
  page,
  open,
  framework,
}) => {
  test.skip(!framework.endsWith("-ssr"), "Only for server-rendered fixtures.");
  await open("own-tabs-ids");
  const served = await onServer(page);
  // A tab points `aria-controls` only at a panel in the page, which a
  // server has none of, as core's tabs say. The rest is the same.
  expect(served).toEqual([
    "tab author-tab-one →  / ",
    "tab author-tab-two →  / ",
    "tab author-tab-three →  / ",
    "tabpanel author-panel-one → author-tab-one / ",
  ]);
  await expect
    .poll(() => inPage(page))
    .toEqual(["tab author-tab-one →  / author-panel-one", ...served.slice(1)]);
  expect(await rewrites(page)).toEqual([]);
  expect(await hydrationErrors(page)).toEqual([]);
});
