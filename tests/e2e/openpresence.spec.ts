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
    await expect(page.getByRole("heading", { name: `${name}, right now.` })).toBeVisible();
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

async function openAddPresence(page: import("@playwright/test").Page) {
  await presenceSwitcher(page, "@jenny_ai").click();
  await page.getByRole("menu", { name: "Your Presences" }).getByRole("menuitem", { name: "Add a Presence", exact: true }).click();
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
  const isMobilePresenceChat = test.info().project.name === "mobile" && await page.locator(".presence-chat-aside").count() > 0;
  if (isMobilePresenceChat) {
    expect(geometry.composerTop).toBeGreaterThanOrEqual(geometry.historyTop);
    expect(geometry.composerBottom).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
    expect(geometry.documentOverflow).toBe(true);
    return;
  }
  if (!isMobilePresenceChat) expect(geometry.overflowY).toBe("auto");
  expect(geometry.composerTop).toBeGreaterThanOrEqual(geometry.historyTop);
  expect(geometry.composerBottom).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
  expect(geometry.scrollGap).toBeLessThanOrEqual(2);
  expect(geometry.documentOverflow).toBe(false);
  const bottomInset = test.info().project.name === "mobile" ? 68 : 0;
  expect(geometry.viewportHeight - geometry.hintBottom - bottomInset).toBeLessThanOrEqual(2);
}

test("operator can create an agent and first Presence from blank state", async ({ page }) => {
  await createAgent(page, "Atlas");
  if (test.info().project.name === "mobile") await expect(page.getByRole("heading", { name: "Atlas, right now." })).toBeVisible();
  else await expect(page.getByRole("button", { name: "Switch agent, currently Atlas" })).toBeVisible();
});

