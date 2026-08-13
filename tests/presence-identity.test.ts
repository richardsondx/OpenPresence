import { describe, expect, it } from "vitest";
import { createAgent, deliverSandboxExecution, formSandboxIntent, startPlaygroundSession } from "../lib/runtime";

describe("Presence platform identity", () => {
  it("keeps the platform handle in Presence context and Social Mirror authorship", () => {
    const input = { name: "Ada", description: "Explain useful AI agent ideas.", mode: "agent" as const, handle: "@ada_presence", accent: "#D68754" };
    let state = createAgent(input);
    expect(state.presence?.context.publicIdentity.handle).toBe(input.handle);

    state = startPlaygroundSession(state);
    state = formSandboxIntent(state, { sessionId: state.playgroundSessions[0]!.id, affordance: "post", text: "A useful simulated point of view." });
    state = deliverSandboxExecution(state, state.executions[0]!.id);

    expect(state.mirrorObjects[0]?.author).toMatchObject({ displayName: "Ada", handle: input.handle });
  });
});
