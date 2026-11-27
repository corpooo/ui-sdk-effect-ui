import { expect, focusedName, tabNamed, test } from "../upstream/ui/tests/fixtures.ts";

type Page = Parameters<typeof tabNamed>[0];

// Focuses a list's selected tab, then dispatches every key to the focused
// element in one task, as a script or a fast replay can and a person can't.
async function pressInOneTask(page: Page, list: string, keys: string[]) {
  await page.getByRole("tablist", { name: list }).getByRole("tab", { selected: true }).focus();
  await page.evaluate((keys) => {
    for (const key of keys) {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
    }
  }, keys);
}

const cases = [
  { name: "three ArrowRight", keys: ["ArrowRight", "ArrowRight", "ArrowRight"], lands: "Four" },
  { name: "there and back", keys: ["ArrowRight", "ArrowRight", "ArrowLeft"], lands: "Two" },
  { name: "away and back", keys: ["ArrowRight", "ArrowLeft"], lands: "One" },
];

for (const list of ["Kept", "Held"]) {
  const owner =
    list === "Kept" ? "tabs that keep their value" : "tabs whose parent holds the value";
  for (const { name, keys, lands } of cases) {
    test(`${owner}: ${name} in one task selects ${lands}`, async ({ page, open }) => {
      // AGENTS.md, Known limits: for a value the parent holds, core judges the
      // second of two requests in one task against the old value, so one that
      // returns to it is dropped. This flips red once that is fixed. The other
      // cases on this page pass, so a broken page fails them, not only this.
      test.fail(list === "Held" && name === "away and back", "Known limit, see AGENTS.md.");
      await open("own-tabs-keys");
      await pressInOneTask(page, list, keys);
      // Each key asks once, so keys that come back to the start did something.
      await expect(page.getByRole("status", { name: "Requests" })).toHaveText(`${keys.length}`);
      const tabs = page.getByRole("tablist", { name: list });
      await expect(tabs.getByRole("tab", { selected: true })).toHaveText(lands);
      expect(await focusedName(page)).toBe(lands);
      const root = page.locator(".tabs").filter({ has: tabs });
      await expect(root.getByRole("tabpanel")).toHaveText(`${list} ${lands.toLowerCase()}.`);
    });
  }
}
