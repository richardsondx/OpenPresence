import type { OpenPresenceState, OperatorConversation, OperatorConversationMessage, Assignment } from "../../lib/types";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
});

test("plans remain readable and waiting work stays visible while recovery can queue", async ({ page, request }, testInfo) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Layout Agent");
  await page.getByLabel("Presence handle").fill("@layout_agent");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await expect(page.getByRole("heading", { name: "Chat with Layout Agent" })).toBeAttached();
  await page.getByLabel("Message Layout Agent").fill("Plan two draft posts privately, without publishing.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".operator-chat-message.is-presence").first()).toBeVisible();
  const base: OpenPresenceState = await request.get("/api/state").then(r => r.json());
  expect((await request.post("/api/state", { data: { type: "createAssignment", presenceId: base.presence!.id, environment: "sandbox", instruction: "Prepare two private drafts" } })).ok()).toBeTruthy();
  let waiting = true;
  await page.route("**/api/state**", async route => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch({ headers: { "if-none-match": "" } });
    const body = await response.json();
    if (!body.operatorConversations) return route.fulfill({ response });
    const conversation = body.operatorConversations.find((c: OperatorConversation) => c.messages.some((m: OperatorConversationMessage) => m.role === "presence"));
    if (conversation) {
      const answer = conversation.messages.findLast((m: OperatorConversationMessage) => m.role === "presence");
      answer.content = "## Draft promotion plan\n\n1. Reply within 24 hours\n2. Quote the following day\n\n> The useful question is which safeguards can be tested.\n\n**Nothing published.**";
    }
    const task = body.assignments.find((a: Assignment) => a.instruction === "Prepare two private drafts");
    if (task) Object.assign(task, { status: "blocked", lastOutcome: { message: "A source needs clarification.", at: new Date().toISOString() } });
    body.assignments.push({ id: "fixture-expired-empty", presenceId: base.presence!.id, status: "expired_incomplete", instruction: "Old unrelated task", title: "Old unrelated task", plan: null, lastOutcome: null });
    if (waiting) body.operationalRuns = [{ id: "fixture-wait", presenceId: base.presence!.id, agentId: base.agent!.id, kind: "operator_chat", state: "waiting", stage: "operator_chat.generating", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Draft promotion plan" })).toBeVisible();
  await expect(page.locator(".chat-rich-text ol li")).toHaveCount(2);
  await expect(page.locator(".chat-rich-text blockquote")).toContainText("safeguards");
  await expect(page.getByTestId("operator-chat-work-status")).toContainText("Layout Agent is waiting");
  await expect(page.getByText("Old unrelated task")).toHaveCount(0);
  const card = page.getByTestId("operator-chat-needs-you");
  await page.getByLabel("Message Layout Agent").fill("Keep my unsent draft");
  await expect(card.getByRole("button", { name: "Queue check" })).toBeEnabled();
  await card.getByRole("button", { name: "Dismiss reminder" }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: "Show paused work" }).click();
  await page.getByLabel("Message Layout Agent").fill("Keep my unsent draft");
  const sent = page.waitForRequest(r => r.method() === "POST" && r.url().includes("/api/state") && r.postDataJSON()?.type === "sendPresenceNudge");
  await card.getByRole("button", { name: "Queue check" }).click();
  expect((await sent).postDataJSON().content).toContain("Please check the issue");
  await expect(page.getByLabel("Message Layout Agent")).toHaveValue("Keep my unsent draft");
  await expect(card).toHaveCount(0);
  waiting = false;
  await page.screenshot({ path: testInfo.outputPath("chat-layout.png"), fullPage: true });
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("late page snapshots cannot erase the conversation after returning to Chat", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Snapshot Agent");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByLabel("Message Snapshot Agent").fill("Keep this conversation visible.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".operator-chat-message.is-presence")).toBeVisible();
  let release!: () => void;
  let received!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { received = resolve; });
  await page.route("**/api/state**", async route => {
    if (route.request().method() !== "GET" || new URL(route.request().url()).searchParams.get("projection") !== "growth") return route.continue();
    const response = await route.fetch({ headers: { "if-none-match": "" } });
    received();
    await held;
    await route.fulfill({ response });
  });
  const navigation = page.getByRole("navigation", { name: /navigation$/ }).filter({ visible: true });
  await navigation.getByRole("button", { name: "Growth", exact: true }).click();
  await requested;
  await navigation.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(page.locator(".operator-chat-message.is-presence")).toBeVisible();
  release();
  await page.unrouteAll({ behavior: "wait" });
  await expect(page.locator(".operator-chat-message.is-operator")).toContainText("Keep this conversation visible.");
  await expect(page.locator(".operator-chat-message.is-presence")).toBeVisible();
});

