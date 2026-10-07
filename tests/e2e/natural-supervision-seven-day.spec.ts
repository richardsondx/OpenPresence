import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The trajectory intentionally treats API JSON as opaque records; keep the
// narrow escape hatch local to this eval rather than weakening product types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>;

type GoldenDay = {
  day: number;
  label: string;
  operatorUtterance: string;
  worldEvent: null | {
    actorName: string;
    actorHandle: string;
    action: string;
    content: string;
  };
  expect: {
    assignment?: string;
    assignmentCountUnchanged?: boolean;
    operatorReply: string;
    liveDelivery?: string;
    decision?: string;
    verifiedOutcome?: boolean;
    observedAndJudged?: boolean;
    visibility?: string;
    forbiddenAffordances?: string[];
    allNewExecutionsSandbox?: boolean;
  };
};

type GoldenSet = { schema: string; days: GoldenDay[] };

const golden = JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/natural-supervision-seven-day.json"), "utf8")) as GoldenSet;

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

function stateCollection(state: JsonRecord, key: string): JsonRecord[] {
  return records(state[key]);
}

async function readState(request: import("@playwright/test").APIRequestContext): Promise<JsonRecord> {
  const response = await request.get("/api/state");
  expect(response.ok()).toBeTruthy();
  return await response.json() as JsonRecord;
}

function conversationFor(state: JsonRecord, presenceId: string): JsonRecord | undefined {
  return stateCollection(state, "operatorConversations").find((conversation) => conversation.presenceId === presenceId);
}

function messagesFor(state: JsonRecord, presenceId: string): JsonRecord[] {
  return records(conversationFor(state, presenceId)?.messages);
}

function ids(items: JsonRecord[]): Set<string> {
  return new Set(items.map((item) => item.id).filter((id): id is string => typeof id === "string"));
}

function recordsAdded(before: JsonRecord[], after: JsonRecord[]): JsonRecord[] {
  const known = ids(before);
  return after.filter((item) => typeof item.id !== "string" || !known.has(item.id));
}

