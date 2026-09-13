import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

async function createAgentPortfolio(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await expect(page.locator("button.portfolio-agent-select").filter({ hasText: "Jenny" })).toBeVisible();

  await page.getByRole("button", { name: "Create a new Agent" }).click();
  const dialog = page.getByRole("dialog", { name: "Create Agent" });
  await dialog.getByLabel("Agent name").fill("Atlas");
  await dialog.getByLabel("Agent description").fill("A focused research personality with a distinct point of view.");
  await dialog.getByLabel("Agent handle").fill("@atlas");
  await dialog.getByRole("button", { name: "Create Agent", exact: true }).click();
  await expect(page.locator("button.portfolio-agent-select").filter({ hasText: "Atlas" })).toHaveAttribute("aria-current", "page");
}

test("Agent switching is click-owned, latest-wins, and persists after reload", async ({ page, request }) => {
  await createAgentPortfolio(page);
  const current = await request.get("/api/state").then((response) => response.json());
  const jenny = current.agents.find((agent: { name: string }) => agent.name === "Jenny");
  const atlas = current.agents.find((agent: { name: string }) => agent.name === "Atlas");
  expect(jenny?.id).toBeTruthy();
  expect(atlas?.id).toBeTruthy();

  const targetChatReads: string[] = [];
  page.on("request", (requestEvent) => {
    const url = new URL(requestEvent.url());
    if (requestEvent.method() === "GET" && url.pathname === "/api/state" && url.searchParams.get("projection") === "chat" && url.searchParams.get("agentId") === jenny.id) {
      targetChatReads.push(url.toString());
    }
  });

  const jennyButton = page.locator("button.portfolio-agent-select").filter({ hasText: "Jenny" });
  await jennyButton.focus();
  expect(targetChatReads).toHaveLength(0);
  await jennyButton.click();

  await expect(jennyButton).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveURL(new RegExp(`/chat\\?.*agentId=${jenny.id}`));
  expect(targetChatReads).toHaveLength(1);

  await page.reload();
  await expect(page.locator("button.portfolio-agent-select").filter({ hasText: "Jenny" })).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveURL(new RegExp(`/chat\\?.*agentId=${jenny.id}`));
});

test("Agent wake controls are Presence-scoped when handles overlap", async ({ page, request }) => {
  await createAgentPortfolio(page);
  const current = await request.get("/api/state").then((response) => response.json());
  const jenny = current.agents.find((agent: { name: string }) => agent.name === "Jenny");
  const atlas = current.agents.find((agent: { name: string }) => agent.name === "Atlas");
  expect(jenny?.id).toBeTruthy();
  expect(atlas?.id).toBeTruthy();

  // Identical handles are valid user data; the row must still resolve its own
  // Presence by Agent ownership rather than by display-name heuristics.
  await page.getByRole("button", { name: "Create a new Agent" }).click();
  const dialog = page.getByRole("dialog", { name: "Create Agent" });
  await dialog.getByLabel("Agent name").fill("Genny");
  await dialog.getByLabel("Agent description").fill("A second persistent personality.");
  await dialog.getByLabel("Agent handle").fill("@jenny_ai");
  await dialog.getByRole("button", { name: "Create Agent", exact: true }).click();
  await expect(page.locator("button.portfolio-agent-select").filter({ hasText: "Genny" })).toBeVisible();

  const jennyToggle = page.locator("button.portfolio-agent-select").filter({ hasText: /^Jenny/ }).locator("..").locator("button.portfolio-agent-toggle");
  const gennyToggle = page.locator("button.portfolio-agent-select").filter({ hasText: /^Genny/ }).locator("..").locator("button.portfolio-agent-toggle");
  await expect(jennyToggle).toBeVisible();
  await expect(gennyToggle).toBeVisible();
  await jennyToggle.click();

  await expect(jennyToggle).toHaveAccessibleName(/Jenny is asleep/, { timeout: 15000 });
  await expect(gennyToggle).toHaveAccessibleName(/Genny is awake/, { timeout: 15000 });
  await jennyToggle.click();
  await expect(jennyToggle).toHaveAccessibleName(/Jenny is awake/, { timeout: 15000 });
  await jennyToggle.click();
  await expect(jennyToggle).toHaveAccessibleName(/Jenny is asleep/, { timeout: 15000 });
  const after = await request.get("/api/state").then((response) => response.json());
  const directory = after.agentPresenceDirectory as Array<{ agentId: string; presence: { status: string } }>;
  expect(directory.find((entry) => entry.agentId === jenny.id)?.presence.status).toBe("paused");
  expect(directory.find((entry) => entry.agentId === atlas.id)?.presence.status).toBe("live");
  expect(directory.filter((entry) => entry.presence.status === "paused")).toHaveLength(1);

  if (process.env.OPENPRESENCE_EVIDENCE_PATH) await page.screenshot({ path: process.env.OPENPRESENCE_EVIDENCE_PATH });
});
