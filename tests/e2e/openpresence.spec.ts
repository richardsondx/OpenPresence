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
  if (test.info().project.name === "mobile") {
    await expect(page.getByRole("heading", { name: `${name} is live.` })).toBeVisible();
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
  else await page.locator(".sidebar").getByRole("button", { name: navigationLabel, exact: true }).click();
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

async function expectChatViewportLayout(page: import("@playwright/test").Page) {
  const geometry = await page.locator(".chat-thread").evaluate((thread) => {
    const history = thread.querySelector<HTMLElement>(".chat-history");
    const composer = thread.querySelector<HTMLElement>(".chat-composer");
    if (!history || !composer) throw new Error("Chat viewport nodes are missing");
    const historyBox = history.getBoundingClientRect();
    const composerBox = composer.getBoundingClientRect();
    const hintBox = thread.querySelector<HTMLElement>(".composer-hint")?.getBoundingClientRect();
    return {
      historyTop: historyBox.top,
      historyBottom: historyBox.bottom,
      composerTop: composerBox.top,
      composerBottom: composerBox.bottom,
      overflowY: getComputedStyle(history).overflowY,
      scrollGap: history.scrollHeight - history.clientHeight - history.scrollTop,
      documentOverflow: document.documentElement.scrollHeight > window.innerHeight + 1,
      hintBottom: hintBox?.bottom ?? 0,
      viewportHeight: window.innerHeight,
    };
  });
  expect(geometry.overflowY).toBe("auto");
  expect(geometry.composerTop).toBeGreaterThanOrEqual(geometry.historyTop);
  expect(geometry.composerBottom).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
  expect(geometry.scrollGap).toBeLessThanOrEqual(2);
  expect(geometry.documentOverflow).toBe(false);
  const bottomInset = test.info().project.name === "mobile" ? 68 : 0;
  expect(geometry.viewportHeight - geometry.hintBottom - bottomInset).toBeLessThanOrEqual(2);
}

async function expectChatContextRailLayout(page: import("@playwright/test").Page) {
  const geometry = await page.getByRole("complementary", { name: "Context & Changes sidebar" }).evaluate((sidebar) => {
    const box = sidebar.getBoundingClientRect();
    const toggle = document.querySelector<HTMLButtonElement>(".context-toggle")?.getBoundingClientRect();
    return {
      position: getComputedStyle(sidebar).position,
      top: box.top,
      right: box.right,
      bottom: box.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      togglePosition: document.querySelector<HTMLButtonElement>(".context-toggle")
        ? getComputedStyle(document.querySelector<HTMLButtonElement>(".context-toggle")!).position
        : "",
      toggleTop: toggle?.top ?? 0,
      toggleRight: toggle ? window.innerWidth - toggle.right : 0,
    };
  });

  expect(geometry.position).toBe("fixed");
  expect(geometry.right).toBeCloseTo(geometry.viewportWidth, 0);
  expect(geometry.togglePosition).toBe("fixed");
  expect(geometry.toggleTop).toBeLessThan(60);
  expect(geometry.toggleRight).toBeLessThan(40);
  if (test.info().project.name !== "mobile") {
    expect(geometry.top).toBeCloseTo(0, 0);
    expect(geometry.bottom).toBeCloseTo(geometry.viewportHeight, 0);
  }
}

test("operator can create an agent and first Presence from blank state", async ({ page }) => {
  await createAgent(page, "Atlas");
  if (test.info().project.name === "mobile") await expect(page.getByRole("heading", { name: "Atlas is live." })).toBeVisible();
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
  const duplicateKeyErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /same key/i.test(message.text())) duplicateKeyErrors.push(message.text());
  });
  await createAgent(page);
  await navigate(page, "Chat");
  await expect(page.getByLabel("Message your Presence")).toBeVisible();
  await expect(page.locator(".topbar-actions")).toHaveCount(0);
  const contextSidebar = page.getByRole("complementary", { name: "Context & Changes sidebar" });
  await expect(contextSidebar).toBeVisible();
  await expectChatContextRailLayout(page);
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
  await expectChatViewportLayout(page);
  await page.getByLabel("Message your Presence").fill("Remember that useful software should feel calm.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Remember that useful software should feel calm.", { exact: true })).toBeVisible();
  await expect(page.getByText(/I understood “Remember that useful software should feel calm/)).toBeVisible();
  await page.reload();
  await navigate(page, "Chat");
  await expect(page.getByText("Remember that useful software should feel calm.", { exact: true })).toBeVisible();
  expect(duplicateKeyErrors).toEqual([]);
});

