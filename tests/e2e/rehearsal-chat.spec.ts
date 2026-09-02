import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

async function createAgent(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await expect.poll(() => page.url()).toMatch(/agentId=/);
  const current = new URL(page.url());
  await page.goto(`/rehearsal?agentId=${current.searchParams.get("agentId")}&presenceId=${current.searchParams.get("presenceId")}`);
  await expect(page.getByRole("heading", { name: "Rehearse with Jenny", exact: true })).toBeVisible();
}

async function expectViewportContract(page: import("@playwright/test").Page) {
  const geometry = await page.getByTestId("rehearsal-composer").evaluate((composer) => {
    const thread = composer.closest(".presence-chat-thread");
    const history = thread?.querySelector<HTMLElement>("[data-testid=rehearsal-transcript]");
    if (!thread || !history) throw new Error("Rehearsal viewport nodes are missing");
    const historyBox = history.getBoundingClientRect();
    const composerBox = composer.getBoundingClientRect();
    const hint = thread.querySelector<HTMLElement>(".composer-hint")?.getBoundingClientRect();
    return {
      historyBottom: historyBox.bottom,
      composerTop: composerBox.top,
      composerBottom: composerBox.bottom,
      hintBottom: hint?.bottom ?? 0,
      overflowY: getComputedStyle(history).overflowY,
      documentOverflow: document.documentElement.scrollHeight > window.innerHeight + 1,
      viewportHeight: window.innerHeight,
    };
  });

  expect(geometry.overflowY).toBe("auto");
  expect(geometry.composerTop).toBeGreaterThanOrEqual(geometry.historyBottom - 1);
  expect(geometry.composerBottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.hintBottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.documentOverflow).toBe(false);
}

test("Presence Rehearsal keeps one Chat-like viewport and persists the thread", async ({ page, request }) => {
  await createAgent(page);

  await expect(page.getByTestId("rehearsal-transcript")).toBeVisible();
  await expect(page.getByTestId("rehearsal-composer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add post", exact: true })).toBeDisabled();
  await expect.poll(async () => {
    const state = await request.get("/api/state?projection=rehearsal").then((response) => response.json());
    return state.presenceChatSessions.filter((session: { presenceId: string }) => session.presenceId === state.presence.id).length;
  }).toBe(1);
  await expectViewportContract(page);

  const message = "A real post in the rehearsal thread.";
  await page.getByLabel("Post for Jenny to encounter").fill(message);
  await page.getByRole("button", { name: "Add post", exact: true }).click();
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add post", exact: true })).toBeDisabled();
  await expectViewportContract(page);

  const saved = await request.get("/api/state?projection=rehearsal").then((response) => response.json());
  const session = saved.presenceChatSessions.find((item: { presenceId: string }) => item.presenceId === saved.presence.id);
  expect(session?.messages.map((item: { role: string }) => item.role)).toEqual(["user"]);

  await page.reload();
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  await expectViewportContract(page);
});