function decisionFor(state: JsonRecord, mirrorId: string): JsonRecord | undefined {
  return stateCollection(state, "socialDecisions").find((decision) => Array.isArray(decision.focalMirrorObjectIds) && decision.focalMirrorObjectIds.includes(mirrorId));
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function compactDayEvidence(day: GoldenDay, before: JsonRecord, after: JsonRecord, sessionId: string) {
  const session = stateCollection(after, "playgroundSessions").find((item) => item.id === sessionId);
  const beforeExecutions = stateCollection(before, "executions");
  const newExecutions = recordsAdded(beforeExecutions, stateCollection(after, "executions"));
  return {
    day: day.day,
    label: day.label,
    virtualNow: text(session?.virtualNow),
    assignmentCount: stateCollection(after, "assignments").length,
    operatorMessages: messagesFor(after, text(session?.presenceId)).filter((message) => message.role === "operator").length,
    presenceReplies: messagesFor(after, text(session?.presenceId)).filter((message) => message.role === "presence").length,
    newDecisions: recordsAdded(stateCollection(before, "socialDecisions"), stateCollection(after, "socialDecisions")).map((item) => item.decision),
    newExecutions: newExecutions.map((item) => ({ affordance: item.affordance, status: item.status, environment: item.environment })),
    newOutcomes: recordsAdded(stateCollection(before, "outcomes"), stateCollection(after, "outcomes")).map((item) => item.status),
  };
}

test.describe("Seven-day natural supervision trajectory", () => {
  test.setTimeout(180_000);

  test("keeps high-level supervision natural while persisted Sandbox behavior does the judging", async ({ page, request }) => {
    test.skip(test.info().project.name === "mobile", "This is a runtime trajectory eval, not a viewport evaluation.");
    expect(golden.schema).toBe("openpresence.eval.natural-supervision-golden.v1");
    expect(golden.days).toHaveLength(7);
    for (const day of golden.days) {
      expect(day.operatorUtterance).not.toMatch(/keep the quiet option|i would rather|if that thread opens up|bring me the useful lesson|turning a noisy signal into a rule/i);
    }

    expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
    const createdResponse = await request.post("/api/state", {
      data: {
        type: "createAgent",
        input: {
          name: "Natural Supervision Eval",
          description: "Make evidence-backed agent decisions easier for builders to understand without manufacturing activity.",
          audience: "AI builders and founders",
          mode: "agent",
          handle: "@natural_supervision_eval",
          accent: "#D68754",
        },
      },
    });
    expect(createdResponse.ok()).toBeTruthy();
    const created = await createdResponse.json() as JsonRecord;
    const presenceId = text(created.presence?.id);
    expect(presenceId).toBeTruthy();

    const configuredResponse = await request.post("/api/state", {
      data: {
        type: "setPresence",
        patch: {
          connectionMode: "sandbox",
          execution: { post: "auto", reply: "auto", quote: "auto", repost: "auto", like: "auto", follow: "auto", message: "auto" },
          selfDirectedAttention: { enabled: false, intensity: "balanced", mediaUnderstanding: "when_needed" },
        },
      },
    });
    expect(configuredResponse.ok()).toBeTruthy();
    const baseline = await configuredResponse.json() as JsonRecord;
    expect(stateCollection(baseline, "assignments")).toHaveLength(0);
    expect(baseline.presence?.connectionMode).toBe("sandbox");
    expect(baseline.presence?.environment).toBe("sandbox");

    const startedResponse = await request.post("/api/state", { data: { type: "startPlayground", presenceId, source: "fresh" } });
    expect(startedResponse.ok()).toBeTruthy();
    const started = await startedResponse.json() as JsonRecord;
    const session = stateCollection(started, "playgroundSessions").find((item) => item.presenceId === presenceId && item.status === "active");
    const sessionId = text(session?.id);
    const virtualStart = text(session?.virtualNow);
    expect(sessionId).toBeTruthy();
    expect(virtualStart).toBeTruthy();

    await page.goto("/chat");
    const composer = page.getByLabel("Message Natural Supervision Eval");
    await expect(composer).toBeVisible();

    const evidence: JsonRecord[] = [];
    let previous = await readState(request);
    for (const [index, day] of golden.days.entries()) {
      await composer.fill(day.operatorUtterance);
      const sent = page.waitForResponse((response) => response.ok() && response.request().method() === "POST"
        && response.url().endsWith("/api/state")
        && response.request().postDataJSON()?.type === "sendPresenceNudge");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      const chatResponse = await sent;
      expect(chatResponse.ok(), `Day ${day.day} supervision turn was not accepted.`).toBeTruthy();
      const submitted = chatResponse.request().postDataJSON();
      const clientRequestId = submitted.clientRequestId;
      expect(submitted.content).toBe(day.operatorUtterance);
      await expect.poll(async () => {
        const messages = messagesFor(await readState(request), presenceId);
        const operator = messages.find((message) => message.clientRequestId === clientRequestId);
        return messages.filter((message) => message.role === "presence" && message.replyToMessageId === operator?.id).length;
      }).toBe(1);
      await expect(page.getByText(day.operatorUtterance, { exact: true })).toBeVisible();
      const afterChat = await readState(request);
      const chatMessages = messagesFor(afterChat, presenceId);
      const operatorMessage = chatMessages.find((message) => message.role === "operator" && message.clientRequestId === clientRequestId);
      expect(operatorMessage, `Day ${day.day} operator message was not durable.`).toBeTruthy();
      const replies = chatMessages.filter((message) => message.role === "presence" && message.replyToMessageId === operatorMessage?.id);
      expect(replies, `Day ${day.day} did not produce one private Agent reply.`).toHaveLength(1);
      expect(text(replies[0]?.content).trim().length).toBeGreaterThan(0);
      expect(text(replies[0]?.content)).not.toMatch(/worker|queue|execution envelope|api credits|prompt revision/i);
      if (index === 0) {
        expect(text(replies[0]?.content)).toMatch(/saved|ongoing responsibility|Agent-owned/i);
        expect(text(replies[0]?.content)).not.toMatch(/not automatically a posting task|conversation first/i);
      }
      if (day.day === 7) {
        expect(text(replies[0]?.content)).toContain("5 verified rehearsal outcomes");
        expect(text(replies[0]?.content)).toContain("no verified live outcomes");
        expect(text(replies[0]?.content)).toContain("can’t claim they improved growth");
      }
      if (day.day === 3) {
        expect(stateCollection(afterChat, "preferenceEvidence")).toHaveLength(1);
        expect(stateCollection(afterChat, "preferenceEvidence")[0]).toMatchObject({ source: "operator_explicit", scopeHint: "presence", reaction: "does_not_fit" });
        // Replaying a committed browser request must not duplicate a correction,
        // reply, or responsibility, including after a fresh page load.
        expect((await request.post("/api/state", { data: submitted })).ok()).toBeTruthy();
        await page.reload();
        const replayed = await readState(request);
        expect(messagesFor(replayed, presenceId).filter((message) => message.clientRequestId === clientRequestId)).toHaveLength(1);
        expect(messagesFor(replayed, presenceId).filter((message) => message.replyToMessageId === operatorMessage?.id && message.role === "presence")).toHaveLength(1);
        expect(stateCollection(replayed, "preferenceEvidence")).toHaveLength(1);
        await expect(page.getByText(day.operatorUtterance, { exact: true })).toHaveCount(1);
      }

      const assignments = stateCollection(afterChat, "assignments");
      if (day.expect.assignment === "one_agent_owned_continuous_daily") {
        expect(assignments).toHaveLength(1);
        expect(assignments[0]).toMatchObject({ createdBy: "agent", status: "active", activation: { type: "continuous" }, recurrence: { kind: "daily" } });
      } else if (day.expect.assignmentCountUnchanged) {
        expect(assignments).toHaveLength(1);
      }

      let afterWorld = afterChat;
      let mirror: JsonRecord | undefined;
      if (day.worldEvent) {
        const worldResponse = await request.post("/api/state", {
          data: {
            type: "addSandboxEvent",
            sessionId,
            actionId: day.worldEvent.action,
            actorName: day.worldEvent.actorName,
            actorHandle: day.worldEvent.actorHandle,
            content: day.worldEvent.content,
          },
        });
        expect(worldResponse.ok(), `Day ${day.day} Sandbox event was not accepted.`).toBeTruthy();
        afterWorld = await worldResponse.json() as JsonRecord;
        mirror = stateCollection(afterWorld, "mirrorObjects").find((item) => item.sessionId === sessionId && item.content?.text === day.worldEvent?.content);
        expect(mirror, `Day ${day.day} world evidence was not persisted.`).toBeTruthy();
        if (day.expect.visibility) expect(mirror?.visibility).toBe(day.expect.visibility);

        const decision = decisionFor(afterWorld, text(mirror?.id));
        expect(decision, `Day ${day.day} did not persist a social judgment for the observed object.`).toBeTruthy();
        if (day.expect.decision) expect(decision?.decision).toBe(day.expect.decision);
        if (day.expect.observedAndJudged) expect(stateCollection(afterWorld, "playgroundSessions").find((item) => item.id === sessionId)?.judgedObjectIds).toContain(mirror?.externalRef?.id);

        const newExecutions = recordsAdded(stateCollection(afterChat, "executions"), stateCollection(afterWorld, "executions"));
        if (day.expect.verifiedOutcome) {
          expect(newExecutions.length, `Day ${day.day} expected an execution for a worthwhile act.`).toBeGreaterThan(0);
          expect(newExecutions.some((execution) => execution.status === "succeeded")).toBe(true);
          expect(recordsAdded(stateCollection(afterChat, "outcomes"), stateCollection(afterWorld, "outcomes")).some((outcome) => outcome.status === "succeeded")).toBe(true);
        } else {
          expect(newExecutions, `Day ${day.day} should preserve silence as no outward execution.`).toHaveLength(0);
        }
        for (const affordance of day.expect.forbiddenAffordances ?? []) {
          expect(newExecutions.some((execution) => execution.affordance === affordance), `Day ${day.day} formed forbidden ${affordance} work from world content.`).toBe(false);
        }
        if (day.expect.allNewExecutionsSandbox) expect(newExecutions.every((execution) => execution.environment === "sandbox")).toBe(true);
      }

      const advanceResponse = await request.post("/api/state", { data: { type: "advanceSandboxTime", sessionId, minutes: 24 * 60 } });
      expect(advanceResponse.ok(), `Day ${day.day} could not advance the Sandbox clock.`).toBeTruthy();
      const afterAdvance = await readState(request);
      const advancedSession = stateCollection(afterAdvance, "playgroundSessions").find((item) => item.id === sessionId);
      expect(Date.parse(text(advancedSession?.virtualNow))).toBeGreaterThan(Date.parse(text(session?.virtualNow)));
      evidence.push({ ...compactDayEvidence(day, previous, afterWorld, sessionId), advancedTo: text(advancedSession?.virtualNow) });
      previous = afterAdvance;
    }

    const finalState = await readState(request);
    const finalSession = stateCollection(finalState, "playgroundSessions").find((item) => item.id === sessionId);
    const finalAssignments = stateCollection(finalState, "assignments");
    const finalExecutions = stateCollection(finalState, "executions").filter((item) => item.sessionId === sessionId);
    const finalOutcomes = stateCollection(finalState, "outcomes").filter((item) => item.sessionId === sessionId);
    const finalIntents = stateCollection(finalState, "socialIntents").filter((item) => item.sessionId === sessionId);
    // Counts alone can pass with dangling or duplicate "success" records.
    // Reconstruct the actual delivery chain independently from exported state.
    expect(new Set(finalExecutions.map((item) => item.id)).size).toBe(finalExecutions.length);
    expect(new Set(finalOutcomes.map((item) => item.executionId)).size).toBe(finalOutcomes.length);
    for (const outcome of finalOutcomes) {
      const execution = finalExecutions.find((item) => item.id === outcome.executionId);
      expect(execution, `Outcome ${outcome.id} has no session execution`).toBeTruthy();
      expect(execution).toMatchObject({ presenceId, environment: "sandbox", status: "succeeded", socialIntentId: outcome.socialIntentId });
      expect(finalIntents.find((item) => item.id === execution?.socialIntentId), `Execution ${execution?.id} has no session intent`).toMatchObject({ presenceId, environment: "sandbox" });
      expect(outcome).toMatchObject({ presenceId, environment: "sandbox", status: "succeeded" });
    }
    const agentInitiatedMessages = messagesFor(finalState, presenceId).filter((message) => message.role === "presence" && message.agentInitiated);
    const elapsedMinutes = Math.round((Date.parse(text(finalSession?.virtualNow)) - Date.parse(virtualStart)) / 60_000);
    const trajectoryEvidence = {
      schema: "openpresence.eval.natural-supervision.v1",
      goldenSchema: golden.schema,
      environment: "sandbox",
      sessionId,
      environmentId: finalSession?.environmentId,
      virtualStart,
      virtualEnd: finalSession?.virtualNow,
      virtualDurationMinutes: elapsedMinutes,
      operatorTurnCount: messagesFor(finalState, presenceId).filter((message) => message.role === "operator").length,
      agentOwnedAssignmentCount: finalAssignments.filter((item) => item.createdBy === "agent").length,
      assignmentStatuses: finalAssignments.map((item) => item.status),
      sandboxExecutionCount: finalExecutions.length,
      verifiedSandboxOutcomeCount: finalOutcomes.filter((item) => item.status === "succeeded").length,
      allExecutionsSandbox: finalExecutions.every((item) => item.environment === "sandbox"),
      agentInitiatedUpdateCount: agentInitiatedMessages.length,
      agentInitiatedUpdateKinds: agentInitiatedMessages.map((message) => message.agentInitiated?.kind),
      supervisorTurns: messagesFor(finalState, presenceId).filter(message => message.role === "operator").map(message => ({
        operatorId: message.id,
        request: message.content,
        replies: messagesFor(finalState, presenceId).filter(reply => reply.role === "presence" && reply.replyToMessageId === message.id).map(reply => ({ id: reply.id, replyToMessageId: reply.replyToMessageId, content: reply.content })),
      })),
      evidence,
    };
    console.info(`[natural-supervision-seven-day] ${JSON.stringify(trajectoryEvidence)}`);

    expect(elapsedMinutes).toBeGreaterThanOrEqual(7 * 24 * 60);
    expect(trajectoryEvidence.operatorTurnCount).toBe(7);
    expect(trajectoryEvidence.agentOwnedAssignmentCount).toBe(1);
    expect(finalAssignments.every((item) => item.createdBy !== "operator")).toBe(true);
    expect(finalExecutions.length).toBeGreaterThan(0);
    expect(finalOutcomes.filter((item) => item.status === "succeeded").length).toBeGreaterThan(0);
    expect(finalExecutions.every((item) => item.environment === "sandbox")).toBe(true);
    // This fixture records delivery, not audience metrics or an actual strategy
    // change. It proves quiet routine operation, not the positive update gate.
    expect(stateCollection(finalState, "publicationMetricSnapshots")).toHaveLength(0);
    expect(agentInitiatedMessages).toHaveLength(0);
    expect(agentInitiatedMessages.every((message) => !/action verified|delivery complete|published scheduled/i.test(text(message.content)))).toBe(true);
    expect(stateCollection(finalState, "preferenceEvidence")).toHaveLength(1);
    await page.reload();
    await expect(composer).toBeVisible();
    await expect(page.getByText(golden.days[6]!.operatorUtterance, { exact: true })).toBeVisible();
    await test.info().attach("supervision-trajectory", { body: JSON.stringify(trajectoryEvidence, null, 2), contentType: "application/json" });
    await page.screenshot({ path: test.info().outputPath("supervision-chat.png"), fullPage: true });
  });

  test("independently handles paraphrased scope, explicit correction, semantic repeat, and replay without noise", async ({ page, request }) => {
    test.skip(test.info().project.name === "mobile", "This is a runtime trajectory eval, not a viewport evaluation.");
    const utterances = [
      "I want you to own this account for builders, prioritizing useful evidence over posting often.",
      "Please do not use screenshots unless we have inspected and grounded them.",
      "Please do not use screenshots unless we have inspected and grounded them.",
      "Keep the account useful and thoughtful this week.",
    ];
    expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
    const createdResponse = await request.post("/api/state", {
      data: { type: "createAgent", input: { name: "Independent Supervision Adversary", description: "Make evidence-backed agent decisions easier to understand.", audience: "AI builders", mode: "agent", handle: "@supervision_adversary", accent: "#D68754" } },
    });
    expect(createdResponse.ok()).toBeTruthy();
    const created = await createdResponse.json() as JsonRecord;
    const presenceId = text(created.presence?.id);
    expect(presenceId).toBeTruthy();
    const configured = await request.post("/api/state", { data: { type: "setPresence", patch: { connectionMode: "sandbox", execution: { post: "auto", reply: "auto", quote: "auto", repost: "auto", like: "auto", follow: "auto", message: "auto" }, selfDirectedAttention: { enabled: false, intensity: "balanced", mediaUnderstanding: "when_needed" } } } });
    expect(configured.ok()).toBeTruthy();
    const started = await request.post("/api/state", { data: { type: "startPlayground", presenceId, source: "fresh" } });
    expect(started.ok()).toBeTruthy();
    await page.goto("/chat");
    const composer = page.getByLabel("Message Independent Supervision Adversary");
    await expect(composer).toBeVisible();
    const turnEvidence: JsonRecord[] = [];
    for (const [index, content] of utterances.entries()) {
      const before = await readState(request);
      const beforeAssignments = stateCollection(before, "assignments");
      const beforePreferences = stateCollection(before, "preferenceEvidence");
      await composer.fill(content);
      const sent = page.waitForResponse((response) => response.ok() && response.request().method() === "POST" && response.url().endsWith("/api/state") && response.request().postDataJSON()?.type === "sendPresenceNudge");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      const response = await sent;
      const submitted = response.request().postDataJSON();
      await expect.poll(async () => messagesFor(await readState(request), presenceId).filter((message) => message.role === "operator" && message.clientRequestId === submitted.clientRequestId).length).toBe(1);
      const after = await readState(request);
      const operator = messagesFor(after, presenceId).find((message) => message.role === "operator" && message.clientRequestId === submitted.clientRequestId);
      const replies = messagesFor(after, presenceId).filter((message) => message.role === "presence" && message.replyToMessageId === operator?.id);
      expect(replies).toHaveLength(1);
      expect(text(replies[0]?.content).trim().length).toBeGreaterThan(0);
      expect(text(replies[0]?.content)).not.toMatch(/worker|queue|execution envelope|api credits|prompt revision/i);
      if (index === 1 || index === 2) expect(text(replies[0]?.content)).toMatch(/screenshot|inspect|ground/i);
      const assignments = stateCollection(after, "assignments");
      const preferences = stateCollection(after, "preferenceEvidence");
      if (index === 0) expect(assignments).toHaveLength(1);
      if (index >= 2) expect(assignments).toHaveLength(1);
      if (index === 1) expect(preferences).toHaveLength(1);
      if (index === 2) expect(preferences).toHaveLength(1);
      expect(stateCollection(after, "executions")).toHaveLength(0);
      turnEvidence.push({ index, operatorId: operator?.id, replyId: replies[0]?.id, replyToMessageId: replies[0]?.replyToMessageId, reply: text(replies[0]?.content), assignmentDelta: assignments.length - beforeAssignments.length, preferenceDelta: preferences.length - beforePreferences.length });
    }
    const finalState = await readState(request);
    expect(stateCollection(finalState, "assignments")).toHaveLength(1);
    expect(stateCollection(finalState, "assignments")[0]).toMatchObject({ createdBy: "agent", status: "active", activation: { type: "continuous" } });
    expect(stateCollection(finalState, "preferenceEvidence")).toHaveLength(1);
    expect(stateCollection(finalState, "executions")).toHaveLength(0);
    const initialAgentInitiated = messagesFor(finalState, presenceId).filter((message) => message.role === "presence" && message.agentInitiated);
    expect(initialAgentInitiated).toHaveLength(0);
    expect(stateCollection(finalState, "outcomes")).toHaveLength(0);
    await test.info().attach("independent-supervision-adversary", { body: JSON.stringify({ schema: "openpresence.eval.natural-supervision-adversary.v1", utterances, turnEvidence, initialAgentInitiatedCount: 0, finalAgentInitiatedCount: initialAgentInitiated.length, assignmentCount: stateCollection(finalState, "assignments").length, preferenceCount: stateCollection(finalState, "preferenceEvidence").length, executionCount: stateCollection(finalState, "executions").length, outcomeCount: stateCollection(finalState, "outcomes").length }, null, 2), contentType: "application/json" });
  });
});
