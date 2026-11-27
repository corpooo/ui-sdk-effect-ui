import { buttonNamed, expect, groupNamed, test } from "../upstream/ui/tests/fixtures.ts";

type Page = Parameters<typeof buttonNamed>[0];
type Locator = ReturnType<typeof buttonNamed>;

// Clicks each button in one task, as a script or a fast replay can and a person can't.
async function pressInOneTask(page: Page, buttons: Locator[]) {
  const handles = await Promise.all(buttons.map((button) => button.elementHandle()));
  await page.evaluate(
    (elements) => elements.forEach((element) => (element as HTMLElement).click()),
    handles,
  );
}

// AGENTS.md, Known limits: for a value the parent holds, core judges the
// second of two requests in one task against the old value. A test marked
// with it flips red once that is fixed.
const knownLimit = (owner: string) =>
  test.fail(owner === "Held", "Known limit for a value the parent holds, see AGENTS.md.");

for (const owner of ["Kept", "Held"]) {
  test(`${owner}: a toggle pressed twice in one task is unpressed`, async ({ page, open }) => {
    knownLimit(owner);
    await open("own-toggle-presses");
    const toggle = buttonNamed(page, `${owner} toggle`);
    await pressInOneTask(page, [toggle, toggle]);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  test(`${owner}: two toggles of a group pressed in one task leave the second pressed`, async ({
    page,
    open,
  }) => {
    await open("own-toggle-presses");
    const group = groupNamed(page, `${owner} single`);
    const [a, b] = [
      group.getByRole("button", { name: "A" }),
      group.getByRole("button", { name: "B" }),
    ];
    await pressInOneTask(page, [a, b]);
    await expect(a).toHaveAttribute("aria-pressed", "false");
    await expect(b).toHaveAttribute("aria-pressed", "true");
  });

  test(`${owner}: one toggle of a group pressed twice in one task is unpressed`, async ({
    page,
    open,
  }) => {
    knownLimit(owner);
    await open("own-toggle-presses");
    const a = groupNamed(page, `${owner} single`).getByRole("button", { name: "A" });
    await pressInOneTask(page, [a, a]);
    await expect(a).toHaveAttribute("aria-pressed", "false");
  });

  test(`${owner}: two toggles of a multiple group pressed in one task are both pressed`, async ({
    page,
    open,
  }) => {
    knownLimit(owner);
    await open("own-toggle-presses");
    const group = groupNamed(page, `${owner} multiple`);
    const [a, b] = [
      group.getByRole("button", { name: "A" }),
      group.getByRole("button", { name: "B" }),
    ];
    await pressInOneTask(page, [a, b]);
    await expect(a).toHaveAttribute("aria-pressed", "true");
    await expect(b).toHaveAttribute("aria-pressed", "true");
  });
}
