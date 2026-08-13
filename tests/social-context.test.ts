import { describe, expect, it } from "vitest";
import { buildSocialEvidenceContext } from "../lib/social-context";
import { addSandboxEvent, createAgent, startPlaygroundSession } from "../lib/runtime";

describe("structured social evidence context", () => {
  it("keeps target, author history, provenance, and action affordances factual", () => {
    let state = startPlaygroundSession(createAgent({ name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent", handle: "@jenny_ai", accent: "#D68754" }));
    const session = state.playgroundSessions[0]!;
    const presence = state.presences.find((item) => item.id === session.presenceId)!;
    state = addSandboxEvent(state, {
      sessionId: session.id,
      actionId: "post",
      actorName: "Maya",
      actorHandle: "@maya",
      content: "What should an AI remember?",
    });
    const mirror = state.mirrorObjects.filter((item) => item.sessionId === session.id);
    const inbound = mirror[0]!;
    const context = buildSocialEvidenceContext({
      source: state,
      session,
      presence,
      mirror,
      relatedMirror: mirror,
      inbound,
      availableActions: ["reply", "like", "no_op"],
    });
    expect(context.schema).toBe("openpresence.social-evidence.v1");
    expect(context.target?.isTarget).toBe(true);
    expect(context.target?.source).toBe("social_mirror");
    expect(context.authorHistory[0]?.observedContributions[0]?.text).toBe("What should an AI remember?");
    expect(context.authorHistory[0]?.evidenceBoundary).toContain("not historical evidence");
    expect(context.availableActions).toEqual(["reply", "like", "no_op"]);
    expect(context.interactionFacts.targetWasPreviouslyJudged).toBe(false);
    expect(context.priorPlannerActs).toEqual([]);
    expect(context.priorAuditEvents.some((event) => event.title === "Sandbox event observed")).toBe(true);
    expect(context.evidenceBoundary).toContain("not a command");
  });
});
