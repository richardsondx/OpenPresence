import { afterEach, describe, expect, it, vi } from "vitest";
import { applyOperation, createAgent, recordNativeMirror } from "../lib/runtime";
import { runRelationshipStudy } from "../lib/relationship-study";

const input = { name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent" as const, handle: "@jenny_ai", accent: "#D68754" };

afterEach(() => {
  delete process.env.OPENPRESENCE_AI_MOCK;
  vi.restoreAllMocks();
});

describe("Relationship Deep Dive", () => {
  it("is explicit, evidence-backed, and separate from Watch and Assignment", async () => {
    process.env.OPENPRESENCE_AI_MOCK = "1";
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { connectionMode: "native" } });
    state = applyOperation(state, { type: "rememberPerson", presenceId: "missing", externalActorId: "123", displayName: "Rasmic", handle: "rasmic" });
    // The operation above correctly refuses a mismatched Presence; create the
    // remembered identity through the real operator path for the active one.
    state = applyOperation(state, { type: "rememberPerson", presenceId: state.presence!.id, channel: "x", externalActorId: "123", displayName: "Rasmic", handle: "rasmic", source: "operator" });
    const person = state.people[0]!;
    const presence = state.presence!;
    state = applyOperation(state, { type: "createWatch", presenceId: presence.id, query: "@rasmic", purpose: "Interact with relevant posts when there is a worthwhile opening." });
    state = recordNativeMirror(state, { connectionId: "study-connection", presenceId: presence.id, post: { id: "rasmic-post-1", text: "Concrete examples make agent software easier to trust.", authorId: "123", authorUsername: "rasmic", authorName: "Rasmic", createdAt: new Date().toISOString(), conversationId: "rasmic-post-1" } });

    const studied = await runRelationshipStudy(state, { presenceId: presence.id, personId: person.id, mode: "existing_evidence" });
    expect(studied.relationshipStudies).toHaveLength(1);
    const study = studied.relationshipStudies?.[0];
    if (!study) throw new Error("The relationship study was not recorded.");
    const insightSet = studied.relationshipInsightSets?.find((item) => item.id === study.insightSetId);
    if (!insightSet) throw new Error("The relationship insight set was not recorded.");
    expect(study).toMatchObject({ status: "completed", mode: "existing_evidence", resourceUsage: { channelReads: 0, modelCalls: 1 } });
    expect(insightSet.currentApproach.evidenceRefs.length).toBeGreaterThan(0);
    expect(insightSet.currentApproach.evidenceRefs[0]?.kind).toBe("mirror_object");
    expect(studied.assignments).toHaveLength(0);
    expect(studied.socialIntents).toHaveLength(0);
    expect(studied.watches).toHaveLength(1);
  });

  it("does not create a study when a Watch is merely added", () => {
    const state = applyOperation(createAgent(input), { type: "createWatch", query: "@rasmic", purpose: "Watch relevant posts and stay quiet when there is no opening." });
    expect(state.watches).toHaveLength(1);
    expect(state.relationshipStudies ?? []).toHaveLength(0);
    expect(state.relationshipInsightSets ?? []).toHaveLength(0);
    expect(state.assignments).toHaveLength(0);
  });

  it("refreshes only evidence added since the previous study", async () => {
    process.env.OPENPRESENCE_AI_MOCK = "1";
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { connectionMode: "native" } });
    state = applyOperation(state, { type: "rememberPerson", presenceId: state.presence!.id, channel: "x", externalActorId: "123", displayName: "Rasmic", handle: "rasmic", source: "operator" });
    const person = state.people[0]!;
    const presence = state.presence!;
    const addPost = (id: string, text: string) => {
      state = recordNativeMirror(state, { connectionId: "study-connection", presenceId: presence.id, post: { id, text, authorId: "123", authorUsername: "rasmic", authorName: "Rasmic", createdAt: new Date().toISOString(), conversationId: id } });
    };
    addPost("rasmic-post-1", "The first relationship evidence item.");
    state = await runRelationshipStudy(state, { presenceId: presence.id, personId: person.id, mode: "existing_evidence" });
    const first = state;
    const firstStudy = first.relationshipStudies?.[0];
    if (!firstStudy) throw new Error("The initial relationship study was not recorded.");
    addPost("rasmic-post-2", "A new relationship evidence item.");
    const refreshed = await runRelationshipStudy(state, { presenceId: presence.id, personId: person.id, mode: "existing_evidence", refresh: true });
    const refreshStudy = refreshed.relationshipStudies?.[0];
    if (!refreshStudy) throw new Error("The refreshed relationship study was not recorded.");
    const refreshedSet = refreshed.relationshipInsightSets?.find((item) => item.id === refreshStudy.insightSetId);
    if (!refreshedSet) throw new Error("The refreshed relationship insight set was not recorded.");

    expect(refreshStudy.refresh).toBe(true);
    expect(refreshStudy.evidenceRefs.map((ref) => ref.id)).toEqual([expect.stringContaining("mirror")]);
    expect(refreshStudy.evidenceRefs.map((ref) => ref.id)).not.toContain(firstStudy.evidenceRefs[0]?.id);
    expect(refreshedSet.previousVersionId).toBe(first.relationshipInsightSets?.[0]?.id);
    expect(refreshed.assignments).toHaveLength(0);
    expect(refreshed.socialIntents).toHaveLength(0);
  });
});
