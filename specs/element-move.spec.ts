import { buttonNamed, expect, regionNamed, test } from "../upstream/ui/tests/fixtures.ts";

// Effect UI moves a keep-alive child's nodes to the element the view writes
// it in next. A part drawn on such a node stays where Effect UI moved it when
// it renders again.
test("a toggle Effect UI moved to another parent stays there when pressed", async ({
  page,
  open,
}) => {
  await open("own-element-move");
  const second = regionNamed(page, "Second shelf");
  await buttonNamed(page, "Move").click();
  const toggle = second.getByRole("button", { name: "Moved toggle" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(regionNamed(page, "First shelf").getByRole("button")).toHaveCount(0);
});
