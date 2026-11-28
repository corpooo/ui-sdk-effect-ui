import { test } from "../upstream/ui/tests/fixtures.ts";

// What the Menu slice needs checked that upstream's menu fixtures don't draw.
// Each becomes a test once Menu lands, with fixtures under fixtures/own/menu-*.

test.fixme("a parent holding `open` refuses to open the menu by keeping it false", () => {});

test.fixme("ArrowUp on the trigger, through a parent-held `open`, opens on the last item", () => {});

test.fixme("in nested menus, each Escape closes one level, two Escapes in one task too", () => {});

test.fixme("focus returns to the trigger when an open menu's parts unmount", () => {});

// What it should do is open: throw, wait for the parts, or do nothing.
test.fixme("`controller.open()` with every part of the menu absent", () => {});
