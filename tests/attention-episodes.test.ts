import { describe, expect, it } from "vitest";
import { createAttentionEpisode, linkAttentionEpisodeRecords, reconcileOrphanedAttentionEpisodes, summarizeAttentionEpisode } from "../lib/attention-episodes";
import { createAgent, initialState } from "../lib/runtime";
import type { Execution, MirrorObject, Outcome, SocialDecision, SocialIntent } from "../lib/types";

describe("Attention Episodes", () => {
  it("groups observation, judgment, multiple acts, and verification into one durable episode", () => {
    let state = createAgent({ name: "Episode Test", description: "Test", audience: "Testers", mode: "agent", handle: "@episode_test", accent: "#777777" });
    const presence = { ...state.presence!, id: "presence_episode_test", status: "live" as const, channel: "x" as const, environment: "live" as const };
    state.presence = presence;
    state.presences = [presence];

    const created = createAttentionEpisode(state, { presenceId: presence.id, runId: "run_episode_test", source: "scheduled" });
    state = created.state;
    const episodeId = created.episode.id;
    const mirror: MirrorObject = {
      id: "mirror_episode_test",
      presenceId: presence.id,
      channelId: "x",
      bridgeId: "bridge_episode_test",
      externalRef: { type: "x.post", id: "post_episode_test" },
      objectType: "post",
      author: { displayName: "Author", handle: "author" },
      content: { text: "A useful post" },
      occurredAt: new Date().toISOString(),
      observedAt: new Date().toISOString(),
      visibility: "public",
      shareability: "presence-only",
      archived: false,
      environment: "live",
      source: "native",
      trust: "untrusted_world_content",
    };
    const decision = { id: "decision_episode_test", presenceId: presence.id, decision: "like", summary: "Quiet signal", focalMirrorObjectIds: [mirror.id], acts: [{ decision: "like" }, { decision: "follow" }], createdAt: new Date().toISOString() } as unknown as SocialDecision;
    const intent = { id: "intent_episode_test", presenceId: presence.id, affordance: "x.like", socialIntentId: "intent_episode_test", runId: "run_episode_test", invocationId: "inv_episode_test" } as unknown as SocialIntent;
    const execution = { id: "execution_episode_test", presenceId: presence.id, socialIntentId: intent.id, affordance: "x.like", status: "succeeded", runId: "run_episode_test", invocationId: "inv_episode_test" } as unknown as Execution;
    const outcome = { id: "outcome_episode_test", presenceId: presence.id, executionId: execution.id, socialIntentId: intent.id, status: "succeeded" } as unknown as Outcome;
    state.mirrorObjects.unshift(mirror);
    state.socialDecisions.unshift(decision);
    state.socialIntents.unshift(intent);
    state.executions.unshift(execution);
    state.outcomes.unshift(outcome);

    state = linkAttentionEpisodeRecords(state, episodeId, { mirrorObjectIds: [mirror.id], decisionIds: [decision.id], intentIds: [intent.id], executionIds: [execution.id], outcomeIds: [outcome.id] });
    state = summarizeAttentionEpisode(state, episodeId);
    const episode = (state.attentionEpisodes ?? []).find((item) => item.id === episodeId)!;

    expect(episode.mirrorObjectIds).toContain(mirror.id);
    expect(episode.socialDecisionIds).toContain(decision.id);
    expect(episode.executionIds).toContain(execution.id);
    expect(episode.verifiedOutcomeCount).toBe(1);
    expect(episode.actionCounts.like).toBe(1);
    expect(episode.actionCounts.follow).toBe(1);
    expect(episode.summary).toContain("2 actions selected");
  });

  it("keeps an episode waiting when durable delivery is still unresolved", () => {
    let state = initialState();
    const presence = { ...state.presence!, id: "presence_episode_waiting", status: "live" as const, channel: "x" as const, environment: "live" as const };
    state.presence = presence;
    state.presences = [presence];
    const created = createAttentionEpisode(state, { presenceId: presence.id, runId: "run_episode_waiting" });
    state = created.state;
    state.executions.unshift({ id: "execution_waiting", presenceId: presence.id, socialIntentId: "intent_waiting", affordance: "x.repost", status: "queued", runId: "run_episode_waiting" } as unknown as Execution);
    state = summarizeAttentionEpisode(state, created.episode.id, { status: "waiting", stage: "confirming" });
    const episode = (state.attentionEpisodes ?? []).find((item) => item.id === created.episode.id)!;
    expect(episode.status).toBe("waiting");
    expect(episode.stage).toBe("confirming");
    expect(episode.pendingExecutionCount).toBe(1);
    expect(episode.verifiedOutcomeCount).toBe(0);
  });

  it("refreshes the derived action summary after an episode first reported silence", () => {
    let state = initialState();
    const presence = { ...state.presence!, id: "presence_episode_summary", status: "live" as const, channel: "x" as const, environment: "live" as const };
    state.presence = presence;
    state.presences = [presence];
    const created = createAttentionEpisode(state, { presenceId: presence.id, runId: "run_episode_summary" });
    state = summarizeAttentionEpisode(created.state, created.episode.id);
    expect(state.attentionEpisodes?.[0]?.summary).toContain("0 actions selected");

    state.socialDecisions.unshift({
      id: "decision_episode_summary",
      presenceId: presence.id,
      decision: "like",
      acts: [{ decision: "like" }],
      focalMirrorObjectIds: [],
      runId: "run_episode_summary",
      createdAt: new Date().toISOString(),
    } as unknown as SocialDecision);
    state = summarizeAttentionEpisode(state, created.episode.id);
    expect(state.attentionEpisodes?.[0]?.summary).toContain("1 action selected");
  });

  it("settles stale running episodes that have no durable attention run owner", () => {
    const state = initialState();
    const old = "2026-08-29T11:00:00.000Z";
    state.attentionEpisodes = [{
      id: "orphan_episode",
      agentId: "agent",
      presenceId: "presence",
      channel: "x",
      environment: "live",
      source: "scheduled",
      status: "running",
      stage: "choosing",
      startedAt: old,
      updatedAt: old,
      runIds: ["missing_run"],
      mirrorObjectIds: [],
      newMirrorObjectIds: [],
      changedMirrorObjectIds: [],
      socialDecisionIds: [],
      socialIntentIds: [],
      executionIds: [],
      outcomeIds: [],
      fetchedCount: 1,
      newCount: 1,
      changedCount: 0,
      knownCount: 0,
      consideredCount: 0,
      closeAttentionCount: 0,
      noOpCount: 0,
      actionCounts: {},
      verifiedOutcomeCount: 0,
      pendingExecutionCount: 0,
      failedExecutionCount: 0,
      resourceUsage: { channelReads: 1, channelWrites: 0, modelCalls: 0, visionCalls: 0, hydrations: 0, mediaFetches: 0 },
      steps: [],
    }];

    expect(reconcileOrphanedAttentionEpisodes(state, new Date("2026-08-29T12:00:00.000Z"))).toBe(1);
    expect(state.attentionEpisodes[0]).toMatchObject({ status: "failed", stage: "completed", completedAt: "2026-08-29T12:00:00.000Z" });
    expect(state.attentionEpisodes[0].lastError).toContain("no longer owns");
  });
});
