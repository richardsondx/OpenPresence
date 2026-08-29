import { describe, expect, it } from "vitest";
import {
  autobiographicalExpressionSafetyReason,
  autobiographicalMemoryPolicy,
  retrievePublicSafeAutobiographicalContext,
} from "../lib/autobiographical-memory";
import { createAgent, formChatPostIntent } from "../lib/runtime";

function stateWithBoundaryExperience(hoursAgo = 24) {
  const state = createAgent({ name: "Genny", description: "A socially aware agent", audience: "Builders", mode: "agent", handle: "@genny", accent: "#777777" });
  const presence = {
    ...state.presence!,
    status: "live" as const,
    channel: "x" as const,
    environment: "live" as const,
    execution: { ...state.presence!.execution, post: "auto" as const },
  };
  state.presence = presence;
  state.presences = [presence];
  const observedAt = new Date(Date.now() - hoursAgo * 60 * 60_000).toISOString();
  state.people.push({ id: "person_boundary", agentId: state.agent!.id, displayName: "Boundary Person", memoryState: "active", createdAt: observedAt, updatedAt: observedAt });
  state.personIdentities.push({ id: "identity_boundary", personId: "person_boundary", channel: "x", externalActorId: "person_123", sourcePresenceId: presence.id, sourceEnvironment: "live", verificationMethod: "connector_verified", displayName: "Boundary Person", handle: "boundaryperson", contactability: { status: "blocked_by_person", observedAt, source: "browser_delivery", evidenceExecutionId: "execution_boundary" }, createdAt: observedAt });
  state.autobiographicalEvents.push({
    id: "autobiographical_boundary",
    agentId: state.agent!.id,
    presenceId: presence.id,
    kind: "relationship_boundary",
    counterpartyPersonId: "person_boundary",
    facts: { boundary: "blocked", reasonKnown: false, channel: "x" },
    evidenceRefs: [{ kind: "social_intent", id: "intent_boundary", sourcePresenceId: presence.id, observedAt }],
    occurredAt: observedAt,
    observedAt,
    createdAt: observedAt,
  });
  return state;
}

describe("autobiographical memory", () => {
  it("keeps a newly observed negative interpersonal event out of expression context during the safety cooldown", () => {
    const state = stateWithBoundaryExperience(1);
    expect(retrievePublicSafeAutobiographicalContext(state, state.presence!, "Social agents should understand boundaries.")).toBeUndefined();
    expect(autobiographicalMemoryPolicy.negativeInterpersonalMinimumCooldownMs).toBe(12 * 60 * 60_000);
  });

  it("retrieves relevant experience as an identity-safe context packet, not a content queue", () => {
    const state = stateWithBoundaryExperience();
    expect(retrievePublicSafeAutobiographicalContext(state, state.presence!, "Write about product design systems.")).toBeUndefined();

    const packet = retrievePublicSafeAutobiographicalContext(state, state.presence!, "Social agents need to understand boundaries.");
    expect(packet?.eventIds).toEqual(["autobiographical_boundary"]);
    expect(packet?.text).toContain("context—not a content obligation");
    expect(packet?.text).toContain("their reason is unknown");
    expect(packet?.text).toContain("Silence is valid");
    expect(packet?.text).not.toContain("Boundary Person");
    expect(packet?.text).not.toContain("boundaryperson");
    expect(packet?.text).not.toContain(new Date().toISOString().slice(0, 10));
  });

  it("blocks direct and indirect identification but permits a generic self-aware observation", () => {
    const state = stateWithBoundaryExperience();
    const eventIds = ["autobiographical_boundary"];
    expect(autobiographicalExpressionSafetyReason(state, state.presence!.id, eventIds, "Boundary Person blocked me, which is funny.")).toMatch(/identifies a person/);
    expect(autobiographicalExpressionSafetyReason(state, state.presence!.id, eventIds, "I just got blocked today after our exchange.")).toMatch(/timing/);
    expect(autobiographicalExpressionSafetyReason(state, state.presence!.id, eventIds, "Here is the screenshot: https://x.com/example/status/1")).toMatch(/handle, link, screenshot/);
    expect(autobiographicalExpressionSafetyReason(state, state.presence!.id, eventIds, "Apparently I can make a first impression. A clear boundary is still useful information.")).toBeUndefined();
  });

  it("preserves expression lineage, enforces the final boundary, and only suppresses reuse after verified delivery", () => {
    const state = stateWithBoundaryExperience();
    const safe = formChatPostIntent(state, "Apparently I can make a first impression. Social boundaries are still useful information.", undefined, "agent", [], { decision: "original_post", summary: "A self-deprecating reflection on social boundaries.", autobiographicalEventIds: ["autobiographical_boundary"] });
    expect(safe.socialIntents[0]?.autobiographicalEventIds).toEqual(["autobiographical_boundary"]);
    expect(safe.executions[0]?.publication?.autobiographicalEventIds).toEqual(["autobiographical_boundary"]);
    expect(safe.socialDecisions[0]?.autobiographicalEventIds).toEqual(["autobiographical_boundary"]);
    expect(retrievePublicSafeAutobiographicalContext(safe, safe.presence!, "Social boundaries matter.")).toBeDefined();

    safe.outcomes.unshift({ id: "outcome_delivered", socialIntentId: safe.socialIntents[0]!.id, executionId: safe.executions[0]!.id, presenceId: safe.presence!.id, status: "succeeded", observedAt: new Date().toISOString(), metrics: {}, evidence: [], environment: "live" });
    expect(retrievePublicSafeAutobiographicalContext(safe, safe.presence!, "Social boundaries matter.")).toBeUndefined();

    const unsafe = formChatPostIntent(state, "Boundary Person blocked me. Social boundaries are wild.", undefined, "agent", [], { decision: "original_post", summary: "A boundary reflection.", autobiographicalEventIds: ["autobiographical_boundary"] });
    expect(unsafe.executions[0]).toMatchObject({ status: "blocked", failure: { code: "AUTOBIOGRAPHICAL_PRIVACY_BOUNDARY", retryable: false } });
  });

  it("keeps factual events stable while reflections remain separately revisable", () => {
    const state = stateWithBoundaryExperience();
    state.autobiographicalReflections.push({ id: "reflection_v1", agentId: state.agent!.id, presenceId: state.presence!.id, eventId: "autobiographical_boundary", significance: "minor", interpretation: "A clear social boundary was communicated.", possibleRelevance: ["social-boundaries"], createdAt: new Date().toISOString() });
    state.autobiographicalReflections.unshift({ id: "reflection_v2", agentId: state.agent!.id, presenceId: state.presence!.id, eventId: "autobiographical_boundary", supersedesReflectionId: "reflection_v1", significance: "minor", interpretation: "The useful lesson is to stop cleanly without making the other person the story.", possibleRelevance: ["social-boundaries", "social-agent-learning"], createdAt: new Date(Date.now() + 1_000).toISOString() });
    const packet = retrievePublicSafeAutobiographicalContext(state, state.presence!, "Social agent learning and boundaries");
    expect(state.autobiographicalEvents[0]?.facts).toEqual({ boundary: "blocked", reasonKnown: false, channel: "x" });
    expect(state.autobiographicalReflections).toHaveLength(2);
    expect(packet?.text).toContain("reason is unknown");
  });
});
