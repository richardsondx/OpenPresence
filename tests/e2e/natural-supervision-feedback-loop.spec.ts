import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

type JsonRecord = Record<string, unknown>;

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

async function state(request: APIRequestContext) {
  const response = await request.get("/api/state");
  expect(response.ok()).toBeTruthy();
  return await response.json() as JsonRecord;
}

test.describe("Natural supervision feedback loop", () => {
  test.setTimeout(120_000);

  test("turns a natural correction into durable evidence that changes later Sandbox judgment", async ({ request }) => {
    test.skip(test.info().project.name === "mobile", "This is a runtime trajectory eval, not a viewport evaluation.");
    expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
    const createdResponse = await request.post("/api/state", { data: { type: "createAgent", input: { name: "Feedback Loop Eval", description: "Make grounded social decisions.", audience: "AI builders", mode: "agent", handle: "@feedback_loop_eval", accent: "#D68754" } } });
    expect(createdResponse.ok()).toBeTruthy();
    const created = await createdResponse.json() as JsonRecord;
    const presenceId = (created.presence as JsonRecord | undefined)?.id as string;
    expect(presenceId).toBeTruthy();
    expect((await request.post("/api/state", { data: { type: "setPresence", patch: { connectionMode: "sandbox", execution: { post: "auto", reply: "auto", quote: "auto", repost: "auto", like: "auto", follow: "auto", message: "auto" } } } })).ok()).toBeTruthy();
    const startedResponse = await request.post("/api/state", { data: { type: "startPlayground", presenceId, source: "fresh" } });
    expect(startedResponse.ok()).toBeTruthy();
    const started = await startedResponse.json() as JsonRecord;
    const sessionId = records(started.playgroundSessions).find((item) => item.presenceId === presenceId && item.status === "active")?.id as string;
    expect(sessionId).toBeTruthy();

    const correction = await request.post("/api/state", { data: { type: "sendPresenceNudge", presenceId, content: "Please don't use screenshots unless we have inspected and grounded them.", clientRequestId: "feedback-loop-correction" } });
    expect(correction.ok()).toBeTruthy();
    const afterCorrection = await state(request);
    const preferenceEvidence = records(afterCorrection.preferenceEvidence);
    expect(preferenceEvidence).toHaveLength(1);
    expect(preferenceEvidence[0]).toMatchObject({ source: "operator_explicit", scopeHint: "presence", reaction: "does_not_fit" });
    expect(preferenceEvidence[0]?.note).toContain("inspected and grounded");
    const conversation = records(afterCorrection.operatorConversations).find((item) => item.presenceId === presenceId);
    expect(records(conversation?.messages).some((item) => item.role === "presence" && typeof item.content === "string" && /screenshots out/i.test(item.content))).toBe(true);
    const assignments = records(afterCorrection.assignments);
    expect(assignments).toHaveLength(1);
    expect(assignments.every((item) => item.createdBy === "agent")).toBe(true);

    const rehearsal = await request.post("/api/state", { data: { type: "considerOriginalPublication", sessionId, inspiration: "Consider an original publication for the current simulated world." } });
    expect(rehearsal.ok()).toBeTruthy();
    const afterDecision = await rehearsal.json() as JsonRecord;
    expect(records(afterDecision.originalPostRehearsals)[0]).toMatchObject({ result: "no_op" });
    expect(records(afterDecision.executions)).toHaveLength(0);
    expect(records(afterDecision.preferenceEvidence)).toHaveLength(1);
    expect(records(afterDecision.events).some((item) => item.title === "Original post rehearsal complete" && typeof item.detail === "string" && /chose silence/i.test(item.detail))).toBe(true);
  });
});