test("options submit a durable selection without erasing a draft and completed work stays visible", async ({ page, request }, testInfo) => {
  await page.goto("/");
  await page.getByLabel("Agent name").fill("Choice Agent");
  await page.getByLabel("Presence handle").fill("@choice_agent");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByLabel("Message Choice Agent").fill("Draft two approaches privately.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".operator-chat-message.is-presence").first()).toBeVisible();
  const base: OpenPresenceState = await request.get("/api/state").then(r => r.json());
  await request.post("/api/state", { data: { type: "createAssignment", presenceId: base.presence!.id, environment: "sandbox", instruction: "Prepare a community showcase" } });
  await page.route("**/api/state**", async route => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch({ headers: { "if-none-match": "" } });
    const body = await response.json();
    if (!body.operatorConversations) return route.fulfill({ response });
    const conversation = body.operatorConversations.find((c: OperatorConversation) => c.messages.some((m: OperatorConversationMessage) => m.role === "presence"));
    const answer = conversation?.messages.find((m: OperatorConversationMessage) => m.role === "presence");
    if (answer) {
      answer.content = "Choose a private draft approach.";
      answer.choices = [{ label: "Community showcase", content: "Draft the community showcase; do not publish." }, { label: "Lessons learned", content: "Draft the lessons option; do not publish." }];
      answer.attachments = [{ id: "fixture-image", kind: "image", name: "community-reference.png", dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" }];
    }
    const assignment = body.assignments.find((a: Assignment) => a.instruction === "Prepare a community showcase");
    if (assignment) {
      assignment.status = "completed";
      assignment.plan = { summary: "Invite builders to share a project and offer specific feedback.", discoveryDirections: ["Study relevant builder conversations"], publishingApproach: ["Prepare private draft options"], relationshipFocus: [] };
      for (const thread of body.operatorThreads ?? []) thread.assignmentIds = [...new Set([...thread.assignmentIds, assignment.id])];
      if (answer && conversation) {
        conversation.messages.splice(conversation.messages.indexOf(answer) + 1, 0, { id: "fixture-assignment-receipt", role: "system", content: JSON.stringify({ tool: "assignment", assignmentId: assignment.id, result: { status: "completed" } }), timestamp: answer.timestamp, replyToMessageId: answer.id });
      }
    }
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await expect(page.getByTestId("operator-chat-decision-media")).toBeVisible();
  const decisionMessage = page.locator(".operator-chat-message.is-presence").filter({ has: page.getByTestId("operator-chat-decision-media") });
  await expect(decisionMessage.locator("img")).toHaveCount(1);
  await expect(page.getByTestId("operator-chat-decision-media").locator("img")).toHaveAttribute("alt", "community-reference.png");
  await expect(page.getByRole("button", { name: "Community showcase", exact: true })).toHaveCSS("background-color", "rgb(70, 87, 168)");
  await decisionMessage.screenshot({ path: testInfo.outputPath("decision-surface.png") });
  await page.screenshot({ path: testInfo.outputPath("choice-preview.png"), fullPage: true });
  await expect(page.getByTestId("operator-approach")).toContainText("Invite builders");
  await expect(page.getByTestId("operator-working-line")).toContainText("Responsibility complete");
  await expect(page.locator(".operator-chat-message.is-tool-activity").filter({ hasText: "Created responsibility" }).locator("xpath=following-sibling::*[1]").getByTestId("operator-approach")).toBeVisible();
  await page.getByLabel("Message Choice Agent").fill("Keep this unsent draft");
  await page.getByRole("button", { name: "Community showcase", exact: true }).click();
  await expect(page.getByLabel("Message Choice Agent")).toHaveValue("Keep this unsent draft");
  await expect.poll(async () => {
    const saved = await request.get("/api/state").then(r => r.json());
    return saved.operatorConversations.flatMap((c: OperatorConversation) => c.messages).filter((m: OperatorConversationMessage) => m.clientRequestId?.startsWith("choice:")).length;
  }).toBe(1);
  await page.reload();
  await expect(page.getByRole("button", { name: "Community showcase · Selected" })).toBeDisabled();
  await expect(page.getByTestId("operator-approach")).toContainText("Invite builders");
  await expect(page.locator(".operator-chat-history")).toHaveJSProperty("scrollWidth", await page.locator(".operator-chat-history").evaluate((node) => node.clientWidth));
  await expect(page.locator(".operator-chat-message.is-operator").last()).toContainText("Draft the community showcase; do not publish.");
  expect(await page.getByTestId("operator-approach").evaluate(node => Boolean(node.compareDocumentPosition([...document.querySelectorAll(".operator-chat-message.is-operator")].at(-1)!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("choices-and-retained-approach.png"), fullPage: true });
  await page.unrouteAll({ behavior: "ignoreErrors" });
});
