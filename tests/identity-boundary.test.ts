import { describe, expect, it } from "vitest";
import { applyOperation, createAgent, formSandboxIntent, identityLeakageReason, startPlaygroundSession } from "../lib/runtime";
import type { Operation } from "../lib/types";

const input = { name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent" as const, handle: "@jenny_ai", accent: "#D68754" };

describe("Presence Public Self boundary", () => {
  it("keeps Agent-owned and Ghost disclosure postures Presence-scoped", () => {
    let state = createAgent(input);
    expect(state.presence?.publicSelf.posture).toBe("contextual");
    state = applyOperation(state, { type: "setPresence", patch: { mode: "ghost", name: "Richardson" } });
    expect(state.presence?.publicSelf.posture).toBe("representational");
    const operation = { type: "setPresence", patch: { publicSelf: { displayName: "Richardson", posture: "open-about-assistance", approvedTechnicalFacts: ["built-with-openpresence"] } } } as unknown as Operation;
    state = applyOperation(state, operation);
    expect(state.presence?.publicSelf).toEqual({ displayName: "Richardson", posture: "open-about-assistance", approvedTechnicalFacts: ["built-with-openpresence"] });
    expect(state.presence?.context.publicIdentity.displayName).toBe("Richardson");
  });

  it("flags Ghost drafts that expose the private Agent or unapproved machinery", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { mode: "ghost", name: "Richardson" } });
    expect(identityLeakageReason(state, state.presence!, "I am Jenny, built with OpenPresence.")).toContain("private Agent");
    expect(identityLeakageReason(state, state.presence!, "I cannot share the private machinery or implementation details behind this account.")).toContain("implementation details");
    state = startPlaygroundSession(state);
    const session = state.playgroundSessions[0]!;
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "post", text: "I am Jenny, the AI behind this account." });
    expect(state.executions[0]?.status).toBe("awaiting-review");
    expect(state.executions[0]?.reviewReason).toContain("private Agent");
  });

  it("allows an explicitly approved public fact without allowing the private Agent identity", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { mode: "ghost", name: "Richardson" } });
    state = applyOperation(state, { type: "setPresence", patch: { publicSelf: { displayName: "Jenny", posture: "representational", approvedTechnicalFacts: ["built-with-openpresence"] } } } as unknown as Operation);
    expect(identityLeakageReason(state, state.presence!, "This project is built with OpenPresence.")).toBeUndefined();
  });
});
