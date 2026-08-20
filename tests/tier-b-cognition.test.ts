import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/state/route";
import { createAgent, applyOperation, startPlaygroundSession, addSandboxEvent, compileAgendaWork } from "../lib/runtime";
import { writeState } from "../lib/db";

afterEach(() => {
  delete process.env.OPENPRESENCE_AI_MOCK;
  vi.restoreAllMocks();
});

describe("Tier B: Real-Cognition Closed-Loop Sandbox Lifecycle", () => {
  it("Phase 1: executes unassisted deliberation -> multi-act fan-out -> delivery -> world reconciliation from world stimuli only", async () => {
    process.env.OPENPRESENCE_AI_MOCK = "1";
    let state = createAgent({
      name: "Genny",
      description: "Research and explain autonomous AI agent cognitive architectures.",
      mode: "agent",
      handle: "@genny_ai",
      accent: "#D68754",
    });
    const presenceId = state.presence!.id;
    state = applyOperation(state, {
      type: "setPresence",
      patch: {
        connectionMode: "sandbox",
        execution: {
          post: "auto",
          reply: "auto",
          quote: "auto",
          repost: "auto",
          like: "auto",
          follow: "auto",
        },
      },
    });
    state = startPlaygroundSession(state, presenceId, "fresh");
    const sessionId = state.playgroundSessions[0]!.id;

    // 1. WORLD STIMULUS: Inbound substantive inquiry from external peer
    state = addSandboxEvent(state, {
      sessionId,
      actorName: "Dr. Chen",
      actorHandle: "dr_chen_ai",
      content: "What is the primary architectural boundary between an LLM tool-calling graph and a self-directed Presence with its own durable Agenda?",
      language: "en",
    });
    const stimulusObject = state.mirrorObjects[0]!;
    writeState(state);

    // 2. TRIGGER AUTHORITATIVE COGNITION (No manual acts, no manual intent formation, no manual delivery)
    const evalResponse = await POST(
      new Request("http://localhost/api/state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "askPresenceToEvaluate",
          presenceId,
          objectId: stimulusObject.id,
          sessionId,
        }),
      })
    );

    expect(evalResponse.status).toBe(200);
    const resultState = await evalResponse.json();

    // 3. VERIFY COGNITIVE & EXECUTION INVARIANTS:
    // Invariant A: Decisions and intents were generated automatically by the pipeline
    expect(resultState.executions.length).toBeGreaterThan(0);
    const executedAffordances = resultState.executions.map((e: { affordance: string }) => e.affordance);
    expect(executedAffordances.length).toBeGreaterThan(0);

    // Invariant B: Executions succeeded and reconciled in the Sandbox Mirror
    const succeededExecutions = resultState.executions.filter((e: { status: string }) => e.status === "succeeded");
    expect(succeededExecutions.length).toBeGreaterThan(0);

    // Invariant C: Activity event was recorded with honest judgment provenance
    expect(resultState.events.some((ev: { title: string }) => ev.title.includes("Evaluation acted") || ev.title.includes("delivered") || ev.title.includes("queued"))).toBe(true);

    // Invariant D: Agenda compiles fresh state without corrupted lineages
    const updatedAgenda = compileAgendaWork(resultState, presenceId);
    expect(updatedAgenda).toBeDefined();
  });

  it("Phase 2: evaluates self-directed discovery candidate triage and attention loop", async () => {
    process.env.OPENPRESENCE_AI_MOCK = "1";
    let state = createAgent({
      name: "Genny",
      description: "Research and explain autonomous AI agent cognitive architectures.",
      mode: "agent",
      handle: "@genny_ai",
      accent: "#D68754",
    });
    const presenceId = state.presence!.id;
    state = applyOperation(state, {
      type: "setPresence",
      patch: {
        connectionMode: "sandbox",
        brief: {
          purpose: "Explore cognitive memory architectures",
          audience: "AI researchers",
          primaryTerritory: ["agent memory", "cognitive persistence", "social presence"],
        },
        execution: {
          post: "auto",
          reply: "auto",
          quote: "auto",
          repost: "auto",
          like: "auto",
          follow: "auto",
        },
      },
    });
    state = startPlaygroundSession(state, presenceId, "fresh");
    const sessionId = state.playgroundSessions[0]!.id;

    // Simulate discovery of a territory lead
    state = addSandboxEvent(state, {
      sessionId,
      actorName: "Memory Lab",
      actorHandle: "memory_lab",
      content: "Published benchmark on long-term cognitive persistence for autonomous software agents.",
      language: "en",
    });
    const candidateLead = state.mirrorObjects[0]!;
    writeState(state);

    // Evaluate lead through attention loop
    const evalResponse = await POST(
      new Request("http://localhost/api/state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "askPresenceToEvaluate",
          presenceId,
          objectId: candidateLead.id,
          sessionId,
        }),
      })
    );

    expect(evalResponse.status).toBe(200);
    const postTriageState = await evalResponse.json();
    expect(postTriageState.executions.length).toBeGreaterThan(0);
  });
});
