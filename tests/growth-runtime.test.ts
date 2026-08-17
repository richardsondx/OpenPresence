import { describe, expect, it } from "vitest";
import { applyOperation, audienceDeltas, compileAssignmentInstruction, completeNativeExecution, derivePresenceCapabilityManifest, ensureCapabilityRequests, formChatPostIntent, formXActionIntent, formXReplyIntent, publicationMetricBaseline, recordVerifiedFollow } from "@/lib/runtime";
import { createAgent } from "@/lib/runtime";
import type { MirrorObject, OpenPresenceState } from "@/lib/types";

function fixture(): OpenPresenceState {
  return createAgent({ name: "Genny", description: "An agent for useful software conversations.", audience: "AI builders", mode: "agent", handle: "@genny", accent: "#d88b57" });
}

describe("continuous growth responsibility", () => {
  it("compiles a 100K request into one continuous Assignment with an evidence contract", () => {
    const state = fixture();
    const assignment = compileAssignmentInstruction(state, "Grow this Presence toward 100,000 followers while building an audience of AI founders.", state.presence!.id, "live");
    expect(assignment.activation).toEqual({ type: "continuous" });
    expect(assignment.successEvidence).toMatchObject({ metric: "followers", comparator: ">=", value: 100000 });
    expect(assignment.plan?.revision).toBe(1);
    expect(assignment.planHistory).toHaveLength(1);
    expect(assignment.deliverable.type).toBe("audience_growth");
  });

  it("does not complete from work, but completes from a verified audience snapshot", () => {
    const state = fixture();
    let next = applyOperation(state, { type: "createAssignment", presenceId: state.presence!.id, environment: "live", instruction: "Grow this Presence toward 100,000 followers while building an audience of AI founders." });
    const assignment = next.assignments[0];
    next = applyOperation(next, { type: "activateAssignment", id: assignment.id });
    expect(next.assignments[0].status).toBe("active");
    next = applyOperation(next, { type: "recordAudienceSnapshot", presenceId: state.presence!.id, followers: 12_000, source: "native", observedAt: "2026-08-01T00:00:00.000Z" });
    expect(next.assignments[0].status).toBe("active");
    next = applyOperation(next, { type: "recordAudienceSnapshot", presenceId: state.presence!.id, followers: 100_000, source: "native", observedAt: "2026-08-16T00:00:00.000Z" });
    expect(next.assignments[0].status).toBe("completed");
    expect(next.assignments[0].progress.verified).toBe(1);
  });

  it("does not let a manual count complete a live follower goal", () => {
    const state = fixture();
    let next = applyOperation(state, { type: "createAssignment", presenceId: state.presence!.id, environment: "live", instruction: "Grow this Presence toward 100,000 followers while building an audience of AI founders." });
    next = applyOperation(next, { type: "activateAssignment", id: next.assignments[0].id });
    next = applyOperation(next, { type: "recordAudienceSnapshot", presenceId: state.presence!.id, followers: 100_000, source: "manual", observedAt: "2026-08-16T00:00:00.000Z" });
    expect(next.assignments[0].status).toBe("active");
  });

  it("keeps plan history and identity files separate during review", () => {
    const state = fixture();
    let next = applyOperation(state, { type: "createAssignment", presenceId: state.presence!.id, environment: "live", instruction: "Grow this Presence toward 100,000 followers while building an audience of AI founders." });
    const assignment = next.assignments[0];
    next = applyOperation(next, { type: "activateAssignment", id: assignment.id });
    const before = Object.fromEntries(next.files.filter((file) => ["SOUL", "MISSION", "TASTE", "BRAIN"].includes(file.kind)).map((file) => [file.kind, file.content]));
    next = applyOperation(next, { type: "recordAudienceSnapshot", presenceId: state.presence!.id, followers: 20_000, source: "native", observedAt: "2026-08-01T00:00:00.000Z" });
    next = applyOperation(next, { type: "reviewGrowth", presenceId: state.presence!.id, assignmentId: assignment.id, kind: "weekly" });
    expect(next.growthReviews).toHaveLength(1);
    expect(next.assignments[0].planHistory).toHaveLength(1);
    expect(Object.fromEntries(next.files.filter((file) => ["SOUL", "MISSION", "TASTE", "BRAIN"].includes(file.kind)).map((file) => [file.kind, file.content]))).toEqual(before);
    expect(next.files.find((file) => file.kind === "GROWTH")?.content).toContain("Latest review");
    next = applyOperation(next, { type: "reviewGrowth", presenceId: state.presence!.id, assignmentId: assignment.id, kind: "weekly" });
    expect(next.growthReviews).toHaveLength(1);
  });

  it("applies a model-backed Growth Review to the growth plan only", () => {
    const state = fixture();
    let next = applyOperation(state, { type: "createAssignment", presenceId: state.presence!.id, environment: "live", instruction: "Grow this Presence toward 100,000 followers while building an audience of AI founders." });
    const assignment = next.assignments[0];
    next = applyOperation(next, { type: "activateAssignment", id: assignment.id });
    const beforeIdentity = Object.fromEntries(next.files.filter((file) => ["SOUL", "MISSION", "TASTE", "BRAIN"].includes(file.kind)).map((file) => [file.kind, file.content]));
    next = applyOperation(next, {
      type: "reviewGrowth",
      presenceId: state.presence!.id,
      assignmentId: assignment.id,
      kind: "weekly",
      modelDecision: {
        summary: "Shift toward reply-led discovery.",
        working: ["Evidence posts earn replies."],
        uncertain: ["Follower attribution is sparse."],
        weak: ["Standalone posts are not yet repeatable."],
        rationale: "Replies are the strongest observed signal.",
        plan: { summary: "Reply-led discovery", dailyTargets: ["Review 10 relevant conversations"] },
      },
    });
    expect(next.growthReviews[0]).toMatchObject({ reviewSource: "model", changedPlan: true, planChangeSummary: "Replies are the strongest observed signal." });
    expect(next.assignments[0].planHistory).toHaveLength(2);
    expect(next.assignments[0].plan?.summary).toBe("Reply-led discovery");
    expect(next.files.find((file) => file.kind === "GROWTH")?.content).toContain("Reply-led discovery");
    expect(next.growthFileVersions).toHaveLength(2);
    expect(next.growthFileVersions[0]).toMatchObject({ version: 2, previousVersion: 1, reviewId: next.growthReviews[0]?.id, reviewSource: "model" });
    expect(Object.fromEntries(next.files.filter((file) => ["SOUL", "MISSION", "TASTE", "BRAIN"].includes(file.kind)).map((file) => [file.kind, file.content]))).toEqual(beforeIdentity);
  });

  it("uses a median comparable baseline and exposes low confidence with sparse evidence", () => {
    const state = fixture();
    const presenceId = state.presence!.id;
    const makeMirror = (id: string): MirrorObject => ({ id, bridgeId: "native:test", presenceId, channelId: "x", externalRef: { type: "x.post", id }, objectType: "post", author: { displayName: "Genny", handle: "genny" }, content: { text: id }, observedAt: "2026-08-16T00:00:00.000Z", occurredAt: "2026-08-15T23:00:00.000Z", visibility: "public", shareability: "presence-only", environment: "live", source: "native", trust: "untrusted_world_content" });
    let next = { ...state, mirrorObjects: [makeMirror("a"), makeMirror("b"), makeMirror("c")] };
    next = applyOperation(next, { type: "recordPublicationMetricSnapshot", presenceId, mirrorObjectId: "a", publicationAgeSeconds: 3600, metrics: { impressions: 100 }, source: "native" });
    next = applyOperation(next, { type: "recordPublicationMetricSnapshot", presenceId, mirrorObjectId: "b", publicationAgeSeconds: 3600, metrics: { impressions: 300 }, source: "native" });
    next = applyOperation(next, { type: "recordPublicationMetricSnapshot", presenceId, mirrorObjectId: "c", publicationAgeSeconds: 3600, metrics: { impressions: 200 }, source: "native" });
    const latest = next.publicationMetricSnapshots[0];
    expect(publicationMetricBaseline(next, latest).comparableCount).toBe(2);
    expect(audienceDeltas(next, presenceId).current).toBeUndefined();
  });

  it("reports an honest unavailable capability without a connected body", () => {
    const state = fixture();
    const manifest = derivePresenceCapabilityManifest(state, state.presence!.id);
    expect(manifest.items.find((item) => item.capability === "follower_measurement")?.availability).toBe("unavailable");
    expect(manifest.items.find((item) => item.capability === "follower_measurement")?.canExecute).toBe(false);
  });

  it("projects connected Bridge media and measurement capabilities into runtime truth", () => {
    const state = fixture();
    const presenceId = state.presence!.id;
    const heartbeat = new Date().toISOString();
    const next = { ...state, bridges: [{ id: "bridge-x", presenceId, channelId: "x", name: "X Browser Bridge", kind: "bridge" as const, state: "online" as const, adapterStatus: "connected" as const, lastHeartbeatAt: heartbeat, capabilities: { inbound: true, reconcile: true, affordances: ["post", "reply", "like", "repost", "quote", "follow"], formats: ["x.post", "x.media-post", "x.reply"], metrics: ["followers", "public_metrics"], assetKinds: ["image", "video"] as ("image" | "video")[] }, createdAt: heartbeat, updatedAt: heartbeat }] };
    const manifest = derivePresenceCapabilityManifest(next, presenceId);
    expect(manifest.items.find((item) => item.capability === "follow")).toMatchObject({ availability: "available", provider: "Browser Bridge", canExecute: true, canVerify: true });
    expect(manifest.items.find((item) => item.capability === "follower_measurement")).toMatchObject({ availability: "available", provider: "Browser Bridge", canObserve: true });
    expect(manifest.items.find((item) => item.capability === "image")).toMatchObject({ availability: "available", provider: "Browser Bridge", canExecute: true });
  });

  it("migrates legacy X channel metadata so Follow is not falsely reported unsupported", () => {
    const state = fixture();
    const legacyCapabilities = state.presence!.capabilities.filter((item) => item.id !== "follow");
    const legacyChannelDefinitions = state.channelDefinitions.map((definition) => definition.id === "x" ? { ...definition, affordances: definition.affordances.filter((item) => item.id !== "follow") } : definition);
    const legacy = { ...state, presence: { ...state.presence!, capabilities: legacyCapabilities }, presences: [{ ...state.presence!, capabilities: legacyCapabilities }], channelDefinitions: legacyChannelDefinitions };
    const follow = derivePresenceCapabilityManifest(legacy, state.presence!.id).items.find((item) => item.capability === "follow");
    expect(follow?.limitation).not.toContain("not supported by X");
  });

  it("does not borrow native capabilities when the Presence selected the Browser Bridge route", () => {
    const state = fixture();
    const bridgePresence = { ...state.presence!, connectionMode: "bridge" as const };
    const next = { ...state, presence: bridgePresence, presences: [bridgePresence], nativeConnections: [{ id: "native-x", presenceId: bridgePresence.id, channelId: "x", kind: "x" as const, status: "connected" as const, access: "read-write" as const, account: { id: "account-1", username: "genny", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] };
    const post = derivePresenceCapabilityManifest(next, bridgePresence.id).items.find((item) => item.capability === "post");
    expect(post).toMatchObject({ availability: "unavailable", provider: undefined, canExecute: false });
  });

  it("forms and verifies native X reactions instead of treating them as unavailable", () => {
    const state = fixture();
    state.presence!.execution.like = "auto";
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "genny", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    const manifest = derivePresenceCapabilityManifest(state, state.presence!.id);
    expect(manifest.items.find((item) => item.capability === "like")).toMatchObject({ availability: "available", provider: "Native X", canExecute: true, canVerify: true });
    const next = formXActionIntent(state, { affordance: "x.like", target: { type: "x.post", id: "post-1" } });
    expect(next.executions[0]).toMatchObject({ affordance: "x.like", connector: "native", status: "queued", target: { type: "x.post", id: "post-1" } });
    const completed = completeNativeExecution(next, next.executions[0]!.id, { type: "x.like", id: "post-1" });
    expect(completed.executions[0]?.status).toBe("succeeded");
    expect(completed.outcomes[0]?.evidence).toEqual([{ type: "x.like", id: "post-1" }]);
  });

  it("records a verified Follow as following relationship memory", () => {
    const state = fixture();
    const next = recordVerifiedFollow(state, state.presence!.id, { type: "x.user", id: "builder-account" });
    const identity = next.personIdentities.find((item) => item.externalActorId === "builder-account");
    expect(identity).toBeDefined();
    expect(next.relationships.find((item) => item.personId === identity?.personId)).toMatchObject({ following: true, state: "active" });
  });

  it("carries ready media into an autonomous live publication envelope", () => {
    const state = fixture();
    state.presence!.execution.post = "auto";
    const asset = { id: "asset-chart", agentId: state.agent!.id, presenceId: state.presence!.id, type: "image" as const, mediaKind: "image" as const, status: "ready" as const, storage: { storeKey: "chart.png", mimeType: "image/png", byteSize: 4, exactHash: "hash" }, provenance: { origin: "discovered", sourceUrl: "https://example.com/chart.png", importedAt: new Date().toISOString() }, environment: "live" as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const withAsset = { ...state, assets: [asset] };
    const published = formChatPostIntent(withAsset, "A grounded media-backed point of view.", undefined, "agent", [asset.id]);
    expect(published.publications[0]).toMatchObject({ format: "x.media-post", assetIds: [asset.id] });
    expect(published.publications[0]?.publicExpression?.mediaIds).toEqual([asset.id]);
  });

  it("carries ready media through live reply and quote envelopes", () => {
    const state = fixture();
    const asset = { id: "asset-reply", agentId: state.agent!.id, presenceId: state.presence!.id, type: "image" as const, mediaKind: "image" as const, status: "ready" as const, storage: { storeKey: "reply.png", mimeType: "image/png", byteSize: 4, exactHash: "hash-reply" }, provenance: { origin: "discovered", sourceUrl: "https://example.com/reply.png", importedAt: new Date().toISOString() }, environment: "live" as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const withAsset = { ...state, assets: [asset] };
    const reply = formXReplyIntent(withAsset, "A grounded reply with evidence.", "post-1", undefined, undefined, [asset.id]);
    expect(reply.publications[0]).toMatchObject({ format: "x.media-post", assetIds: [asset.id] });
    const quote = formXActionIntent(withAsset, { affordance: "x.quote", target: { type: "x.post", id: "post-1" }, text: "A grounded quote with evidence.", assetIds: [asset.id] });
    expect(quote.publications[0]).toMatchObject({ format: "x.media-post", assetIds: [asset.id] });
  });

  it("opens deduplicated durable requests for growth capabilities and resolves them on recovery", () => {
    const state = fixture();
    let next = applyOperation(state, { type: "createAssignment", presenceId: state.presence!.id, environment: "live", instruction: "Grow this Presence toward 100,000 followers while building an audience of AI founders." });
    expect(next.agentRequests.filter((item) => item.kind === "capability").map((item) => item.capability)).toEqual(expect.arrayContaining(["follower_measurement", "post_performance", "follow", "image", "video"]));
    const request = next.agentRequests.find((item) => item.capability === "follower_measurement")!;
    next = applyOperation(next, { type: "updateAgentRequest", id: request.id, status: "accepted" });
    expect(next.agentRequests.find((item) => item.id === request.id)?.status).toBe("accepted");
    next = applyOperation(next, { type: "recordCapabilityChange", presenceId: state.presence!.id, changes: [{ capability: "follower_measurement", previousAvailability: "unavailable", nextAvailability: "available", provider: "Native X", detail: "Native X returned authenticated audience metrics." }] });
    expect(next.agentRequests.find((item) => item.id === request.id)?.status).toBe("resolved");
    expect(next.capabilityChangeEvents[0]).toMatchObject({ capability: "follower_measurement", nextAvailability: "available" });
    next = ensureCapabilityRequests(next, state.presence!.id);
    expect(next.agentRequests.filter((item) => item.capability === "post_performance" && item.status === "open")).toHaveLength(1);
  });
});