test("Presence Settings makes the destination route explicit", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Settings");

  const routeOptions = page.locator(".channel-mode-options");
  const identityBox = await page.locator(".identity-card").boundingBox();
  const channelBox = await page.locator(".channel-settings-card").boundingBox();
  expect(identityBox?.y).toBeLessThan(channelBox?.y ?? Number.POSITIVE_INFINITY);
  await expect(routeOptions.getByRole("button", { name: /^Sandbox/ })).toHaveClass(/selected/);
  await expect(routeOptions.getByText("Sandbox · Simulated X", { exact: true })).toBeVisible();
  await expect(page.getByText("This world is simulated.", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connect this Presence to X" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Connect this Presence through Bridge/ })).toHaveCount(0);

  await routeOptions.getByRole("button", { name: /^X/ }).click();
  await expect(routeOptions.getByRole("button", { name: /^X/ })).toHaveClass(/selected/);
  await expect(page.getByRole("heading", { name: "Connect this Presence to X" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Connect this Presence through Bridge/ })).toHaveCount(0);
  await expect(page.getByText("No live connection is active yet.", { exact: false })).toBeVisible();

  await routeOptions.getByRole("button", { name: /^Bridge/ }).click();
  await expect(routeOptions.getByRole("button", { name: /^Bridge/ })).toHaveClass(/selected/);
  await expect(page.getByRole("heading", { name: /Connect this Presence through Bridge/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connect this Presence to X" })).toHaveCount(0);

  await routeOptions.getByRole("button", { name: /^Sandbox/ }).click();
  await expect(page.getByText("This world is simulated.", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Connect this Presence through Bridge/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Connect this Presence to X" })).toHaveCount(0);
  await page.reload();
  await navigate(page, "Settings");
  await expect(routeOptions.getByRole("button", { name: /^Sandbox/ })).toHaveClass(/selected/);
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
  await expect(page.getByRole("heading", { name: "Atlas is live." })).toBeVisible();
  await clickAgentSwitcher("Atlas");
  await page.getByRole("menu", { name: "Your Agents" }).getByRole("menuitem", { name: /Jenny/ }).click();
  await expect(page.getByRole("heading", { name: "Jenny is live." })).toBeVisible();
  await clickAgentSwitcher("Jenny");
  await page.getByRole("menu", { name: "Your Agents" }).getByRole("menuitem", { name: /Atlas/ }).click();
  await expect(page.getByRole("heading", { name: "Atlas is live." })).toBeVisible();
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
  await expect(page.getByText("Connect Ollama to discover installed models.", { exact: true })).toBeVisible();
  const ollamaConnection = page.locator(".config-list-row").filter({ hasText: "Ollama" });
  await ollamaConnection.getByRole("button", { name: "Set up", exact: true }).click();
  await page.getByLabel("Connection name").fill("Ollama local");
  await page.getByLabel("Ollama endpoint").fill("http://localhost:11434");
  await page.getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(page.getByRole("button", { name: /Use Qwen 2\.5/ }).first()).toBeVisible();
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

test("Manage Agent makes Agent tools discoverable", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Brain");
  await expect(page.getByRole("heading", { name: "Tools bound to Jenny" })).toBeVisible();
  for (const name of ["Web search", "Asset inspection", "Chart rendering", "Channel execution"]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Presence connector · Bound", { exact: true })).toBeVisible();
  await expect(page.locator(".tool-boundary")).toContainText("Presence settings still control whether channel actions are off, manual, review, or auto.");
  await navigate(page, "Chat");
  await expect(page.getByText("Tools available", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Tools bound", { exact: true })).toBeVisible();
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
  await page.getByRole("textbox", { name: "Time", exact: true }).fill("09:15");
  await page.getByRole("button", { name: "Save standing intent" }).click();
  await expect(page.getByText("Teach the audience one useful idea about persistent agents.")).toBeVisible();
  await expect(page.locator(".slot-row")).toContainText("09:15");
  await expect(page.getByLabel("Calendar presence filter")).toHaveCount(0);
  await expect(page.getByLabel("Intent presence")).toHaveCount(0);
  await page.getByRole("button", { name: /^Edit / }).click();
  await page.getByLabel("What should Jenny do?").fill("Teach the audience one edited useful idea about persistent agents.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Teach the audience one edited useful idea about persistent agents.")).toBeVisible();
  await expect(page.locator(".slot-row")).toContainText("09:15");
  await page.getByRole("button", { name: "Run now" }).click();
  await navigate(page, "Activity");
  await expect(page.locator(".event-title").filter({ hasText: /Calendar evaluation complete|Standing intention held/ }).first()).toBeVisible();
  await expect(page.getByText("0.94", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Reply to a technical founder", { exact: true })).toHaveCount(0);
});

test("Activity explains current work, next attention, and configured rhythm", async ({ page }) => {
  await createAgent(page);
  await expect(page.getByLabel("Operating status").getByRole("heading", { name: "Waiting for the next meaningful event" })).toBeVisible();
  await expect(page.getByLabel("Operating status").getByRole("heading", { name: "On demand" })).toBeVisible();
  await expect(page.getByLabel("Operating status").getByText("No automatic scan is scheduled because no observer or standing intent is connected.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Operating status").getByText("Publishing Auto", { exact: true })).toBeVisible();
  await page.locator(".page-heading .heading-actions").getByRole("button", { name: "Check now", exact: true }).click();
  await expect(page.getByLabel("Operating status").getByRole("heading", { name: "Waiting for a better moment" })).toBeVisible();
  await expect(page.locator(".event-title").filter({ hasText: "Pulse completed" })).toBeVisible();
});

test("Activity completes review and manual execution lifecycles", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Settings");
  await page.getByRole("button", { name: "Posts review", exact: true }).click();
  await navigate(page, "Calendar");
  await page.getByRole("button", { name: "Add intent" }).click();
  await page.getByLabel("What should Jenny do?").fill("Review one useful idea before it is sent.");
  await page.getByRole("button", { name: "Save standing intent" }).click();
  await page.getByRole("button", { name: "Run now" }).click();
  await page.waitForTimeout(150);
  await page.reload();
  await page.getByRole("button", { name: "Approve execution" }).click();
  await page.getByRole("button", { name: "Execute approved action" }).click();
  await expect(page.locator(".execution-ledger").getByRole("heading", { name: "Action completed" })).toBeVisible();

  await navigate(page, "Settings");
  await page.getByRole("button", { name: "Posts manual", exact: true }).click();
  await navigate(page, "Calendar");
  await page.getByRole("button", { name: "Add intent" }).click();
  await page.getByLabel("What should Jenny do?").fill("Carry one useful idea to the channel manually.");
  await page.getByRole("button", { name: "Save standing intent" }).click();
  await page.locator(".slot-row").filter({ hasText: "Carry one useful idea to the channel manually" }).getByRole("button", { name: "Run now" }).click();
  await page.waitForTimeout(150);
  await page.reload();
  await expect(page.getByLabel("External reference", { exact: true })).toBeVisible();
  await page.getByLabel("External reference", { exact: true }).fill("manual-post-1");
  await page.getByRole("button", { name: "Mark posted" }).click();
  await expect(page.locator(".execution-ledger").getByRole("heading", { name: "Action completed" })).toBeVisible();
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
  await navigate(page, "Activity");
  await expect(page.getByRole("heading", { name: "Jenny is asleep." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Wake up Jenny", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume Presence", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run one pulse", exact: true })).toHaveCount(0);
  await page.route("**/api/state", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.postDataJSON()?.type === "wakePresence") await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });
  await page.getByRole("button", { name: "Wake up Jenny", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Waking Jenny…", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Jenny is live." })).toBeVisible();
  await expect(page.locator(".event-title").filter({ hasText: "Jenny woke up" })).toBeVisible();
  await expect(page.locator(".event-title").filter({ hasText: "Pulse completed" })).toBeVisible();
  await navigate(page, "Settings");
  await expect(page.getByRole("button", { name: "Pause Presence" })).toBeVisible();
});

test("Presence Public Self saves its disclosure boundary", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Settings");
  await page.getByLabel("Presence name").fill("Alex");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await page.locator(".identity-options").getByRole("button", { name: /Me \/ my organization/ }).click();
  const publicSelf = page.locator(".public-self-card");
  await expect(publicSelf.getByRole("heading", { name: "How this Presence describes itself" })).toBeVisible();
  await publicSelf.getByRole("button", { name: /Representational/ }).click();
  await publicSelf.getByLabel("Built with OpenPresence", { exact: false }).check();
  await publicSelf.getByRole("button", { name: "Save Public Self", exact: true }).click();
  await page.reload();
  await navigate(page, "Settings");
  await expect(page.getByLabel("Presence name")).toHaveValue("Alex");
  await expect(page.locator(".public-self-card").getByRole("button", { name: /Representational/ })).toHaveClass(/selected/);
  await expect(page.locator(".public-self-card").getByLabel("Built with OpenPresence", { exact: false })).toBeChecked();
});

test("Chat acknowledges live Presence identity changes", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Settings");
  const identityOptions = page.locator(".identity-options");
  await identityOptions.getByRole("button", { name: /Me \/ my organization/ }).click();
  await expect(identityOptions.getByRole("button", { name: /Me \/ my organization/ })).toHaveClass(/selected/);
  await expect(page.getByRole("heading", { name: "What should this Ghost represent?" })).toBeVisible();
  await page.getByLabel("Ghost subject").fill("Alex Rivera");
  await page.getByLabel("Ghost priorities").fill("Build trustworthy open-source AI products.");
  await page.getByLabel("Ghost preferences").fill("Prefer clear evidence and useful depth over hype.");
  await page.getByLabel("Ghost voice").fill("Warm, direct, and technically sharp.");
  await page.getByLabel("Ghost boundaries").fill("Never invent my views or disclose private community context.");
  await page.getByRole("button", { name: "Save Ghost profile", exact: true }).click();
  await expect(page.getByText("Profile defined", { exact: true })).toBeVisible();
  await page.reload();
  await navigate(page, "Settings");
  await expect(page.getByLabel("Ghost subject")).toHaveValue("Alex Rivera");
  await expect(page.locator(".ghost-understanding").getByText("Never invent my views or disclose private community context.", { exact: true })).toBeVisible();
  await navigate(page, "Chat");
  await expect(page.getByText("I noticed this Presence is now Ghost. I’ll use that live state from here.", { exact: true })).toBeVisible();
  await expect(page.getByText("I noticed the Ghost profile changed. I’ll use the reviewed profile for this Presence from here.", { exact: true })).toBeVisible();

  await navigate(page, "Settings");
  await identityOptions.getByRole("button", { name: /^Jenny Agent-owned/ }).click();
  await expect(identityOptions.getByRole("button", { name: /^Jenny Agent-owned/ })).toHaveClass(/selected/);
  await navigate(page, "Chat");
  await expect(page.getByText("I noticed this Presence is now Agent-owned. I’ll use that live state from here.", { exact: true })).toBeVisible();
});

test("desktop shell keeps sidebar and runtime status available", async ({ page }) => {
  await createAgent(page);
  await expect(page.getByLabel("Help")).toHaveCount(0);
  const expectedPosition = test.info().project.name === "mobile" ? "relative" : "sticky";
  await expect(page.locator(".sidebar")).toHaveCSS("position", expectedPosition);
  if (test.info().project.name !== "mobile") {
    await expect(page.locator(".sidebar .secondary-nav").nth(0)).toHaveText("Chat");
    await expect(page.locator(".sidebar .secondary-nav").nth(1)).toHaveText("Playground");
    await expect(page.locator(".sidebar .secondary-nav").nth(2)).toContainText("Manage Agent");
  }
  await expect(page.getByLabel("Live presence filter")).toHaveCount(0);
  await expect(page.locator(".pause-card")).toHaveCount(0);
  await expect(page.locator(".scope-summary")).toContainText("X");
  await navigate(page, "Calendar");
  await expect(page.getByText(/Planning for/)).toBeVisible();
  await expect(page.getByLabel("Calendar presence filter")).toHaveCount(0);
});

test("Presence and Agent names can be edited at their own scopes", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Settings");
  await page.getByLabel("Presence name").fill("Jenny in Founders");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("heading", { name: "Jenny in Founders" })).toBeVisible();
  await page.reload();
  await navigate(page, "Settings");
  await expect(page.getByLabel("Presence name")).toHaveValue("Jenny in Founders");

  await navigate(page, "Brain");
  await page.getByLabel("Agent name").fill("Juno");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("button", { name: "Switch agent, currently Juno" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Switch agent, currently Juno" })).toBeVisible();
  await navigate(page, "Settings");
  await expect(page.getByRole("heading", { name: "Jenny in Founders" })).toBeVisible();
  await expect(page.getByLabel("Presence name")).toHaveValue("Jenny in Founders");
});

test("Activity and Calendar stay scoped to the Presence identity", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Settings");
  await page.getByLabel("Presence name").fill("Genny");
  await page.getByRole("button", { name: "Save name" }).click();

  await navigate(page, "Activity");
  await expect(page.getByRole("heading", { name: "Genny is live." })).toBeVisible();
  await expect(page.getByText("@jenny_ai", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Manage Jenny/ })).toHaveCount(0);

  await navigate(page, "Calendar");
  await expect(page.getByText("Tell Genny when to pay attention.", { exact: false })).toBeVisible();
  await expect(page.getByText("Planning for Genny", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Week" }).click();
  await expect(page.getByRole("heading", { name: "When Genny is meant to pay attention" })).toBeVisible();
});

test("Playground rehearses a Presence inside an isolated simulated world", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Playground");
  await expect(page.getByRole("heading", { name: "Playground", exact: true })).toBeVisible();
  await expect(page.locator(".playground-grid")).toBeVisible();
  await expect(page.getByText(/Rehearse how this Presence behaves on X\. This world is simulated\. Jenny is real\./)).toBeVisible();
  await expect(page.getByText("Sandbox", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Check now" }).click();
  await expect(page.locator(".social-card").first()).toBeVisible();
  await expect(page.locator(".social-card").first()).not.toContainText(/[–—]/);
  const eventForm = page.locator(".sandbox-event-form");
  await eventForm.getByLabel("What should happen").selectOption("reply");
  await expect(eventForm.getByLabel("Replying to")).toBeVisible();
  await expect(eventForm.getByText("Conversation", { exact: true })).toHaveCount(0);
  await eventForm.getByLabel("What should happen").selectOption("post");
  await expect(eventForm.getByLabel("Replying to")).toHaveCount(0);
  await eventForm.getByLabel("New person name").fill("Maya Chen");
  await eventForm.getByLabel("New person handle").fill("@maya");
  await eventForm.getByLabel("What did they post?").fill("What is one thing you are learning about agents?");
  await eventForm.getByRole("button", { name: "Add post" }).click();
  await expect(page.getByText("Maya Chen", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "+1h" }).click();
  await expect(page.getByText("Virtual time", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.locator(".playground-grid")).toBeVisible();
  await expect(page.locator(".social-card")).toHaveCount(0);
  await expect(page.getByText("Fresh X account", { exact: true })).toBeVisible();
});

test("Playground actions work while a Presence keeps its live route", async ({ page, request }) => {
  await createAgent(page);
  const routeChange = await request.post("/api/state", { data: { type: "setPresence", patch: { connectionMode: "native" } } });
  expect(routeChange.ok()).toBeTruthy();
  await page.reload();
  await navigate(page, "Playground");

  await expect(page.getByText(/Agent handle: @jenny_ai/)).toBeVisible();
  await expect(page.locator(".playground-grid")).toBeVisible();
  await page.getByRole("button", { name: "Check now" }).click();
  await expect(page.locator(".social-card").first()).toBeVisible();

  const eventForm = page.locator(".sandbox-event-form");
  await eventForm.getByLabel("New person name").fill("Maya Chen");
  await eventForm.getByLabel("What did they post?").fill("A live-routed Presence can still rehearse safely.");
  await eventForm.getByRole("button", { name: "Add post" }).click();
  await expect(page.getByText("A live-routed Presence can still rehearse safely.", { exact: true })).toBeVisible();
  await expect(page.getByText("That change could not be saved.", { exact: true })).toHaveCount(0);
});

test("Custom Channel connects a Bridge, receives Mirror events, and completes queued work", async ({ page, request }) => {
  await createAgent(page);
  await page.getByRole("button", { name: "Add a Presence" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a Presence" });
  await dialog.getByRole("radio", { name: "Bridge" }).check();
  await dialog.getByLabel("Custom channel name").fill("Founder Community");
  await dialog.getByLabel("Custom channel ID").fill("founder-community");
  await dialog.getByLabel("Social Mirror domain").fill("https://www.skool.com/");
  await dialog.getByRole("button", { name: "Use Forum icon" }).click();
  await dialog.getByLabel("New Presence handle").fill("Jenny in Founders");
  await dialog.getByRole("button", { name: "Add Presence" }).click();
  await expect(presenceSwitcher(page, "Jenny in Founders")).toBeVisible();
  await expect(presenceSwitcher(page, "Jenny in Founders").locator(".presence-logo img")).toHaveAttribute("src", /domain=www\.skool\.com/);
  const customChannel = await (await request.get("/api/state")).json();
  expect(customChannel.channelDefinitions.find((item: { id: string }) => item.id === "founder-community")).toMatchObject({ icon: "forum", domain: "https://www.skool.com/" });

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
  await navigate(page, "Activity");
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
  await navigate(page, "Activity");
  await expect(page.locator(".execution-ledger").getByRole("heading", { name: "Action completed" })).toBeVisible();

  await navigate(page, "Settings");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByText("Disconnected", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Disconnect", exact: true })).toHaveCount(0);
  const disconnectedRow = page.locator(".bridge-row").filter({ hasText: "Founder Bridge" });
  await expect(disconnectedRow).toContainText("Credential prefix:");
  await expect(disconnectedRow).toContainText("secret value is not recoverable");
  await disconnectedRow.getByRole("button", { name: "Remove Bridge", exact: true }).click();
  await expect(disconnectedRow).toHaveCount(0);
  await expect(page.getByLabel("Bridge name")).toBeVisible();
  await page.getByLabel("Bridge name").fill("Reconnected Bridge");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  const reconnectedRow = page.locator(".bridge-row").filter({ hasText: "Reconnected Bridge" });
  await expect(reconnectedRow).toBeVisible();
  await expect(reconnectedRow.getByText("Connected", { exact: true })).toBeVisible();
  const revoked = await request.get("/api/bridge/v1/health", { headers: { Authorization: `Bearer ${bridgeKey}` } });
  expect(revoked.status()).toBe(401);
});
