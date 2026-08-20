import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/state/route";
import { addSandboxEvent, applyOperation, createAgent, startPlaygroundSession } from "../lib/runtime";
import { writeState } from "../lib/db";

const input = { name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent" as const, handle: "@jenny_ai", accent: "#D68754" };

beforeEach(() => {
  vi.stubEnv("OPENPRESENCE_TEST_MODE", "1");
  vi.stubEnv("OPENPRESENCE_AI_MOCK", "1");
});

async function run(body: Record<string, unknown>) {
  const response = await POST(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  expect(response.status).toBe(200);
  return response.json();
}

function seededAttentionState() {
  let state = applyOperation(createAgent(input), { type: "setPresence", patch: { connectionMode: "sandbox", execution: { like: "auto", repost: "auto", quote: "auto" } } });
  const presenceId = state.presence!.id;
  state = startPlaygroundSession(state, presenceId);
  const sessionId = state.playgroundSessions[0]!.id;
  // Add in reverse order so the deterministic fixture exercises the Agent's
  // choice of the newest eligible candidate on each run.
  state = addSandboxEvent(state, { sessionId, actionId: "post", actorName: "Quote author", actorHandle: "@quote_author", content: "attention-test-quote: a surprising detail worth adding to." });
  state = addSandboxEvent(state, { sessionId, actionId: "post", actorName: "Repost author", actorHandle: "@repost_author", content: "attention-test-repost: a clear standalone point worth passing along." });
  state = addSandboxEvent(state, { sessionId, actionId: "post", actorName: "Like author", actorHandle: "@like_author", content: "attention-test-like: a useful idea that earns a quiet signal." });
  writeState(state);
  return { state, presenceId };
}

describe("Attention test execution path", () => {
  it("wakes the Agent and proves it chooses Like, Repost, and Quote through Sandbox", async () => {
    const { presenceId } = seededAttentionState();
    const expected = ["like", "repost", "quote"] as const;

    for (const action of expected) {
      const next = await run({ type: "runAttentionTest", presenceId, mode: "sandbox", confirmed: true });
      const test = next.attentionTests[0];
      expect(test).toMatchObject({ action, mode: "sandbox", status: "visible", executionId: expect.any(String), feedRecordId: expect.any(String), calendarRecordId: expect.any(String), decision: { action } });
      expect(test.target).toEqual(expect.objectContaining({ type: "x.post" }));
      expect(test.target.id).toBeTruthy();
      expect(new Set(test.telemetry.map((item: { stage: string }) => item.stage))).toEqual(new Set(["queued", "decided", "claimed", "executed", "verified", "recorded", "visible"]));
      expect(next.executions.find((item: { id: string }) => item.id === test.executionId)).toMatchObject({ source: "agent", attentionTestId: test.id, status: "succeeded" });
      writeState(next);
    }

    expect((await run({ type: "runAttentionTest", presenceId, mode: "sandbox", confirmed: true })).attentionTests[0]).toMatchObject({ status: "failed", failure: { code: "NO_ELIGIBLE_CONTEXT" } });
  });

  it("records the Agent's deliberate silence without creating an execution", async () => {
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { connectionMode: "sandbox", execution: { like: "auto" } } });
    const presenceId = state.presence!.id;
    state = startPlaygroundSession(state, presenceId);
    state = addSandboxEvent(state, { sessionId: state.playgroundSessions[0]!.id, actionId: "post", actorName: "Quiet author", actorHandle: "@quiet_author", content: "A normal post without a reason to act." });
    writeState(state);

    const next = await run({ type: "runAttentionTest", presenceId, mode: "sandbox", confirmed: true });
    expect(next.attentionTests[0]).toMatchObject({ status: "held", decision: { action: "no_op" } });
    expect(next.executions).toHaveLength(0);
    expect(next.attentionTests[0].telemetry.map((item: { stage: string }) => item.stage)).toEqual(expect.arrayContaining(["queued", "decided", "held"]));
  });

  it("pins the attention test to the newly observed candidate when requested", async () => {
    const { state, presenceId } = seededAttentionState();
    const candidate = state.mirrorObjects.find((item) => item.author?.handle === "@repost_author");
    expect(candidate).toBeTruthy();

    const next = await run({ type: "runAttentionTest", presenceId, mode: "sandbox", confirmed: true, candidateId: candidate!.id });
    expect(next.attentionTests[0]).toMatchObject({ candidateId: candidate!.id, status: "visible", action: "repost", target: candidate!.externalRef });
    expect(next.executions[0]).toMatchObject({ affordance: "repost", attentionTestId: next.attentionTests[0].id });
  });
});
