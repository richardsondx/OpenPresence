import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const reset = await request.post("/api/state", { data: { type: "reset" } });
  expect(reset.ok()).toBeTruthy();
});

test("Add Presence modal covers the viewport and centers the channel identity flow", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Add a Presence", exact: true }).click();

  const backdrop = page.locator(".add-presence-modal-backdrop");
  const dialog = page.getByRole("dialog", { name: "Add a Presence" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("X handle", { exact: false })).toBeVisible();
  await expect(dialog.getByText(/Social Mirror when this Presence speaks in rehearsal/)).toBeVisible();

  const geometry = await backdrop.evaluate((node) => {
    const dialogNode = node.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialogNode) throw new Error("Add Presence dialog is missing");
    const backdropBox = node.getBoundingClientRect();
    const dialogBox = dialogNode.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      backdrop: { left: backdropBox.left, top: backdropBox.top, right: backdropBox.right, bottom: backdropBox.bottom },
      dialogCenter: { x: dialogBox.left + dialogBox.width / 2, y: dialogBox.top + dialogBox.height / 2 },
    };
  });

  expect(geometry.backdrop.left).toBeCloseTo(0, 0);
  expect(geometry.backdrop.top).toBeCloseTo(0, 0);
  expect(geometry.backdrop.right).toBeCloseTo(geometry.viewportWidth, 0);
  expect(geometry.backdrop.bottom).toBeCloseTo(geometry.viewportHeight, 0);
  expect(geometry.dialogCenter.x).toBeCloseTo(geometry.viewportWidth / 2, 0);
  expect(geometry.dialogCenter.y).toBeCloseTo(geometry.viewportHeight / 2, 0);

  await dialog.getByLabel("New Presence handle").fill("@mirror_ada");
  await dialog.getByRole("button", { name: "Add Presence", exact: true }).click();
  await expect(page.locator('[aria-label="Switch Presence, currently @mirror_ada"]').first()).toBeVisible();
});
