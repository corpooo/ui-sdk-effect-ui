// What upstream's menu fixtures don't draw: a parent that refuses a menu's
// requests, nested menus closed in one task, content that leaves while the
// menu is open, and a menu with no part in the page.
import { buttonNamed, expect, menuNamed, test } from "../upstream/ui/tests/fixtures.ts";

type Page = Parameters<typeof buttonNamed>[0];

const itemNamed = (page: Page, name: string) => page.getByRole("menuitem", { name, exact: true });

// Every request the held menu made of its parent, as `open:reason` or `close:reason`.
const requests = (page: Page) => page.getByRole("status", { name: "Requests" });

// A click from a script, which is no press outside the menu, so the parent acts with no request before it.
const clickFromScript = (page: Page, name: string) =>
  buttonNamed(page, name).evaluate((button) => (button as HTMLElement).click());

test.describe("a parent holding `open`", () => {
  test("refuses to open the menu by keeping it false", async ({ page, open }) => {
    await open("own-menu", { refuse: "" });
    const trigger = buttonNamed(page, "Held");
    await trigger.click();
    await expect(requests(page)).toHaveText("open:trigger-press");
    await trigger.press("ArrowDown");
    await expect(requests(page)).toHaveText("open:trigger-press open:trigger-press");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test("ArrowUp on the trigger opens on the last item", async ({ page, open }) => {
    await open("own-menu");
    await buttonNamed(page, "Held").press("ArrowUp");
    await expect(requests(page)).toHaveText("open:trigger-press");
    await expect(itemNamed(page, "Last")).toBeFocused();
  });

  test("ArrowDown on the trigger opens on the first item", async ({ page, open }) => {
    await open("own-menu");
    await buttonNamed(page, "Held").press("ArrowDown");
    await expect(itemNamed(page, "First")).toBeFocused();
  });

  // AGENTS.md, Known limits: core takes a request the parent refuses by
  // keeping the value for one still on its way, where `details.cancel()`
  // would end it. Each known limit asserts what happens today, and fails
  // once that is fixed. Its twin asserts the right outcome on the same page.
  test("opens the menu itself, and focus stays where it is", async ({ page, open }) => {
    await open("own-menu", { refuse: "" });
    await buttonNamed(page, "Open from parent").click();
    await expect(menuNamed(page, "Held")).toBeVisible();
    await expect(buttonNamed(page, "Open from parent")).toBeFocused();
  });

  test("known limit, a refused ArrowUp stays pending, so the menu the parent opens itself focuses its last item, see AGENTS.md", async ({
    page,
    open,
  }) => {
    await open("own-menu", { refuse: "" });
    await buttonNamed(page, "Held").press("ArrowUp");
    await expect(requests(page)).toHaveText("open:trigger-press");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await buttonNamed(page, "Open from parent").click();
    await expect(itemNamed(page, "Last")).toBeFocused();
  });

  test("closes the menu itself, and focus returns to the trigger", async ({ page, open }) => {
    await open("own-menu", { refuse: "close" });
    await buttonNamed(page, "Held").press("ArrowDown");
    await expect(itemNamed(page, "First")).toBeFocused();
    await clickFromScript(page, "Close from parent");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(buttonNamed(page, "Held")).toBeFocused();
  });

  test("known limit, a refused press outside stays pending, so the menu the parent closes itself loses focus, see AGENTS.md", async ({
    page,
    open,
  }) => {
    await open("own-menu", { refuse: "close" });
    await buttonNamed(page, "Held").press("ArrowDown");
    await expect(itemNamed(page, "First")).toBeFocused();
    await page.mouse.click(5, 5);
    await expect(requests(page)).toHaveText("open:trigger-press close:outside-press");
    await expect(menuNamed(page, "Held")).toBeVisible();
    await clickFromScript(page, "Close from parent");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.locator("body")).toBeFocused();
  });
});

// Presses Escape twice in one task, as a script or a fast replay can and a person can't.
const escapeTwiceInOneTask = (page: Page) =>
  page.evaluate(() => {
    for (let press = 0; press < 2; press++) {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    }
  });

// `Kept` menus keep whether they're open themselves. The `Held` one's parent holds it for the outermost menu.
for (const owner of ["Kept", "Held"]) {
  const options: Record<string, string> = owner === "Held" ? { nested: "held" } : {};

  test.describe(`${owner}: in nested menus`, () => {
    test.beforeEach(async ({ page, open }) => {
      await open("own-menu", options);
      await buttonNamed(page, "Nested").press("Enter");
      await expect(itemNamed(page, "Copy")).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowRight");
      await expect(itemNamed(page, "Email")).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowRight");
      await expect(itemNamed(page, "Embed")).toBeFocused();
    });

    test("each Escape closes one level", async ({ page }) => {
      await page.keyboard.press("Escape");
      await expect(menuNamed(page, "More")).toBeHidden();
      await expect(menuNamed(page, "Share")).toBeVisible();
      await expect(itemNamed(page, "More")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(menuNamed(page, "Share")).toBeHidden();
      await expect(menuNamed(page, "Nested")).toBeVisible();
      await expect(itemNamed(page, "Share")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect(buttonNamed(page, "Nested")).toBeFocused();
    });

    test("two Escapes in one task close two levels", async ({ page }) => {
      await escapeTwiceInOneTask(page);
      await expect(menuNamed(page, "More")).toBeHidden();
      await expect(menuNamed(page, "Share")).toBeHidden();
      await expect(menuNamed(page, "Nested")).toBeVisible();
      await expect(itemNamed(page, "Share")).toBeFocused();
    });

    test("two Escapes in one task close the last two levels", async ({ page }) => {
      await page.keyboard.press("Escape");
      await expect(itemNamed(page, "More")).toBeFocused();
      await escapeTwiceInOneTask(page);
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect(buttonNamed(page, "Nested")).toBeFocused();
    });
  });

  test(`${owner}: the same value in a menu and its submenu is two items`, async ({
    page,
    open,
  }) => {
    await open("own-menu", options);
    await buttonNamed(page, "Nested").press("Enter");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await expect(itemNamed(page, "Email")).toBeFocused();
    const inShare = page.getByRole("menuitemcheckbox", { name: "Pinned in Share" });
    await inShare.focus();
    await page.keyboard.press("Space");
    await expect(inShare).toHaveAttribute("aria-checked", "true");
    await expect(
      page.getByRole("menuitemcheckbox", { name: "Pinned", exact: true }),
    ).toHaveAttribute("aria-checked", "false");
    // The parent hears which of the two it was.
    await expect(page.getByRole("status", { name: "Checks" })).toHaveText("share/pinned");
  });

  test(`${owner}: a submenu key with a slash names another submenu than the path it spells`, async ({
    page,
    open,
  }) => {
    await open("own-menu", options);
    await buttonNamed(page, "Nested").press("Enter");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await expect(itemNamed(page, "Email")).toBeFocused();
    const ids = await Promise.all(
      ["More", "Flat"].map((name) => itemNamed(page, name).getAttribute("id")),
    );
    expect(ids[0]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
  });

  test(`${owner}: \`controller.open()\` opens a menu with every part absent`, async ({
    page,
    open,
  }) => {
    await open("own-menu", owner === "Held" ? { controller: "held" } : {});
    // No trigger, and no content while it's closed.
    await expect(page.locator('[data-slot^="menu-"]:not([data-slot="menu-trigger"])')).toHaveCount(
      0,
    );
    const opener = buttonNamed(page, "Open with controller");
    await opener.click();
    await expect(menuNamed(page, "Commands")).toBeVisible();
    await expect(itemNamed(page, "Run")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await opener.click();
    await expect(itemNamed(page, "Run")).toBeFocused();
  });

  test(`${owner}: a menu with every part absent takes the props its parent changes`, async ({
    page,
    open,
  }) => {
    await open("own-menu", owner === "Held" ? { controller: "held" } : {});
    await buttonNamed(page, "Commands as a sheet").click();
    await buttonNamed(page, "Open with controller").click();
    await expect(menuNamed(page, "Commands")).toHaveAttribute("data-presentation", "sheet");
  });

  test(`${owner}: a menu that takes the place of the one holding the controller opens with it`, async ({
    page,
    open,
  }) => {
    await open("own-menu", owner === "Held" ? { controller: "held" } : {});
    await buttonNamed(page, "Replace commands").click();
    await buttonNamed(page, "Open from outside the app").click();
    await expect(menuNamed(page, "Commands")).toBeVisible();
  });

  test(`${owner}: a menu mounted again at its own path opens with its controller`, async ({
    page,
    open,
  }) => {
    await open("own-menu", owner === "Held" ? { controller: "held" } : {});
    await buttonNamed(page, "Rewrap commands").click();
    await buttonNamed(page, "Open from outside the app").click();
    await expect(menuNamed(page, "Commands")).toBeVisible();
  });

  test(`${owner}: two menus that swap controllers each open with the other's`, async ({
    page,
    open,
  }) => {
    await open("own-menu", owner === "Held" ? { controller: "held" } : {});
    await buttonNamed(page, "Swap controllers").click();
    await buttonNamed(page, "Open with controller").click();
    await expect(menuNamed(page, "Other commands")).toBeVisible();
    await expect(page.getByRole("menu")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await buttonNamed(page, "Open with the other controller").click();
    await expect(menuNamed(page, "Commands")).toBeVisible();
    await expect(page.getByRole("menu")).toHaveCount(1);
  });
}

test("a controller given away and taken back in one task still opens its menu", async ({
  page,
  open,
}) => {
  // A press of Run gives the controller to the other menu, and the close that follows takes it back.
  await open("own-menu", { bounce: "" });
  const opener = buttonNamed(page, "Open from outside the app");
  await opener.click();
  await itemNamed(page, "Run").click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await opener.click();
  await expect(menuNamed(page, "Commands")).toBeVisible();
});

test("a closed menu given another container opens in it", async ({ page, open }) => {
  await open("own-menu", { containers: "" });
  await buttonNamed(page, "Switch container").click();
  await buttonNamed(page, "Portaled").click();
  const second = page.getByRole("region", { name: "Second container" });
  await expect(second.getByRole("menu", { name: "Portaled" })).toBeVisible();
});

test.describe("on a touch phone", () => {
  test.use({ viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true });

  test("a menu kept in a container turns into a sheet that shows", async ({ page, open }) => {
    await open("own-menu", { sheet: "" });
    await buttonNamed(page, "Sheet").press("Enter");
    const sheet = menuNamed(page, "Sheet");
    await expect(sheet).toHaveAttribute("data-presentation", "sheet");
    await expect(sheet).toBeVisible();
  });
});

test("focus returns to the trigger when an open menu's parts unmount", async ({ page, open }) => {
  await open("own-menu");
  const trigger = buttonNamed(page, "Unmount");
  await trigger.press("Enter");
  await expect(itemNamed(page, "Hide content")).toBeFocused();
  // The page stops drawing the content, with focus inside it.
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  // The menu is still open, so the content the page draws again shows.
  await buttonNamed(page, "Show content").click();
  await expect(menuNamed(page, "Unmount")).toBeVisible();
});
