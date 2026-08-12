import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
  const fresh = await request.get("/api/state");
  expect((await fresh.json()).onboarded).toBe(false);
});

async function createAgent(page: import("@playwright/test").Page, name = "Jenny") {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Put an intelligent presence into the world." })).toBeVisible();
  await page.getByLabel("Agent name").fill(name);
  if (name !== "Jenny") await page.getByLabel("Presence handle").fill(`@${name.toLowerCase()}`);
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  const handle = name === "Jenny" ? "@jenny_ai" : `@${name.toLowerCase()}`;
  if (test.info().project.name === "mobile") {
    await expect(page.getByRole("heading", { name: `${handle} is live.` })).toBeVisible();
  } else {
    await expect(page.getByRole("button", { name: `Switch agent, currently ${name}` })).toBeVisible();
  }
}

async function navigate(page: import("@playwright/test").Page, label: string) {
  if (label === "Settings") {
    const navigation = test.info().project.name === "mobile"
      ? page.locator(".mobile-nav")
      : page.locator(".sidebar");
    await navigation.getByRole("button", { name: "Settings", exact: true }).click();
    return;
  }
  const navigationLabel = label === "Brain" ? "Manage Agent" : label;
  const mobile = page.locator(".mobile-nav");
  if (await mobile.isVisible()) await mobile.getByRole("button", { name: navigationLabel }).click();
  else if (label === "Brain") await page.getByRole("button", { name: /^Manage Agent/ }).click();
  else await page.getByRole("button", { name: navigationLabel, exact: true }).click();
}

function presenceSwitcher(page: import("@playwright/test").Page, handle: string) {
  const visibleShell = test.info().project.name === "mobile"
    ? page.locator("header")
    : page.getByRole("complementary");
  return visibleShell.getByRole("button", { name: `Switch Presence, currently ${handle}` });
}

