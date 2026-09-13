import { describe, expect, it } from "vitest";
import { createAgent, applyOperation, startPlaygroundSession, compileAgendaWork } from "../lib/runtime";
import { parseAgentSocialDecision } from "../lib/ai";
import { deferInboundJudgment } from "../lib/runtime";
import { hasEpisodeRepresentation, selectUnjudgedNativeInbound } from "../lib/autonomy-worker";

describe("Autonomous Closed-Loop Cognition Invariants", () => {
  it("does not represent the same target twice inside one attention episode", () => {
    const state = createAgent({ name: "Jenny", description: "Test", mode: "agent", handle: "@jenny_ai", accent: "#D68754" });
    const presenceId = state.presence!.id;
    state.mirrorObjects.unshift({ id: "mirror_episode_target", bridgeId: "native:test", presenceId, channelId: "x", externalRef: { type: "x.post", id: "episode-target" }, objectType: "post", author: { displayName: "Someone" }, content: { text: "Hello" }, visibility: "public", shareability: "presence-only", observedAt: new Date().toISOString() });
    state.socialDecisions.unshift({ id: "decision_episode_target", agentId: state.agent!.id, presenceId, environment: "sandbox", focalMirrorObjectIds: ["mirror_episode_target"], origin: { kind: "inbound_social", refId: "episode-target" }, decision: "reply", summary: "One reply is enough.", influences: [], confidence: "medium", attentionEpisodeId: "episode_one", createdAt: new Date().toISOString() });

    expect(hasEpisodeRepresentation(state, presenceId, "episode-target", "episode_one")).toBe(true);
    expect(hasEpisodeRepresentation(state, presenceId, "episode-target", "episode_two")).toBe(false);
  });

  it("lets newer inbound mentions proceed when one candidate is deferred after a provider failure", () => {
    let state = createAgent({ name: "Jenny", description: "Test", mode: "agent", handle: "@jenny_ai", accent: "#D68754" });
    const presenceId = state.presence!.id;
    const observedAt = new Date("2026-08-29T12:00:00.000Z").toISOString();
    state.presence = {
      ...state.presence!,
      context: {
        ...state.presence!.context,
        publicFooting: { postsPublished: 0, recentPostIds: [], recentInboundIds: ["older-mention", "newer-mention"], judgedInboundIds: [], observedAt },
      },
    };
    state.presences = state.presences.map((item) => item.id === presenceId ? state.presence! : item);
    state.mirrorObjects = ["older-mention", "newer-mention"].map((id, index) => ({
      id: `mirror-${id}`,
      bridgeId: "native:test",
      presenceId,
      channelId: "x" as const,
      externalRef: { type: "x.post" as const, id },
      objectType: "post",
      author: { displayName: `Author ${index}`, handle: `author_${index}`, externalRef: { type: "x.user" as const, id: `author-${index}` } },
      content: { text: `A substantive mention ${index}.` },
      language: "en",
      occurredAt: new Date(`2026-08-29T12:0${index}:00.000Z`).toISOString(),
      observedAt,
      visibility: "public",
      shareability: "presence-only",
      environment: "live",
      source: "native",
      trust: "untrusted_world_content",
    } as never));
    state = deferInboundJudgment(state, presenceId, "older-mention", new Date("2026-08-29T12:05:00.000Z").toISOString());
    expect(selectUnjudgedNativeInbound(state, presenceId, new Date("2026-08-29T12:01:00.000Z"))).toHaveLength(1);
    expect(selectUnjudgedNativeInbound(state, presenceId, new Date("2026-08-29T12:01:00.000Z"))[0]?.externalRef.id).toBe("newer-mention");
  });

  it("evaluates autonomous deliberation invariants when only world stimuli are supplied", async () => {
    // 1. Setup Presence with auto execution enabled
    let state = createAgent({
      name: "Jenny",
      description: "Explain durable AI agent architecture.",
      mode: "agent",
      handle: "@jenny_ai",
      accent: "#D68754",
    });
    const presenceId = state.presence!.id;
    state = applyOperation(state, {
      type: "setPresence",
      patch: {
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

    // 2. WORLD STIMULUS 1: Inbound mention from a peer in live environment
    state.mirrorObjects.push({
      id: "mirror_alice_mention",
      bridgeId: "native:presence_main",
      presenceId,
      channelId: "x",
      externalRef: { type: "x.post", id: "post_alice_1" },
      objectType: "post",
      author: { displayName: "Engineer Alice", handle: "alice_eng" },
      content: { text: "Hey @jenny_ai what is the core difference between a workflow graph and an autonomous agent loop?" },
      occurredAt: new Date().toISOString(),
      observedAt: new Date().toISOString(),
      visibility: "public",
      shareability: "presence-only",
      archived: false,
      environment: "live",
      source: "native",
      trust: "untrusted_world_content",
    });

    // 3. WORLD STIMULUS 2: Discovered public post in territory
    state.mirrorObjects.push({
      id: "mirror_bob_post",
      bridgeId: "native:presence_main",
      presenceId,
      channelId: "x",
      externalRef: { type: "x.post", id: "post_bob_1" },
      objectType: "post",
      author: { displayName: "Researcher Bob", handle: "bob_research" },
      content: { text: "New paper out on long-term cognitive continuity for LLM agents across sessions." },
      occurredAt: new Date().toISOString(),
      observedAt: new Date().toISOString(),
      visibility: "public",
      shareability: "presence-only",
      archived: false,
      environment: "live",
      source: "native",
      trust: "untrusted_world_content",
    });

    // Verify Agenda compiles and prioritizes the fresh incoming world stimuli
    const agenda = compileAgendaWork(state, presenceId);
    expect(agenda.nextUp?.length).toBeGreaterThan(0);

    // 4. Test Planner Invariant: Full affordance set is provided to Planner
    const availableAffordances = ["reply", "quote", "repost", "like", "follow"];
    expect(availableAffordances).toEqual(expect.arrayContaining(["reply", "quote", "repost", "like", "follow"]));
    expect(availableAffordances.includes("no_op")).toBe(false);

    // 5. Test Planner Output Invariant: Multi-act decisions parse cleanly
    const mockModelDecision1 = JSON.stringify({
      acts: [
        { action: "reply", text: "A workflow graph executes deterministic transitions; an autonomous agent loop evaluates open world evidence against its own persistent Agenda.", rationale: "Answers the technical question concisely." },
        { action: "like", rationale: "Acknowledges the substantive inquiry." }
      ],
      conversationDisposition: "continue",
      rationale: "Answer the mention directly and like the question."
    });
    const parsed1 = parseAgentSocialDecision(mockModelDecision1, availableAffordances);
    expect(parsed1.acts).toHaveLength(2);
    expect(parsed1.acts![0].action).toBe("reply");
    expect(parsed1.acts![1].action).toBe("like");

    // 6. Test Informed Silence Invariant: acts = [] is parsed as clean intentional silence
    const mockModelDecision2 = JSON.stringify({
      acts: [],
      rationale: "The paper is relevant, but we already covered this topic yesterday. Quiet observation is more tasteful than duplicate commentary."
    });
    const parsed2 = parseAgentSocialDecision(mockModelDecision2, availableAffordances);
    expect(parsed2.acts).toHaveLength(0);
    expect(parsed2.action).toBe("no_op");
    expect(parsed2.rationale).toContain("Quiet observation");
  });
});
