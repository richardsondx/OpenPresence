import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

async function createAgent(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Jenny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
}

async function navigatePeople(page: import("@playwright/test").Page) {
  if (test.info().project.name === "mobile") {
    await page.getByRole("navigation", { name: "Mobile navigation" }).last().getByRole("button", { name: "People" }).click({ force: true });
  } else {
    await page.locator(".sidebar:visible").getByRole("button", { name: "People", exact: false }).click();
  }
}

test("operator can explicitly study a person without creating an Assignment or public act", async ({ page, request }) => {
  await createAgent(page);
  const initial = await (await request.get("/api/state")).json();
  const presenceId = initial.presence.id;
  const seeded = await request.post("/api/state", { data: { type: "rememberPerson", presenceId, channel: "x", externalActorId: "rasmic", displayName: "Rasmic", handle: "rasmic", source: "operator" } });
  expect(seeded.ok()).toBeTruthy();

  await page.reload();
  await navigatePeople(page);
  await expect(page.getByText("Added by you", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Rasmic/ }).click();
  await expect(page.getByRole("heading", { name: /hasn.t studied Rasmic yet/ })).toBeVisible();
  await page.getByRole("button", { name: "Learn this person", exact: true }).click();
  await expect(page.getByRole("dialog", { name: /Learn Rasmic/ })).toBeVisible();
  await expect(page.getByText(/Already available/)).toBeVisible();
  await page.getByRole("button", { name: /Start study/ }).click();
  await expect(page.getByText(/Last studied/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Last studied [A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}, \d{4},/ })).toBeVisible();
  await expect(page.getByText(/Receipt · 0 X reads · 0 hydrations · 1 model calls/)).toBeVisible();

  const finalState = await (await request.get("/api/state")).json();
  expect(finalState.relationshipStudies).toHaveLength(1);
  expect(finalState.assignments).toHaveLength(0);
  expect(finalState.socialIntents).toHaveLength(0);
});
