import { describe, expect, it } from "vitest";
import { applyOperation, audienceDeltas, capabilityProviderLabel, clearNativeBrowserContinuityHold, collapseAudienceSnapshots, compileAssignmentInstruction, completeNativeExecution, derivePresenceCapabilityManifest, formChatPostIntent, formXActionIntent, formXReplyIntent, publicationMetricBaseline, recordPublicationMetricSnapshots, recordVerifiedFollow } from "@/lib/runtime";
import { createAgent } from "@/lib/runtime";
import type { MirrorObject, OpenPresenceState } from "@/lib/types";
import { nextSelfDirectedAttentionAt, recurringAttentionOperation, selectBridgeDiscoveryCandidates, selectGrowthDiscoverySource } from "@/lib/growth-scheduler";

// A verified account alone does not prove the current Chrome adapter can act.
function verifiedBrowserAdapters(accountIdentity: import("../lib/types").Bridge["accountIdentity"]) {
  return [{ executorId: "openpresence-chrome-test", version: "1.0.0", protocolVersion: 2, probed: true,
    observedAt: accountIdentity!.observedAt,
    accountIdentity,
    capabilities: { channelRead: true, mediaUpload: true, verification: true,
      affordances: ["post", "reply", "quote", "repost", "like", "follow", "delete"] },
  }];
}

function fixture(): OpenPresenceState {
  return createAgent({ name: "Genny", description: "An agent for useful software conversations.", audience: "AI builders", mode: "agent", handle: "@genny", accent: "#d88b57" });
}

