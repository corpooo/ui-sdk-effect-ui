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

// From the page's first script, every id or reference that changed to
// another value once set, as "element attribute old → new". A tab's
// `aria-controls` comes and goes with its panel, which the snapshots check.
const recordRewrites = (page: Page) =>
  page.addInitScript(() => {
    const rewrites: string[] = [];
    Object.assign(window, { __rewrites: rewrites });
    new MutationObserver((records) => {
      for (const { target, attributeName, oldValue } of records) {
        const now = (target as Element).getAttribute(attributeName!);
        if (oldValue !== null && now !== null && now !== oldValue) {
          rewrites.push(`${(target as Element).localName} ${attributeName} ${oldValue} → ${now}`);
        }
      }
    }).observe(document, {
      subtree: true,
      attributeOldValue: true,
      attributeFilter: ["id", "aria-labelledby", "aria-controls"],
    });
  });

const rewrites = (page: Page) => page.evaluate(() => (window as any).__rewrites as string[]);
const hydrationErrors = (page: Page) =>
  page.evaluate(() => ((window as any).__hydrationErrors as string[] | undefined) ?? []);

test.beforeEach(({ page }) => recordRewrites(page));

test("tabs and panels take the author's ids and point at each other by them", async ({
  page,
  open,
}) => {
  await open("own-tabs-ids");
  expect(await inPage(page)).toEqual([
    "tab author-tab-one →  / author-panel-one",
    "tab author-tab-two →  / ",
    "tab author-tab-three →  / ",
    "tabpanel author-panel-one → author-tab-one / ",
  ]);
  await tabNamed(page, "Two").click();
  await expect(page.getByRole("tabpanel", { name: "Two" })).toHaveId("author-panel-two");
  expect(await inPage(page)).toEqual([
    "tab author-tab-one →  / ",
    "tab author-tab-two →  / author-panel-two",
    "tab author-tab-three →  / ",
    "tabpanel author-panel-two → author-tab-two / ",
  ]);
  expect(await rewrites(page)).toEqual([]);
  expect(await hydrationErrors(page)).toEqual([]);
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
  expect(await inPage(page)).toEqual([
    "tab author-tab-one →  / author-panel-one",
    ...served.slice(1),
  ]);
  expect(await rewrites(page)).toEqual([]);
  expect(await hydrationErrors(page)).toEqual([]);
});
