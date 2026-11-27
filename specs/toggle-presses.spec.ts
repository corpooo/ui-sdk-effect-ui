import { buttonNamed, expect, groupNamed, test } from "../upstream/ui/tests/fixtures.ts";

type Page = Parameters<typeof buttonNamed>[0];
type Locator = ReturnType<typeof buttonNamed>;

// Clicks each button in one task, as a script or a fast replay can and a
// person can't. Each press asks once, so presses that come back to the start
// did something.
async function pressInOneTask(page: Page, buttons: Locator[]) {
  const handles = await Promise.all(buttons.map((button) => button.elementHandle()));
  await page.evaluate(
    (elements) => elements.forEach((element) => (element as HTMLElement).click()),
    handles,
  );
  await expect(page.getByRole("status", { name: "Requests" })).toHaveText(`${buttons.length}`);
}

// AGENTS.md, Known limits: for a value the parent holds, core makes and
// judges the second of two requests in one task from the old value. Where
// that changes the outcome, the Held test is titled a known limit, asserts
// what happens today, and fails once that is fixed. Its Kept twin asserts
// the right outcome on the same page.
const title = (owner: string, right: string, today: string) =>
  owner === "Held" ? `Held: known limit, ${today}, see AGENTS.md` : `${owner}: ${right}`;

for (const owner of ["Kept", "Held"]) {
  const held = owner === "Held";

  test(
    title(
      owner,
      "a toggle pressed twice in one task is unpressed",
      "a toggle pressed twice in one task stays pressed",
    ),
    async ({ page, open }) => {
      await open("own-toggle-presses");
      const toggle = buttonNamed(page, `${owner} toggle`);
      await pressInOneTask(page, [toggle, toggle]);
      await expect(toggle).toHaveAttribute("aria-pressed", `${held}`);
    },
  );

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

  test(
    title(
      owner,
      "one toggle of a group pressed twice in one task is unpressed",
      "one toggle of a group pressed twice in one task stays pressed",
    ),
    async ({ page, open }) => {
      await open("own-toggle-presses");
      const a = groupNamed(page, `${owner} single`).getByRole("button", { name: "A" });
      await pressInOneTask(page, [a, a]);
      await expect(a).toHaveAttribute("aria-pressed", `${held}`);
    },
  );

  test(
    title(
      owner,
      "two toggles of a multiple group pressed in one task are both pressed",
      "of two toggles of a multiple group pressed in one task only the second is pressed",
    ),
    async ({ page, open }) => {
      await open("own-toggle-presses");
      const group = groupNamed(page, `${owner} multiple`);
      const [a, b] = [
        group.getByRole("button", { name: "A" }),
        group.getByRole("button", { name: "B" }),
      ];
      await pressInOneTask(page, [a, b]);
      await expect(a).toHaveAttribute("aria-pressed", `${!held}`);
      await expect(b).toHaveAttribute("aria-pressed", "true");
    },
  );
}
