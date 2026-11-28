import { expect, tabNamed, test } from "../upstream/ui/tests/fixtures.ts";

type Page = Parameters<typeof tabNamed>[0];

// Types into the shown panel's field, marks the panel's element, selects
// Two, and reads what the panel shown then is: whether it is the marked
// element, what its field holds, and what it labels.
async function switchAfterTyping(page: Page, list: string) {
  const tablist = page.getByRole("tablist", { name: list, exact: true });
  const root = page.locator(".tabs").filter({ has: tablist });
  const panel = root.getByRole("tabpanel");
  await panel.getByRole("textbox").fill("draft");
  await panel.evaluate((element) => Object.assign(window, { __marked: element }));
  await root.getByRole("tab", { name: "Two" }).click();
  await expect(panel).toHaveAccessibleName("Two");
  return {
    same: await panel.evaluate((element) => element === (window as any).__marked),
    field: await panel.getByRole("textbox").inputValue(),
    label: await panel.locator("label").textContent(),
  };
}

test("keyed panels each keep an element of their own", async ({ page, open }) => {
  await open("own-tabs-panels");
  expect(await switchAfterTyping(page, "Keyed")).toEqual({
    same: false,
    field: "",
    label: "Keyed two ",
  });
});

// AGENTS.md, How a component renders: Effect UI pairs elements without a key
// by position, so the panel that comes takes over the element of the one that
// left, with what was typed in it. This is why a panel's element needs a key.
test("unkeyed panels share one element, which keeps what was typed in it", async ({
  page,
  open,
}) => {
  await open("own-tabs-panels");
  expect(await switchAfterTyping(page, "Unkeyed")).toEqual({
    same: true,
    field: "draft",
    label: "Unkeyed two ",
  });
});
