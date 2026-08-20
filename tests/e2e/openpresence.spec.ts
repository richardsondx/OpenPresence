import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  const desktopSidebar = page.locator(".sidebar:visible");
  if (label === "Settings") {
    const navigation = test.info().project.name === "mobile"
      ? page.locator(".mobile-nav")
      : desktopSidebar;
    await navigation.getByRole("button", { name: "Settings", exact: false }).click();
    return;
  }
  const navigationLabel = label === "Brain" ? "Manage Agent" : label;
  if (test.info().project.name === "mobile") {
    await page.getByRole("navigation", { name: "Mobile navigation" }).last().getByRole("button", { name: navigationLabel }).click({ force: true });
  } else if (label === "Brain") await page.getByRole("button", { name: /^Manage Agent/ }).click();
  else await desktopSidebar.getByRole("button", { name: navigationLabel, exact: false }).click();
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
  await expect(page.locator(".topbar-actions")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "New rehearsal", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "See Jenny in the feed." })).toHaveCount(0);
  await expect(page.getByText("Public self · @jenny_ai", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Chat · X", { exact: true })).toHaveCount(0);
  await expect(page.getByText("X · Jenny", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Start the rehearsal.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Add a post to the scene, or choose Reply on a post to continue its thread. Nothing publishes or changes the Agent during this rehearsal.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Post", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Reply", exact: true })).toBeDisabled();
  await expect(page.getByRole("complementary", { name: "Context & Changes sidebar" })).toHaveCount(0);
  await expect(page.getByText("Private thread · not published", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Brief rehearsal", exact: true })).toBeVisible();
  await expect(page.getByText("Durable", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit brief", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Rehearse brief for/ })).toBeVisible();
  await page.getByLabel("Presence Brief purpose").fill("Explore edge cases in autonomous software.");
  await page.getByRole("button", { name: "Preview in rehearsal", exact: true }).click();
  await expect(page.getByText("Preview active", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save to Presence", exact: true })).toBeVisible();
  await expect(page.getByLabel("Model")).toHaveCount(0);
  await expectComposerLayout(page);
  await expectChatViewportLayout(page);
  let chatCallCount = 0;
  await page.route("**/api/state", async (route) => {
    if (route.request().method() === "POST" && (route.request().postDataJSON() as { type?: string }).type === "sendPresenceChatMessage") {
      chatCallCount++;
      if (chatCallCount === 1) {
        expect((route.request().postDataJSON() as { briefOverride?: { purpose?: string } }).briefOverride?.purpose).toContain("Explore edge cases");
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    await route.continue();
  });
  await page.getByLabel("Post for Jenny to encounter").fill("My name is Bob and I own a submarine.");
  await page.getByRole("button", { name: "Send post" }).click();
  await expect(page.getByText("My name is Bob and I own a submarine.", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").getByText("Considering", { exact: true })).toBeVisible();
  await expect(page.getByText(/That is a memorable introduction/)).toBeVisible();
  await expect(page.getByText(/Agent runtime/)).toHaveCount(0);
  await expect(page.getByText("Not published · private rehearsal", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveCount(0);
  const afterChat = await (await request.get("/api/state")).json();
  expect(afterChat.presenceChatSessions[0].messages.map((message: { role: string }) => message.role)).toEqual(["user", "presence"]);
  expect(afterChat.conversations[0].messages).toHaveLength(0);
  expect(afterChat.changeSets).toHaveLength(0);
  await page.getByRole("button", { name: "Save to Presence", exact: true }).click();
  await expect(page.getByText("Durable", { exact: true })).toBeVisible();
  const afterSave = await (await request.get("/api/state")).json();
  expect(afterSave.presences[0].brief.purpose).toBe("Explore edge cases in autonomous software.");
  await page.getByRole("button", { name: "Reply to this post", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reply", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Reply for Jenny to encounter")).toBeVisible();
  await expect(page.getByText("Replying to", { exact: true })).toBeVisible();
  await page.getByLabel("Reply for Jenny to encounter").fill("The edge cases are where the product tells the truth.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByText("The edge cases are where the product tells the truth.", { exact: true })).toBeVisible();
  await expect(page.getByText(/happy paths demonstrate possibility/)).toBeVisible();
  const afterReply = await (await request.get("/api/state")).json();
  const rehearsalMessages = afterReply.presenceChatSessions[0].messages;
  expect(rehearsalMessages.map((message: { role: string }) => message.role)).toEqual(["user", "presence", "user", "presence"]);
  expect(rehearsalMessages[2].replyToMessageId).toBe(rehearsalMessages[0].id);
  await page.reload();
  await navigate(page, "Chat");
  await expect(page.getByText("The edge cases are where the product tells the truth.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New rehearsal", exact: true }).click();
  await expect(page.getByText("Start the rehearsal.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("The edge cases are where the product tells the truth.", { exact: true })).toHaveCount(0);
  expect(duplicateKeyErrors).toEqual([]);
});

test("Presence Chat renders video attachments as playable video", async ({ page, request }) => {
  await createAgent(page);
  await navigate(page, "Chat");
  const initialState = await (await request.get("/api/state")).json();
  const session = initialState.presenceChatSessions[0];
  expect(session).toBeTruthy();
  const videoDataUrl = `data:video/mp4;base64,${readFileSync(resolve("scenarios/fixtures/agent-demo.mp4")).toString("base64")}`;

  await page.route("**/api/state", async (route) => {
    if (route.request().method() !== "POST" || (route.request().postDataJSON() as { type?: string }).type !== "sendPresenceChatMessage") {
      await route.continue();
      return;
    }
    const body = route.request().postDataJSON() as { content: string };
    const now = new Date().toISOString();
    const next = structuredClone(initialState);
    next.presenceChatSessions[0].messages = [
      { id: "video-user-message", role: "user", content: body.content, timestamp: now, attachments: [{ id: "video-attachment", name: "agent-demo.mp4", kind: "video", mimeType: "video/mp4", dataUrl: videoDataUrl, perception: { observation: "A short blue-and-white chart animation.", uncertainty: "low" } }] },
      { id: "video-presence-reply", role: "presence", content: "I can inspect the video and describe what is visible.", timestamp: now },
    ];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(next) });
  });

  await page.getByLabel("Attach asset").locator("input[type=file]").setInputFiles(resolve("scenarios/fixtures/agent-demo.mp4"));
  await page.getByLabel("Post for Jenny to encounter").fill("Describe exactly what you can see.");
  await page.getByRole("button", { name: "Send post" }).click();
  await expect(page.locator("video[aria-label='Attached video']")).toBeVisible();
  await expect(page.locator("img[alt='Attached video']")).toHaveCount(0);
});

test("Presence Chat makes a specific, consent-aware introduction judgment", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Chat");
  await page.getByLabel("Post for Jenny to encounter").fill("A founder wants an investor introduction. How would you decide if it is useful?");
  await page.getByRole("button", { name: "Send post", exact: true }).click();
  await expect(page.getByText(/specific fit first/)).toBeVisible();
  await expect(page.getByText(/warm intro without evidence is just noise/)).toBeVisible();
});

test("Teach is the operator-facing surface for durable Agent changes", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Teach");
  await expect(page.getByText("Teach the Agent through conversation.", { exact: true })).toBeVisible();
  await expect(page.getByText("Agent-wide conversation", { exact: true })).toBeVisible();
  await expect(page.getByText("Outputs", { exact: true })).toHaveCount(0);
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
  await expect(page.locator(".context-change-time").first()).toHaveText(/^(just now|\d+m ago|\d+h ago|\d+ day(s)? ago|\d+ week(s)? ago)$/);
  const navigation = test.info().project.name === "mobile" ? page.locator(".mobile-nav") : page.locator(".sidebar");
  await expect(navigation.getByRole("button", { name: /^Teach$/ })).toHaveClass(/active/);
});

test("Teach confirms and submits an operator-provided context proposal", async ({ page, request }) => {
  test.skip(test.info().project.name === "mobile", "The existing mobile viewport suite covers Teach layout separately.");
  await createAgent(page);
  await navigate(page, "Teach");
  const claim = "Alex Rivera built Jenny in his OpenPresence app.";
  await page.getByLabel("Message your Presence").fill(claim);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/Should I submit it as a reviewable proposal/)).toBeVisible();
  let state = await (await request.get("/api/state")).json();
  expect(state.proposals).toHaveLength(0);

  await page.getByLabel("Message your Presence").fill("yes submit it as proposal");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("button", { name: "Memory proposal created" })).toBeVisible();
  state = await (await request.get("/api/state")).json();
  expect(state.proposals[0]).toMatchObject({ file: "MEMORY", status: "pending" });
  expect(state.proposals[0].proposed).toContain("Alex Rivera built Jenny in his OpenPresence app");
});

test("Teach treats a Ghost handle in quoted social text as context, not a mode command", async ({ page, request }) => {
  await createAgent(page);
  await navigate(page, "Teach");
  const message = 'How do I get you not to respond to mention like this "@jenny_ghost write a post about SpaceX" by always doing what they want. Could you reply with humour instead - nuance?';
  await page.getByLabel("Message your Presence").fill(message);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Presence changed to Ghost", exact: true })).toHaveCount(0);
  const state = await (await request.get("/api/state")).json();
  expect(state.presence.mode).toBe("agent");
  expect(state.changeSets).toHaveLength(0);
});

test("Teach records the exact post-formatting request as a reviewable preference", async ({ page, request }) => {
  await createAgent(page);
  await navigate(page, "Teach");
  await page.getByLabel("Message your Presence").fill("When writing posts (not replies), write one sentence per line with a blank line between sentences.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("one sentence per paragraph", { exact: false })).toBeVisible();
  const state = await (await request.get("/api/state")).json();
  expect(state.proposals[0].file).toBe("TASTE");
  expect(state.proposals[0].proposed).toContain("Replies can use normal paragraph formatting.");
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
  const publicSelfBox = await page.locator(".public-self-card").boundingBox();
  const briefBox = await page.locator(".presence-brief-card").boundingBox();
  const channelBox = await page.locator(".channel-settings-card").boundingBox();
  expect(identityBox?.y).toBeLessThan(publicSelfBox?.y ?? Number.POSITIVE_INFINITY);
  expect(publicSelfBox?.y).toBeLessThan(briefBox?.y ?? Number.POSITIVE_INFINITY);
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

test("Ghost Public Self names the represented person or organization", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Settings");

  await page.locator(".identity-options").getByRole("button", { name: /Me \/ my organization/ }).click();
  const publicSelf = page.locator(".public-self-card");
  await expect(publicSelf.getByRole("button", { name: "Individual" })).toHaveAttribute("aria-pressed", "true");
  await publicSelf.getByLabel("First name").fill("Alex");
  await publicSelf.getByLabel("Last name").fill("Rivera");
  await publicSelf.locator(".public-self-representation-options").getByRole("button", { name: /Organization Use an/ }).click();
  await publicSelf.getByLabel("Organization name").fill("Alex's AI Founders Club");
  const represented = publicSelf.getByLabel("Organization website");
  await represented.fill("https://aifounders.club");
  await publicSelf.getByRole("button", { name: "Save Public Self" }).click();
  await expect(represented).toHaveValue("https://aifounders.club");
  await page.reload();
  await navigate(page, "Settings");
  const reloadedPublicSelf = page.locator(".public-self-card");
  await expect(reloadedPublicSelf.getByLabel("Organization name")).toHaveValue("Alex's AI Founders Club");
  await expect(reloadedPublicSelf.getByLabel("Organization website")).toHaveValue("https://aifounders.club");
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
  await expect(page.getByRole("button", { name: "Use GPT 5.6 Luna medium" })).toHaveClass(/selected/);
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

test("Manage Agent makes Agent capabilities discoverable and Presence authority explicit", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Brain");
  await expect(page.getByRole("heading", { name: "What Jenny can use" })).toBeVisible();
  for (const name of ["Web research", "Asset intelligence", "Visual creation", "Channel action"]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Managed by Presence", { exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Enable Channel action" })).toHaveCount(0);
  await expect(page.locator(".tool-boundary")).toContainText("Disabling a capability withholds its callable tools");
  await page.getByRole("switch", { name: "Enable Web research" }).click();
  await expect(page.getByRole("switch", { name: "Enable Web research" })).not.toBeChecked();
  await expect(page.getByText("Off · Registered", { exact: true }).first()).toBeVisible();
  await page.reload();
  await navigate(page, "Brain");
  await expect(page.getByRole("switch", { name: "Enable Web research" })).not.toBeChecked();
  await expect(page.getByText("Unavailable", { exact: true }).first()).toBeVisible();
  await navigate(page, "Teach");
  await expect(page.getByText("Tools available", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Capabilities enabled", { exact: true })).toBeVisible();
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

test("Teach submits an explicit Presence identity instruction for review", async ({ page, request }) => {
  await createAgent(page);
  await navigate(page, "Teach");
  const instruction = `You are NOT "I'm Jenny — @jenny_ai." You are "Jenny". Your full name is "Jenny Presence".`;
  await page.getByLabel("Message your Presence").fill(instruction);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("button", { name: "Presence identity proposal created" })).toBeVisible();

  const proposed = await (await request.get("/api/state")).json();
  expect(proposed.proposals[0]).toMatchObject({ file: "PRESENCE", status: "pending", target: { type: "presence_identity", name: "Jenny Presence" } });
  expect(proposed.presence.name).toBe("Jenny");

  await navigate(page, "Brain");
  await expect(page.getByRole("heading", { name: "Protected changes" })).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await navigate(page, "Settings");
  await expect(page.getByLabel("Presence name")).toHaveValue("Jenny Presence");
});

test("Schedule stores an Assignment and shows its readiness contract", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Schedule");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.locator(".page-heading").getByRole("button", { name: "Add assignment", exact: true }).click();
  await expect(page.getByLabel("Assignment window")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Timing options" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("How long is this relevant?", { exact: true })).toHaveCount(0);
  await page.getByLabel("What should Jenny accomplish?").fill("Teach the audience one useful idea about persistent agents.");
  await page.getByRole("textbox", { name: "Time", exact: true }).fill("09:15");
  await page.getByRole("button", { name: "Review assignment" }).click();
  await expect(page.getByText("Teach the audience one useful idea about persistent agents.")).toBeVisible();
  await expect(page.getByText("Ready to activate", { exact: true })).toBeVisible();
  await expect(page.getByText("The post is live on X and confirmed.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Activate Assignment" }).click();
  await expect(page.getByText("active", { exact: true })).toBeVisible();
});

test("Schedule reveals a custom Assignment window only when requested", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Schedule");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.locator(".page-heading").getByRole("button", { name: "Add assignment", exact: true }).click();
  await page.getByRole("button", { name: "Timing options" }).click();
  await expect(page.getByText("How long is this relevant?", { exact: true })).toBeVisible();
  await expect(page.getByText("Recommended · Jenny can work within a few hours.", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: /Custom/ }).check();
  await page.getByLabel("Assignment starts").fill("07:00");
  await page.getByLabel("Assignment ends").fill("10:30");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel("What should Jenny accomplish?").fill("Review one useful idea for the audience.");
  await page.getByRole("button", { name: "Review assignment" }).click();
  await expect(page.getByText("07:00–10:30", { exact: true })).toBeVisible();
});

test("Activity explains current work and next attention", async ({ page }) => {
  await createAgent(page);
  await expect(page.getByRole("heading", { name: "When Jenny pays attention" })).toHaveCount(0);
  await expect(page.getByLabel("Operating status").getByRole("heading", { name: "Waiting for the next meaningful event" })).toBeVisible();
  await expect(page.getByLabel("Operating status").getByRole("heading", { name: "On demand" })).toBeVisible();
  await expect(page.getByLabel("Operating status").getByText("No automatic scan is scheduled because no observer or Assignment is connected.", { exact: true })).toBeVisible();
  await page.locator(".page-heading .heading-actions").getByRole("button", { name: "Check now", exact: true }).click();
  await expect(page.getByLabel("Operating status").getByRole("heading", { name: "Waiting for a better moment" })).toBeVisible();
  await expect(page.locator(".event-title").filter({ hasText: "Pulse completed" })).toBeVisible();
});

test("Growth exposes evidence freshness and the next Agent review", async ({ page, request }) => {
  await createAgent(page);
  const fresh = await request.get("/api/state");
  const state = await fresh.json();
  const changed = await request.post("/api/state", { data: { type: "createAssignment", presenceId: state.presence.id, environment: "live", instruction: "Grow this Presence toward 100,000 followers while building an audience of AI founders." } });
  expect(changed.ok()).toBeTruthy();

  await page.reload();
  await navigate(page, "Growth");
  await expect(page.getByRole("region", { name: "Genny's current read" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Genny's current read" })).toContainText("Genny is still learning");
  await expect(page.getByRole("region", { name: "What happens next" })).toContainText("Growth needs attention");
  await expect(page.getByRole("region", { name: "What happens next" })).toContainText("No connected X body can perform this action.");
  await expect(page.getByText("When Growth was checked", { exact: true })).toHaveCount(0);
  await expect(page.locator(".growth-disclosure").filter({ hasText: "Capabilities & limitations" })).toContainText("Unavailable");
});

test("Growth shows fresh evidence directly without requiring a review action", async ({ page, request }) => {
  await createAgent(page);
  const initial = await (await request.get("/api/state")).json();
  const presenceId = initial.presence.id;
  const created = await request.post("/api/state", { data: { type: "createAssignment", presenceId, environment: "live", instruction: "Grow this Presence toward 100,000 followers while building an audience of AI founders." } });
  expect(created.ok()).toBeTruthy();
  const afterAssignment = await (await request.get("/api/state")).json();
  const assignment = afterAssignment.assignments.find((item: { presenceId: string; successEvidence?: { metric?: string } }) => item.presenceId === presenceId && item.successEvidence?.metric === "followers");
  expect(assignment).toBeTruthy();
  const reviewed = await request.post("/api/state", { data: { type: "reviewGrowth", presenceId, assignmentId: assignment.id, kind: "weekly" } });
  expect(reviewed.ok()).toBeTruthy();
  const observedAt = new Date().toISOString();
  await page.route("**/api/state*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const payload = await response.json();
    payload.audienceSnapshots = [...(payload.audienceSnapshots ?? []), { id: "fresh-audience", presenceId, channel: "x", followers: 4, source: "native", observationStatus: "observed", observedAt, environment: "live" }];
    payload.mirrorObjects = [...(payload.mirrorObjects ?? []), { id: "fresh-post", bridgeId: "native:test", presenceId, channelId: "x", externalRef: { type: "x.post", id: "fresh-post" }, objectType: "post", language: "en", author: { displayName: "Builder", handle: "builder" }, content: { text: "A fresh implementation lesson." }, observedAt, visibility: "public", shareability: "public", environment: "live", source: "native", trust: "untrusted_world_content" }];
    payload.publicationMetricSnapshots = [...(payload.publicationMetricSnapshots ?? []), { id: "fresh-publication", presenceId, mirrorObjectId: "fresh-post", observedAt, publicationAgeSeconds: 60, impressions: 120, likes: 8, replies: 2, source: "native", observationStatus: "observed" }];
    return route.fulfill({ response, json: payload });
  });
  await page.reload();
  await navigate(page, "Growth");
  const read = page.getByRole("region", { name: "Genny's current read" });
  await expect(read).toContainText("2 newer observations will be incorporated automatically");
  await expect(page.getByRole("button", { name: "Review new evidence" })).toHaveCount(0);
  const evidence = page.locator(".growth-disclosure").filter({ hasText: "Evidence" }).first();
  await expect(evidence).toContainText("Audience, publication, and Social Mirror records");
  await evidence.locator("summary").first().click();
  await evidence.getByText("View audience and publication evidence", { exact: true }).click();
  await expect(evidence).toContainText("A fresh implementation lesson.");
});

test("Growth review shows immediate feedback while new evidence is processing", async ({ page, request }) => {
  await createAgent(page);
  const initial = await (await request.get("/api/state")).json();
  const presenceId = initial.presence.id;
  const created = await request.post("/api/state", { data: { type: "createAssignment", presenceId, environment: "live", instruction: "Grow this Presence toward 100,000 followers while building an audience of AI founders." } });
  expect(created.ok()).toBeTruthy();

  await page.reload();
  await navigate(page, "Growth");
  await page.getByText("Review evidence early", { exact: true }).click();
  const reviewButton = page.getByRole("button", { name: "Review now" });
  await expect(reviewButton).toBeVisible();
  await page.route(/\/api\/state(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "POST" || !route.request().postData()?.includes('"reviewGrowth"')) return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    return route.continue();
  });
  await reviewButton.click();
  await expect(page.getByText("Reviewing…", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reviewing…", exact: true })).toBeDisabled();
  await expect(page.getByText("Reviewing…", { exact: true })).toBeHidden({ timeout: 10_000 });
});

test("Activity distinguishes observed Mirror volume from selected attention", async ({ page }) => {
  await createAgent(page);
  await page.route("**/api/state*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const payload = await response.json();
    const presenceId = payload.presence?.id;
    if (!presenceId) return route.fulfill({ response, json: payload });
    const observedAt = new Date().toISOString();
    const objectId = "mirror-test-mention";
    const judgedObjectId = "mirror-test-judged";
    payload.mirrorObjects = [{
      id: objectId,
      bridgeId: "native:test",
      presenceId,
      channelId: "x",
      externalRef: { type: "x.post", id: "2089273076663955538" },
      objectType: "post",
      language: "en",
      author: { displayName: "InnerClaw", handle: "CGreeneGo" },
      content: { text: "@jenny_ai we need another opinion here please 🫶" },
      occurredAt: observedAt,
      observedAt,
      visibility: "public",
      shareability: "presence-only",
      environment: "sandbox",
      source: "native",
      trust: "untrusted_world_content",
    }, {
      id: judgedObjectId,
      bridgeId: "native:test",
      presenceId,
      channelId: "x",
      externalRef: { type: "x.post", id: "2089273076663955539" },
      objectType: "post",
      language: "en",
      author: { displayName: "Judged Person", handle: "judged_person" },
      content: { text: "This observed post has already been evaluated." },
      occurredAt: observedAt,
      observedAt,
      visibility: "public",
      shareability: "presence-only",
      environment: "sandbox",
      source: "native",
      trust: "untrusted_world_content",
    }, ...payload.mirrorObjects];
    payload.socialDecisions = [{
      id: "social-decision-mirror-test-judged",
      agentId: payload.agent?.id ?? "test-agent",
      presenceId,
      environment: "sandbox",
      focalMirrorObjectIds: [judgedObjectId],
      decision: "no_op",
      summary: "The observed post was evaluated and left alone.",
      influences: [],
      createdAt: observedAt,
    }, ...(payload.socialDecisions ?? [])];
    await route.fulfill({ response, json: payload });
  });
  await page.reload();
  await navigate(page, "Activity");
  const judgmentFilter = page.getByRole("group", { name: "Attention selection filter" });
  await expect(judgmentFilter.getByRole("button", { name: /Awaiting judgment/ })).toBeVisible();
  await expect(judgmentFilter.getByRole("button", { name: /Selected for attention/ })).toBeVisible();
  await judgmentFilter.getByRole("button", { name: /Awaiting judgment/ }).click();
  await expect(page.getByText("we need another opinion here please", { exact: false })).toBeVisible();
  await expect(page.getByText("This observed post has already been evaluated.", { exact: false })).toHaveCount(0);
  await judgmentFilter.getByRole("button", { name: /All/ }).click();
  await judgmentFilter.getByRole("button", { name: /Selected for attention/ }).click();
  await expect(page.getByText("This observed post has already been evaluated.", { exact: false })).toBeVisible();
  await expect(page.getByText("we need another opinion here please", { exact: false })).toHaveCount(0);
  await judgmentFilter.getByRole("button", { name: /All/ }).click();
  await page.getByRole("button", { name: /Mentions/ }).click();
  await expect(page.getByText("we need another opinion here please", { exact: false })).toBeVisible();
  await expect(page.getByText("Seen by Jenny", { exact: true })).toBeVisible();
  await expect(page.getByText("Mentioned @jenny_ai", { exact: true })).toBeVisible();
  await expect(page.getByText("Observed · not selected", { exact: true })).toBeVisible();
});

test("Activity and Agenda expose the current dynamic attention plan", async ({ page, request }) => {
  await createAgent(page);
  const initial = await (await request.get("/api/state")).json();
  const created = await request.post("/api/state", { data: { type: "createAssignment", presenceId: initial.presence.id, environment: "live", instruction: "Grow this Presence toward 100,000 followers while building an audience of AI founders." } });
  expect(created.ok()).toBeTruthy();
  await page.reload();

  const rail = page.getByRole("region", { name: "Live attention order" });
  await expect(rail).toBeVisible();
  await expect(rail.getByText("Next", { exact: true })).toBeVisible();
  await expect(rail.getByText("Watching", { exact: true })).toBeVisible();
  await expect(rail.getByText("Needs you", { exact: true })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Open Agenda →" })).toBeVisible();
  await expect(page.getByText("Queue clear", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Behind the mind", { exact: true })).toHaveCount(0);

  await page.getByRole("tab", { name: /Agenda/ }).click();
  const agenda = page.getByRole("region", { name: "Agent Agenda" });
  await expect(agenda).toBeVisible();
  await expect(agenda.getByRole("region", { name: "Next up" })).toBeVisible();
  await expect(agenda.getByRole("region", { name: "Watching in the background" })).toBeVisible();
  await expect(agenda.getByRole("region", { name: "Ongoing responsibilities" })).toContainText("Active");
  await expect(agenda.getByRole("region", { name: "Needs you" })).toBeVisible();
  await expect(agenda.getByText("dynamic snapshot items", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("People paginates a long remembered-facts record", async ({ page }) => {
  await createAgent(page);
  await page.route("**/api/state*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    const presenceId = body.presence.id;
    const agentId = body.agent.id;
    const now = new Date().toISOString();
    const personId = "person-boardy";
    const relationshipId = "relationship-boardy";
    body.people.push({ id: personId, agentId, displayName: "Boardy", memoryState: "active", createdAt: now, updatedAt: now });
    body.personIdentities.push({ id: "identity-boardy", personId, channel: "x", externalActorId: "boardyai", handle: "@boardyai", sourcePresenceId: presenceId, sourceEnvironment: body.presence.environment ?? "live", verificationMethod: "connector_verified", createdAt: now });
    body.relationships.push({ id: relationshipId, agentId, personId, state: "active", lastMeaningfulInteractionAt: now, createdAt: now, updatedAt: now });
    body.relationshipFacts.push(...Array.from({ length: 17 }, (_, index) => ({ id: `boardy-fact-${index}`, relationshipId, statement: `Boardy remembered fact ${index + 1}.`, epistemicKind: "stated_by_person", provenanceRefs: [{ kind: "mirror_object", id: `boardy-evidence-${index}` }], visibility: `presence:${presenceId}`, createdAt: now })));
    await route.fulfill({ response, json: body });
  });

  await page.reload();
  await navigate(page, "People");
  const facts = page.locator(".person-inspector-section").filter({ hasText: "What Jenny remembers" });
  await expect(facts).toContainText("17 remembered facts");
  const pages = page.getByRole("navigation", { name: "Boardy remembered facts pages" });
  await expect(pages).toContainText("Page 1 of 3");
  await expect(facts.locator("li")).toHaveCount(8);
  await pages.getByRole("button", { name: "Older" }).click();
  await expect(pages).toContainText("Page 2 of 3");
  await expect(facts).toContainText("Boardy remembered fact 9.");
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

test("Schedule reviews and activates delegated work", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Schedule");
  await page.locator(".page-heading").getByRole("button", { name: "Add assignment", exact: true }).click();
  await page.getByLabel("What should Jenny accomplish?").fill("Produce one useful idea before it is sent.");
  await page.getByRole("button", { name: "Review assignment" }).click();
  await expect(page.getByRole("heading", { name: "Ready to activate" })).toBeVisible();
  await page.getByRole("button", { name: "Activate Assignment" }).click();
  await expect(page.getByText("active", { exact: true })).toBeVisible();
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
  await navigate(page, "Settings");
  await expect(page.getByRole("heading", { name: "When should Jenny look around?" })).toBeVisible();
  await expect(page.getByText("Rhythm controls when this Presence checks its connected channel for something worth considering.", { exact: false })).toBeVisible();
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
  await expect(page.getByText("Off · automatic observation follows the selected rhythm.", { exact: true })).toHaveCount(0);
});

test("Presence publishing pace separates responsibility from attention and persists its target", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Settings");
  const pace = page.locator(".publishing-initiative-card");
  await expect(pace.getByRole("heading", { name: "How actively should Jenny publish?" })).toBeVisible();
  await expect(pace.getByRole("button", { name: /Let Jenny decide.*Recommended/ })).toHaveClass(/selected/);
  await pace.getByRole("button", { name: "Set a pace" }).click();
  await pace.getByLabel("Publishing pace count").fill("7");
  await pace.getByLabel("Publishing pace period").selectOption("week");
  await pace.getByRole("button", { name: "Save pace" }).click();
  await expect(pace.getByText("This is a pace, not a forced quota.", { exact: false })).toBeVisible();
  await page.reload();
  await navigate(page, "Settings");
  await expect(pace.getByRole("button", { name: "Set a pace" })).toHaveClass(/selected/);
  await expect(pace.getByLabel("Publishing pace count")).toHaveValue("7");
  await expect(pace.getByLabel("Publishing pace period")).toHaveValue("week");
  await navigate(page, "Activity");
  const publishingProgress = page.getByLabel("Publishing plan status");
  await expect(publishingProgress).toBeVisible();
  await expect(publishingProgress.getByText("0 of ~7", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Agent publishing plan" })).toHaveCount(0);
});

test("Presence publishing responsibility options change the canonical responsibility", async ({ page, request }) => {
  await createAgent(page);
  await navigate(page, "Settings");
  const initiative = page.locator(".publishing-initiative-card");
  const readState = async () => (await request.get("/api/state")).json();

  await expect(initiative.getByRole("button", { name: /Let Jenny decide.*Recommended/ })).toHaveAttribute("aria-pressed", "true");
  await expect(initiative.getByLabel("Publishing pace count")).toHaveCount(0);

  await initiative.getByRole("button", { name: "Set a pace" }).click();
  await initiative.getByLabel("Publishing pace count").fill("7");
  await initiative.getByLabel("Publishing pace period").selectOption("week");
  await initiative.getByRole("button", { name: "Save pace" }).click();
  await expect.poll(async () => (await readState()).presence.publishingInitiative).toMatchObject({ mode: "pace", target: { count: 7, period: "week" } });
  let state = await readState();
  expect(state.assignments.find((item: { origin?: string }) => item.origin === "publishing_initiative")).toMatchObject({ status: "active", quantityPolicy: { quantity: 7, period: "week" } });

  await initiative.getByRole("button", { name: /Let Jenny decide.*Recommended/ }).click();
  await expect(initiative.getByRole("button", { name: /Let Jenny decide.*Recommended/ })).toHaveAttribute("aria-pressed", "true");
  await expect(initiative.getByLabel("Publishing pace count")).toHaveCount(0);
  await expect.poll(async () => (await readState()).presence.publishingInitiative.mode).toBe("adaptive");
  state = await readState();
  expect(state.assignments.find((item: { origin?: string }) => item.origin === "publishing_initiative")).toMatchObject({ status: "active", deliverable: { type: "maintain_original_presence" }, quantityPolicy: { quantity: "agent_planned" } });

  await initiative.getByRole("button", { name: "No publishing responsibility" }).click();
  await expect(initiative.getByRole("button", { name: "No publishing responsibility" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await readState()).presence.publishingInitiative.mode).toBe("off");
  state = await readState();
  expect(state.presence.publishingInitiative.assignmentId).toBeUndefined();
  expect(state.assignments.find((item: { origin?: string }) => item.origin === "publishing_initiative")).toMatchObject({ status: "paused" });

  await page.reload();
  await navigate(page, "Settings");
  await expect(page.locator(".publishing-initiative-card").getByRole("button", { name: "No publishing responsibility" })).toHaveAttribute("aria-pressed", "true");
});

test("Presence Public Self saves its disclosure boundary", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Settings");
  await page.getByLabel("Presence name").fill("Alex");
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
  await expect(page.getByLabel("Presence name")).toHaveValue("Alex");
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
  await expect(page.getByText("I noticed this Presence is now Ghost.", { exact: false })).toHaveCount(0);
  await expect(page.getByText("I noticed the Ghost profile changed.", { exact: false })).toHaveCount(0);
  await expect(page.getByLabel("Post for Jenny to encounter")).toBeVisible();

  await navigate(page, "Settings");
  await identityOptions.getByRole("button", { name: /^Jenny Agent-owned/ }).click();
  await expect(identityOptions.getByRole("button", { name: /^Jenny Agent-owned/ })).toHaveClass(/selected/);
  await navigate(page, "Chat");
  await expect(page.getByText("I noticed this Presence is now Agent-owned.", { exact: false })).toHaveCount(0);
  await expect(page.getByLabel("Post for Jenny to encounter")).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Jenny in Founders", exact: true })).toBeVisible();
  await page.getByLabel("Presence handle").fill("@genny");
  await page.getByRole("button", { name: "Save handle", exact: true }).click();
  await expect(page.getByLabel("Presence handle")).toHaveValue("@genny");
  await page.reload();
  await navigate(page, "Settings");
  await expect(page.getByLabel("Presence name")).toHaveValue("Jenny in Founders");
  await expect(page.getByLabel("Presence handle")).toHaveValue("@genny");
  await expect(presenceSwitcher(page, "@genny")).toBeVisible();

  await navigate(page, "Brain");
  await page.getByLabel("Agent name").fill("Juno");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("button", { name: "Switch agent, currently Juno" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Switch agent, currently Juno" })).toBeVisible();
  await navigate(page, "Settings");
  await expect(page.getByRole("heading", { name: "Jenny in Founders", exact: true })).toBeVisible();
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
  await expect(page.getByText("Give Genny time-bound permission to notice, decide, and work toward delegated outcomes.", { exact: false })).toBeVisible();
  await expect(page.getByText("Planning for Genny", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Week", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "When Genny can notice and act" })).toBeVisible();
});

test("Playground does not duplicate Presence identity beside Rehearse", async ({ page }) => {
  await createAgent(page);
  await navigate(page, "Playground");
  await expect(page.locator(".playground-presence")).toHaveCount(0);
  await expect(page.locator(".playground-title-row .playground-world-label")).toHaveCount(0);
});

test("Playground rehearses a Presence inside an isolated simulated world", async ({ page, request }) => {
  await createAgent(page);
  await navigate(page, "Playground");
  await expect(page.getByRole("heading", { name: "Playground", exact: true })).toBeVisible();
  await expect(page.locator(".playground-grid")).toBeVisible();
  await expect(page.locator(".playground-presence")).toHaveCount(0);
  await expect(page.getByText("Rehearse how this Presence behaves on X.", { exact: true })).toBeVisible();
  await expect(page.getByText(/This world is simulated\. Jenny is real\./)).toHaveCount(0);
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
  const resetState = await (await request.get("/api/state")).json();
  const resetSession = resetState.playgroundSessions.find((item: { status: string }) => item.status === "active");
  expect(resetSession.virtualTimeMode).toBe("realtime");
  expect(Math.abs(Date.now() - new Date(resetSession.virtualNow).getTime())).toBeLessThan(60_000);
});

test("Playground opens with a current default virtual clock", async ({ page, request }) => {
  await createAgent(page);
  await navigate(page, "Playground");
  const state = await (await request.get("/api/state")).json();
  const session = state.playgroundSessions.find((item: { status: string }) => item.status === "active");
  expect(session.virtualTimeMode).toBe("realtime");
  expect(Math.abs(Date.now() - new Date(session.virtualNow).getTime())).toBeLessThan(60_000);
  await expect(page.locator(".playground-time")).toContainText("Virtual time");
});

test("Playground Reset returns virtual time to the current clock", async ({ page, request }) => {
  await createAgent(page);
  await navigate(page, "Playground");
  await page.getByRole("button", { name: "+1h" }).click();
  const advanced = await (await request.get("/api/state")).json();
  const advancedSession = advanced.playgroundSessions.find((item: { status: string }) => item.status === "active");
  expect(advancedSession.virtualTimeMode).toBe("manual");

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.locator(".playground-grid")).toBeVisible();
  const reset = await (await request.get("/api/state")).json();
  const resetSession = reset.playgroundSessions.find((item: { status: string }) => item.status === "active");
  expect(resetSession.virtualTimeMode).toBe("realtime");
  expect(Math.abs(Date.now() - new Date(resetSession.virtualNow).getTime())).toBeLessThan(60_000);
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

test("Playground removes one post or reply without clearing the rehearsal", async ({ page, request }) => {
  await createAgent(page);
  await navigate(page, "Playground");
  const initial = await request.get("/api/state");
  const initialState = await initial.json();
  const session = initialState.playgroundSessions[0];
  const postResponse = await request.post("/api/state", { data: { type: "addSandboxEvent", sessionId: session.id, actionId: "post", actorName: "Maya Chen", actorHandle: "@maya", content: "Keep this simulated post." } });
  expect(postResponse.ok()).toBeTruthy();
  const postState = await postResponse.json();
  const post = postState.mirrorObjects.find((item: { objectType: string; content?: { text?: string }; externalRef: { type: string; id: string } }) => item.objectType === "post" && item.content?.text === "Keep this simulated post.");
  const replyResponse = await request.post("/api/state", { data: { type: "addSandboxEvent", sessionId: session.id, actionId: "reply", actorName: "Jenny", actorHandle: "@jenny_ai", content: "Remove only this simulated reply.", targetExternalRef: post.externalRef } });
  expect(replyResponse.ok()).toBeTruthy();

  await page.reload();
  await navigate(page, "Playground");
  const feed = page.locator(".social-feed");
  await expect(feed.locator(".social-card")).toHaveCount(2);
  await feed.locator(".thread-reply-card").getByRole("button", { name: "Remove reply from Playground", exact: true }).click();
  await expect(feed.locator(".social-card")).toHaveCount(1);
  await expect(feed).toContainText("Keep this simulated post.");

  await page.reload();
  await navigate(page, "Playground");
  await page.locator(".social-card").getByRole("button", { name: "Remove post from Playground", exact: true }).click();
  await expect(page.locator(".social-card")).toHaveCount(0);
  await expect(page.getByText("The simulated X world is quiet.", { exact: true })).toBeVisible();
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
  await expect(page.locator(".event-context-preview span", { hasText: "↳" }).first()).toBeVisible();

  const liveRoute = await request.post("/api/state", { data: { type: "setPresence", patch: { connectionMode: "native" } } });
  expect(liveRoute.ok()).toBeTruthy();
  await page.reload();
  await navigate(page, "Activity");
  await expect(page.locator(".scope-summary")).toHaveText("X · Live");
  await expect(page.getByText("A Playground-only observation.", { exact: true })).toHaveCount(0);
});

test("Activity addresses operator-directed replies to the selected Presence", async ({ page, request }) => {
  await createAgent(page);
  const renamed = await request.post("/api/state", { data: { type: "setPresence", patch: { name: "Genny" } } });
  expect(renamed.ok()).toBeTruthy();
  await page.reload();
  await navigate(page, "Playground");
  const initial = await request.get("/api/state");
  const session = (await initial.json()).playgroundSessions[0];
  const added = await request.post("/api/state", {
    data: { type: "addSandboxEvent", sessionId: session.id, actionId: "post", actorName: "Maya Chen", content: "What changed your mind about persistent agents?", observeOnly: true },
  });
  expect(added.ok()).toBeTruthy();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Genny, right now." })).toBeVisible();
  await page.getByRole("button", { name: "Create reply assignment", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Decision context" });
  await expect(dialog.getByRole("heading", { name: "Ask Genny to reply" })).toBeVisible();
  await expect(dialog.getByLabel("Optional direction for Genny")).toBeVisible();
  await expect(dialog.locator(".operator-reply-card .full-button")).toHaveCSS("justify-content", "center");
  await dialog.getByLabel("Optional direction for Genny").fill("Keep the answer concrete.");
  await dialog.getByRole("button", { name: "Ask Genny to reply", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Ask Genny to reply" })).toBeVisible();
  await expect(dialog.getByText("Genny is preparing the expression through the existing reply envelope.", { exact: true })).toHaveCount(0);

  const updated = await (await request.get("/api/state")).json();
  expect(updated.operatorDirectives[0]).toMatchObject({ status: "failed", optionalDirection: "Keep the answer concrete." });
  expect(updated.socialIntents).toHaveLength(0);
});

test("Activity lets the operator quietly ask a Presence to leave an observed post alone", async ({ page, request }) => {
  await createAgent(page);
  await navigate(page, "Playground");
  const initial = await request.get("/api/state");
  const session = (await initial.json()).playgroundSessions[0];
  const added = await request.post("/api/state", {
    data: { type: "addSandboxEvent", sessionId: session.id, actionId: "post", actorName: "Maya Chen", content: "A post the operator wants left alone.", observeOnly: true },
  });
  expect(added.ok()).toBeTruthy();

  await page.reload();
  const ignore = page.getByRole("button", { name: "Ask Jenny to ignore", exact: true }).first();
  const reply = page.getByRole("button", { name: "Ask Jenny to reply", exact: true }).first();
  await expect(ignore).toBeVisible();
  const ignoreBox = await ignore.boundingBox();
  const replyBox = await reply.boundingBox();
  expect(ignoreBox).not.toBeNull();
  expect(replyBox).not.toBeNull();
  expect(ignoreBox!.x + ignoreBox!.width).toBeLessThan(replyBox!.x);

  await ignore.click();
  await expect(page.getByRole("button", { name: "Ask Jenny to ignore", exact: true })).toHaveCount(0);
  await expect(page.locator(".event-title", { hasText: "The operator asked Jenny to ignore this post" })).toBeVisible();
  await expect(page.locator(".mirror-post-ignored-status", { hasText: "Ignored" })).toBeVisible();
  await expect(page.locator(".mirror-post-ignored")).toHaveCount(1);

  const updated = await (await request.get("/api/state")).json();
  expect(updated.operatorDirectives[0]).toMatchObject({ requiredAct: "no_op", status: "expressed" });
  expect(updated.socialIntents).toHaveLength(0);
  expect(updated.executions).toHaveLength(0);
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

test("Custom Channel editor updates its destination and media declaration", async ({ page, request }) => {
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
  await navigate(page, "Settings");
  await page.getByRole("button", { name: "Edit Channel" }).click();
  await page.getByLabel("Channel destination").fill("https://www.skool.com/saaspreneur-academy");
  await page.getByRole("checkbox", { name: /Images/ }).check();
  await page.getByRole("checkbox", { name: /GIFs/ }).check();
  await page.getByRole("button", { name: "Save Channel" }).click();
  await expect(page.getByText("https://www.skool.com/saaspreneur-academy", { exact: true })).toBeVisible();
  const updatedChannel = await (await request.get("/api/state")).json();
  expect(updatedChannel.channelDefinitions.find((item: { id: string }) => item.id === "founder-community")).toMatchObject({ domain: "https://www.skool.com/saaspreneur-academy", supportedAssetKinds: ["image", "gif"] });
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
  await expect(page.locator(".adapter-guide")).toContainText("Copy adapter instructions");
  await expect(page.locator(".adapter-status-summary").getByText("Bridge configured · waiting for adapter", { exact: true })).toBeVisible();
  const bridgeKey = await page.locator(".bridge-key > code").innerText();
  expect(bridgeKey).toMatch(/^opb_/);
  await page.getByRole("button", { name: "Copy adapter instructions" }).click();
  await expect(page.getByText("Prompt copied", { exact: true })).toBeVisible();
  await page.getByText("View browser-agent prompt", { exact: true }).click();
  const promptText = await page.locator(".adapter-guide").innerText();
  expect(promptText).toContain("UNSUPPORTED_ASSET");
  expect(promptText).not.toContain(bridgeKey);
  const unauthorized = await request.post("/api/bridge/v1/events", { data: { events: [] } });
  expect(unauthorized.status()).toBe(401);
  const heartbeat = await request.post("/api/bridge/v1/heartbeat", { headers: { Authorization: `Bearer ${bridgeKey}` }, data: { executorId: "playwright-bridge" } });
  expect(heartbeat.ok()).toBeTruthy();
  const health = await request.get("/api/bridge/v1/health", { headers: { Authorization: `Bearer ${bridgeKey}` } });
  expect((await health.json()).bridge.adapterStatus).toBe("connected");

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
  await page.locator(".page-heading").getByRole("button", { name: "Add assignment", exact: true }).click();
  await page.getByLabel("What should Jenny in Founders accomplish?").fill("Share one useful memory idea with the founders.");
  await page.getByRole("button", { name: "Review assignment" }).click();
  await expect(page.getByText("post is available through the Presence execution envelope.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Activate Assignment" }).click();
  await expect(page.getByText("active", { exact: true })).toBeVisible();

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
  await expect(reconnectedRow.getByText("Bridge configured · waiting for adapter", { exact: true })).toBeVisible();
  const revoked = await request.get("/api/bridge/v1/health", { headers: { Authorization: `Bearer ${bridgeKey}` } });
  expect(revoked.status()).toBe(401);
});