test("Add Presence opens a working channel-aware flow", async ({ page }) => {
  await createAgent(page);
  await openAddPresence(page);
  await expect(page.getByRole("dialog", { name: "Add a Presence" })).toBeVisible();
  const alignment = await page.locator(".add-presence-modal-backdrop").evaluate((backdrop) => {
    const dialog = backdrop.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) throw new Error("Add Presence layout nodes are missing");
    const dialogBox = dialog.getBoundingClientRect();
    const backdropBox = backdrop.getBoundingClientRect();
    return {
      horizontalOffset: Math.abs(
        dialogBox.left + dialogBox.width / 2 - (backdropBox.left + backdropBox.width / 2),
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

test("Presence Chat speaks as the selected public self without teaching the Agent", async ({ page, request }) => {
  const duplicateKeyErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /same key/i.test(message.text())) duplicateKeyErrors.push(message.text());
  });
  await createAgent(page);
  await navigate(page, "Chat");
  await expect(page.getByLabel("Post for Jenny to encounter")).toBeVisible();
  await expect(page.locator(".topbar-actions")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "See Jenny in the feed." })).toBeVisible();
  await expect(page.getByText("Public self · @jenny_ai", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Chat · X", { exact: true })).toBeVisible();
  await expect(page.getByText("X · Jenny", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Start the rehearsal.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Write a post or reply that Jenny might encounter in X. Nothing publishes or changes the Agent during this rehearsal.", { exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Context & Changes sidebar" })).toHaveCount(0);
  await expect(page.getByText("Private thread · not published", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Model")).toHaveCount(0);
  await expectComposerLayout(page);
  await expectChatViewportLayout(page);
  await page.route("**/api/state", async (route) => {
    if (route.request().method() === "POST" && (route.request().postDataJSON() as { type?: string }).type === "sendPresenceChatMessage") {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    await route.continue();
  });
  await page.getByLabel("Post for Jenny to encounter").fill("My name is Bob and I own a submarine.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("My name is Bob and I own a submarine.", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").getByText("Considering", { exact: true })).toBeVisible();
  await expect(page.getByText(/I understood “My name is Bob/)).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  const afterChat = await (await request.get("/api/state")).json();
  expect(afterChat.presenceChatSessions[0].messages.map((message: { role: string }) => message.role)).toEqual(["user", "presence"]);
  expect(afterChat.conversations[0].messages).toHaveLength(0);
  expect(afterChat.changeSets).toHaveLength(0);
  await page.reload();
  await navigate(page, "Chat");
  await expect(page.getByText("My name is Bob and I own a submarine.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New rehearsal", exact: true }).click();
  await expect(page.getByText("Start the rehearsal.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Write a post or reply that Jenny might encounter in X. Nothing publishes or changes the Agent during this rehearsal.", { exact: true })).toBeVisible();
  expect(duplicateKeyErrors).toEqual([]);
});

test("Teach is the operator-facing surface for durable Agent changes", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Teach");
  await expect(page.getByText("Teach the Agent through conversation.", { exact: true })).toBeVisible();
  await expect(page.getByText("Agent-wide conversation", { exact: true })).toBeVisible();
  await page.route("**/api/state", async (route) => {
    if (route.request().method() === "POST" && (route.request().postDataJSON() as { type?: string }).type === "sendMessage") {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    await route.continue();
  });
  await page.getByLabel("Message your Presence").fill("Don't use em dashes anymore.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Don't use em dashes anymore.", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").getByText("Thinking", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Taste proposal created" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  const navigation = test.info().project.name === "mobile" ? page.locator(".mobile-nav") : page.locator(".sidebar");
  await expect(navigation.getByRole("button", { name: /^Teach$/ })).toHaveClass(/active/);
});

test("Teach does not turn punctuation-only context into assistant onboarding", async ({ page, request }) => {
  await createAgent(page);
  await navigate(page, "Teach");
  await page.getByLabel("Message your Presence").fill("?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("?", { exact: true })).toBeVisible();
  await expect(page.getByText(/I understood/)).toHaveCount(0);
  await expect(page.getByText(/What.?s on your mind|half-formed thought|AI assistant/i)).toHaveCount(0);
  const state = await (await request.get("/api/state")).json();
  expect(state.conversations[0].messages.map((message: { role: string }) => message.role)).toEqual(["operator"]);
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
  const publicSelf = page.locator(".public-self-card");
  await expect(publicSelf).toHaveCSS("border-top-width", "1px");
  await expect(publicSelf).toHaveCSS("padding-top", "26px");
  await expect(publicSelf.getByText("Approved disclosure details", { exact: true })).toBeVisible();
  await expect(publicSelf.getByText("Default when none are selected", { exact: true })).toBeVisible();
  await expect(publicSelf.getByText(/Typical response: answer naturally as this Presence without volunteering AI, platform, provider, model, or tool details\./)).toBeVisible();
  await expect(publicSelf.getByText("Choose which details this Presence may share when relevant.", { exact: false })).toBeVisible();
  await expect(publicSelf.getByText("Open source", { exact: true })).toHaveCount(0);
  await expect(publicSelf.getByText("Tools used", { exact: true })).toHaveCount(0);
  await expect(publicSelf.locator(".inline-form-actions")).toHaveCSS("margin-top", "20px");

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

test("Review to Auto confirms and processes pending replies", async ({ page, request }) => {
  await createAgent(page);
  await navigate(page, "Playground");
  const reviewRoute = await request.post("/api/state", { data: { type: "setPresence", patch: { execution: { reply: "review" } } } });
  expect(reviewRoute.ok()).toBeTruthy();
  const initial = await request.get("/api/state");
  const session = (await initial.json()).playgroundSessions[0];
  const added = await request.post("/api/state", {
    data: { type: "addSandboxEvent", sessionId: session.id, actionId: "post", actorName: "Maya Chen", actorHandle: "@maya", content: "Can you introduce me to a backend engineer in Toronto?" },
  });
  expect(added.ok()).toBeTruthy();
  const seeded = await added.json();
  const pending = seeded.executions.find((item: { affordance: string; status: string }) => (item.affordance === "reply" || item.affordance === "x.reply") && item.status === "awaiting-review");
  expect(pending).toBeTruthy();

  await page.reload();
  await navigate(page, "Settings");
  await page.getByRole("button", { name: "Replies auto", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Enable Auto for Replies?" })).toContainText("automatically approve 1 message waiting for approval");
  await page.getByRole("button", { name: "Keep Review", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Replies review", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Replies auto", exact: true }).click();
  await page.getByRole("button", { name: "Confirm Auto", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Replies auto", exact: true })).toHaveAttribute("aria-pressed", "true");
  const confirmed = await (await request.get("/api/state")).json();
  expect(confirmed.executions.find((item: { id: string }) => item.id === pending.id)?.status).toBe("succeeded");
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
  await expect(page.getByRole("heading", { name: "Atlas, right now." })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Switch agent, currently Atlas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Atlas, right now." })).toBeVisible();
  await clickAgentSwitcher("Atlas");
  await page.getByRole("menu", { name: "Your Agents" }).getByRole("menuitem", { name: /Jenny/ }).click();
  await expect(page.getByRole("heading", { name: "Jenny, right now." })).toBeVisible();
  await clickAgentSwitcher("Jenny");
  await page.getByRole("menu", { name: "Your Agents" }).getByRole("menuitem", { name: /Atlas/ }).click();
  await expect(page.getByRole("heading", { name: "Atlas, right now." })).toBeVisible();
  await navigate(page, "Brain");
  await expect(page.getByRole("button", { name: "Use Claude Sonnet high" })).toHaveClass(/selected/);
  await expect(page.getByText("How I think")).toBeVisible();
});

test("Skill creation keeps the instruction within the API contract", async ({ page }) => {
  await createAgent(page, "Alex Klonemozi");
  await navigate(page, "Brain");
  await page.getByRole("button", { name: "Create skill", exact: true }).click();
  const skillName = page.getByLabel("Skill name");
  const skillPrompt = page.getByLabel("Skill prompt");
  await expect(skillName).toHaveAttribute("maxlength", "100");
  await expect(skillPrompt).toHaveAttribute("maxlength", "500");
  await skillName.fill("Direct operator voice");
  await skillPrompt.fill("Write original X posts with a clear claim, short sentences, concrete examples, practical next steps, and no filler or engagement bait.");
  await page.locator("form.inline-config-form").getByRole("button", { name: "Create skill", exact: true }).click();
  await expect(page.getByText("Direct operator voice", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).not.toContainText("could not be saved");
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
  await expect(page.getByLabel("Connection name")).toHaveCount(0);
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

test("Brain exposes OpenRouter without an editable connection name", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Brain");
  const openRouterConnection = page.locator(".config-list-row").filter({ hasText: "OpenRouter" });
  await expect(openRouterConnection).toBeVisible();
  await openRouterConnection.getByRole("button", { name: "Set up", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Set up OpenRouter" })).toBeVisible();
  await expect(page.getByLabel("Connection name")).toHaveCount(0);
  await page.getByLabel("Provider API key").fill("test-openrouter-key");
  await page.getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(openRouterConnection).toContainText("Credential ready");
  await page.getByLabel("Runtime provider").selectOption("openrouter");
  await expect(page.getByRole("button", { name: "Use Auto medium" })).toBeVisible();
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
  await navigate(page, "Teach");
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
  await expect(page.getByLabel("Connection name")).toHaveCount(0);
  await page.getByLabel("Provider API key").fill("not-persisted-test-key");
  await page.getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(page.getByText("Credential ready")).toBeVisible();
});

test("Teach creates a protected proposal and Brain can apply it", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Teach");
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
  await navigate(page, "Schedule");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Add intent" }).click();
  await expect(page.getByLabel("Execution window")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Timing options" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("How long is this relevant?", { exact: true })).toHaveCount(0);
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
  await page.getByRole("button", { name: "Evaluate this intent" }).click();
  await navigate(page, "Activity");
  await expect(page.locator(".event-title").filter({ hasText: /Calendar evaluation complete|Standing intention held/ }).first()).toBeVisible();
  await expect(page.getByText("0.94", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Reply to a technical founder", { exact: true })).toHaveCount(0);
});

test("Schedule reveals custom consideration timing only when requested", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Schedule");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Add intent" }).click();
  await page.getByRole("button", { name: "Timing options" }).click();
  await expect(page.getByText("How long is this relevant?", { exact: true })).toBeVisible();
  await expect(page.getByText("Recommended · Jenny can consider this for a few hours.", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: /Custom/ }).check();
  await page.getByLabel("Consideration starts").fill("07:00");
  await page.getByLabel("Consideration ends").fill("10:30");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel("What should Jenny do?").fill("Review one useful idea for the audience.");
  await page.getByRole("button", { name: "Save standing intent" }).click();
  await expect(page.locator(".slot-row")).toContainText("consider 07:00–10:30");
  await expect(page.locator(".slot-row")).not.toContainText("window");
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

test("Activity separates configuration changes from Presence decisions", async ({ page, request }) => {
  await createAgent(page);
  const changed = await request.post("/api/state", { data: { type: "setPresence", patch: { execution: { post: "review" } } } });
  expect(changed.ok()).toBeTruthy();
  await page.reload();
  await navigate(page, "Activity");
  await expect(page.getByRole("heading", { name: "No Presence decisions yet" })).toBeVisible();
  await expect(page.getByText("Presence settings updated", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Activity will show what this Presence observed, chose, and delivered.", { exact: false })).toBeVisible();
});

test("Activity does not guess a repeated post for legacy unlinked decisions", async ({ page, request }) => {
  await createAgent(page);
  await navigate(page, "Playground");
  const eventForm = page.locator(".sandbox-event-form");
  await eventForm.getByLabel("New person name").fill("Maya Chen");
  await eventForm.getByLabel("What did they post?").fill("A precise post used to test Activity lineage.");
  await eventForm.getByRole("button", { name: "Add post" }).click();
  await expect(page.getByText("A precise post used to test Activity lineage.", { exact: true })).toBeVisible();

  const state = await (await request.get("/api/state")).json();
  const legacyCandidate = state.events.find(
    (item: { id: string; type: string; title: string; sessionId?: string; sourceObjectId?: string }) =>
      item.type === "decision" &&
      Boolean(item.sessionId) &&
      Boolean(item.sourceObjectId) &&
      /observed|silence|reply/i.test(item.title),
  );
  expect(legacyCandidate).toBeTruthy();

  await page.route("**/api/state*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    body.events = body.events.map((item: { id: string; sourceObjectId?: string }) =>
      item.id === legacyCandidate.id ? { ...item, sourceObjectId: undefined } : item,
    );
    const candidate = body.events.find((item: { id: string }) => item.id === legacyCandidate.id);
    if (candidate) body.events.unshift({ ...candidate, id: `duplicate:${candidate.id}` });
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await navigate(page, "Activity");
  const rows = page.locator(".event-row").filter({ hasText: legacyCandidate.title });
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator(".event-context-preview")).toHaveCount(0);
});

test("Activity completes review and manual execution lifecycles", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Settings");
  await page.getByRole("button", { name: "Posts review", exact: true }).click();
  await navigate(page, "Schedule");
  await page.getByRole("button", { name: "Add intent" }).click();
  await page.getByLabel("What should Jenny do?").fill("Review one useful idea before it is sent.");
  await page.getByRole("button", { name: "Save standing intent" }).click();
  await page.getByRole("button", { name: "Evaluate this intent" }).click();
  await page.waitForTimeout(150);
  await page.reload();
  const reviewButton = page.getByRole("button", { name: "Approve execution" });
  await expect(reviewButton).toHaveClass(/review-cta/);
  await expect(reviewButton).toHaveCSS("background-color", "rgb(169, 81, 44)");
  await expect(reviewButton).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(reviewButton).toHaveCSS("min-height", "48px");
  await reviewButton.focus();
  await expect(reviewButton).toBeFocused();
  await reviewButton.click();
  await page.getByRole("button", { name: "Execute approved action" }).click();
  await expect(page.locator(".execution-ledger").getByRole("heading", { name: "Action completed" })).toBeVisible();
  await expect(page.locator(".execution-ledger")).not.toContainText("x.post");
  await expect(page.locator(".execution-ledger")).not.toContainText("execution envelope");

  await navigate(page, "Settings");
  await page.getByRole("button", { name: "Posts manual", exact: true }).click();
  await navigate(page, "Schedule");
  await page.getByRole("button", { name: "Add intent" }).click();
  await page.getByLabel("What should Jenny do?").fill("Carry one useful idea to the channel manually.");
  await page.getByRole("button", { name: "Save standing intent" }).click();
  await page.locator(".slot-row").filter({ hasText: "Carry one useful idea to the channel manually" }).getByRole("button", { name: "Evaluate this intent" }).click();
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
  await expect(page.getByRole("heading", { name: "Jenny, right now." })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Jenny, right now." })).toBeVisible();
  await expect(page.locator(".event-title").filter({ hasText: "Jenny woke up" })).toBeVisible();
  await expect(page.locator(".event-title").filter({ hasText: "Pulse completed" })).toBeVisible();
  await navigate(page, "Settings");
  await expect(page.getByRole("button", { name: "Pause Presence" })).toBeVisible();
});

test("Presence rhythm explains attention settings and saves quiet hours", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Activity");
  await expect(page.getByRole("heading", { name: "When Jenny pays attention" })).toBeVisible();
  await expect(page.getByText("Rhythm controls when this Presence looks for something worth considering.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Manage attention rhythm", exact: true }).click();
  await expect(page.getByRole("heading", { name: "When should Jenny look around?" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Recommended.*Check about every 5 minutes/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Gentle.*Check about every 15 minutes/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Custom.*Choose the check interval/ })).toBeVisible();
  await expect(page.getByText("Quiet hours", { exact: true })).toBeVisible();
  await expect(page.getByText("Off · automatic observation follows the selected rhythm.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Custom.*Choose the check interval/ }).click();
  await page.getByLabel("Custom attention interval").selectOption("30");
  await expect(page.getByLabel("Custom attention interval")).toHaveValue("30");
  await page.locator(".toggle-control").click();
  await expect(page.getByLabel("Enable quiet hours")).toBeChecked();
  await page.getByLabel("Quiet hours start").fill("22:00");
  await page.getByLabel("Quiet hours end").fill("07:00");
  await page.reload();
  await navigate(page, "Settings");
  await expect(page.getByRole("button", { name: /Custom.*Choose the check interval/ })).toHaveClass(/selected/);
  await expect(page.getByLabel("Custom attention interval")).toHaveValue("30");
  await expect(page.getByLabel("Enable quiet hours")).toBeChecked();
  await expect(page.getByLabel("Quiet hours start")).toHaveValue("22:00");
  await expect(page.getByLabel("Quiet hours end")).toHaveValue("07:00");
  await navigate(page, "Activity");
  await expect(page.locator(".rhythm-summary")).toContainText("22:00–07:00");
});

test("Presence Public Self saves its disclosure boundary", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Settings");
  await page.getByLabel("Presence name").fill("Richardson");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  const settingsOrder = await page.locator(".presence-settings-page > section").evaluateAll((sections) => Object.fromEntries(sections.map((section) => [section.className, Number(getComputedStyle(section).order)])));
  expect(settingsOrder["settings-card channel-settings-card"]).toBeLessThan(settingsOrder["settings-card presence-execution-card"]);
  expect(settingsOrder["settings-card presence-execution-card"]).toBeLessThan(settingsOrder["settings-card presence-rhythm-card"]);
  expect(settingsOrder["settings-card presence-rhythm-card"]).toBeLessThan(settingsOrder["settings-card media-policy-card"]);
  expect(settingsOrder["settings-card presence-execution-card"]).toBeLessThan(settingsOrder["settings-card media-policy-card"]);
  expect(settingsOrder["settings-card media-policy-card"]).toBeLessThan(settingsOrder["settings-card public-self-card"]);
  const settingsSeparators = await page.locator(".presence-execution-card, .presence-rhythm-card, .media-policy-card, .public-self-card").evaluateAll((sections) => sections.map((section) => {
    const style = getComputedStyle(section);
    return { color: style.borderTopColor, width: style.borderTopWidth };
  }));
  expect(new Set(settingsSeparators.map((separator) => separator.color)).size).toBe(1);
  expect(settingsSeparators.every((separator) => separator.width === "1px")).toBe(true);
  await expect(page.locator(".presence-rhythm-card")).toHaveCSS("padding-top", "26px");
  const mediaPolicy = page.locator(".media-policy-card");
  await expect(mediaPolicy).toHaveCSS("border-top-width", "1px");
  await expect(mediaPolicy).toHaveCSS("padding-top", "26px");
  await expect(mediaPolicy.getByRole("heading", { name: "When media is hard to interpret" })).toBeVisible();
  await mediaPolicy.getByRole("button", { name: /Always review media actions/ }).click();
  await page.locator(".identity-options").getByRole("button", { name: /Me \/ my organization/ }).click();
  const publicSelf = page.locator(".public-self-card");
  await expect(publicSelf.getByRole("heading", { name: "How this Presence describes itself" })).toBeVisible();
  await publicSelf.getByRole("button", { name: /Representational/ }).click();
  await publicSelf.getByLabel("Built with OpenPresence", { exact: false }).check();
  await publicSelf.getByRole("button", { name: "Save Public Self", exact: true }).click();
  await page.reload();
  await navigate(page, "Settings");
  await expect(page.getByLabel("Presence name")).toHaveValue("Richardson");
  await expect(page.locator(".media-policy-card").getByRole("button", { name: /Always review media actions/ })).toHaveClass(/selected/);
  await expect(page.locator(".public-self-card").getByRole("button", { name: /Representational/ })).toHaveClass(/selected/);
  await expect(page.locator(".public-self-card").getByLabel("Built with OpenPresence", { exact: false })).toBeChecked();
});

test("Presence Brief keeps comma-separated territory text while editing", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Settings");
  await page.getByRole("button", { name: "Edit brief" }).click();
  const adjacent = page.getByLabel("Adjacent territory");
  const boundaries = page.getByLabel("Presence Brief boundaries");
  const primary = page.getByLabel("Primary territory");
  await adjacent.fill("AI infrastructure,");
  await expect(adjacent).toHaveValue("AI infrastructure,");
  await adjacent.fill("AI infrastructure, community design");
  await boundaries.fill("Partisan politics,");
  await expect(boundaries).toHaveValue("Partisan politics,");
  await boundaries.fill("Partisan politics, engagement bait");
  await primary.fill("Persistent agents, durable memory");
  await page.getByRole("button", { name: "Save brief", exact: true }).click();
  await page.getByRole("button", { name: "Edit brief" }).click();
  await expect(adjacent).toHaveValue("AI infrastructure, community design");
  await expect(boundaries).toHaveValue("Partisan politics, engagement bait");
  await expect(primary).toHaveValue("Persistent agents, durable memory");
  await page.getByRole("button", { name: "Close brief editor" }).click();
  await expect(page.getByText("AI infrastructure", { exact: true })).toBeVisible();
  await expect(page.getByText("community design", { exact: true })).toBeVisible();
  await expect(page.getByText("Partisan politics", { exact: true })).toBeVisible();
  await expect(page.getByText("engagement bait", { exact: true })).toBeVisible();
});

test("Chat stays quiet when Presence identity changes outside Chat", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Settings");
  const identityOptions = page.locator(".identity-options");
  await identityOptions.getByRole("button", { name: /Me \/ my organization/ }).click();
  await expect(identityOptions.getByRole("button", { name: /Me \/ my organization/ })).toHaveClass(/selected/);
  await expect(page.getByRole("heading", { name: "What should this Ghost represent?" })).toBeVisible();
  await page.getByLabel("Ghost subject").fill("Richardson Dackam");
  await page.getByLabel("Ghost priorities").fill("Build trustworthy open-source AI products.");
  await page.getByLabel("Ghost preferences").fill("Prefer clear evidence and useful depth over hype.");
  await page.getByLabel("Ghost voice").fill("Warm, direct, and technically sharp.");
  await page.getByLabel("Ghost boundaries").fill("Never invent my views or disclose private community context.");
  await page.getByRole("button", { name: "Save Ghost profile", exact: true }).click();
  await expect(page.getByText("Profile defined", { exact: true })).toBeVisible();
  await page.reload();
  await navigate(page, "Settings");
  await expect(page.getByLabel("Ghost subject")).toHaveValue("Richardson Dackam");
  await expect(page.locator(".ghost-understanding").getByText("Never invent my views or disclose private community context.", { exact: true })).toBeVisible();
  await navigate(page, "Chat");
  await expect(page.getByText("I noticed this Presence is now Ghost.", { exact: false })).toHaveCount(0);
  await expect(page.getByText("I noticed the Ghost profile changed.", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "See Jenny in the feed." })).toBeVisible();

  await navigate(page, "Settings");
  await identityOptions.getByRole("button", { name: /^Jenny Agent-owned/ }).click();
  await expect(identityOptions.getByRole("button", { name: /^Jenny Agent-owned/ })).toHaveClass(/selected/);
  await navigate(page, "Chat");
  await expect(page.getByText("I noticed this Presence is now Agent-owned.", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "See Jenny in the feed." })).toBeVisible();
});

test("desktop shell keeps sidebar and runtime status available", async ({ page }) => {
  await createAgent(page);
  await expect(page.getByLabel("Help")).toHaveCount(0);
  const expectedPosition = test.info().project.name === "mobile" ? "relative" : "sticky";
  await expect(page.locator(".sidebar")).toHaveCSS("position", expectedPosition);
  if (test.info().project.name !== "mobile") {
    await expect(page.locator(".sidebar .secondary-nav").nth(0)).toHaveText("Teach");
    await expect(page.locator(".sidebar .secondary-nav").nth(1)).toHaveText("Playground");
    await expect(page.locator(".sidebar .secondary-nav").nth(2)).toContainText("Manage Agent");
  }
  await expect(page.getByLabel("Live presence filter")).toHaveCount(0);
  await expect(page.locator(".pause-card")).toHaveCount(0);
  await expect(page.locator(".scope-summary")).toContainText("X");
  await navigate(page, "Schedule");
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
  await expect(page.getByRole("heading", { name: "Genny, right now." })).toBeVisible();
  await expect(page.getByText("@jenny_ai", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Manage Jenny/ })).toHaveCount(0);

  await navigate(page, "Schedule");
  await expect(page.getByText("Tell Genny when to pay attention.", { exact: false })).toBeVisible();
  await expect(page.getByText("Planning for Genny", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Week", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "When Genny is meant to pay attention" })).toBeVisible();
});

test("Playground Presence chip keeps identity separate from channel context", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Playground");
  await expect(page.locator(".playground-presence")).toHaveText(/^\s*Jenny\s*$/);
  await expect(page.locator(".playground-world-label")).toHaveText("Simulated X");
});

test("Playground rehearses a Presence inside an isolated simulated world", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Playground");
  await expect(page.getByRole("heading", { name: "Playground", exact: true })).toBeVisible();
  await expect(page.locator(".playground-grid")).toBeVisible();
  await expect(page.locator(".playground-presence")).toHaveText(/^\s*Jenny\s*$/);
  await expect(page.locator(".playground-world-label")).toHaveText("Simulated X");
  await expect(page.getByText(/Rehearse how this Presence behaves on X\. This world is simulated\. Jenny is real\./)).toBeVisible();
  await expect(page.getByText("Sandbox", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Check now" }).click();
  await expect(page.locator(".social-card").first()).toBeVisible();
  await expect(page.locator(".social-card").first()).not.toContainText(/[–—]/);
  const eventForm = page.locator(".sandbox-event-form");
  const mediaInput = eventForm.locator(".sandbox-file-input");
  await expect(eventForm.locator(".sandbox-file-button")).toBeVisible();
  await expect(eventForm.locator(".sandbox-file-button")).toContainText("Add media");
  await expect(mediaInput).toBeAttached();
  const mediaInputStyle = await mediaInput.evaluate((node) => {
    const style = getComputedStyle(node);
    return { position: style.position, width: style.width, height: style.height, clipPath: style.clipPath };
  });
  expect(mediaInputStyle).toEqual({ position: "absolute", width: "1px", height: "1px", clipPath: "inset(50%)" });
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
  const fixture = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await eventForm.getByLabel("Add media").setInputFiles({ name: "simulated-image.png", mimeType: "image/png", buffer: fixture });
  await eventForm.getByLabel("What did they post?").fill("This post includes an image.");
  await eventForm.getByRole("button", { name: "Add post" }).click();
  await expect(page.getByRole("button", { name: "What Jenny sees" })).toBeVisible();
  await expect(page.getByText("Media needs inspection", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "What Jenny sees" }).click();
  const perceptionPanel = page.locator(".perception-panel");
  await expect(perceptionPanel.getByText(/not been successfully interpreted/)).toBeVisible();
  await expect(perceptionPanel.getByText("insufficient", { exact: true })).toBeVisible();
  await perceptionPanel.getByRole("button", { name: "Inspect media" }).click();
  await expect(page.getByText("Media inspected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "+1h" }).click();
  await expect(page.getByText("Virtual time", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.locator(".playground-grid")).toBeVisible();
  await expect(page.locator(".social-card")).toHaveCount(0);
  await expect(page.getByText("Fresh X account", { exact: true })).toBeVisible();
});

test("Original Post Rehearsal stays autonomous and records calibration evidence", async ({ page, request }) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", (request) => { failedRequests.push(`${request.method()} ${request.url()}`); });
  await createAgent(page);
  await navigate(page, "Playground");

  await page.getByRole("button", { name: "Consider an original post", exact: true }).click();
  await expect(page.getByRole("region", { name: "Original post rehearsal", exact: true })).toBeVisible();
  await page.getByLabel("Optional inspiration").fill("A private operator thought that must not become a social-world event.");
  await page.getByRole("button", { name: "Consider now", exact: true }).click();
  const rehearsalHistory = page.getByRole("region", { name: "Original post rehearsal history" });
  const controlRoomLayout = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>(".playground-activity > section"));
    return {
      documentFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      sectionsFitRail: sections.every((section) => section.scrollWidth <= section.clientWidth + 1),
    };
  });
  expect(controlRoomLayout).toEqual({ documentFitsViewport: true, sectionsFitRail: true });
  await expect(rehearsalHistory).toContainText("Published in Sandbox");
  await expect(rehearsalHistory).toContainText("A good memory keeps the decision and the evidence that made it useful, not every transcript.");
  await expect(rehearsalHistory.getByRole("button", { name: "View what you submitted", exact: true })).toBeVisible();
  await rehearsalHistory.getByRole("button", { name: "View what you submitted", exact: true }).click();
  await expect(rehearsalHistory.locator(".rehearsal-context-detail").getByText("A private operator thought that must not become a social-world event.", { exact: true })).toBeVisible();
  await expect(rehearsalHistory).toContainText("Considered as context only. It was not added to the simulated world or treated as a command to publish.");

  const afterConsider = await (await request.get("/api/state")).json();
  expect(afterConsider.originalPostRehearsals).toHaveLength(1);
  expect(afterConsider.originalPostRehearsals[0].stimulus).toEqual({ type: "text", value: "A private operator thought that must not become a social-world event." });
  expect(afterConsider.originalPostRehearsals[0].result).toBe("published");
  expect(afterConsider.originalPostRehearsals[0].publicationId).toBeTruthy();
  const rehearsalExecution = afterConsider.executions.find((item: { rehearsalAttemptId?: string }) => item.rehearsalAttemptId === afterConsider.originalPostRehearsals[0].id);
  expect(rehearsalExecution).toMatchObject({ status: "succeeded", connector: "simulated", environment: "sandbox" });
  expect(afterConsider.mirrorObjects.some((item: { originExecutionId?: string; environment?: string }) => item.originExecutionId === rehearsalExecution?.id && item.environment === "sandbox")).toBe(true);
  expect(afterConsider.mirrorObjects.some((item: { content?: { text?: string } }) => item.content?.text?.includes("private operator thought"))).toBe(false);

  await page.getByRole("button", { name: "Fits", exact: true }).click();
  await expect(page.getByText(/Saved as preference evidence/).first()).toBeVisible();
  const calibrated = await (await request.get("/api/state")).json();
  expect(calibrated.preferenceEvidence[0].reaction).toBe("fits");

  await page.getByRole("button", { name: "Try another", exact: true }).click();
  await expect(rehearsalHistory).toContainText("Attempt 2");
  const retried = await (await request.get("/api/state")).json();
  expect(retried.originalPostRehearsals).toHaveLength(2);
  expect(retried.originalPostRehearsals[0].id).not.toBe(retried.originalPostRehearsals[1].id);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test("Playground gives likes an activity treatment distinct from posts", async ({ page, request }) => {
  await createAgent(page);
  await navigate(page, "Playground");

  const initial = await request.get("/api/state");
  const initialState = await initial.json();
  const session = initialState.playgroundSessions[0];
  expect(session).toBeTruthy();

  const postResponse = await request.post("/api/state", {
    data: {
      type: "addSandboxEvent",
      sessionId: session.id,
      actionId: "post",
      actorName: "Maya Chen",
      actorHandle: "@maya",
      content: "What is the hardest part of giving an AI a durable identity?",
    },
  });
  expect(postResponse.ok()).toBeTruthy();
  const postState = await postResponse.json();
  const post = postState.mirrorObjects.find(
    (item: { objectType: string; content?: { text?: string } }) =>
      item.objectType === "post" &&
      item.content?.text === "What is the hardest part of giving an AI a durable identity?",
  );
  expect(post).toBeTruthy();

  const likeResponse = await request.post("/api/state", {
    data: {
      type: "addSandboxEvent",
      sessionId: session.id,
      actionId: "like",
      actorName: "Maya Chen",
      actorHandle: "@mayachen",
      targetExternalRef: post.externalRef,
    },
  });
  expect(likeResponse.ok()).toBeTruthy();
  const finalState = await (await request.get("/api/state")).json();
  const like = finalState.mirrorObjects.find(
    (item: { objectType: string; author?: { displayName?: string } }) =>
      item.objectType === "like" && item.author?.displayName === "Maya Chen",
  );
  const target = like
    ? finalState.mirrorObjects.find(
        (item: { externalRef: { type: string; id: string }; content?: { text?: string } }) =>
          item.externalRef.type === like.parentExternalRef?.type &&
          item.externalRef.id === like.parentExternalRef?.id,
      )
    : undefined;
  expect(like).toBeTruthy();
  expect(target?.content?.text).toBeTruthy();

  await page.reload();
  await navigate(page, "Playground");
  const reaction = page.locator(".social-event-card");
  await expect(reaction).toHaveCount(1);
  await expect(reaction).toContainText("Activity · Like");
  await expect(reaction).toContainText("Maya Chen liked a post");
  await expect(reaction.locator("blockquote")).toContainText(target.content.text);
  await expect(reaction).not.toContainText("Someone likes a post occurred.");
  await expect(reaction.locator(".social-card-meta")).toHaveCount(0);
});

test("Playground stacks Jenny's reply beneath the simulated post it answers", async ({ page, request }) => {
  await createAgent(page);
  await navigate(page, "Playground");
  const initial = await request.get("/api/state");
  const initialState = await initial.json();
  const session = initialState.playgroundSessions[0];
  expect(session).toBeTruthy();

  const postResponse = await request.post("/api/state", {
    data: {
      type: "addSandboxEvent",
      sessionId: session.id,
      actionId: "post",
      actorName: "Maya Chen",
      actorHandle: "@maya",
      content: "What is one concrete way to keep an AI agent's memory useful?",
    },
  });
  expect(postResponse.ok()).toBeTruthy();
  const replyState = await request.post("/api/state", {
    data: {
      type: "addSandboxEvent",
      sessionId: session.id,
      actionId: "reply",
      actorName: "Jenny",
      actorHandle: "@jenny_ai",
      content: "Keep memories tied to people, decisions, and the evidence that made them useful.",
      targetExternalRef: (await postResponse.json()).mirrorObjects.find((item: { content?: { text?: string }; externalRef: { type: string; id: string } }) => item.content?.text === "What is one concrete way to keep an AI agent's memory useful?").externalRef,
    },
  });
  expect(replyState.ok()).toBeTruthy();

  await page.reload();
  await navigate(page, "Playground");
  await expect(page.locator(".social-feed").getByText("What is one concrete way to keep an AI agent's memory useful?", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".thread-reply-card").filter({ hasText: "Jenny" })).toHaveCount(1);
  const sourceBox = await page.locator(".social-feed").getByText("What is one concrete way to keep an AI agent's memory useful?", { exact: true }).first().locator("xpath=ancestor::article").boundingBox();
  const replyBox = await page.locator(".thread-reply-card").filter({ hasText: "Jenny" }).boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(replyBox).not.toBeNull();
  expect(replyBox!.y).toBeGreaterThan(sourceBox!.y);
});

test("Activity keeps Sandbox records scoped and labels Playground context", async ({ page, request }) => {
  await createAgent(page);
  await navigate(page, "Playground");
  const initial = await request.get("/api/state");
  const session = (await initial.json()).playgroundSessions[0];
  const added = await request.post("/api/state", {
    data: { type: "addSandboxEvent", sessionId: session.id, actionId: "post", actorName: "Maya Chen", content: "A Playground-only observation." },
  });
  expect(added.ok()).toBeTruthy();
  await page.reload();
  await navigate(page, "Activity");
  await expect(page.locator(".activity-tag", { hasText: "Playground" })).toBeVisible();
  await expect(page.locator(".event-context-preview span", { hasText: "↳" })).toHaveCount(1);

  const liveRoute = await request.post("/api/state", { data: { type: "setPresence", patch: { connectionMode: "native" } } });
  expect(liveRoute.ok()).toBeTruthy();
  await page.reload();
  await navigate(page, "Activity");
  await expect(page.locator(".scope-summary")).toHaveText("X · Live");
  await expect(page.getByText("A Playground-only observation.", { exact: true })).toHaveCount(0);
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
  await openAddPresence(page);
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

  await navigate(page, "Schedule");
  await page.getByRole("button", { name: "Add intent" }).click();
  await page.getByLabel("What should Jenny in Founders do?").fill("Share one useful memory idea with the founders.");
  await page.getByRole("button", { name: "Save standing intent" }).click();
  await page.getByRole("button", { name: "Evaluate this intent" }).click();
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
