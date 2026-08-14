import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

async function createInitialAgent(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Put an intelligent presence into the world." })).toBeVisible();
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await expect(page.getByRole("button", { name: "Switch agent, currently Jenny" })).toBeVisible();
}

async function createSecondAgent(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Switch agent, currently Jenny" }).click();
  await page.getByRole("menu", { name: "Your Agents" }).getByRole("button", { name: "Create Agent" }).click();
  const dialog = page.getByRole("dialog", { name: "Create Agent" });
  await dialog.getByLabel("Agent name").fill("Atlas");
  await dialog.getByRole("button", { name: "Create Agent", exact: true }).click();
  await expect(page.getByRole("button", { name: "Switch agent, currently Atlas" })).toBeVisible();
}

async function selectAgent(page: import("@playwright/test").Page, current: string, target: string) {
  await page.getByRole("button", { name: `Switch agent, currently ${current}` }).click();
  await page.getByRole("menu", { name: "Your Agents" }).getByRole("menuitem", { name: new RegExp(`^${target}`) }).click();
  await expect(page.getByRole("button", { name: `Switch agent, currently ${target}` })).toBeVisible();
}

async function sendTeachMessage(page: import("@playwright/test").Page, content: string) {
  await page.locator(".sidebar").getByRole("button", { name: "Teach", exact: true }).click();
  await page.getByLabel("Message your Presence").fill(content);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByText(content, { exact: true })).toBeVisible();
}

test("separate browser tabs keep different Agents independent", async ({ page, context, request }) => {
  await createInitialAgent(page);
  await createSecondAgent(page);

  const afterCreation = await (await request.get("/api/state")).json();
  const jenny = afterCreation.agents.find((agent: { name: string }) => agent.name === "Jenny");
  const atlas = afterCreation.agents.find((agent: { name: string }) => agent.name === "Atlas");
  expect(jenny?.id).toBeTruthy();
  expect(atlas?.id).toBeTruthy();

  await selectAgent(page, "Atlas", "Jenny");
  const atlasTab = await context.newPage();
  await atlasTab.goto(`/?agentId=${encodeURIComponent(atlas.id)}`);
  await expect(atlasTab.getByRole("button", { name: "Switch agent, currently Atlas" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch agent, currently Jenny" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`agentId=${jenny.id}`));
  await expect(atlasTab).toHaveURL(new RegExp(`agentId=${atlas.id}`));

  await sendTeachMessage(page, "Jenny tab context stays with Jenny.");
  await sendTeachMessage(atlasTab, "Atlas tab context stays with Atlas.");

  await page.reload();
  await atlasTab.reload();
  await expect(page.getByRole("button", { name: "Switch agent, currently Jenny" })).toBeVisible();
  await expect(atlasTab.getByRole("button", { name: "Switch agent, currently Atlas" })).toBeVisible();
  await page.locator(".sidebar").getByRole("button", { name: "Teach", exact: true }).click();
  await atlasTab.locator(".sidebar").getByRole("button", { name: "Teach", exact: true }).click();
  await expect(page.getByText("Jenny tab context stays with Jenny.", { exact: true })).toBeVisible();
  await expect(atlasTab.getByText("Atlas tab context stays with Atlas.", { exact: true })).toBeVisible();

  await selectAgent(page, "Jenny", "Atlas");
  await expect(atlasTab.getByRole("button", { name: "Switch agent, currently Atlas" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`agentId=${atlas.id}`));
  await expect(atlasTab).toHaveURL(new RegExp(`agentId=${atlas.id}`));

  const jennyState = await (await request.get(`/api/state?agentId=${jenny.id}`)).json();
  const atlasState = await (await request.get(`/api/state?agentId=${atlas.id}`)).json();
  expect(jennyState.agent.name).toBe("Jenny");
  expect(atlasState.agent.name).toBe("Atlas");
  expect(jennyState.conversations.some((conversation: { messages: Array<{ content: string }> }) => conversation.messages.some((message) => message.content === "Jenny tab context stays with Jenny."))).toBe(true);
  expect(atlasState.conversations.some((conversation: { messages: Array<{ content: string }> }) => conversation.messages.some((message) => message.content === "Atlas tab context stays with Atlas."))).toBe(true);
});