describe("continuous growth responsibility", () => {
  it("derives attention cadence from intensity rather than social-action targets", () => {
    const now = Date.parse("2026-08-21T05:00:00.000Z");
    expect(nextSelfDirectedAttentionAt({ intensity: "curious", now })).toBe("2026-08-21T06:00:00.000Z");
    expect(nextSelfDirectedAttentionAt({ intensity: "quiet", now })).toBe("2026-08-21T11:00:00.000Z");
  });

  it("hands discovery to a healthy Bridge when Native X needs attention", () => {
    expect(selectGrowthDiscoverySource({ nativeReadable: true, nativeStatus: "needs-attention", bridgeConnected: true, hasNativeCredentials: true })).toBe("bridge");
    expect(selectGrowthDiscoverySource({ nativeReadable: true, nativeStatus: "connected", bridgeConnected: true, hasNativeCredentials: true })).toBe("native");
  });

  it("compiles a 100K request into one continuous Assignment with an evidence contract", () => {
    const state = fixture();
    expect(state.presence?.createdAt).toBeTruthy();
    expect(state.presences[0]?.createdAt).toBe(state.presence?.createdAt);
    const assignment = compileAssignmentInstruction(state, "Grow this Presence toward 100,000 followers while building an audience of AI founders.", state.presence!.id, "live");
    expect(assignment.activation).toEqual({ type: "continuous" });
    expect(assignment.successEvidence).toMatchObject({ metric: "followers", comparator: ">=", value: 100000 });
    expect(assignment.plan?.revision).toBe(1);
    expect(assignment.planHistory).toHaveLength(1);
    expect(assignment.deliverable.type).toBe("audience_growth");
  });

  it("does not complete from work, but completes from a verified audience snapshot", () => {
    const state = fixture();
    const createdAt = "2026-07-01T00:00:00.000Z";
    const presence = { ...state.presence!, createdAt, environment: "live" as const };
    state.presence = presence;
    state.presences = [presence];
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

  it("excludes audience snapshots recorded before the Presence boundary", () => {
    const state = fixture();
    const createdAt = "2026-08-01T00:00:00.000Z";
    const presence = { ...state.presence!, createdAt, environment: "live" as const };
    state.presence = presence;
    state.presences = [presence];
    let next = applyOperation(state, { type: "recordAudienceSnapshot", presenceId: presence.id, followers: 999, source: "native", observedAt: "2026-07-31T00:00:00.000Z" });
    next = applyOperation(next, { type: "recordAudienceSnapshot", presenceId: presence.id, followers: 12, source: "native", observedAt: "2026-08-01T00:00:00.000Z" });
    next = applyOperation(next, { type: "recordAudienceSnapshot", presenceId: presence.id, followers: 15, source: "native", observedAt: "2026-08-02T00:00:00.000Z" });

    expect(next.audienceSnapshots).toHaveLength(3);
    expect(audienceDeltas(next, presence.id)).toMatchObject({ current: 15, daily: 3 });
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
    expect(next.changeSets.find((changeSet) => changeSet.operations.some((operation) => operation.path === "agentFiles.GROWTH"))?.presenceId).toBe(state.presence!.id);
    next = applyOperation(next, { type: "reviewGrowth", presenceId: state.presence!.id, assignmentId: assignment.id, kind: "weekly" });
    expect(next.growthReviews).toHaveLength(1);
  });

  it("allows a fresh review when new evidence arrives within the normal review cooldown", () => {
    const state = fixture();
    state.presence!.environment = "live";
    let next = applyOperation(state, { type: "createAssignment", presenceId: state.presence!.id, environment: "live", instruction: "Grow this Presence toward 100,000 followers while building an audience of AI founders." });
    const assignment = next.assignments[0];
    next = applyOperation(next, { type: "activateAssignment", id: assignment.id });
    next = applyOperation(next, { type: "recordAudienceSnapshot", presenceId: state.presence!.id, followers: 20_000, source: "native", observedAt: new Date().toISOString() });
    next = applyOperation(next, { type: "reviewGrowth", presenceId: state.presence!.id, assignmentId: assignment.id, kind: "weekly" });
    expect(next.growthReviews).toHaveLength(1);
    next = applyOperation(next, { type: "recordAudienceSnapshot", presenceId: state.presence!.id, followers: 20_100, source: "native", observedAt: new Date(Date.now() + 1_000).toISOString() });
    next = applyOperation(next, { type: "reviewGrowth", presenceId: state.presence!.id, assignmentId: assignment.id, kind: "weekly" });
    expect(next.growthReviews).toHaveLength(2);
    expect(next.growthReviews[0]?.evidenceIds).toContain(next.audienceSnapshots[0]?.id);
  });

  it("collapses unchanged polling bursts but preserves later cadence and real changes", () => {
    const state = fixture();
    const presenceId = state.presence!.id;
    let next = applyOperation(state, { type: "recordAudienceSnapshot", presenceId, followers: 3, following: 3, source: "native", observedAt: "2026-08-17T14:29:05.000Z" });
    next = applyOperation(next, { type: "recordAudienceSnapshot", presenceId, followers: 3, following: 3, source: "native", observedAt: "2026-08-17T14:29:26.000Z" });
    next = applyOperation(next, { type: "recordAudienceSnapshot", presenceId, followers: 3, following: 3, source: "native", observedAt: "2026-08-17T14:30:27.000Z" });
    expect(next.audienceSnapshots).toHaveLength(1);
    next = applyOperation(next, { type: "recordAudienceSnapshot", presenceId, followers: 3, following: 3, source: "native", observedAt: "2026-08-17T14:31:10.000Z" });
    expect(next.audienceSnapshots).toHaveLength(2);
    next = applyOperation(next, { type: "recordAudienceSnapshot", presenceId, followers: 4, following: 3, source: "native", observedAt: "2026-08-17T14:31:20.000Z" });
    expect(next.audienceSnapshots).toHaveLength(3);
    expect(collapseAudienceSnapshots(next.audienceSnapshots)).toHaveLength(3);
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
        hypothesisActions: [{ action: "create", statement: "Direct builder replies may create stronger qualified conversations.", scope: "presence", patternIds: ["social.x.v1.useful-disagreement"], confidence: "low" }],
      },
    });
    expect(next.growthReviews[0]).toMatchObject({ reviewSource: "model", changedPlan: true, planChangeSummary: "Replies are the strongest observed signal." });
    expect(next.assignments[0].planHistory).toHaveLength(2);
    expect(next.assignments[0].plan?.summary).toBe("Reply-led discovery");
    expect(next.files.find((file) => file.kind === "GROWTH")?.content).toContain("Reply-led discovery");
    expect(next.growthFileVersions).toHaveLength(2);
    expect(next.growthFileVersions[0]).toMatchObject({ version: 2, previousVersion: 1, reviewId: next.growthReviews[0]?.id, reviewSource: "model" });
    expect(next.operatorConversations?.flatMap((conversation) => conversation.messages).some((message) => message.agentInitiated?.kind === "strategy_change" && message.milestone === "decision")).toBe(true);
    expect(Object.fromEntries(next.files.filter((file) => ["SOUL", "MISSION", "TASTE", "BRAIN"].includes(file.kind)).map((file) => [file.kind, file.content]))).toEqual(beforeIdentity);
  });

  it("uses a median comparable baseline and exposes low confidence with sparse evidence", () => {
    const state = fixture();
    const presenceId = state.presence!.id;
    const presence = { ...state.presence!, createdAt: "2026-08-14T00:00:00.000Z" };
    state.presence = presence;
    state.presences = [presence];
    const makeMirror = (id: string): MirrorObject => ({ id, bridgeId: "native:test", presenceId, channelId: "x", externalRef: { type: "x.post", id }, objectType: "post", author: { displayName: "Genny", handle: "genny" }, content: { text: id }, observedAt: "2026-08-16T00:00:00.000Z", occurredAt: "2026-08-15T23:00:00.000Z", visibility: "public", shareability: "presence-only", environment: "live", source: "native", trust: "untrusted_world_content" });
    let next = { ...state, mirrorObjects: [makeMirror("a"), makeMirror("b"), makeMirror("c")] };
    next = applyOperation(next, { type: "recordPublicationMetricSnapshot", presenceId, mirrorObjectId: "a", publicationAgeSeconds: 3600, metrics: { impressions: 100 }, source: "native" });
    next = applyOperation(next, { type: "recordPublicationMetricSnapshot", presenceId, mirrorObjectId: "b", publicationAgeSeconds: 3600, metrics: { impressions: 300 }, source: "native" });
    next = applyOperation(next, { type: "recordPublicationMetricSnapshot", presenceId, mirrorObjectId: "c", publicationAgeSeconds: 3600, metrics: { impressions: 200 }, source: "native" });
    const latest = next.publicationMetricSnapshots[0];
    expect(publicationMetricBaseline(next, latest).comparableCount).toBe(2);
    expect(audienceDeltas(next, presenceId).current).toBeUndefined();
  });

  it("records a publication-metric batch without dropping measurements or events", () => {
    const state = fixture();
    const presenceId = state.presence!.id;
    const presence = { ...state.presence!, createdAt: "2026-08-14T00:00:00.000Z" };
    const mirrors: MirrorObject[] = Array.from({ length: 100 }, (_, index) => ({ id: `metric-${index}`, bridgeId: "native:test", presenceId, channelId: "x", externalRef: { type: "x.post", id: `post-${index}` }, objectType: "post", author: { displayName: "Genny", handle: "genny" }, content: { text: `post-${index}` }, observedAt: "2026-08-16T00:00:00.000Z", occurredAt: "2026-08-15T23:00:00.000Z", visibility: "public", shareability: "presence-only", environment: "live", source: "native", trust: "untrusted_world_content" }));
    const next = recordPublicationMetricSnapshots({ ...state, presence, presences: [presence], mirrorObjects: mirrors }, mirrors.map((mirror) => ({ type: "recordPublicationMetricSnapshot" as const, presenceId, mirrorObjectId: mirror.id, publicationAgeSeconds: 3600, metrics: { impressions: 100 }, source: "native" as const })));
    expect(next.publicationMetricSnapshots).toHaveLength(100);
    expect(next.events.filter((event) => event.title === "Publication performance observed")).toHaveLength(100);
  });

  it("does not baseline a pre-Presence publication just because its metric was collected later", () => {
    const state = fixture();
    const presenceId = state.presence!.id;
    const presence = { ...state.presence!, createdAt: "2026-08-20T00:00:00.000Z" };
    state.presence = presence;
    state.presences = [presence];
    const makeMirror = (id: string): MirrorObject => ({ id, bridgeId: "native:test", presenceId, channelId: "x", externalRef: { type: "x.post", id }, objectType: "post", author: { displayName: "Genny", handle: "genny" }, content: { text: id }, observedAt: "2026-08-19T23:00:00.000Z", occurredAt: "2026-08-19T22:00:00.000Z", visibility: "public", shareability: "presence-only", environment: "live", source: "native", trust: "untrusted_world_content" });
    let next = { ...state, mirrorObjects: [makeMirror("a"), makeMirror("b"), makeMirror("c")] };
    next = applyOperation(next, { type: "recordPublicationMetricSnapshot", presenceId, mirrorObjectId: "a", publicationAgeSeconds: 3600, metrics: { impressions: 100 }, source: "native" });
    next = applyOperation(next, { type: "recordPublicationMetricSnapshot", presenceId, mirrorObjectId: "b", publicationAgeSeconds: 3600, metrics: { impressions: 300 }, source: "native" });
    next = applyOperation(next, { type: "recordPublicationMetricSnapshot", presenceId, mirrorObjectId: "c", publicationAgeSeconds: 3600, metrics: { impressions: 200 }, source: "native" });

    expect(publicationMetricBaseline(next, next.publicationMetricSnapshots[0]).comparableCount).toBe(0);
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
    const next = { ...state, bridges: [{ id: "bridge-x", presenceId, channelId: "x", name: "X Browser Bridge", kind: "bridge" as const, state: "online" as const, adapterStatus: "connected" as const, lastHeartbeatAt: heartbeat, accountIdentity: { username: "genny", status: "verified" as const, observedAt: heartbeat }, browserAdapters: verifiedBrowserAdapters({ username: "genny", status: "verified" as const, observedAt: heartbeat }), capabilities: { inbound: true, reconcile: true, affordances: ["post", "reply", "like", "repost", "quote", "follow"], formats: ["x.post", "x.media-post", "x.reply"], metrics: ["followers", "public_metrics"], assetKinds: ["image", "video"] as ("image" | "video")[] }, createdAt: heartbeat, updatedAt: heartbeat }] };
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

  it("prefers native capabilities when both API and Browser Bridge routes exist", () => {
    const state = fixture();
    const bridgePresence = { ...state.presence!, connectionMode: "bridge" as const };
    const next = { ...state, presence: bridgePresence, presences: [bridgePresence], nativeConnections: [{ id: "native-x", presenceId: bridgePresence.id, channelId: "x", kind: "x" as const, status: "connected" as const, access: "read-write" as const, account: { id: "account-1", username: "genny", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] };
    const post = derivePresenceCapabilityManifest(next, bridgePresence.id).items.find((item) => item.capability === "post");
    expect(post).toMatchObject({ availability: "available", provider: "Native X", canExecute: true, requiresBrowser: false });
  });

  it("projects the connected Browser Bridge when Native X is readable but creditless", () => {
    const state = fixture();
    const presence = { ...state.presence!, connectionMode: "native" as const };
    const now = new Date().toISOString();
    const next = {
      ...state,
      presence,
      presences: [presence],
      nativeConnections: [{ id: "native-x", presenceId: presence.id, channelId: "x" as const, kind: "x" as const, status: "connected" as const, access: "read-write" as const, deliveryError: "X has no API credits remaining for this app.", account: { id: "account-1", username: "genny", name: "Genny" }, createdAt: now, updatedAt: now }],
      bridges: [{ id: "bridge-x", presenceId: presence.id, channelId: "x" as const, name: "OpenPresence Chrome", kind: "bridge" as const, state: "online" as const, adapterStatus: "connected" as const, lastHeartbeatAt: now, accountIdentity: { username: "genny", status: "verified" as const, observedAt: now }, browserAdapters: verifiedBrowserAdapters({ username: "genny", status: "verified" as const, observedAt: now }), capabilities: { inbound: true, reconcile: true, affordances: ["post", "reply", "like", "repost", "quote", "follow"], formats: ["x.post", "x.reply", "x.like", "x.repost", "x.quote", "x.follow"], metrics: ["followers", "public_metrics"] }, createdAt: now, updatedAt: now }],
    };
    const manifest = derivePresenceCapabilityManifest(next, presence.id);
    for (const capability of ["post", "repost", "quote", "follow"]) {
      expect(manifest.items.find((item) => item.capability === capability)).toMatchObject({ availability: "available", provider: "Browser Bridge", canExecute: true, requiresBrowser: true });
    }
  });

  it("projects the connected Browser Bridge when the Native API credentials are expired", () => {
    const state = fixture();
    const presence = { ...state.presence!, connectionMode: "native" as const };
    const now = new Date().toISOString();
    const next = {
      ...state,
      presence,
      presences: [presence],
      nativeConnections: [{ id: "native-x", presenceId: presence.id, channelId: "x" as const, kind: "x" as const, status: "needs-attention" as const, access: "read-write" as const, deliveryError: "X rejected these credentials. The access token has expired.", account: { id: "account-1", username: "genny", name: "Genny" }, createdAt: now, updatedAt: now }],
      bridges: [{ id: "bridge-x", presenceId: presence.id, channelId: "x" as const, name: "OpenPresence Chrome", kind: "bridge" as const, state: "online" as const, adapterStatus: "connected" as const, lastHeartbeatAt: now, accountIdentity: { username: "genny", status: "verified" as const, observedAt: now }, browserAdapters: verifiedBrowserAdapters({ username: "genny", status: "verified" as const, observedAt: now }), capabilities: { inbound: true, reconcile: true, affordances: ["post", "reply", "like", "repost", "quote", "follow"], formats: ["x.post", "x.reply", "x.like", "x.repost", "x.quote", "x.follow"], metrics: ["followers", "public_metrics"] }, createdAt: now, updatedAt: now }],
    };
    expect(derivePresenceCapabilityManifest(next, presence.id).items.find((item) => item.capability === "post")).toMatchObject({ availability: "available", provider: "Browser Bridge", canExecute: true, requiresBrowser: true });
  });

  it("forms new X actions on the browser body while the native credentials are expired", () => {
    const state = fixture();
    const presence = { ...state.presence!, browserAccess: { enabled: true }, connectionMode: "native" as const, execution: { ...state.presence!.execution, like: "auto" as const } };
    const now = new Date().toISOString();
    const next = formXActionIntent({
      ...state,
      presence,
      presences: [presence],
      nativeConnections: [{ id: "native-x", presenceId: presence.id, channelId: "x" as const, kind: "x" as const, status: "needs-attention" as const, access: "read-write" as const, deliveryError: "X rejected these credentials. The access token has expired.", account: { id: "account-1", username: "genny", name: "Genny" }, createdAt: now, updatedAt: now }],
      bridges: [{ id: "bridge-x", presenceId: presence.id, channelId: "x" as const, name: "OpenPresence Chrome", kind: "bridge" as const, state: "online" as const, adapterStatus: "connected" as const, lastHeartbeatAt: now, accountIdentity: { username: "genny", status: "verified" as const, observedAt: now }, browserAdapters: verifiedBrowserAdapters({ username: "genny", status: "verified" as const, observedAt: now }), capabilities: { inbound: true, reconcile: true, affordances: ["like"], formats: ["x.like"], metrics: [] }, createdAt: now, updatedAt: now }],
    }, { affordance: "x.like", target: { type: "x.post", id: "post-1" } });
    expect(next.executions[0]).toMatchObject({ connector: "bridge", bridgeId: "bridge-x", status: "queued" });
  });

  it("projects a learned quote fallback through the actual verified browser route", () => {
    const state = fixture();
    const now = new Date().toISOString();
    const presence = { ...state.presence!, browserAccess: { enabled: true, learnedFallbacks: [{ action: "x.quote", reason: "Native X rejected quote access.", learnedAt: now }] } };
    const bridge = { id: "bridge-x", presenceId: presence.id, channelId: "x" as const, name: "OpenPresence Chrome", kind: "bridge" as const, state: "online" as const, adapterStatus: "connected" as const, lastHeartbeatAt: now, accountIdentity: { username: "genny", status: "verified" as const, observedAt: now }, browserAdapters: verifiedBrowserAdapters({ username: "genny", status: "verified" as const, observedAt: now }), capabilities: { inbound: true, reconcile: true, affordances: ["quote"], formats: ["x.quote"], metrics: [] }, createdAt: now, updatedAt: now };
    const native = { id: "native-x", presenceId: presence.id, channelId: "x" as const, kind: "x" as const, status: "connected" as const, access: "read-write" as const, account: { id: "account-1", username: "genny", name: "Genny" }, createdAt: now, updatedAt: now };
    const manifest = derivePresenceCapabilityManifest({ ...state, presence, presences: [presence], bridges: [bridge], nativeConnections: [native] }, presence.id);
    expect(manifest.items.find((item) => item.capability === "quote")).toMatchObject({ availability: "available", provider: "Browser Bridge", requiresBrowser: true, canExecute: true });
  });

  it("keeps the browser hold until an explicit connection check re-arms Native X", () => {
    const state = fixture();
    const now = new Date().toISOString();
    const presence = { ...state.presence!, browserAccess: { enabled: true, learnedFallbacks: [{ action: "x.quote", reason: "X API credits are exhausted; the authorized Chrome Bridge is the continuity route.", learnedAt: now }] } };
    const native = { id: "native-x", presenceId: presence.id, channelId: "x" as const, kind: "x" as const, status: "connected" as const, access: "read-write" as const, account: { id: "account-1", username: "genny", name: "Genny" }, createdAt: now, updatedAt: now };
    const heldState = { ...state, presence, presences: [presence], bridges: [], nativeConnections: [native] };
    expect(derivePresenceCapabilityManifest(heldState, presence.id).items.find((item) => item.capability === "quote")).toMatchObject({ availability: "unavailable", canExecute: false });
    const rearmed = clearNativeBrowserContinuityHold(heldState, presence.id);
    expect(derivePresenceCapabilityManifest(rearmed, presence.id).items.find((item) => item.capability === "quote")).toMatchObject({ availability: "available", provider: "Native X", requiresBrowser: false, canExecute: true });
  });

  it("withholds learned quote fallback from cognition until browser identity is verified", () => {
    const state = fixture();
    const now = new Date().toISOString();
    const presence = { ...state.presence!, browserAccess: { enabled: true, learnedFallbacks: [{ action: "x.quote", reason: "Native X rejected quote access.", learnedAt: now }] } };
    const bridge = { id: "bridge-x", presenceId: presence.id, channelId: "x" as const, name: "OpenPresence Chrome", kind: "bridge" as const, state: "online" as const, adapterStatus: "connected" as const, lastHeartbeatAt: now, capabilities: { inbound: true, reconcile: true, affordances: ["quote"], formats: ["x.quote"], metrics: [] }, createdAt: now, updatedAt: now };
    const native = { id: "native-x", presenceId: presence.id, channelId: "x" as const, kind: "x" as const, status: "connected" as const, access: "read-write" as const, account: { id: "account-1", username: "genny", name: "Genny" }, createdAt: now, updatedAt: now };
    const manifest = derivePresenceCapabilityManifest({ ...state, presence, presences: [presence], bridges: [bridge], nativeConnections: [native] }, presence.id);
    expect(manifest.items.find((item) => item.capability === "quote")).toMatchObject({ availability: "temporarily-unavailable", canExecute: false });
  });

  it("routes recurring Native Growth through self-directed attention only for the verified Presence account", () => {
    const state = fixture();
    const presence = { ...state.presence!, browserAccess: { enabled: true }, connectionMode: "native" as const, selfDirectedAttention: { ...state.presence!.selfDirectedAttention!, enabled: true } };
    const now = new Date().toISOString();
    const next = {
      ...state,
      presence,
      presences: [presence],
      bridges: [{ id: "bridge-x", presenceId: presence.id, channelId: "x" as const, name: "OpenPresence Chrome", kind: "bridge" as const, state: "online" as const, adapterStatus: "connected" as const, lastHeartbeatAt: now, accountIdentity: { username: "genny", status: "verified" as const, observedAt: now }, browserAdapters: verifiedBrowserAdapters({ username: "genny", status: "verified" as const, observedAt: now }), capabilities: { inbound: true, reconcile: true, affordances: ["post", "quote", "repost", "follow"], formats: ["x.post", "x.quote", "x.repost", "x.follow"], metrics: [] }, createdAt: now, updatedAt: now }],
    };
    expect(recurringAttentionOperation(next, presence)).toMatchObject({ type: "runAttentionWorker", presenceId: presence.id, scheduled: true });
    const wrongAccount = { ...next, bridges: next.bridges.map((bridge) => ({ ...bridge, accountIdentity: { ...bridge.accountIdentity!, username: "someone_else" }, browserAdapters: verifiedBrowserAdapters({ ...bridge.accountIdentity!, username: "someone_else" }) })) };
    expect(recurringAttentionOperation(wrongAccount, presence)).toMatchObject({ type: "runPulse", presenceId: presence.id, scheduled: true });
  });

  it("keeps Native Pulse for a readable Presence without a connected Chrome body", () => {
    const state = fixture();
    const presence = { ...state.presence!, connectionMode: "native" as const, selfDirectedAttention: { ...state.presence!.selfDirectedAttention!, enabled: true } };
    expect(recurringAttentionOperation({ ...state, presence, presences: [presence], bridges: [] }, presence)).toMatchObject({ type: "runPulse", presenceId: presence.id, scheduled: true });
  });

  it("turns fresh Bridge observations into bounded discovery leads without judging them", () => {
    const state = fixture();
    const presenceId = state.presence!.id;
    const now = Date.parse("2026-08-21T05:00:00.000Z");
    const mirror = (id: string, observedAt: string, text: string, actorPresenceId?: string): MirrorObject => ({ id: `mirror-${id}`, bridgeId: "bridge-x", presenceId, channelId: "x", externalRef: { type: "x.post", id }, objectType: "post", author: { displayName: "Builder", handle: "builder" }, content: { text }, observedAt, occurredAt: observedAt, visibility: "public", shareability: "presence-only", environment: "live", actorPresenceId });
    const candidates = selectBridgeDiscoveryCandidates([
      mirror("fresh", "2026-08-21T04:59:00.000Z", "A concrete AI systems result."),
      { ...mirror("legacy", "2026-08-21T04:58:30.000Z", "A fresh observation from the readable Native source."), bridgeId: `native:${presenceId}` },
      mirror("old", "2026-08-20T20:00:00.000Z", "Too old for this attention slice."),
      mirror("judged", "2026-08-21T04:58:00.000Z", "Already considered."),
      mirror("self", "2026-08-21T04:57:00.000Z", "Own post.", presenceId),
    ], { bridgeId: "bridge-x", legacyBridgeIds: [`native:${presenceId}`], presenceId, judgedIds: ["judged"], now, isEligible: () => true, limit: 10 });
    expect(candidates).toEqual([
      { id: "fresh", authorName: "Builder", text: "A concrete AI systems result." },
      { id: "legacy", authorName: "Builder", text: "A fresh observation from the readable Native source." },
    ]);
  });

  it("keeps API evidence primary when one native delivery is rejected", () => {
    const state = fixture();
    const presence = { ...state.presence!, connectionMode: "bridge" as const };
    const now = new Date().toISOString();
    const next = {
      ...state,
      presence,
      presences: [presence],
      nativeConnections: [{ id: "native-x", presenceId: presence.id, channelId: "x" as const, kind: "x" as const, status: "connected" as const, access: "read-write" as const, deliveryError: "X rejected this action: You are not permitted to perform this action.", observation: { status: "up-to-date" as const, lastObservedAt: now }, account: { id: "account-1", username: "genny", name: "Genny" }, createdAt: now, updatedAt: now }],
      bridges: [{ id: "bridge-x", presenceId: presence.id, channelId: "x" as const, name: "OpenPresence Chrome", kind: "bridge" as const, state: "online" as const, adapterStatus: "connected" as const, lastHeartbeatAt: now, capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: ["followers", "public_metrics"] }, createdAt: now, updatedAt: now }],
    };
    const manifest = derivePresenceCapabilityManifest(next, presence.id);
    expect(manifest.items.find((item) => item.capability === "follower_measurement")).toMatchObject({ availability: "available", provider: "Native X", requiresBrowser: false });
    expect(manifest.items.find((item) => item.capability === "post_performance")).toMatchObject({ availability: "available", provider: "Native X", requiresBrowser: false });
    expect(manifest.items.find((item) => item.capability === "reply")).toMatchObject({ availability: "available", provider: "Native X", requiresBrowser: false });
    expect(manifest.items.find((item) => item.capability === "post")).toMatchObject({ availability: "available", provider: "Native X", canExecute: true });
    expect(capabilityProviderLabel(next, presence.id, manifest.items.find((item) => item.capability === "post")!)).toBe("Native X");
    expect(manifest.items.find((item) => item.capability === "message")).toMatchObject({ provider: "Native X", limitation: expect.stringContaining("does not currently expose") });
    expect(capabilityProviderLabel(next, presence.id, manifest.items.find((item) => item.capability === "message")!)).toBe("Native X · not supported");
  });

  it("routes an X reply through the API when the Presence also has a Bridge", () => {
    const state = fixture();
    state.presence = { ...state.presence!, connectionMode: "bridge", execution: { ...state.presence!.execution, reply: "auto" } };
    state.presences = [state.presence];
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "genny", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state.bridges = [{ id: "bridge-x", presenceId: state.presence.id, channelId: "x", name: "OpenPresence Chrome", kind: "bridge", state: "online", adapterStatus: "connected", lastHeartbeatAt: new Date().toISOString(), capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    const next = formXReplyIntent(state, "A direct API reply.", "post-1");
    expect(next.executions[0]).toMatchObject({ connector: "native", bridgeId: undefined, status: "queued" });
  });

  it("uses the Chrome fallback only for a reply to an observed post without a mention", () => {
    const state = fixture();
    const presence = { ...state.presence!, environment: "live" as const, browserAccess: { enabled: true }, connectionMode: "native" as const, execution: { ...state.presence!.execution, reply: "auto" as const } };
    const now = new Date().toISOString();
    const next = {
      ...state,
      presence,
      presences: [presence],
      nativeConnections: [{ id: "native-x", presenceId: presence.id, channelId: "x" as const, kind: "x" as const, status: "connected" as const, access: "read-write" as const, account: { id: "account-1", username: "genny", name: "Genny" }, createdAt: now, updatedAt: now }],
      bridges: [{ id: "bridge-x", presenceId: presence.id, channelId: "x" as const, name: "OpenPresence Chrome", kind: "bridge" as const, state: "online" as const, adapterStatus: "connected" as const, lastHeartbeatAt: now, accountIdentity: { username: "genny", status: "verified" as const, observedAt: now }, browserAdapters: verifiedBrowserAdapters({ username: "genny", status: "verified" as const, observedAt: now }), capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: [] }, createdAt: now, updatedAt: now }],
      mirrorObjects: [{ id: "observed-post", bridgeId: "native-x", presenceId: presence.id, channelId: "x" as const, externalRef: { type: "x.post" as const, id: "post-unmentioned" }, objectType: "post", content: { text: "A useful public post without a mention." }, observedAt: now, visibility: "public" as const, shareability: "presence-only" as const, environment: "live" as const }],
    };
    const reply = formXReplyIntent(next, "A grounded reply through the browser fallback.", "post-unmentioned");
    expect(reply.executions[0]).toMatchObject({ connector: "bridge", bridgeId: "bridge-x", status: "queued" });
  });

  it("rebinds normal pending Bridge work to Native X without stealing the non-mention fallback", () => {
    const state = fixture();
    const now = new Date().toISOString();
    const bridgePresence = { ...state.presence!, environment: "live" as const, browserAccess: { enabled: true }, connectionMode: "bridge" as const, execution: { ...state.presence!.execution, post: "auto" as const, reply: "auto" as const } };
    let pending: OpenPresenceState = {
      ...state,
      presence: bridgePresence,
      presences: [bridgePresence],
      bridges: [{ id: "bridge-x", presenceId: bridgePresence.id, channelId: "x" as const, name: "OpenPresence Chrome", kind: "bridge" as const, state: "online" as const, adapterStatus: "connected" as const, lastHeartbeatAt: now, accountIdentity: { username: "genny", status: "verified" as const, observedAt: now }, browserAdapters: verifiedBrowserAdapters({ username: "genny", status: "verified" as const, observedAt: now }), capabilities: { inbound: true, reconcile: true, affordances: ["post", "reply"], formats: ["x.post", "x.reply"], metrics: [] }, createdAt: now, updatedAt: now }],
      mirrorObjects: [
        { id: "mentioned-post", bridgeId: "bridge-x", presenceId: bridgePresence.id, channelId: "x" as const, externalRef: { type: "x.post" as const, id: "mentioned-post" }, objectType: "post", content: { text: "@example_agent a useful public post." }, observedAt: now, visibility: "public" as const, shareability: "presence-only" as const, environment: "live" as const },
        { id: "unmentioned-post", bridgeId: "bridge-x", presenceId: bridgePresence.id, channelId: "x" as const, externalRef: { type: "x.post" as const, id: "unmentioned-post" }, objectType: "post", content: { text: "A useful public post without a mention." }, observedAt: now, visibility: "public" as const, shareability: "presence-only" as const, environment: "live" as const },
      ],
    };
    pending = formXReplyIntent(pending, "A reply to the mentioned post.", "mentioned-post");
    const fallback = formXReplyIntent(pending, "A reply through the browser fallback.", "unmentioned-post");
    pending = { ...fallback, nativeConnections: [{ id: "native-x", presenceId: bridgePresence.id, channelId: "x" as const, kind: "x" as const, status: "connected" as const, access: "read-write" as const, account: { id: "account-1", username: "genny", name: "Genny" }, createdAt: now, updatedAt: now }] };
    const rebound = applyOperation(pending, { type: "setPresence", patch: { connectionMode: "native" } });
    const mentioned = rebound.executions.find((execution) => execution.target?.id === "mentioned-post");
    const unmentioned = rebound.executions.find((execution) => execution.target?.id === "unmentioned-post");
    expect(mentioned).toMatchObject({ connector: "native", bridgeId: undefined });
    expect(unmentioned).toMatchObject({ connector: "bridge", bridgeId: "bridge-x" });

    const alreadyNativeButBlocked: OpenPresenceState = {
      ...rebound,
      executions: rebound.executions.map((execution) => execution.target?.id === "mentioned-post"
        ? { ...execution, connector: "native" as const, bridgeId: undefined, status: "awaiting-connector" as const }
        : execution),
    };
    const recovered = applyOperation(alreadyNativeButBlocked, { type: "setPresence", patch: { connectionMode: "native" } });
    expect(recovered.executions.find((execution) => execution.target?.id === "mentioned-post"))
      .toMatchObject({ connector: "native", bridgeId: undefined, status: "queued" });
  });

  it.each([
    ["like", "x.like"],
    ["repost", "x.repost"],
    ["quote", "x.quote"],
  ] as const)("routes an X %s through the API when the Presence also has a Bridge", (_label, affordance) => {
    const state = fixture();
    state.presence = { ...state.presence!, connectionMode: "bridge", execution: { ...state.presence!.execution, [affordance.slice(2)]: "auto" } };
    state.presences = [state.presence];
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "genny", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state.bridges = [{ id: "bridge-x", presenceId: state.presence.id, channelId: "x", name: "OpenPresence Chrome", kind: "bridge", state: "online", adapterStatus: "connected", lastHeartbeatAt: new Date().toISOString(), capabilities: { inbound: true, reconcile: true, affordances: ["like", "repost", "quote"], formats: ["x.like", "x.repost", "x.quote"], metrics: [] }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    const next = formXActionIntent(state, { affordance, target: { type: "x.post", id: "post-1" }, ...(affordance === "x.quote" ? { text: "A direct API quote." } : {}) });
    expect(next.executions[0]).toMatchObject({ affordance, connector: "native", bridgeId: undefined, status: "queued" });
  });

  it("does not treat a stale Bridge adapter flag as a live body", () => {
    const state = fixture();
    const heartbeat = new Date(Date.now() - 5 * 60_000).toISOString();
    const bridgePresence = { ...state.presence!, connectionMode: "bridge" as const };
    const next = { ...state, presence: bridgePresence, presences: [bridgePresence], bridges: [{ id: "bridge-stale", presenceId: bridgePresence.id, channelId: "x", name: "Stale Bridge", kind: "bridge" as const, state: "online" as const, adapterStatus: "connected" as const, lastHeartbeatAt: heartbeat, capabilities: { inbound: true, reconcile: true, affordances: ["post"], formats: ["x.post"], metrics: [] }, createdAt: heartbeat, updatedAt: heartbeat }] };
    expect(derivePresenceCapabilityManifest(next, bridgePresence.id).items.find((item) => item.capability === "post")).toMatchObject({ availability: "temporarily-unavailable", canExecute: false });
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
    const asset = { id: "asset-chart", retention: "preserved" as const, reusePermission: "ready_to_use" as const, agentId: state.agent!.id, presenceId: state.presence!.id, type: "image" as const, mediaKind: "image" as const, status: "ready" as const, storage: { storeKey: "chart.png", mimeType: "image/png", byteSize: 4, exactHash: "hash" }, provenance: { origin: "discovered", sourceUrl: "https://example.com/chart.png", importedAt: new Date().toISOString() }, environment: "live" as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const withAsset = { ...state, assets: [asset] };
    const published = formChatPostIntent(withAsset, "A grounded media-backed point of view.", undefined, "agent", [asset.id]);
    expect(published.publications[0]).toMatchObject({ format: "x.media-post", assetIds: [asset.id] });
    expect(published.publications[0]?.publicExpression?.mediaIds).toEqual([asset.id]);
  });

  it("carries ready media through live reply and quote envelopes", () => {
    const state = fixture();
    const asset = { id: "asset-reply", retention: "preserved" as const, reusePermission: "ready_to_use" as const, agentId: state.agent!.id, presenceId: state.presence!.id, type: "image" as const, mediaKind: "image" as const, status: "ready" as const, storage: { storeKey: "reply.png", mimeType: "image/png", byteSize: 4, exactHash: "hash-reply" }, provenance: { origin: "discovered", sourceUrl: "https://example.com/reply.png", importedAt: new Date().toISOString() }, environment: "live" as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const withAsset = { ...state, assets: [asset] };
    const reply = formXReplyIntent(withAsset, "A grounded reply with evidence.", "post-1", undefined, undefined, [asset.id]);
    expect(reply.publications[0]).toMatchObject({ format: "x.media-post", assetIds: [asset.id] });
    const quote = formXActionIntent(withAsset, { affordance: "x.quote", target: { type: "x.post", id: "post-1" }, text: "A grounded quote with evidence.", assetIds: [asset.id] });
    expect(quote.publications[0]).toMatchObject({ format: "x.media-post", assetIds: [asset.id] });
  });

  it("keeps unavailable capabilities visible without creating Agent Requests", () => {
    const state = fixture();
    const next = applyOperation(state, { type: "createAssignment", presenceId: state.presence!.id, environment: "live", instruction: "Grow this Presence toward 100,000 followers while building an audience of AI founders." });
    expect(next.agentRequests.filter((item) => item.kind === "capability")).toHaveLength(0);
    expect(derivePresenceCapabilityManifest(next, state.presence!.id).items.find((item) => item.capability === "follower_measurement")).toMatchObject({ availability: "unavailable" });
  });
});
