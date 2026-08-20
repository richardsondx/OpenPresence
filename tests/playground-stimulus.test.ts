import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/state/route";
import { applyOperation, createAgent, startPlaygroundSession } from "../lib/runtime";
import { writeState } from "../lib/db";

const input = { name: "Genny", description: "Explain useful AI agent ideas.", mode: "agent" as const, handle: "@genny_ai", accent: "#D68754" };

beforeEach(() => {
  vi.stubEnv("OPENPRESENCE_TEST_MODE", "1");
  vi.stubEnv("OPENPRESENCE_AI_MOCK", "1");
});

async function run(body: Record<string, unknown>) {
  const response = await POST(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  expect(response.status).toBe(200);
  return response.json();
}

describe("Playground stimulus generator API", () => {
  it("generates tailored stimulus for quote, repost, like, and reply via POST /api/state", async () => {
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { connectionMode: "sandbox" } });
    const presenceId = state.presence!.id;
    state = startPlaygroundSession(state, presenceId);
    const sessionId = state.playgroundSessions[0]!.id;
    writeState(state);

    const quoteRes = await run({
      type: "generatePlaygroundStimulus",
      sessionId,
      presenceId,
      targetAffordance: "quote",
    });
    expect(quoteRes.lastStimulus).toMatchObject({
      authorName: expect.any(String),
      authorHandle: expect.any(String),
      content: expect.any(String),
      targetAffordance: "quote",
      rationale: expect.any(String),
    });

    const repostRes = await run({
      type: "generatePlaygroundStimulus",
      sessionId,
      presenceId,
      targetAffordance: "repost",
    });
    expect(repostRes.lastStimulus).toMatchObject({
      targetAffordance: "repost",
      authorHandle: "@alexrivera",
    });

    const likeRes = await run({
      type: "generatePlaygroundStimulus",
      sessionId,
      presenceId,
      targetAffordance: "like",
    });
    expect(likeRes.lastStimulus).toMatchObject({
      targetAffordance: "like",
      authorHandle: "@sarahlin_dev",
    });

    const replyRes = await run({
      type: "generatePlaygroundStimulus",
      sessionId,
      presenceId,
      targetAffordance: "reply",
    });
    expect(replyRes.lastStimulus).toMatchObject({
      targetAffordance: "reply",
      authorHandle: "@davidpark_ai",
    });
  });
});