async function expectComposerLayout(page: import("@playwright/test").Page) {
  const geometry = await page.locator(".chat-composer").evaluate((form) => {
    const rect = (selector: string) => {
      const node = form.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    };
    const formBox = form.getBoundingClientRect();
    const hint = document.querySelector(".composer-hint")?.getBoundingClientRect();
    return {
      form: { left: formBox.left, right: formBox.right, bottom: formBox.bottom },
      attach: rect(".attach-button"),
      textarea: rect("textarea"),
      send: rect(".send-button"),
      fileInputDisplay: getComputedStyle(form.querySelector('input[type="file"]')!).display,
      hintTop: hint?.top ?? 0,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });

  expect(geometry.overflow).toBe(false);
  expect(geometry.attach).not.toBeNull();
  expect(geometry.textarea).not.toBeNull();
  expect(geometry.send).not.toBeNull();
  expect(geometry.fileInputDisplay).toBe("none");
  expect(geometry.attach!.top).toBeGreaterThanOrEqual(geometry.textarea!.top);
  expect(geometry.attach!.bottom).toBeLessThanOrEqual(geometry.textarea!.bottom);
  expect(geometry.send!.top).toBeGreaterThanOrEqual(geometry.textarea!.top);
  expect(geometry.send!.bottom).toBeLessThanOrEqual(geometry.textarea!.bottom);
  expect(geometry.hintTop).toBeGreaterThanOrEqual(geometry.form.bottom);
}

test("operator can create an agent and first Presence from blank state", async ({ page }) => {
  await createAgent(page, "Atlas");
  if (test.info().project.name === "mobile") await expect(page.getByRole("heading", { name: "@atlas is live." })).toBeVisible();
  else await expect(page.getByRole("button", { name: "Switch agent, currently Atlas" })).toBeVisible();
});

test("Add Presence opens a working channel-aware flow", async ({ page }) => {
  await createAgent(page);
  await page.getByRole("button", { name: "Add a Presence" }).click();
  await expect(page.getByRole("dialog", { name: "Add a Presence" })).toBeVisible();
  const alignment = await page.locator(".add-presence-modal-backdrop").evaluate((backdrop) => {
    const dialog = backdrop.querySelector<HTMLElement>('[role="dialog"]');
    const workspace = document.querySelector<HTMLElement>(".workspace");
    if (!dialog || !workspace) throw new Error("Add Presence layout nodes are missing");
    const dialogBox = dialog.getBoundingClientRect();
    const backdropBox = backdrop.getBoundingClientRect();
    const workspaceBox = workspace.getBoundingClientRect();
    return {
      horizontalOffset: Math.abs(
        dialogBox.left + dialogBox.width / 2 - (workspaceBox.left + workspaceBox.width / 2),
      ),
      verticalOffset: Math.abs(
        dialogBox.top + dialogBox.height / 2 - (backdropBox.top + backdropBox.height / 2),
      ),
    };
  });
  expect(alignment.horizontalOffset).toBeLessThan(2);
  expect(alignment.verticalOffset).toBeLessThan(2);
  await expect(page.getByRole("radio", { name: "Agent-owned" })).toBeChecked();
  await page.getByRole("radio", { name: "Ghost" }).check();
  await expect(page.getByRole("radio", { name: "Ghost" })).toBeChecked();
  await page.getByLabel("New Presence handle").fill("@second_jenny");
  await page.getByRole("dialog").getByRole("button", { name: "Add Presence" }).click();
  await expect(page.getByRole("complementary").getByRole("button", { name: "Switch Presence, currently @second_jenny" })).toContainText("Ghost");
  await expect(page.getByText("X · simulated locally")).toHaveCount(0);
});

test("Chat keeps one persistent Agent conversation", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Chat");
  await expect(page.getByRole("heading", { name: "Talk to Jenny." })).toBeVisible();
  const contextSidebar = page.getByRole("complementary", { name: "Context & Changes sidebar" });
  await expect(contextSidebar).toBeVisible();
  await expect(contextSidebar.getByRole("button", { name: "Change scope", exact: true })).toHaveCount(0);
  for (const [index, section] of ["Scope", "Context", "Changes", "Outputs", "Advanced"].entries()) {
    await expect(contextSidebar.locator(".context-section").nth(index).locator(".eyebrow")).toHaveText(
      new RegExp(`^${section}`),
    );
  }
  await expect(page.locator(".conversation-list")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New conversation", exact: true })).toHaveCount(0);
  await expect(page.getByText("Try saying")).toHaveCount(0);
  await expect(page.getByLabel("Model")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hide context sidebar" })).toBeVisible();
  await page.getByRole("button", { name: "Hide context sidebar" }).click();
  await expect(contextSidebar).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show context sidebar" })).toBeVisible();
  await page.getByRole("button", { name: "Show context sidebar" }).click();
  await expect(contextSidebar).toBeVisible();
  await expectComposerLayout(page);
  await page.getByLabel("Message your Presence").fill("Remember that useful software should feel calm.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Remember that useful software should feel calm.")).toBeVisible();
  await page.reload();
  await navigate(page, "Chat");
  await expect(page.getByText("Remember that useful software should feel calm.")).toBeVisible();
});

test("Agent switcher creates and switches isolated workspaces", async ({ page }) => {
  await createAgent(page);
  const clickAgentSwitcher = async (name: string) => {
    const agentSwitcher = test.info().project.name === "mobile"
      ? page.locator(".mobile-agent-switcher .agent-switcher")
      : page.getByRole("button", { name: `Switch agent, currently ${name}` });
    await agentSwitcher.click();
  };
  await clickAgentSwitcher("Jenny");
  const agentMenu = page.getByRole("menu", { name: "Your Agents" });
  await expect(agentMenu).toBeVisible();
  await expect(agentMenu.getByRole("button", { name: "Manage Agents", exact: true })).toHaveCount(0);
  const menuBox = await agentMenu.boundingBox();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.x).toBeGreaterThanOrEqual(0);
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual((await page.evaluate(() => window.innerWidth)) + 1);
  await agentMenu.getByRole("button", { name: /Create Agent/ }).click();
  await expect(page.getByRole("dialog", { name: "Create Agent" })).toBeVisible();
  await page.getByLabel("Agent name").last().fill("Atlas");
  await page.getByLabel("Agent description").last().fill("Research carefully and make evidence useful.");
  await page.getByLabel("Agent handle").fill("@atlas");
  await page.getByRole("dialog", { name: "Create Agent" }).getByRole("button", { name: "Create Agent" }).click();
  await expect(page.getByRole("button", { name: "Switch agent, currently Atlas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "@atlas is live." })).toBeVisible();
  await clickAgentSwitcher("Atlas");
  await page.getByRole("menu", { name: "Your Agents" }).getByRole("menuitem", { name: /Jenny/ }).click();
  await expect(page.getByRole("heading", { name: "@jenny_ai is live." })).toBeVisible();
  await clickAgentSwitcher("Jenny");
  await page.getByRole("menu", { name: "Your Agents" }).getByRole("menuitem", { name: /Atlas/ }).click();
  await expect(page.getByRole("heading", { name: "@atlas is live." })).toBeVisible();
  await navigate(page, "Brain");
  await expect(page.getByRole("button", { name: "Use Claude Sonnet high" })).toHaveClass(/selected/);
  await expect(page.getByText("How I think")).toBeVisible();
});

test("Agent model selection lives in Brain and persists per Agent", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Brain");
  await expect(page.locator(".runtime-provider")).toHaveCount(1);
  await expect(page.getByLabel("Runtime provider")).toBeVisible();
  await page.getByLabel("Runtime provider").selectOption("ollama");
  await expect(page.getByLabel("Runtime provider")).toHaveValue("ollama");
  await expect(page.getByRole("button", { name: "Use Llama 3.2 local" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use GPT 5.6 Sol high" })).toHaveCount(0);
  await page.getByLabel("Runtime provider").selectOption("openai");
  await page.getByRole("button", { name: "Use GPT 5.6 Sol high" }).click();
  await expect(page.getByRole("button", { name: "Use GPT 5.6 Sol high" })).toHaveClass(/selected/);
  await navigate(page, "Chat");
  await expect(page.getByLabel("Model")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New conversation", exact: true })).toHaveCount(0);
  await page.reload();
  await navigate(page, "Brain");
  await expect(page.getByRole("button", { name: "Use GPT 5.6 Sol high" })).toHaveClass(/selected/);
});

test("Brain makes skill creation and provider setup actionable", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Brain");
  await page.getByRole("button", { name: "Create skill", exact: true }).click();
  await page.getByLabel("Skill name").fill("Founder brief");
  await page.getByLabel("Skill prompt").fill("Turn research into a useful founder brief.");
  await page.getByRole("button", { name: "Create skill", exact: true }).last().click();
  await expect(page.getByText("Founder brief")).toBeVisible();
  await page.locator(".config-list-row").filter({ hasText: "Founder brief" }).getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit skill" })).toBeVisible();
  await expect(page.getByLabel("Skill prompt")).toHaveValue("Turn research into a useful founder brief.");
  await page.getByLabel("Skill prompt").fill("Turn research into a concise, evidence-backed founder brief.");
  await page.getByRole("button", { name: "Save skill changes", exact: true }).click();
  await expect(page.getByText("Turn research into a concise, evidence-backed founder brief.")).toBeVisible();
  await page.getByRole("button", { name: "Set up", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Set up OpenAI" })).toBeVisible();
  await page.getByLabel("Connection name").fill("OpenAI workspace");
  await page.getByLabel("Provider API key").fill("not-persisted-test-key");
  await page.getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(page.getByText("Credential ready")).toBeVisible();
});

test("Chat creates a protected proposal and Brain can apply it", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Chat");
  await page.getByLabel("Message your Presence").fill("Don't use em dashes anymore.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("button", { name: "Taste proposal created" })).toBeVisible();
  await navigate(page, "Brain");
  await expect(page.getByRole("heading", { name: "Protected changes" })).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Protected changes" })).toHaveCount(0);
});

test("Calendar stores a real Standing Intent and evaluates it now", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Calendar");
  await page.getByRole("button", { name: "Add intent" }).click();
  await page.getByLabel("What should Jenny do?").fill("Teach the audience one useful idea about persistent agents.");
  await page.getByRole("button", { name: "Save standing intent" }).click();
  await expect(page.getByText("Teach the audience one useful idea about persistent agents.")).toBeVisible();
  await expect(page.getByLabel("Calendar presence filter")).toHaveCount(0);
  await expect(page.getByLabel("Intent presence")).toHaveCount(0);
  await page.getByRole("button", { name: /^Edit / }).click();
  await page.getByLabel("What should Jenny do?").fill("Teach the audience one edited useful idea about persistent agents.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Teach the audience one edited useful idea about persistent agents.")).toBeVisible();
  await page.getByRole("button", { name: "Run now" }).click();
  await navigate(page, "Live");
  await expect(page.getByText("Standing intent evaluated", { exact: true })).toBeVisible();
  await expect(page.getByText("0.94", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Reply to a technical founder", { exact: true })).toHaveCount(0);
});

test("Live completes review and manual execution lifecycles", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Settings");
  await page.getByRole("button", { name: "Posts review", exact: true }).click();
  await navigate(page, "Calendar");
  await page.getByRole("button", { name: "Add intent" }).click();
  await page.getByLabel("What should Jenny do?").fill("Review one useful idea before it is sent.");
  await page.getByRole("button", { name: "Save standing intent" }).click();
  await page.getByRole("button", { name: "Run now" }).click();
  await navigate(page, "Live");
  await page.getByRole("button", { name: "Approve execution" }).click();
  await page.getByRole("button", { name: "Execute approved action" }).click();
  await expect(page.getByRole("heading", { name: "Action completed" })).toBeVisible();

  await navigate(page, "Settings");
  await page.getByRole("button", { name: "Posts manual", exact: true }).click();
  await navigate(page, "Calendar");
  await page.getByRole("button", { name: "Add intent" }).click();
  await page.getByLabel("What should Jenny do?").fill("Carry one useful idea to the channel manually.");
  await page.getByRole("button", { name: "Save standing intent" }).click();
  await page.locator(".slot-row").filter({ hasText: "Carry one useful idea to the channel manually" }).getByRole("button", { name: "Run now" }).click();
  await navigate(page, "Live");
  await expect(page.getByLabel("External reference", { exact: true })).toBeVisible();
  await page.getByLabel("External reference", { exact: true }).fill("manual-post-1");
  await page.getByRole("button", { name: "Mark posted" }).click();
  await expect(page.getByRole("heading", { name: "Action completed" })).toBeVisible();
});

test("Presence settings are generated from channel capabilities and pause truthfully", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Settings");
  await expect(page.getByRole("heading", { name: "How this Presence acts" })).toBeVisible();
  await expect(page.getByText("Connection health", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Healthy and within rhythm.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Within your configured pacing.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Posts auto", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replies review", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause Presence" }).click();
  await navigate(page, "Live");
  await expect(page.getByRole("heading", { name: "@jenny_ai is paused." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run pulse" })).toBeDisabled();
  await navigate(page, "Settings");
  await page.getByRole("button", { name: "Resume Presence" }).click();
  await navigate(page, "Live");
  await expect(page.getByRole("heading", { name: "@jenny_ai is live." })).toBeVisible();
});

test("desktop shell keeps sidebar and runtime status available", async ({ page }) => {
  await createAgent(page);
  const expectedPosition = test.info().project.name === "mobile" ? "relative" : "sticky";
  await expect(page.locator(".sidebar")).toHaveCSS("position", expectedPosition);
  if (test.info().project.name !== "mobile") {
    await expect(page.locator(".sidebar .secondary-nav").nth(0)).toHaveText("Chat");
    await expect(page.locator(".sidebar .secondary-nav").nth(1)).toContainText("Manage Agent");
  }
  await expect(page.getByLabel("Live presence filter")).toHaveCount(0);
  await expect(page.locator(".pause-card")).toHaveCount(0);
  await expect(page.locator(".scope-summary")).toContainText("@jenny_ai");
  await navigate(page, "Calendar");
  await expect(page.getByText(/Planning for/)).toBeVisible();
  await expect(page.getByLabel("Calendar presence filter")).toHaveCount(0);
});

test("Custom Channel connects a Bridge, receives Mirror events, and completes queued work", async ({ page, request }) => {
  await createAgent(page);
  await page.getByRole("button", { name: "Add a Presence" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a Presence" });
  await dialog.getByRole("radio", { name: "Custom Channel" }).check();
  await dialog.getByLabel("Custom channel name").fill("Founder Community");
  await dialog.getByLabel("Custom channel ID").fill("founder-community");
  await dialog.getByLabel("New Presence handle").fill("Jenny in Founders");
  await dialog.getByRole("button", { name: "Add Presence" }).click();
  await expect(presenceSwitcher(page, "Jenny in Founders")).toBeVisible();

  await navigate(page, "Settings");
  await expect(page.getByRole("heading", { name: "Connect this Presence" })).toBeVisible();
  await page.getByLabel("Bridge name").fill("Founder Bridge");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator(".bridge-key")).toContainText("Connect your external adapter");
  await expect(page.locator(".bridge-key")).toContainText("Events endpoint");
  await expect(page.locator(".bridge-key")).toContainText("Execution endpoint");
  const bridgeKey = await page.locator(".bridge-key > code").innerText();
  expect(bridgeKey).toMatch(/^opb_/);
  const unauthorized = await request.post("/api/bridge/v1/events", { data: { events: [] } });
  expect(unauthorized.status()).toBe(401);

  const inbound = await request.post("/api/bridge/v1/events", {
    headers: { Authorization: `Bearer ${bridgeKey}` },
    data: { events: [{ sourceEventId: "skool-event-1", event: "created", object: { externalRef: { type: "post", id: "28381" }, objectType: "post", author: { displayName: "Maya" }, content: { text: "How are people handling memory?" }, visibility: "private-community", shareability: "presence-only" } }] },
  });
  expect(inbound.ok()).toBeTruthy();
  const duplicate = await request.post("/api/bridge/v1/events", {
    headers: { Authorization: `Bearer ${bridgeKey}` },
    data: { events: [{ sourceEventId: "skool-event-1", event: "created", object: { externalRef: { type: "post", id: "28381" }, objectType: "post", author: { displayName: "Maya" }, content: { text: "How are people handling memory?" }, visibility: "private-community", shareability: "presence-only" } }] },
  });
  expect(duplicate.ok()).toBeTruthy();
  const persisted = await (await request.get("/api/state")).json();
  expect(JSON.stringify(persisted)).not.toContain(bridgeKey);
  await page.reload();
  await navigate(page, "Live");
  await expect(page.getByText("How are people handling memory?")).toBeVisible();

  await navigate(page, "Calendar");
  await page.getByRole("button", { name: "Add intent" }).click();
  await page.getByLabel("What should Jenny do?").fill("Share one useful memory idea with the founders.");
  await page.getByRole("button", { name: "Save standing intent" }).click();
  await page.getByRole("button", { name: "Run now" }).click();
  const stateAfterRun = await (await request.get("/api/state")).json();
  const execution = stateAfterRun.executions[0];
  expect(execution.status).toBe("queued");

  const claimed = await request.post("/api/bridge/v1/executions/claim", { headers: { Authorization: `Bearer ${bridgeKey}` }, data: { executorId: "playwright-bridge", limit: 1 } });
  expect(claimed.ok()).toBeTruthy();
  const claimedPayload = await claimed.json();
  expect(claimedPayload.executions[0].status).toBe("claimed");
  const acknowledged = await request.post(`/api/bridge/v1/executions/${execution.id}/ack`, { headers: { Authorization: `Bearer ${bridgeKey}` }, data: { executorId: "playwright-bridge", externalRef: { type: "post", id: "comment-8821" } } });
  expect(acknowledged.ok()).toBeTruthy();
  await page.reload();
  await navigate(page, "Live");
  await expect(page.getByText("Action completed", { exact: false })).toBeVisible();

  await navigate(page, "Settings");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByText("Disconnected", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Disconnect", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Bridge name")).toBeVisible();
  await page.getByLabel("Bridge name").fill("Reconnected Bridge");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  const reconnectedRow = page.locator(".bridge-row").filter({ hasText: "Reconnected Bridge" });
  await expect(reconnectedRow).toBeVisible();
  await expect(reconnectedRow.getByText("Connected", { exact: true })).toBeVisible();
  const revoked = await request.get("/api/bridge/v1/health", { headers: { Authorization: `Bearer ${bridgeKey}` } });
  expect(revoked.status()).toBe(401);
});
