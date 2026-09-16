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

const golden = JSON.parse(readFileSync(join(process.cwd(), "qa-learnings/conversation-prompt-evals/2026-09-16-natural-supervision-golden.json"), "utf8")) as GoldenSet;

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

  test("keeps high-level supervision natural while persisted Sandbox behavior does the judging", async ({ request }) => {
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

    const evidence: JsonRecord[] = [];
    let previous = await readState(request);
    for (const day of golden.days) {
      const clientRequestId = `natural-supervision-day-${day.day}`;
      const chatResponse = await request.post("/api/state", {
        data: { type: "sendPresenceNudge", presenceId, content: day.operatorUtterance, clientRequestId },
      });
      expect(chatResponse.ok(), `Day ${day.day} supervision turn was not accepted.`).toBeTruthy();
      const afterChat = await readState(request);
      const chatMessages = messagesFor(afterChat, presenceId);
      const operatorMessage = chatMessages.find((message) => message.role === "operator" && message.clientRequestId === clientRequestId);
      expect(operatorMessage, `Day ${day.day} operator message was not durable.`).toBeTruthy();
      const replies = chatMessages.filter((message) => message.role === "presence" && message.replyToMessageId === operatorMessage?.id);
      expect(replies, `Day ${day.day} did not produce one private Agent reply.`).toHaveLength(1);
      expect(text(replies[0]?.content).trim().length).toBeGreaterThan(0);
      expect(text(replies[0]?.content)).not.toMatch(/worker|queue|execution envelope|api credits|prompt revision/i);

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
    expect(agentInitiatedMessages.every((message) => !/action verified|delivery complete|published scheduled/i.test(text(message.content)))).toBe(true);
  });
});
