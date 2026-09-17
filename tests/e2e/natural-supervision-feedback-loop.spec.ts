import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

type JsonRecord = Record<string, any>;

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
    const presenceId = created.presence?.id as string;
    expect(presenceId).toBeTruthy();
    expect((await request.post("/api/state", { data: { type: "setPresence", patch: { connectionMode: "sandbox", execution: { post: "auto", reply: "auto", quote: "auto", repost: "auto", like: "auto", follow: "auto", message: "auto" } } } })).ok()).toBeTruthy();
    const startedResponse = await request.post("/api/state", { data: { type: "startPlayground", presenceId, source: "fresh" } });
    expect(startedResponse.ok()).toBeTruthy();
    const started = await startedResponse.json() as JsonRecord;
    const sessionId = started.playgroundSessions.find((item: JsonRecord) => item.presenceId === presenceId && item.status === "active")?.id as string;
    expect(sessionId).toBeTruthy();

    const correction = await request.post("/api/state", { data: { type: "sendPresenceNudge", presenceId, content: "Please don't use screenshots unless we have inspected and grounded them.", clientRequestId: "feedback-loop-correction" } });
    expect(correction.ok()).toBeTruthy();
    const afterCorrection = await state(request);
    expect(afterCorrection.preferenceEvidence).toHaveLength(1);
    expect(afterCorrection.preferenceEvidence[0]).toMatchObject({ source: "operator_explicit", scopeHint: "presence", reaction: "does_not_fit" });
    expect(afterCorrection.preferenceEvidence[0].note).toContain("inspected and grounded");
    const conversation = afterCorrection.operatorConversations.find((item: JsonRecord) => item.presenceId === presenceId);
    expect(conversation.messages.some((item: JsonRecord) => item.role === "presence" && /screenshots out/i.test(item.content))).toBe(true);
    expect(afterCorrection.assignments).toHaveLength(1);
    expect(afterCorrection.assignments.every((item: JsonRecord) => item.createdBy === "agent")).toBe(true);

    const rehearsal = await request.post("/api/state", { data: { type: "considerOriginalPublication", sessionId, inspiration: "Consider an original publication for the current simulated world." } });
    expect(rehearsal.ok()).toBeTruthy();
    const afterDecision = await rehearsal.json() as JsonRecord;
    expect(afterDecision.originalPostRehearsals[0]).toMatchObject({ result: "no_op" });
    expect(afterDecision.executions).toHaveLength(0);
    expect(afterDecision.preferenceEvidence).toHaveLength(1);
    expect(afterDecision.events.some((item: JsonRecord) => item.title === "Original post rehearsal complete" && /chose silence/i.test(item.detail))).toBe(true);
  });
});
