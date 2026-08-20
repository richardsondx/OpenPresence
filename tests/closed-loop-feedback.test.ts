import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgent, applyOperation, deliverSandboxExecution, formSandboxIntent } from "../lib/runtime";

afterEach(() => {
  delete process.env.OPENPRESENCE_AI_MOCK;
  vi.restoreAllMocks();
});

describe("Closed Social-Life Loop Verification", () => {
  it("updates conversation episode and records outcome when a sandbox action executes", async () => {
    let state = createAgent({
      name: "Jenny",
      description: "Explain AI agents.",
      mode: "agent",
      handle: "@jenny_ai",
      accent: "#D68754",
    });
    state = applyOperation(state, {
      type: "setPresence",
      patch: {
        execution: {
          reply: "auto",
          post: "auto",
        }
      }
    });
    const presenceId = state.presence!.id;
    state = (await import("../lib/runtime")).startPlaygroundSession(state, presenceId, "fresh");
    const sessionId = state.playgroundSessions[0]!.id;

    // Simulate inbound post
    state = (await import("../lib/runtime")).addSandboxEvent(state, {
      sessionId,
      actorName: "Founder",
      actorHandle: "founder",
      content: "What makes agent memory durable over long horizons?",
      language: "en",
    });
    const inbound = state.mirrorObjects[0]!;

    // Form reply intent
    state = formSandboxIntent(state, {
      sessionId,
      affordance: "reply",
      format: "x.reply",
      text: "Preserving the decision and evidence that justified it, rather than raw message tokens.",
      target: inbound.externalRef,
      perceptionTarget: inbound.externalRef,
    });

    const execution = state.executions[0]!;
    expect(execution.status).toBe("queued");

    // Deliver execution
    state = deliverSandboxExecution(state, execution.id);

    const deliveredExecution = state.executions.find(e => e.id === execution.id)!;
    expect(deliveredExecution.status).toBe("succeeded");
    expect(state.outcomes).toHaveLength(1);
    expect(state.outcomes[0].status).toBe("succeeded");

    // Verify mirror object was created in social mirror
    expect(state.mirrorObjects.some(m => m.originExecutionId === execution.id)).toBe(true);

    // Verify conversation episode updated
    const episode = state.conversationEpisodes.find(ep => ep.presenceId === presenceId);
    expect(episode).toBeDefined();
    expect(episode?.agentTurnCount).toBeGreaterThanOrEqual(1);
  });
});
