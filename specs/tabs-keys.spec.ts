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

// AGENTS.md, Known limits: for a value the parent holds, core judges the
// second of two requests in one task against the old value, so one that
// returns to it is dropped: focus comes back to One, the selection stays on
// Two. This case asserts what happens today, and fails once that is fixed.
const knownLimit = {
  list: "Held",
  name: "away and back",
  requests: 1,
  lands: "Two",
  focused: "One",
};

for (const list of ["Kept", "Held"]) {
  const owner =
    list === "Kept" ? "tabs that keep their value" : "tabs whose parent holds the value";
  for (const { name, keys, lands: wanted } of cases) {
    const limit = list === knownLimit.list && name === knownLimit.name;
    const { requests, lands, focused } = limit
      ? knownLimit
      : { requests: keys.length, lands: wanted, focused: wanted };
    const title = limit
      ? `${owner}: known limit, ${name} in one task selects ${lands}, see AGENTS.md`
      : `${owner}: ${name} in one task selects ${lands}`;
    test(title, async ({ page, open }) => {
      await open("own-tabs-keys");
      await pressInOneTask(page, list, keys);
      // Each key asks once, so keys that come back to the start did something.
      await expect(page.getByRole("status", { name: "Requests" })).toHaveText(`${requests}`);
      const tabs = page.getByRole("tablist", { name: list });
      await expect(tabs.getByRole("tab", { selected: true })).toHaveText(lands);
      expect(await focusedName(page)).toBe(focused);
      const root = page.locator(".tabs").filter({ has: tabs });
      await expect(root.getByRole("tabpanel")).toHaveText(`${list} ${lands.toLowerCase()}.`);
    });
  }
}
