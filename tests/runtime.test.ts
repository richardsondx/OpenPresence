import { describe, expect, it } from "vitest";
import { addSandboxEvent, applyOperation, assignmentIsOpen, assignmentIsSatisfied, cleanSandboxDraft, cleanUserFacingAssignmentInstruction, compileAssignmentInstruction, compilePresenceContext, compileWatch, completeNativeExecution, createAgent, deliverSandboxExecution, defaultPublishingInitiative, defaultSelfDirectedAttentionPolicy, deriveActivitySummary, derivePresenceCapabilityManifest, derivePublicHistory, derivePublishingProgress, deriveSelfDirectedDiscoveryPlan, failNativeExecution, formAssignmentPostIntent, formChatPostIntent, formSandboxIntent, formXDeleteIntent, formXReplyIntent, formXActionIntent, identityLeakageReason, inferExplicitDurableContext, inferPresenceIdentityChange, initialState, isActivityDecisionEvent, isExplicitGhostModeRequest, isExplicitXPostRequest, isMentionRestrictedError, isTeachProposalConfirmation, markInboundJudged, markNativeConnectionNeedsAttention, normalizePresenceBoundaryValues, normalizeState, publicHistoryMatchesPresence, publicSelfGuidance, recordAttentionTestDecision, recordNativeMirror, recordNativeObservation, recordPublicFooting, recordPublicRequestsFromMirrors, recordResourceUsageEvent, recordSocialDecision, recordStandingIntentNoOp, recordVerifiedChromeReply, recordVerifiedXReply, recordWatchSignals, relationshipPolicyFromWatchPurpose, rerouteExecutionToBridge, startAttentionTest, startPlaygroundSession, stateForContext, xQuoteTargetHasAvailableRoute } from "../lib/runtime";
import { expireQueuedDeliveryWindows } from "../lib/temporal";
import { acknowledgeExecution, claimExecutions, createBridgeWithKey, heartbeatBridge, ingestEvents, removeBridge, reportBridgeIdentity, revokeBridge } from "../lib/bridge";
import { readBridgeById, readBridgeCredentialMetadata, readState, readStateVersion, writeState } from "../lib/db";
import { nextObservationAt } from "../lib/native-x";

// A verified account alone does not prove the current Chrome adapter can act.
function verifiedBrowserAdapters(accountIdentity: import("../lib/types").Bridge["accountIdentity"]) {
  return [{ executorId: "openpresence-chrome-test", version: "1.0.0", protocolVersion: 2, probed: true,
    observedAt: accountIdentity!.observedAt,
    accountIdentity,
    capabilities: { channelRead: true, mediaUpload: true, verification: true,
      affordances: ["post", "reply", "quote", "repost", "like", "follow", "delete"] },
  }];
}

const input = { name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent" as const, handle: "@jenny_ai", accent: "#D68754" };

describe("Fresh Presence authority", () => {
  it("starts public posting in Review and keeps existing explicit choices", () => {
    const fresh = createAgent(input);
    expect(fresh.presence?.execution.post).toBe("review");

    const existingChoice = applyOperation(fresh, { type: "setPresence", patch: { execution: { post: "auto" } } });
    expect(existingChoice.presence?.execution.post).toBe("auto");

    const missingExecution = { ...fresh, presence: { ...fresh.presence!, execution: {} } };
    expect(normalizeState(missingExecution).presence?.execution.post).toBe("review");
  });
});

describe("Presence-owned X deletion", () => {
  const ownPost = (state: ReturnType<typeof createAgent>, id = "own-post-1", parentId?: string) => recordNativeMirror(state, {
    connectionId: "native-delete-test",
    presenceId: state.presence!.id,
    own: true,
    post: { id, text: parentId ? "@source A correction reply." : "A duplicate post.", authorId: "presence-account", authorUsername: "jenny_ai", authorName: "Jenny", parentId },
  });

  it("adds the capability and defaults new and migrated X Presences to Review", () => {
    const fresh = createAgent(input);
    expect(fresh.presence?.capabilities.some((capability) => capability.id === "delete")).toBe(true);
    expect(fresh.presence?.execution.delete).toBe("review");

    const legacy = createAgent(input);
    legacy.presence!.capabilities = legacy.presence!.capabilities.filter((capability) => capability.id !== "delete");
    delete legacy.presence!.execution.delete;
    const migrated = normalizeState(legacy);
    expect(migrated.presence?.capabilities.some((capability) => capability.id === "delete")).toBe(true);
    expect(migrated.presence?.execution.delete).toBe("review");
  });

  it("forms a reviewable deletion only for the Presence's own live post or reply", () => {
    let state = ownPost(createAgent(input));
    const presenceId = state.presence!.id;
    state = formXDeleteIntent(state, { presenceId, target: { type: "x.post", id: "own-post-1" }, source: "agent" });
    expect(state.executions[0]).toMatchObject({ affordance: "x.delete", mode: "review", status: "awaiting-review", target: { type: "x.post", id: "own-post-1" } });
    expect(state.actions[0]).toMatchObject({ intent: "delete", status: "review", summary: "Delete post" });
    expect(state.events[0]?.detail).toContain("own X post");

    const replyState = formXDeleteIntent(ownPost(createAgent(input), "own-reply-1", "source-post-1"), { target: { type: "x.post", id: "own-reply-1" } });
    expect(replyState.executions[0]?.reviewReason).toContain("this reply");

    const thirdPartyBase = createAgent(input);
    const thirdParty = recordNativeMirror(thirdPartyBase, {
      connectionId: "native-delete-test",
      presenceId: thirdPartyBase.presence!.id,
      post: { id: "other-post-1", text: "Someone else's post.", authorId: "other-account", authorUsername: "someone_else", authorName: "Someone Else" },
    });
    expect(formXDeleteIntent(thirdParty, { target: { type: "x.post", id: "other-post-1" } }).executions).toHaveLength(0);
  });

  it.each([
    ["off", "skipped", 0],
    ["manual", "awaiting-manual", 1],
    ["review", "awaiting-review", 1],
    ["auto", "awaiting-connector", 1],
  ] as const)("honors the %s delete execution mode", (mode, expectedStatus, executionCount) => {
    let state = ownPost(createAgent(input));
    state = applyOperation(state, { type: "setPresence", patch: { execution: { delete: mode } } });
    state = formXDeleteIntent(state, { target: { type: "x.post", id: "own-post-1" } });
    expect(state.executions).toHaveLength(executionCount);
    if (executionCount) expect(state.executions[0]?.status).toBe(expectedStatus);
    else expect(state.actions[0]).toMatchObject({ intent: "delete", status: "skipped" });
  });

  it("routes Auto deletion through Native X and archives the mirror only after completion", () => {
    let state = ownPost(createAgent(input));
    const presence = state.presence!;
    state = applyOperation(state, { type: "setPresence", patch: { execution: { delete: "auto" } } });
    state.nativeConnections.push({ id: "native-delete", agentId: state.agent!.id, presenceId: presence.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { username: presence.handle }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as never);
    state = formXDeleteIntent(state, { target: { type: "x.post", id: "own-post-1" } });
    const execution = state.executions[0]!;
    expect(execution).toMatchObject({ connector: "native", mode: "auto", status: "queued" });

    const completed = completeNativeExecution(state, execution.id, { type: "x.post", id: "own-post-1" });
    expect(completed.executions[0]).toMatchObject({ status: "succeeded", externalRef: { type: "x.post", id: "own-post-1" } });
    expect(completed.mirrorObjects.find((object) => object.externalRef.id === "own-post-1")).toMatchObject({ archived: true });
    expect(completed.mirrorEvents[0]).toMatchObject({ event: "deleted", externalRef: { type: "x.post", id: "own-post-1" } });
    expect(completed.outcomes[0]).toMatchObject({ status: "succeeded" });
  });

  it("keeps Manual deletion scoped to the selected target and preserves history", () => {
    let state = ownPost(createAgent(input));
    state = applyOperation(state, { type: "setPresence", patch: { execution: { delete: "manual" } } });
    state = formXDeleteIntent(state, { target: { type: "x.post", id: "own-post-1" } });
    const execution = state.executions[0]!;
    const rejected = applyOperation(state, { type: "markManualExecution", id: execution.id, externalRef: { type: "x.post", id: "another-post" } });
    expect(rejected.executions[0]?.status).toBe("awaiting-manual");
    const completed = applyOperation(state, { type: "markManualExecution", id: execution.id, externalRef: { type: "x.post", id: "own-post-1" } });
    expect(completed.executions[0]?.status).toBe("succeeded");
    expect(completed.actions[0]).toMatchObject({ status: "executed", outcomeId: expect.any(String) });
    expect(completed.mirrorObjects.find((object) => object.externalRef.id === "own-post-1")).toMatchObject({ archived: true });
  });

  it("does not form a second deletion for the same target", () => {
    let state = ownPost(createAgent(input));
    state = formXDeleteIntent(state, { target: { type: "x.post", id: "own-post-1" } });
    state = formXDeleteIntent(state, { target: { type: "x.post", id: "own-post-1" } });
    expect(state.executions).toHaveLength(1);
    expect(state.socialIntents).toHaveLength(1);
  });
});

describe("Presence Brief boundary normalization", () => {
  it("keeps exclusions while omitting pasted positive guidance from Keep out", () => {
    expect(normalizePresenceBoundaryValues([
      "Avoid generic AI-agent commentary",
      "and engagement bait. Do not hard-sell",
      "or force a GitGlance mention. Ask genuine questions",
      "lead with help",
      "and mention GitGlance only when it naturally solves the person's stated problem.",
    ])).toEqual([
      "Avoid generic AI-agent commentary",
      "engagement bait",
      "Do not hard-sell",
      "force a GitGlance mention",
    ]);
  });

  it("preserves ambiguous boundary fragments and empty lists", () => {
    expect(normalizePresenceBoundaryValues(["No politics", "Make unsupported claims"])).toEqual(["No politics", "Make unsupported claims"]);
    expect(normalizePresenceBoundaryValues([])).toEqual([]);
  });
});

describe("Capability trials", () => {
  it("creates a canonical Assignment without changing the Presence envelope", () => {
    const state = applyOperation(createAgent(input), { type: "createCapabilityTrial", capability: "repost", environment: "live", executionMode: "auto" });
    const trial = state.capabilityTrials[0]!;
    expect(trial).toMatchObject({ capability: "repost", environment: "live", status: "preflight", executionIsolation: { mode: "auto", presenceWide: false } });
    expect(state.assignments.find((item) => item.id === trial.assignmentId)).toMatchObject({ origin: "capability_trial", deliverable: { type: "repost", quantity: 1 }, status: "draft" });
    expect(state.presence?.execution.repost).not.toBe("auto");
  });

  it("retains an operator-selected observed candidate for a bounded live proof", () => {
    const state = applyOperation(createAgent(input), { type: "createCapabilityTrial", capability: "quote", candidateId: "post-observed-1", environment: "live", executionMode: "auto" });
    expect(state.capabilityTrials[0]).toMatchObject({ capability: "quote", candidateId: "post-observed-1" });
  });

  it.each([
    ["like", "like"],
    ["quote", "quote"],
  ] as const)("keeps the %s trial contract aligned with its tested act", (capability, deliverable) => {
    const state = applyOperation(createAgent(input), { type: "createCapabilityTrial", capability, environment: "live", executionMode: "review" });
    const trial = state.capabilityTrials[0]!;
    const assignment = state.assignments.find((item) => item.id === trial.assignmentId)!;
    expect(assignment).toMatchObject({ origin: "capability_trial", deliverable: { type: deliverable, quantity: 1, quantityMode: "exact" } });
    expect(assignment.instruction.toLowerCase()).toContain(capability);
    expect(assignment.preflight?.contract?.successEvidence.toLowerCase()).toContain(capability);
  });

  it("uses a trial-scoped execution overlay and records a verified result", () => {
    let state = applyOperation(createAgent(input), { type: "createCapabilityTrial", capability: "repost", environment: "live", executionMode: "auto" });
    const trial = state.capabilityTrials[0]!;
    trial.status = "active";
    const presence = state.presence!;
    presence.execution.repost = "off";
    state.presences = [presence];
    state.nativeConnections.push({ id: "native-trial", agentId: state.agent!.id, presenceId: presence.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { username: presence.handle }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as never);
    state = formXActionIntent(state, { affordance: "x.repost", target: { type: "x.post", id: "post-trial" }, capabilityTrialId: trial.id, decision: { decision: "repost", summary: "The original stands on its own.", focalMirrorObjectIds: [], origin: { kind: "capability_trial", refId: trial.id }, influences: ["Taste"], confidence: "medium" } });
    const execution = state.executions[0]!;
    expect(execution).toMatchObject({ mode: "auto", capabilityTrialId: trial.id, status: "queued" });
    expect(state.presence?.execution.repost).toBe("off");
    const verified = completeNativeExecution(state, execution.id, { type: "x.repost", id: "repost-trial" });
    expect(verified.capabilityTrials[0]).toMatchObject({ status: "completed", result: "PASS_VERIFIED", executionId: execution.id, verifiedOutcomeId: expect.any(String) });
    expect(verified.assignments.find((item) => item.id === trial.assignmentId)).toMatchObject({ status: "completed", progress: { verified: 1 } });
  });

  it("repairs an open Assignment left behind by an inconclusive trial", () => {
    const state = applyOperation(createAgent(input), { type: "createCapabilityTrial", capability: "repost", environment: "sandbox", executionMode: "auto" });
    const trial = state.capabilityTrials[0]!;
    trial.status = "completed";
    trial.result = "INCONCLUSIVE_NO_OPPORTUNITY";
    trial.lastError = "No qualified candidate.";
    const assignment = state.assignments.find((item) => item.id === trial.assignmentId)!;
    assignment.status = "active";
    const repaired = normalizeState(state);
    expect(repaired.assignments.find((item) => item.id === assignment.id)).toMatchObject({ status: "expired_incomplete", lastOutcome: { class: "incomplete", message: "No qualified candidate." } });
  });

  it("cannot leave a resource-blocked trial discovering after its Assignment is terminal", () => {
    const state = applyOperation(createAgent(input), { type: "createCapabilityTrial", capability: "like", environment: "live", executionMode: "auto" });
    const trial = state.capabilityTrials[0]!;
    trial.status = "discovering";
    const assignment = state.assignments.find((item) => item.id === trial.assignmentId)!;
    assignment.status = "expired_incomplete";
    assignment.lastOutcome = { class: "incomplete", message: "The bounded trial could not read X because the provider resource quota was exhausted.", at: new Date().toISOString() };
    const repaired = normalizeState(state);
    expect(repaired.capabilityTrials.find((item) => item.id === trial.id)).toMatchObject({ status: "failed", result: "BLOCKED_RESOURCE" });
  });
});

describe("Chrome delivery reconciliation", () => {
  it("expires queued delivery windows without requiring a Bridge claim", () => {
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = formXReplyIntent(state, "This action must not remain queued forever.", "target-post-expiry");
    const execution = state.executions[0]!;
    const intent = state.socialIntents.find((item) => item.id === execution.socialIntentId)!;
    intent.validity.expiresAt = "2026-08-23T00:00:00.000Z";
    execution.status = "queued";

    expect(expireQueuedDeliveryWindows(state, new Date("2026-08-24T00:00:00.000Z"))).toBe(1);
    expect(execution).toMatchObject({ status: "expired", failure: { code: "INTENT_EXPIRED_BEFORE_CLAIM", retryable: false } });
    expect(intent.state).toBe("expired");
    expect(state.actions.find((item) => item.executionId === execution.id)?.status).toBe("skipped");
  });

  it("closes active delivery records whose Assignment was lost during restore", () => {
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = formXReplyIntent(state, "This delivery belongs to an Assignment that no longer exists.", "target-post-orphan");
    const execution = state.executions[0]!;
    execution.assignmentId = "assignment-lost-during-restore";
    execution.status = "queued";
    const normalized = normalizeState(state);
    const repaired = normalized.executions.find((item) => item.id === execution.id)!;
    expect(repaired).toMatchObject({ status: "expired", failure: { code: "ORPHANED_ASSIGNMENT", retryable: false } });
    expect(normalized.socialIntents.find((item) => item.id === execution.socialIntentId)?.state).toBe("expired");
  });

  it("keeps a direct Agent-selected Sandbox attention decision durable and idempotent", () => {
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { connectionMode: "sandbox", execution: { like: "auto" } } });
    state = startAttentionTest(state, { presenceId: state.presence!.id, mode: "sandbox", confirmed: true });
    const test = state.attentionTests[0]!;
    state = startPlaygroundSession(state, state.presence!.id);
    const session = state.playgroundSessions[0]!;
    const target = { type: "x.post", id: "101" } as const;
    state.mirrorObjects.unshift({ id: "target-like", bridgeId: `sandbox:${session.environmentId}`, presenceId: state.presence!.id, channelId: "x", externalRef: target, objectType: "post", language: "en", content: { text: "A grounded target post.", language: "en" }, observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", environment: "sandbox", sessionId: session.id, source: "operator", trust: "untrusted_world_content" });
    state = recordAttentionTestDecision(state, { testId: test.id, action: "like", rationale: "The observed post earns a quiet signal.", target, targetUrl: "https://x.com/target/status/101" });
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "like", text: "like", target, perceptionTarget: target, source: "agent", attentionTestId: test.id });
    const execution = state.executions[0]!;
    state.attentionTests[0]!.executionId = execution.id;
    const delivered = normalizeState(deliverSandboxExecution(state, execution.id));
    const completed = delivered.attentionTests.find((item) => item.id === test.id)!;
    expect(completed.status).toBe("visible");
    expect(completed.telemetry.map((item) => item.stage)).toEqual(expect.arrayContaining(["queued", "decided", "claimed", "executed", "verified", "recorded", "visible"]));
    expect(derivePublicHistory(delivered, delivered.presence!.id).find((item) => item.kind === "like")?.executionId).toBe(execution.id);
    const acknowledgedAgain = normalizeState(deliverSandboxExecution(delivered, execution.id));
    expect(acknowledgedAgain.mirrorObjects.filter((item) => item.originExecutionId === execution.id)).toHaveLength(1);
  });

  it("keeps legacy ambiguous X reply failures pending until exact verification", () => {
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = formXReplyIntent(state, "An outcome that still needs proof.", "target-post-pending");
    const execution = state.executions[0]!;
    execution.environment = "live";
    execution.connector = "bridge";
    execution.status = "failed";
    execution.failure = { code: "RESULT_NOT_VERIFIED", message: "The extension finished, but verification was not yet available.", retryable: true };

    const normalized = normalizeState(state);
    const repaired = normalized.executions.find((item) => item.id === execution.id)!;
    expect(repaired).toMatchObject({ status: "verification-pending", failure: { code: "X_API_VERIFICATION_PENDING", retryable: true } });

    execution.failure.reviewedAt = new Date().toISOString();
    expect(normalizeState(state).executions.find((item) => item.id === execution.id)?.status).toBe("failed");
  });

  it("repairs a stale Chrome failure from one authoritative X outcome", () => {
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = formXReplyIntent(state, "The exact public reply.", "target-post");
    const execution = state.executions[0]!;
    execution.connector = "bridge";
    execution.status = "failed";
    execution.failure = { code: "RESULT_NOT_VERIFIED", message: "The extension finished, but verification was not yet available.", retryable: true };

    const repaired = recordVerifiedChromeReply(state, execution.id, { type: "x.reply", id: "reply-123" });
    const repairedExecution = repaired.executions.find((item) => item.id === execution.id)!;
    expect(repairedExecution).toMatchObject({ status: "succeeded", externalRef: { type: "x.reply", id: "reply-123" } });
    expect(repaired.outcomes.filter((item) => item.executionId === execution.id && item.status === "succeeded")).toHaveLength(1);
    expect(repaired.actions.find((item) => item.executionId === execution.id)?.status).toBe("executed");
    expect(repaired.events[0]?.title).toBe("Browser capability reply verified on X");

    const idempotent = recordVerifiedChromeReply(repaired, execution.id, { type: "x.reply", id: "reply-123" });
    expect(idempotent.outcomes.filter((item) => item.executionId === execution.id && item.status === "succeeded")).toHaveLength(1);
  });

  it("repairs a stale Native X failure from one authoritative X outcome", () => {
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = formXReplyIntent(state, "The exact native reply.", "target-post");
    const execution = state.executions[0]!;
    execution.connector = "native";
    execution.status = "failed";
    execution.failure = { code: "RESULT_NOT_VERIFIED", message: "The native connector did not return the public result.", retryable: true };

    const repaired = recordVerifiedXReply(state, execution.id, { type: "x.reply", id: "reply-native-123" });
    expect(repaired.executions.find((item) => item.id === execution.id)).toMatchObject({ status: "succeeded", externalRef: { type: "x.reply", id: "reply-native-123" } });
    expect(repaired.events[0]?.title).toBe("Native X reply verified on X");
  });

  it("closes unresolved X verification without counting it as delivered", () => {
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = formXReplyIntent(state, "An unresolved reply that must not be counted.", "target-post-unresolved");
    const execution = state.executions[0]!;
    execution.environment = "live";
    execution.connector = "bridge";
    execution.status = "verification-pending";
    execution.failure = { code: "X_API_CREDITS_EXHAUSTED", message: "X verification is paused.", retryable: true };

    const closed = applyOperation(state, { type: "closeUnverifiedExecutions", ids: [execution.id], note: "Closed after the verification provider remained unavailable." });
    expect(closed.executions[0]).toMatchObject({ status: "verification-closed", failure: { reviewedAt: expect.any(String), reviewDisposition: "operator_action_required", reviewNote: "Closed after the verification provider remained unavailable." } });
    expect(closed.executions[0]?.externalRef).toBeUndefined();
    expect(closed.socialIntents.find((item) => item.id === execution.socialIntentId)?.state).toBe("expired");
    expect(closed.outcomes.filter((item) => item.executionId === execution.id)).toHaveLength(0);
    expect(closed.actions.find((item) => item.executionId === execution.id)?.status).toBe("skipped");
    expect(closed.events[0]?.title).toBe("Unverified X outcomes closed");
  });
});

describe("OpenPresence runtime boundaries", () => {
  it("requires exact destructive confirmation and removes Presence-scoped state", () => {
    let state = createAgent(input);
    const originalPresenceId = state.presence!.id;
    state = applyOperation(state, { type: "createPresence", input: { channel: "linkedin", name: "Jenny Builds", handle: "@jenny-builds", mode: "agent", accent: "#4F7CAC" } });
    const deletedPresenceId = state.presence!.id;
    state.mirrorObjects.push({ id: "presence-delete-mirror", bridgeId: "bridge-delete", presenceId: deletedPresenceId, channelId: "linkedin", externalRef: { type: "linkedin.post", id: "post-delete" }, objectType: "post", language: "en", content: { text: "Scoped history", language: "en" }, observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", environment: "live", source: "manual", trust: "untrusted_world_content" });
    expect(() => applyOperation(state, { type: "deletePresence", presenceId: deletedPresenceId, confirmationName: "Wrong name" })).toThrow(/Type/);
    state = applyOperation(state, { type: "deletePresence", presenceId: deletedPresenceId, confirmationName: "Jenny Builds" });
    expect(state.presences.map((item) => item.id)).toEqual([originalPresenceId]);
    expect(state.presence?.id).toBe(originalPresenceId);
    expect(state.mirrorObjects.some((item) => item.presenceId === deletedPresenceId)).toBe(false);
  });

  it("deletes the active Agent workspace only after exact confirmation", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "createAdditionalAgent", input: { name: "Atlas", description: "Research carefully.", audience: "researchers", mode: "agent", handle: "@atlas", accent: "#7A8FD8" } });
    expect(state.agent?.name).toBe("Atlas");
    expect(() => applyOperation(state, { type: "deleteAgent", confirmationName: "Jenny" })).toThrow(/Type/);
    state = applyOperation(state, { type: "deleteAgent", confirmationName: "Atlas" });
    expect(state.agent?.name).toBe("Jenny");
    expect(state.agents.map((item) => item.name)).toEqual(["Jenny"]);
    expect(state.agentWorkspaces.some((workspace) => workspace.agent?.name === "Atlas")).toBe(false);
  });

  it("makes self-directed attention available by default and derives a Presence-scoped plan from meaning", () => {
    const state = createAgent(input);
    expect(defaultSelfDirectedAttentionPolicy()).toMatchObject({ enabled: true, intensity: "balanced", mediaUnderstanding: "when_needed", budget: { maxChannelReadsPerDay: 60, maxModelCallsPerDay: 40 } });
    state.presence!.brief = { ...state.presence!.brief, primaryTerritory: ["AI agents"], adjacentTerritory: ["founder questions"] };
    state.presences = [state.presence!];
    const plan = deriveSelfDirectedDiscoveryPlan(state, state.presence!.id);
    expect(plan).toMatchObject({ origin: "self_directed_discovery", presenceId: state.presence!.id, surfaces: ["public_search", "thread_hydration", "media_when_needed"] });
    expect(plan?.directions).toEqual(expect.arrayContaining(["AI agents", "founder questions"]));
  });

  it("keeps self-directed resource usage auditable and presence-scoped", () => {
    const state = createAgent(input);
    const next = recordResourceUsageEvent(state, { presenceId: state.presence!.id, invocationId: "self-directed:test", originKind: "self_directed_discovery", attentionSource: "self_directed_discovery", category: "channel_read", provider: "x", usage: { requests: 1 }, quota: { provenance: "inferred" } });
    expect(next.resourceUsageEvents[0]).toMatchObject({ agentId: state.agent!.id, presenceId: state.presence!.id, invocationId: "self-directed:test", category: "channel_read", attentionSource: "self_directed_discovery" });
  });

  it("bounds compatibility history without discarding durable domain records", () => {
    const state = createAgent(input);
    const eventTime = new Date().toISOString();
    state.events = Array.from({ length: 2_005 }, (_, index) => ({
      id: `event-${index}`,
      type: "system" as const,
      title: `Event ${index}`,
      detail: "Operational event",
      time: eventTime,
      tone: "neutral" as const,
    }));
    state.actions = Array.from({ length: 1_005 }, (_, index) => ({
      id: `action-${index}`,
      intent: "no_op" as const,
      summary: `Action ${index}`,
      status: "skipped" as const,
      reason: "Test action",
      createdAt: eventTime,
    }));

    const normalized = normalizeState(state);
    expect(normalized.events).toHaveLength(2_000);
    expect(normalized.events[0]?.id).toBe("event-0");
    expect(normalized.actions).toHaveLength(1_000);
    expect(normalized.actions[0]?.id).toBe("action-0");
  });

  it("restores a stale Native X connection after authenticated observation succeeds", () => {
    let state = createAgent(input);
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "needs-attention", access: "read-write", healthMessage: "The native X connection is unavailable.", account: { id: "account-1", username: "jenny_ai", name: "Jenny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state = recordNativeObservation(state, state.presence!.id, { status: "up-to-date", lastObservedAt: new Date().toISOString(), nextObservationAt: new Date(Date.now() + 300_000).toISOString(), ownPostCount: 1, mentionCount: 1, conversationCount: 0 });
    expect(state.nativeConnections[0]).toMatchObject({ status: "connected", healthMessage: undefined, observation: { status: "up-to-date" } });
  });

  it("removes legacy calendar records without removing Assignments", () => {
    const state = applyOperation(createAgent(input), {
      type: "addSlot",
      instruction: "Teach one useful thing",
      day: "Tuesday",
      time: "08:00",
      objective: "education",
      executionWindow: "08:00–11:00",
    });
    const assignmentCount = state.assignments.length;
    const removed = applyOperation(state, { type: "removeLegacyCalendarEntries" });
    expect(removed.calendar).toHaveLength(0);
    expect(removed.standingIntents).toHaveLength(0);
    expect(removed.assignments).toHaveLength(assignmentCount);
    expect(removed.events[0]?.title).toBe("Legacy calendar entries removed");
  });

  it("keeps completed Assignments out of operational views while retaining their record", () => {
    const state = createAgent(input);
    const assignment = compileAssignmentInstruction(state, "Produce one original X post about a useful lesson.", state.presence!.id, "sandbox");
    expect(assignmentIsOpen(assignment)).toBe(true);
    expect(assignmentIsOpen({ ...assignment, status: "completed" })).toBe(false);
    expect(assignmentIsOpen({ ...assignment, status: "completed_with_adaptation" })).toBe(false);
    expect(assignmentIsOpen({ ...assignment, status: "cancelled" })).toBe(false);
    expect(assignmentIsOpen({ ...assignment, status: "blocked" })).toBe(true);
  });

  it("persists a bounded Social Decision and links it to the Activity event", () => {
    const state = applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { follow: "auto" } } });
    const next = formXActionIntent(state, {
      affordance: "x.follow",
      target: { type: "x.user", id: "maya" },
      decision: {
        decision: "follow",
        summary: "Maya is repeatedly contributing useful ideas in this Presence's territory.",
        focalMirrorObjectIds: ["mirror_post_1"],
        origin: { kind: "inbound_social", refId: "post_1" },
        influences: ["Mission", "Taste", "Current social context"],
        confidence: "medium",
      },
    });
    expect(next.socialDecisions).toHaveLength(1);
    expect(next.socialDecisions[0]).toMatchObject({ decision: "follow", summary: "Maya is repeatedly contributing useful ideas in this Presence's territory.", focalMirrorObjectIds: ["mirror_post_1"] });
    expect(next.socialDecisions[0]?.socialIntentId).toBe(next.socialIntents[0]?.id);
    expect(next.events.some((event) => event.decisionId === next.socialDecisions[0]?.id)).toBe(true);
  });

  it("records NO_OP decisions without inventing a Social Intent", () => {
    const state = createAgent(input);
    const next = recordSocialDecision(state, { decision: "no_op", summary: "The observed cue did not open a useful exchange.", focalMirrorObjectIds: ["mirror_post_2"], origin: { kind: "inbound_social", refId: "post_2" } });
    expect(next.socialDecisions[0]).toMatchObject({ decision: "no_op", summary: "The observed cue did not open a useful exchange.", socialIntentId: undefined });
    expect(next.socialIntents).toHaveLength(0);
  });

  it("keeps internal QA identifiers out of Sandbox publications", () => {
    expect(cleanSandboxDraft("A useful point. QA-TEN-RUN-2026-08-14")).toBe("A useful point.");
    expect(cleanSandboxDraft("QA-ONE-2026-08-14")).toBe("");
    expect(cleanSandboxDraft("A real QA process is worth discussing.")).toBe("A real QA process is worth discussing.");
  });

  it("keeps internal QA identifiers out of Assignment summaries", () => {
    expect(cleanUserFacingAssignmentInstruction("QA-NOW-RUN-2026-08-14: Produce exactly 1 original X post about a practical lesson.")).toBe("Produce exactly 1 original X post about a practical lesson.");
    expect(cleanUserFacingAssignmentInstruction("Produce exactly 1 post. Include QA-NOW-RUN-2026-08-14 only as an internal diagnostic marker and never publish it.")).toBe("Produce exactly 1 post.");
    expect(cleanUserFacingAssignmentInstruction("QA-NOW-RUN-2026-08-14")).toBe("Original post Assignment");
  });

  it("preserves intentional paragraph breaks in long-form Sandbox drafts", () => {
    expect(cleanSandboxDraft("Lead sentence.\n\nEvidence paragraph with  extra spaces.\n\nClosing implication.")).toBe("Lead sentence.\n\nEvidence paragraph with extra spaces.\n\nClosing implication.");
  });

  it("compiles Watches as Presence-scoped attention without changing Agent identity", () => {
    const state = createAgent(input);
    const creator = compileWatch(state.agent!.id, state.presence!.id, "x", "https://x.com/AlexHormozi", "Learn from strong offers without imitating the voice.");
    const topic = compileWatch(state.agent!.id, state.presence!.id, "x", "conversations about AI agent infrastructure");
    expect(creator.kind).toBe("creator");
    expect(creator.title).toBe("@AlexHormozi");
    expect(creator.observation.status).toBe("watching");
    expect(topic.kind).toBe("topic");
    expect(topic.observation.status).toBe("manual");

    const added = applyOperation(state, { type: "createWatch", query: "@AlexHormozi", purpose: "Learn from strong offers", presenceId: state.presence!.id });
    expect(added.watches).toHaveLength(1);
    expect(added.watches[0]?.agentId).toBe(state.agent!.id);
    expect(added.watches[0]?.presenceId).toBe(state.presence!.id);
    expect(added.agent?.name).toBe("Jenny");
    const watchId = added.watches[0]!.id;
    const edited = applyOperation(added, { type: "updateWatch", id: watchId, query: "@new_creator", purpose: "Interact regularly when useful." });
    expect(edited.watches[0]).toMatchObject({ id: watchId, query: "@new_creator", title: "@new_creator", purpose: "Interact regularly when useful.", kind: "creator" });
    expect(edited.watches[0]?.createdAt).toBe(added.watches[0]?.createdAt);
    expect(edited.watches[0]?.observation.observedCount).toBe(0);
    const removed = applyOperation(edited, { type: "deleteWatch", id: watchId });
    expect(removed.watches).toHaveLength(0);

    const recovered = { ...compileWatch(state.agent!.id, state.presence!.id, "x", "@sandbox_person"), id: "watch_recovered_relationship_test" };
    const explicit = { ...compileWatch(state.agent!.id, state.presence!.id, "x", "@operator_person"), id: "watch_operator_test" };
    const normalized = normalizeState({ ...state, watches: [recovered, explicit] });
    expect(normalized.watches.map((watch) => watch.id)).toEqual(["watch_operator_test"]);
  });

  it("pauses a Watch durably and prevents observation or autonomous action until resumed", () => {
    const state = createAgent(input);
    const presenceId = state.presence!.id;
    const added = applyOperation(state, { type: "createWatch", query: "@watched_person", purpose: "Interact when worthwhile.", presenceId });
    const watchId = added.watches[0]!.id;
    const paused = applyOperation(added, { type: "setWatchState", id: watchId, state: "paused" });

    expect(paused.watches[0]).toMatchObject({ id: watchId, state: "paused" });
    expect(paused.events[0]).toMatchObject({ title: "Watch paused" });

    const actionReady = applyOperation(added, { type: "setPresence", patch: { status: "live", execution: { like: "auto" } } });
    const actionCandidate = formXActionIntent(actionReady, {
      affordance: "x.like",
      target: { type: "x.post", id: "queued-watch-post" },
      source: "agent",
      origin: { kind: "watchlist", refId: watchId },
    });
    expect(actionCandidate.executions).toHaveLength(1);
    const pausedWithAction = applyOperation(actionCandidate, { type: "setWatchState", id: watchId, state: "paused" });
    expect(pausedWithAction.executions[0]).toMatchObject({ status: "cancelled", failure: { code: "WATCH_PAUSED" } });

    const observedPaused = recordNativeMirror(paused, {
      connectionId: "native-watch-pause-test",
      presenceId,
      post: { id: "paused-watch-post", text: "This should wait.", authorId: "watched-author", authorUsername: "watched_person", authorName: "Watched Person" },
    });
    const signalWhilePaused = recordWatchSignals(observedPaused, [observedPaused.mirrorObjects.find((item) => item.externalRef.id === "paused-watch-post")!]);
    expect(signalWhilePaused.watchSignals).toHaveLength(0);

    const blockedAction = formXActionIntent(paused, {
      affordance: "x.like",
      target: { type: "x.post", id: "paused-watch-post" },
      source: "agent",
      origin: { kind: "watchlist", refId: watchId },
    });
    expect(blockedAction.executions).toHaveLength(0);

    const resumed = applyOperation(paused, { type: "setWatchState", id: watchId, state: "active" });
    expect(resumed.watches[0]).toMatchObject({ id: watchId, state: "active" });
    expect(resumed.events[0]).toMatchObject({ title: "Watch resumed" });
  });

  it("defaults public Requests to nobody and keeps that separate from Watching", () => {
    const state = createAgent(input);
    const presence = state.presence!;
    expect(presence.requestPolicy).toMatchObject({ access: "nobody", acceptance: "operator_review" });
    const watched = applyOperation(state, { type: "createWatch", query: "@source_author", purpose: "Learn from useful insights and interact when worthwhile", presenceId: presence.id });
    const withMirror = recordNativeMirror(watched, { connectionId: "native-request-test", presenceId: presence.id, post: { id: "watched-post-1", text: "A useful observation.", authorId: "author-1", authorUsername: "source_author", authorName: "Source Author" } });
    const observedMirror = withMirror.mirrorObjects.find((item) => item.externalRef.id === "watched-post-1")!;
    const observed = recordWatchSignals(withMirror, [observedMirror]);
    expect(observed.watchSignals).toHaveLength(1);
    expect(observed.watches[0]?.target).toMatchObject({ externalActorId: "author-1", handle: "source_author", identityStatus: "verified" });
    expect(observed.relationshipPolicies[0]).toMatchObject({ learning: "selective", engagement: "when_worthwhile" });

    const requestState = recordNativeMirror(observed, { connectionId: "native-request-test", presenceId: presence.id, post: { id: "request-post-1", text: "Hey @jenny_ai, can you find someone who would be a good fit for this?", authorId: "requester-1", authorUsername: "requester", authorName: "Requester" } });
    const requestMirror = requestState.mirrorObjects.find((item) => item.externalRef.id === "request-post-1")!;
    const denied = recordPublicRequestsFromMirrors(requestState, [requestMirror]);
    expect(denied.publicRequests[0]).toMatchObject({ eligibility: "not_allowed", disposition: "ignored" });
    expect(denied.assignments).toHaveLength(0);

    const enabled = applyOperation(denied, { type: "setPresenceRequestPolicy", presenceId: presence.id, policy: { access: "anyone", allowedRequestTypes: ["recommendation"], requireDirectAddress: true, acceptance: "operator_review", impactLimit: "low" } });
    const secondRequestState = recordNativeMirror(enabled, { connectionId: "native-request-test", presenceId: presence.id, post: { id: "request-post-2", text: "Hey @jenny_ai, can you recommend someone who would be a good fit?", authorId: "requester-2", authorUsername: "requester_two", authorName: "Requester Two" } });
    const secondRequestMirror = secondRequestState.mirrorObjects.find((item) => item.externalRef.id === "request-post-2")!;
    const eligible = recordPublicRequestsFromMirrors(secondRequestState, [secondRequestMirror]);
    expect(eligible.publicRequests[0]).toMatchObject({ eligibility: "eligible", disposition: "needs_operator_review" });
    const accepted = applyOperation(eligible, { type: "decidePublicRequest", id: eligible.publicRequests[0]!.id, disposition: "accepted" });
    expect(accepted.assignments[0]).toMatchObject({ origin: "public_request", target: { mirrorObjectId: secondRequestMirror.id } });
    expect(accepted.publicRequests[0]?.assignmentId).toBe(accepted.assignments[0]?.id);
  });

  it("treats explicit learning differently from social contribution language in Watch purposes", () => {
    expect(relationshipPolicyFromWatchPurpose("Interact with his posts, add useful insights, and make people laugh.")).toMatchObject({ learning: "off", engagement: "when_worthwhile" });
    expect(relationshipPolicyFromWatchPurpose("Learn selectively from their insights without copying their voice.")).toMatchObject({ learning: "selective", engagement: "observe_only" });
  });

  it("keeps browser hands separate from the Presence channel and native route", () => {
    const state = createAgent(input);
    const enabled = applyOperation(state, { type: "setPresenceBrowserAccess", presenceId: state.presence!.id, enabled: true });
    expect(enabled.presence?.browserAccess).toEqual({ enabled: true });
    expect(enabled.presence?.connectionMode).toBe("native");
    const disabled = applyOperation(enabled, { type: "setPresenceBrowserAccess", presenceId: state.presence!.id, enabled: false });
    expect(disabled.presence?.browserAccess).toEqual({ enabled: false });
    expect(disabled.presence?.connectionMode).toBe("native");
  });

  it("keeps configuration churn out of the Presence decision feed", () => {
    expect(isActivityDecisionEvent({ id: "settings", type: "system", title: "Presence settings updated", detail: "The new execution envelope is active.", time: new Date().toISOString(), tone: "positive" })).toBe(false);
    expect(isActivityDecisionEvent({ id: "pulse", type: "system", title: "Pulse completed", detail: "The channel was checked.", time: new Date().toISOString(), tone: "positive" })).toBe(true);
    expect(isActivityDecisionEvent({ id: "self-directed-look", type: "system", title: "Genny looked around X", detail: "Two directions checked.", time: new Date().toISOString(), tone: "positive" })).toBe(true);
    expect(isActivityDecisionEvent({ id: "self-directed-held", type: "system", title: "Self-directed opportunity held", detail: "Nothing earned an outward act.", time: new Date().toISOString(), tone: "quiet" })).toBe(true);
    expect(isActivityDecisionEvent({ id: "decision", type: "decision", title: "Post intention held", detail: "Silence was selected.", time: new Date().toISOString(), tone: "quiet" })).toBe(true);
  });

  it("removes legacy unsolicited Presence messages without touching real chat turns", () => {
    const state = createAgent(input);
    const conversation = state.conversations[0]!;
    conversation.messages.push(
      { id: "state_legacy", role: "agent", content: "I noticed the Presence settings changed.", timestamp: new Date().toISOString(), change: "Presence state updated" },
      { id: "operator_real", role: "operator", content: "Keep the voice direct.", timestamp: new Date().toISOString() },
      { id: "agent_real", role: "agent", content: "I will.", timestamp: new Date().toISOString() },
    );

    const normalized = normalizeState(state);
    expect(normalized.conversations[0]?.messages.map((message) => message.id)).toEqual(["operator_real", "agent_real"]);
  });

  it("creates an agent and a distinct Presence with human-readable meaning files", () => {
    const state = createAgent(input);
    expect(state.onboarded).toBe(true);
    expect(state.agent?.id).not.toBe(state.presence?.id);
    expect(state.files.map((file) => file.kind)).toEqual(["BRAIN", "SOUL", "MISSION", "TASTE", "MEMORY", "GROWTH", "PULSE", "PRESENCE"]);
    expect(state.files.find((file) => file.kind === "TASTE")?.protected).toBe(true);
    expect(state.operatorConversations?.[0]?.messages[0]).toMatchObject({
      role: "presence",
      content: expect.stringContaining("What would you like me to take off your plate?"),
      choices: expect.arrayContaining([
        expect.objectContaining({ label: "Grow my audience" }),
        expect.objectContaining({ label: "Turn ideas into posts" }),
      ]),
    });
  });

  it("migrates legacy meaning-file subtitles when an existing workspace is read", () => {
    const state = createAgent(input);
    state.files = state.files.map((file) => ({ ...file, subtitle: `Legacy ${file.kind} subtitle` }));

    const normalized = normalizeState(state);
    expect(normalized.files.map((file) => file.subtitle)).toEqual([
      "How I think",
      "Who I am",
      "What I am here to do",
      "What I consider good",
      "What I should remember",
      "What results have taught me",
      "What keeps me active",
      "A situated social self, not just a channel.",
    ]);
  });

  it("defaults new Agents to OpenAI GPT 5.6 Luna at medium reasoning", () => {
    const state = createAgent(input);
    expect(state.modelProfiles[0]).toMatchObject({ provider: "openai", model: "gpt-5.6-luna", quality: "medium" });
    expect(state.providerConnections).toContainEqual(expect.objectContaining({ provider: "openai", label: "OpenAI", status: "needs-configuration" }));
    expect(state.providerConnections).not.toContainEqual(expect.objectContaining({ provider: "anthropic" }));
  });

  it("migrates only the untouched Anthropic seed to the new default", () => {
    const legacy = createAgent(input);
    legacy.modelProfiles[0] = { ...legacy.modelProfiles[0]!, provider: "anthropic", model: "claude", quality: "high" };
    legacy.providerConnections = [{ id: "legacy-anthropic", provider: "anthropic", label: "Anthropic", status: "needs-configuration", createdAt: new Date().toISOString() }];
    const migrated = normalizeState(legacy);
    expect(migrated.modelProfiles[0]).toMatchObject({ provider: "openai", model: "gpt-5.6-luna", quality: "medium" });
    expect(migrated.providerConnections).toContainEqual(expect.objectContaining({ provider: "openai", label: "OpenAI" }));

    legacy.modelProfiles[0] = { ...legacy.modelProfiles[0]!, provider: "anthropic", model: "claude", quality: "high" };
    legacy.providerConnections[0]!.status = "available";
    const preserved = normalizeState(legacy);
    expect(preserved.modelProfiles[0]).toMatchObject({ provider: "anthropic", model: "claude", quality: "high" });
  });

  it("keeps Presence Chat session memory separate from durable Agent state", () => {
    let state = createAgent(input);
    const presenceId = state.presence!.id;
    state.presence!.execution.quote = "auto";
    const originalFiles = state.files.map((file) => `${file.kind}:${file.content}`).join("\n");
    state = applyOperation(state, { type: "newPresenceChatSession", presenceId });
    const session = state.presenceChatSessions[0]!;
    state = applyOperation(state, { type: "sendPresenceChatMessage", presenceId, sessionId: session.id, content: "My name is Bob and I own a submarine.", attachments: [{ name: "chart.png", kind: "image", mimeType: "image/png" }], briefOverride: { purpose: "Temporary purpose", audience: "Testers", primaryTerritory: ["Testing"], adjacentTerritory: [], boundaries: [] } });
    expect(state.presenceChatSessions[0]?.messages[0]).toMatchObject({ role: "user", content: "My name is Bob and I own a submarine." });
    expect(state.presenceChatSessions[0]?.messages[0]?.attachments?.[0]).toMatchObject({ name: "chart.png", kind: "image" });
    expect(state.conversations[0]?.messages).toHaveLength(0);
    expect(state.proposals).toHaveLength(0);
    expect(state.changeSets).toHaveLength(0);
    expect(state.socialIntents).toHaveLength(0);
    expect(state.executions).toHaveLength(0);
    expect(state.files.map((file) => `${file.kind}:${file.content}`).join("\n")).toBe(originalFiles);
    expect(JSON.stringify(state)).not.toContain("Temporary purpose");
    const firstMessage = state.presenceChatSessions[0]!.messages[0]!;
    state = applyOperation(state, { type: "sendPresenceChatMessage", presenceId, sessionId: session.id, content: "That is the part worth testing.", replyToMessageId: firstMessage.id });
    expect(state.presenceChatSessions[0]?.messages[1]?.replyToMessageId).toBe(firstMessage.id);
  });

  it("seeds the default Brain with concrete, natural social voice judgment", () => {
    const brain = createAgent(input).files.find((file) => file.kind === "BRAIN")?.content ?? "";
    expect(brain).toContain("Start from the specific object in front of me.");
    expect(brain).toContain("Do not open with automatic praise, canned agreement");
    expect(brain).toContain("For replies, answer the exact sentence in front of me.");
    expect(brain).toContain("often 8 to 35 words");
    expect(brain).toContain("Avoid filler frames such as \"I agree\"");
    expect(brain).toContain("Voice is craft, not taste");
    expect(brain).toContain("Emoji are seasoning, not grammar.");
    expect(brain).toContain("never invent a network match");
  });

  it("seeds the Agent with the named mechanical tool bindings", () => {
    const state = createAgent(input);
    expect(state.toolBindings.map((binding) => binding.toolId)).toEqual([
      "web.search",
      "evidence.search",
      "asset.inspect",
      "chart.render",
      "channel.execute",
    ]);
    expect(state.toolBindings.every((binding) => binding.agentId === state.agent?.id)).toBe(true);
  });

  it("can bind media inspection to a specialized model without changing the Agent brain", () => {
    const state = createAgent(input);
    const brain = state.modelProfiles[0]!;
    const next = applyOperation(state, { type: "setToolBinding", toolId: "asset.inspect", provider: "ollama", model: "qwen3-vl:8b", connectionId: "local-ollama" });
    expect(next.modelProfiles[0]?.model).toBe(brain.model);
    expect(next.toolBindings.find((binding) => binding.toolId === "asset.inspect")).toMatchObject({ provider: "ollama", model: "qwen3-vl:8b", connectionId: "local-ollama" });
  });

  it("toggles coherent Agent capabilities without creating an Agent-level channel authority", () => {
    const state = createAgent(input);
    const disabled = applyOperation(state, { type: "setCapability", capabilityId: "research", enabled: false });
    expect(disabled.toolBindings.find((binding) => binding.toolId === "web.search")).toMatchObject({ enabled: false });
    expect(disabled.toolBindings.find((binding) => binding.toolId === "channel.execute")).toMatchObject({ enabled: true });
    const ignored = applyOperation(state, { type: "setCapability", capabilityId: "channel-action", enabled: false });
    expect(ignored.toolBindings.find((binding) => binding.toolId === "channel.execute")).toMatchObject({ enabled: true });
  });

  it("creates a proposal instead of silently mutating protected identity", () => {
    const state = createAgent(input);
    const original = state.files.find((file) => file.kind === "TASTE")?.content;
    const next = applyOperation(state, { type: "saveFile", kind: "TASTE", content: "# A new taste" });
    expect(next.files.find((file) => file.kind === "TASTE")?.content).toBe(original);
    expect(next.proposals[0]?.status).toBe("pending");
  });

  it("submits explicit Presence identity instructions and applies them only after review", () => {
    const state = createAgent(input);
    const instruction = `You are NOT "I'm Jenny — @jenny_ai." You are "Jenny". Your full name is "Jenny Presence".`;
    expect(inferPresenceIdentityChange(instruction, state.presence!)).toEqual({ name: "Jenny Presence" });

    const proposed = applyOperation(state, { type: "sendMessage", content: instruction });
    expect(proposed.proposals[0]).toMatchObject({ status: "pending", file: "PRESENCE", target: { type: "presence_identity", name: "Jenny Presence" } });
    expect(proposed.presence?.name).toBe("Jenny");
    expect(proposed.conversations[0]?.messages.at(-1)?.content).toContain("submitted a Presence identity change");

    const applied = applyOperation(proposed, { type: "resolveProposal", id: proposed.proposals[0]!.id, decision: "approve" });
    expect(applied.presence?.name).toBe("Jenny Presence");
    expect(applied.presence?.publicSelf.displayName).toBe("Jenny Presence");
  });

  it("asks once, then creates a real Mind File proposal when the operator confirms durable context", () => {
    const state = createAgent(input);
    const claim = "Alex Rivera built Jenny in his OpenPresence app.";
    const waiting = applyOperation(state, { type: "sendMessage", content: claim });
    expect(waiting.proposals).toHaveLength(0);
    expect(waiting.conversations[0]?.messages.at(-1)?.content).toContain("Should I submit it as a reviewable proposal?");
    expect(waiting.conversations[0]?.messages.at(-1)?.change).toBe("Teach confirmation requested");
    expect(isTeachProposalConfirmation("yes submit it as proposal")).toBe(true);

    const confirmed = applyOperation(waiting, { type: "sendMessage", content: "yes submit it as proposal" });
    expect(confirmed.proposals[0]).toMatchObject({ file: "MEMORY", status: "pending" });
    expect(confirmed.proposals[0]?.proposed).toContain("Alex Rivera built Jenny in his OpenPresence app");
    expect(confirmed.changeSets[0]?.summary).toBe("Propose MEMORY.md change");
    expect(confirmed.files.find((file) => file.kind === "MEMORY")?.content).not.toContain(claim);
    expect(confirmed.conversations[0]?.messages.at(-1)?.content).toContain("reviewable proposal");
  });

  it("submits explicit memory instructions and applies simple chat settings", () => {
    expect(inferExplicitDurableContext("Remember that Jenny was built for thoughtful agent builders.")).toBe("Jenny was built for thoughtful agent builders");
    const state = createAgent(input);
    const remembered = applyOperation(state, { type: "sendMessage", content: "Remember that Jenny was built for thoughtful agent builders." });
    expect(remembered.proposals[0]?.file).toBe("MEMORY");

    const focused = applyOperation(createAgent(input), { type: "sendMessage", content: "Focus on AI founders." });
    expect(focused.presence?.brief.primaryTerritory).toEqual(["AI founders"]);

    const configured = applyOperation(createAgent(input), { type: "sendMessage", content: "Set replies to manual." });
    expect(configured.presence?.execution.reply).toBe("manual");
    expect(configured.conversations[0]?.messages.at(-1)?.content).toContain("replies");
  });

  it("turns a conversational voice instruction into a reviewable Taste proposal", () => {
    const state = createAgent(input);
    const next = applyOperation(state, { type: "sendMessage", content: "Make Genny's replies more conversational and less like an AI answering a prompt." });
    expect(next.proposals[0]).toMatchObject({ file: "TASTE", status: "pending" });
    expect(next.proposals[0]?.proposed).toContain("## Conversational presence");
    expect(next.conversations[0]?.messages.at(-1)?.content).toContain("answer the person and the concrete detail first");
  });

  it("allows curated learning files to update directly", () => {
    const state = createAgent(input);
    const next = applyOperation(state, { type: "saveFile", kind: "GROWTH", content: "# GROWTH.md\n\nA useful finding." });
    expect(next.files.find((file) => file.kind === "GROWTH")?.content).toContain("A useful finding");
    expect(next.proposals).toHaveLength(0);
  });

  it("keeps intention, execution, and no-op outcome visible separately", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "runPulse" });
    expect(state.actions[0]?.intent).toBe("no_op");
    expect(state.actions[0]?.status).toBe("skipped");
    expect(state.metrics.opportunitiesIgnored).toBe(36);
    expect(state.events.some((item) => item.title === "Silence was the right action")).toBe(true);
  });

  it("compiles prompt-driven Assignments into hard progress and human judgment context", () => {
    const state = createAgent(input);
    const assignment = compileAssignmentInstruction(state, "Publish exactly 3 original posts each weekday about offers, pricing, or sales. Choose your own angles and do not repeat yourself.", state.presence!.id, "sandbox");
    expect(assignment.deliverable).toMatchObject({ type: "original_publication", quantity: 3, quantityMode: "exact" });
    expect(assignment.recurrence).toMatchObject({ kind: "weekdays" });
    expect(assignment.editorialContext?.topics).toEqual(["offers", "pricing", "sales"]);
    expect(assignment.editorialContext?.constraints).toContain("Keep the delivered ideas meaningfully distinct.");
    expect(assignment.instruction).toContain("Choose your own angles");
  });

  it("does not treat dates or QA markers as Assignment quantities", () => {
    const state = createAgent(input);
    const one = compileAssignmentInstruction(state, "QA-ONE-2026-08-14: Produce exactly 1 original X post about a practical lesson.", state.presence!.id, "sandbox");
    const ten = compileAssignmentInstruction(state, "QA-TEN-2026-08-14: Produce exactly 10 original X posts about practical lessons.", state.presence!.id, "sandbox");

    expect(one.deliverable).toMatchObject({ quantity: 1, quantityMode: "exact" });
    expect(ten.deliverable).toMatchObject({ quantity: 10, quantityMode: "exact" });
  });

  it("preserves an Assignment's scheduled timing instead of reducing it to Once", () => {
    const state = createAgent(input);
    const scheduled = applyOperation(state, {
      type: "createAssignment",
      instruction: "Produce 2 original Sandbox posts about useful agent ideas.",
      presenceId: state.presence!.id,
      environment: "sandbox",
      schedule: { day: "Thursday", time: "23:25", executionWindow: "23:25–23:25" },
    });

    expect(scheduled.assignments[0]?.schedule).toEqual({ day: "Thursday", time: "23:25", executionWindow: "23:25–23:25" });
  });

  it("does not create a second open Assignment for the same scoped request", () => {
    let state = createAgent(input);
    const request = { type: "createAssignment" as const, instruction: "Reply to @craigweiss.", presenceId: state.presence!.id, environment: "live" as const };
    state = applyOperation(state, request);
    state = applyOperation(state, { ...request, instruction: "Reply to @craigweiss" });

    expect(state.assignments).toHaveLength(1);
  });

  it("allows a Ghost to discuss model capability while still protecting private runtime details", () => {
    const state = createAgent({ ...input, name: "Alex", mode: "ghost", handle: "@richardson" });
    const presence = state.presence!;
    expect(identityLeakageReason(state, presence, "The best AI model is the one that recovers well from failure.")).toBeUndefined();
    expect(identityLeakageReason(state, presence, "OpenAI could build a better model by measuring recovery, not just benchmark peaks.")).toBeUndefined();
    expect(identityLeakageReason(state, presence, "I use the current model provider and exact model behind this account.")).toContain("implementation details");
    expect(identityLeakageReason(state, presence, "This account uses OpenAI and runs on the selected model.")).toContain("implementation details");
  });

  it("keeps an Agent-owned Presence's public aliases in first person", () => {
    const state = createAgent({ name: "Genny", description: "Make useful founder observations.", mode: "agent", handle: "@example_agent", accent: "#D68754" });
    const guidance = publicSelfGuidance(state.presence!);

    expect(guidance).toContain("This Agent-owned Presence is you, not another person");
    expect(guidance).toContain("Genny and @example_agent are your own public name and account");
    expect(guidance).toContain("use first person (I/me/my)");
    expect(guidance).toContain("never switch to third person to comment on yourself");
  });

  it("does not invent strategy learning or interrupt Chat from delivery counts alone", () => {
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { connectionMode: "sandbox", execution: { post: "auto" } } });
    state = startPlaygroundSession(state, state.presence!.id);
    const sessionId = state.playgroundSessions[0]!.id;
    for (const text of ["A grounded explanation of durable agent state.", "A separate example of inspecting a decision's evidence.", "A third concrete example of permission boundaries."]) {
      state = formSandboxIntent(state, { sessionId, affordance: "post", text });
      state = deliverSandboxExecution(state, state.executions[0]!.id);
    }
    expect(state.outcomes.filter((outcome) => outcome.sessionId === sessionId && outcome.status === "succeeded")).toHaveLength(3);
    expect(state.publicationMetricSnapshots).toHaveLength(0);
    expect(state.operatorConversations?.flatMap((conversation) => conversation.messages).filter((message) => message.agentInitiated)).toHaveLength(0);
    expect(state.events.some((event) => event.title === "Strategy learning update")).toBe(false);
    expect(JSON.stringify(state.playgroundSessions)).not.toContain("changed the Agent's next strategy allocation");
  });

  it("counts only verified Sandbox Mirror publications toward an Assignment", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { execution: { post: "auto" } } });
    const session = startPlaygroundSession(state, state.presence!.id);
    state = applyOperation(session, { type: "createAssignment", instruction: "Produce 2 original Sandbox posts about useful agent ideas.", presenceId: state.presence!.id, sessionId: session.playgroundSessions[0]!.id, environment: "sandbox" });
    const assignment = state.assignments[0]!;
    state = applyOperation(state, { type: "startAssignment", id: assignment.id, sessionId: session.playgroundSessions[0]!.id });
    expect(state.assignments[0]).toMatchObject({ status: "active", progress: { verified: 0, required: 2 } });
    const formed = formSandboxIntent(state, { sessionId: session.playgroundSessions[0]!.id, affordance: "post", text: "A specific idea about persistent agents.", assignmentId: assignment.id });
    expect(formed.assignments[0]?.progress.verified).toBe(0);
    const execution = formed.executions[0]!;
    const delivered = deliverSandboxExecution(formed, execution.id);
    expect(delivered.assignments[0]?.progress.verified).toBe(1);
    expect(delivered.mirrorObjects[0]?.assignmentId).toBe(assignment.id);
    expect(assignmentIsSatisfied(delivered.assignments[0]!)).toBe(false);
  });

  it("cancels draft and active Assignments without deleting their history or allowing restart", () => {
    let state = createAgent(input);
    const session = startPlaygroundSession(state, state.presence!.id);
    const sessionId = session.playgroundSessions[0]!.id;
    state = applyOperation(session, { type: "createAssignment", instruction: "Produce 2 original Sandbox posts about useful agent ideas.", presenceId: state.presence!.id, sessionId, environment: "sandbox" });
    const assignmentId = state.assignments.find((item) => item.instruction === "Produce 2 original Sandbox posts about useful agent ideas.")!.id;

    state = applyOperation(state, { type: "cancelAssignment", id: assignmentId });
    expect(state.assignments).toHaveLength(2);
    expect(state.assignments.find((item) => item.id === assignmentId)).toMatchObject({ id: assignmentId, status: "cancelled" });
    expect(state.events[0]?.title).toBe("Assignment cancelled");

    const restarted = applyOperation(state, { type: "startAssignment", id: assignmentId, sessionId });
    expect(restarted.assignments.find((item) => item.id === assignmentId)?.status).toBe("cancelled");

    const activeDraft = applyOperation(restarted, { type: "createAssignment", instruction: "Produce 1 original Sandbox post about a useful agent idea.", presenceId: state.presence!.id, sessionId, environment: "sandbox" });
    const activeAssignmentId = activeDraft.assignments.find((item) => item.instruction === "Produce 1 original Sandbox post about a useful agent idea.")!.id;
    const active = applyOperation(activeDraft, { type: "startAssignment", id: activeAssignmentId, sessionId });
    expect(active.assignments.find((item) => item.id === activeAssignmentId)?.status).toBe("active");
    const cancelledActive = applyOperation(active, { type: "cancelAssignment", id: activeAssignmentId });
    expect(cancelledActive.assignments.find((item) => item.id === activeAssignmentId)?.status).toBe("cancelled");
  });

  it("force-stops an unresolved X delivery without claiming the public outcome is absent", () => {
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = formXReplyIntent(state, "A reply that must not be duplicated.", "target-post-stop");
    const execution = state.executions[0]!;
    execution.environment = "live";
    execution.connector = "bridge";
    execution.status = "verification-pending";

    const stopped = applyOperation(state, { type: "cancelExecution", id: execution.id });
    const result = stopped.executions.find((item) => item.id === execution.id)!;
    const intent = stopped.socialIntents.find((item) => item.id === execution.socialIntentId)!;

    expect(result.status).toBe("verification-closed");
    expect(result.externalRef).toBeUndefined();
    expect(result.failure?.reviewDisposition).toBe("operator_action_required");
    expect(intent.state).toBe("expired");
    expect(stopped.outcomes).toHaveLength(0);
    expect(stopped.events[0]?.title).toBe("Unresolved delivery stopped");
  });

  it("cancelling an Assignment also stops its pending delivery", () => {
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { reply: "auto" } } });
    state = applyOperation(state, { type: "createAssignment", instruction: "Reply once to the selected post.", presenceId: state.presence!.id, environment: "live" });
    const assignment = state.assignments[0]!;
    state = formXReplyIntent(state, "A reply owned by the Assignment.", "target-post-assignment-stop", undefined, assignment.id);
    const execution = state.executions[0]!;

    const stopped = applyOperation(state, { type: "cancelAssignment", id: assignment.id });
    expect(stopped.assignments[0]?.status).toBe("cancelled");
    expect(stopped.executions.find((item) => item.id === execution.id)?.status).toBe("cancelled");
    expect(stopped.socialIntents.find((item) => item.id === execution.socialIntentId)?.state).toBe("withdrawn");
  });

  it("keeps Assignment actions scoped to their Presence after an active Presence switch", () => {
    const state = createAgent(input);
    const activePresence = { ...state.presence!, id: "presence-active", name: "Active Presence", handle: "@active_presence", status: "live" as const, environment: "live" as const, connectionMode: "native" as const };
    const assignmentPresence = { ...state.presence!, id: "presence-assignment", name: "Assignment Presence", handle: "@assignment_presence", status: "live" as const, environment: "live" as const, connectionMode: "native" as const, execution: { ...state.presence!.execution, like: "auto" as const, reply: "auto" as const } };
    state.presences = [activePresence, assignmentPresence];
    state.presence = activePresence;
    state.activePresenceId = activePresence.id;
    const assignmentId = "assignment-presence-scope";
    state.assignments = [{ id: assignmentId, agentId: state.agent!.id, presenceId: assignmentPresence.id, environment: "live", status: "active", instruction: "Help the source reach people who genuinely care.", title: "Assignment Presence distribution", deliverable: { type: "meaningful_engagement" }, progress: { required: 1, verified: 0 }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as never];
    state.mirrorObjects = [{ id: "assignment-target", bridgeId: "native:assignment", presenceId: assignmentPresence.id, channelId: "x", externalRef: { type: "x.post", id: "assignment-target" }, objectType: "post", language: "en", content: { text: "A concrete public conversation for the Assignment." }, author: { displayName: "Target Author", handle: "target_author", externalRef: { type: "x.user", id: "target-author" } }, observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", environment: "live", source: "native", trust: "untrusted_world_content" } as never];

    const next = formXActionIntent(state, { affordance: "x.like", target: { type: "x.post", id: "assignment-target" }, assignmentId, source: "agent" });
    expect(next.executions[0]).toMatchObject({ assignmentId, presenceId: assignmentPresence.id, target: { id: "assignment-target" } });
    expect(next.socialIntents[0]?.presenceId).toBe(assignmentPresence.id);

    const publicationState = formAssignmentPostIntent(next, "A concrete Assignment publication.", assignmentId);
    expect(publicationState.executions[0]).toMatchObject({ assignmentId, presenceId: assignmentPresence.id, affordance: "x.post" });
    expect(publicationState.socialIntents[0]?.presenceId).toBe(assignmentPresence.id);
    expect(publicationState.publications[0]?.publicExpression?.presenceId).toBe(assignmentPresence.id);
  });

  it("cancelling a migrated reply Assignment also stops its legacy directive delivery", () => {
    let state = createAgent(input);
    const presenceId = state.presence!.id;
    const target = { type: "x.post" as const, id: "target-post-migrated-stop" };
    state.mirrorObjects.unshift({ id: "mirror-migrated-stop", bridgeId: "native:test", presenceId, channelId: "x", externalRef: target, objectType: "post", author: { displayName: "Craig", handle: "craigweiss" }, content: { text: "A target that must not receive a duplicate reply." }, observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", environment: "live", source: "native", trust: "untrusted_world_content" });
    state.operatorDirectives.unshift({ id: "directive-migrated-stop", agentId: state.agent!.id, presenceId, target, requiredAct: "reply", provenance: "operator", initialAct: "no_op", status: "requested", createdAt: new Date().toISOString() });
    state = normalizeState(state);
    const assignment = state.assignments.find((item) => item.migration?.sourceId === "directive-migrated-stop")!;
    state = formXReplyIntent(state, "A reply linked to the migrated Assignment.", target.id, "directive-migrated-stop");
    const execution = state.executions[0]!;
    execution.status = "queued";

    const stopped = applyOperation(state, { type: "cancelAssignment", id: assignment.id });
    expect(stopped.assignments.find((item) => item.id === assignment.id)?.status).toBe("cancelled");
    expect(stopped.operatorDirectives.find((item) => item.id === "directive-migrated-stop")?.status).toBe("failed");
    expect(stopped.executions.find((item) => item.id === execution.id)?.status).toBe("cancelled");
  });

  it("preserves in-flight dispatched child execution reconciliation when parent Assignment is cancelled", () => {
    let state = createAgent(input);
    const presenceId = state.presence!.id;
    const target = { type: "x.post" as const, id: "target-post-inflight-cancel" };
    state.mirrorObjects.unshift({ id: "mirror-inflight-cancel", bridgeId: "native:test", presenceId, channelId: "x", externalRef: target, objectType: "post", author: { displayName: "Dana", handle: "dana_research" }, content: { text: "Long-horizon persistence." }, observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", environment: "live", source: "native", trust: "untrusted_world_content" });
    state.operatorDirectives.unshift({ id: "directive-inflight-cancel", agentId: state.agent!.id, presenceId, target, requiredAct: "reply", provenance: "operator", initialAct: "no_op", status: "requested", createdAt: new Date().toISOString() });
    state = normalizeState(state);
    const assignment = state.assignments.find((item) => item.migration?.sourceId === "directive-inflight-cancel")!;
    state = formXReplyIntent(state, "A reply that is already in flight on the wire.", target.id, "directive-inflight-cancel");
    const execution = state.executions[0]!;
    // Dispatch has started: execution is in flight
    execution.status = "executing";

    // Operator cancels the Assignment
    const stopped = applyOperation(state, { type: "cancelAssignment", id: assignment.id });
    expect(stopped.assignments.find((item) => item.id === assignment.id)?.status).toBe("cancelled");
    // Already-dispatched child execution enters reconciliation-only state
    expect(stopped.executions.find((item) => item.id === execution.id)?.status).toBe("verification-pending");
  });

  it("handles uncertain execution during connector handoff without blind retries or false cancellation claims", () => {
    let state = createAgent(input);
    const presenceId = state.presence!.id;
    const target = { type: "x.post" as const, id: "target-uncertain-handoff" };
    state.mirrorObjects.unshift({ id: "mirror-uncertain-handoff", bridgeId: "native:test", presenceId, channelId: "x", externalRef: target, objectType: "post", author: { displayName: "Researcher", handle: "researcher" }, content: { text: "Uncertain handoff post." }, observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", environment: "live", source: "native", trust: "untrusted_world_content" });
    state.operatorDirectives.unshift({ id: "directive-uncertain", agentId: state.agent!.id, presenceId, target, requiredAct: "reply", provenance: "operator", initialAct: "no_op", status: "requested", createdAt: new Date().toISOString() });
    state = normalizeState(state);
    const assignment = state.assignments.find((item) => item.migration?.sourceId === "directive-uncertain")!;
    state = formXReplyIntent(state, "Reply sent during uncertain network window.", target.id, "directive-uncertain");
    const execution = state.executions[0]!;
    // Status is in flight/uncertain (1 attempt in progress)
    execution.status = "executing";
    execution.attempts = 1;

    // Operator cancels parent Assignment during uncertain handoff
    const stopped = applyOperation(state, { type: "cancelAssignment", id: assignment.id });
    // Invariant 1: Assignment is marked cancelled
    expect(stopped.assignments.find((item) => item.id === assignment.id)?.status).toBe("cancelled");
    // Invariant 2: In-flight execution is NOT falsely marked cancelled or retryable
    const inFlightExecution = stopped.executions.find((item) => item.id === execution.id)!;
    expect(inFlightExecution.status).toBe("verification-pending");
    expect(inFlightExecution.attempts).toBe(1);
    // Invariant 3: Intent remains in flight so reconciliation can finish
    const intent = stopped.socialIntents.find((item) => item.id === execution.socialIntentId)!;
    expect(intent.state).not.toBe("withdrawn");
    // Invariant 4: In-flight/working executions are strictly excluded from retry queues
    const retryEligible = stopped.executions.filter((item) => item.status === "queued" && item.mode === "auto");
    expect(retryEligible.some((item) => item.id === execution.id)).toBe(false);
  });

  it("turns an explicit Chat publication request into a native X execution", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { execution: { post: "auto" } } });
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "jenny_ai", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    expect(isExplicitXPostRequest("Introduce this Presence on X and invite conversation.")).toBe(true);
    state = formChatPostIntent(state, "I am Jenny, learning to become a useful presence for thoughtful builders. What are you learning right now?");
    expect(state.socialIntents[0]?.affordance).toBe("x.post");
    expect(state.executions[0]?.connector).toBe("native");
    expect(state.executions[0]?.status).toBe("queued");
    expect(state.actions[0]?.executionId).toBe(state.executions[0]?.id);
    expect(state.outcomes).toHaveLength(0);
  });

  it("distinguishes an explicit publication outcome from a request for drafting help", () => {
    expect(isExplicitXPostRequest("Introduce yourself to the world. You just woke up for the first time. Make your first tweet")).toBe(true);
    expect(isExplicitXPostRequest("Actually make the tweet")).toBe(true);
    expect(isExplicitXPostRequest("Publish a post on X about what you learned today")).toBe(true);
    expect(isExplicitXPostRequest("Can you post")).toBe(true);
    expect(isExplicitXPostRequest("Could you please publish something")).toBe(true);
    expect(isExplicitXPostRequest("Draft three tweet options for me to review")).toBe(false);
    expect(isExplicitXPostRequest("What makes a good tweet?")).toBe(false);
    expect(isExplicitXPostRequest("How do I make a post on X?")).toBe(false);
    expect(isExplicitXPostRequest("Should we make a tweet about this?")).toBe(false);
    expect(isExplicitXPostRequest("What do you think about our growth right now?")).toBe(false);
  });

  it("blocks planner metadata at every public intent constructor", () => {
    const plannerObject = '{"conversationDisposition":"react_only","action":"like","rationale":"A quiet signal is enough."}';
    let state = createAgent(input);
    state = formChatPostIntent(state, plannerObject);
    expect(state.executions[0]).toMatchObject({ status: "blocked", failure: { code: "PUBLIC_TEXT_INTERNAL_MARKER" } });
    expect(state.mirrorObjects).toHaveLength(0);

    state = createAgent(input);
    state = formXReplyIntent(state, plannerObject, "post-1");
    expect(state.executions[0]).toMatchObject({ status: "blocked", failure: { code: "PUBLIC_TEXT_INTERNAL_MARKER" } });

    state = createAgent(input);
    state = startPlaygroundSession(state, state.presence!.id, "fresh");
    const session = state.playgroundSessions[0]!;
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "post", text: plannerObject });
    expect(state.executions[0]).toMatchObject({ status: "blocked", failure: { code: "PUBLIC_TEXT_INTERNAL_MARKER" } });
    expect(() => deliverSandboxExecution(state, state.executions[0]!.id)).toThrow(/Sandbox delivery is not ready/);
    expect(state.mirrorObjects).toHaveLength(0);
  });

  it("blocks a live reply that substantially impersonates the observed source", () => {
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { reply: "auto" } } });
    const presenceId = state.presence!.id;
    const target = { type: "x.post" as const, id: "micky-source" };
    state.mirrorObjects.unshift({ id: "mirror-micky-source", bridgeId: "native:test", presenceId, channelId: "x", externalRef: target, objectType: "reply", author: { displayName: "Micky", handle: "Rasmic" }, content: { text: "@benswerd hmm you gave me reason to opensource it... give me a couple days and will do it" }, observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", environment: "live", source: "native", trust: "untrusted_world_content" });

    state = formXReplyIntent(state, "@benswerd Hmm, you’ve given me a reason to open-source it… give me a couple of days and I’ll do it.", target.id);
    expect(state.executions[0]).toMatchObject({ status: "blocked", failure: { code: "SOURCE_EXPRESSION_ECHO" } });
  });

  it("requires context for written actions but permits a direct like on the observed target", () => {
    const state = applyOperation(createAgent(input), { type: "setPresence", patch: { execution: { reply: "auto", like: "auto" } } });
    const presenceId = state.presence!.id;
    const target = { type: "x.post" as const, id: "outer-quote" };
    state.mirrorObjects.unshift({ id: "mirror-outer-quote", bridgeId: "bridge:test", presenceId, channelId: "x", externalRef: target, referencedExternalRefs: [{ type: "x.post", id: "missing-quoted-post" }], objectType: "post", author: { displayName: "Outer Author", handle: "outer" }, content: { text: "Commentary over a quote." }, observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", environment: "live", source: "native", trust: "untrusted_world_content" });

    const afterReply = formXReplyIntent(state, "A reply that would otherwise be valid.", target.id);
    expect(afterReply.executions).toHaveLength(state.executions.length);
    expect(afterReply.events[0]).toMatchObject({ title: "Public action held for complete context", tone: "warning" });

    const afterQuote = formXActionIntent(state, { affordance: "x.quote", target, text: "A grounded addition." });
    expect(afterQuote.executions).toHaveLength(state.executions.length);

    const afterLike = formXActionIntent(state, { affordance: "x.like", target });
    expect(afterLike.executions).toHaveLength(state.executions.length + 1);
    expect(afterLike.executions[0]).toMatchObject({ affordance: "x.like", target });
  });

  it("keeps public footing in Presence context and anchors replies to the observed post", () => {
    let state = createAgent(input);
    state = recordPublicFooting(state, state.presence!.id, { postsPublished: 0, recentPostIds: [], recentInboundIds: ["mention-1"], observedAt: new Date().toISOString() });
    expect(state.presence?.context.publicFooting?.postsPublished).toBe(0);
    expect(compilePresenceContext(state.presence!).publicFooting?.recentInboundIds).toEqual(["mention-1"]);
    state = formXReplyIntent(state, "That is exactly the kind of question I want to explore.", "post-1");
    expect(state.socialIntents[0]?.target).toEqual({ type: "x.post", id: "post-1" });
    expect(state.executions[0]?.target).toEqual({ type: "x.post", id: "post-1" });
  });

  it("records operator-directed replies without giving the operator the Agent's expression", () => {
    let state = createAgent(input);
    const sessionState = startPlaygroundSession(state, state.presence!.id);
    state = addSandboxEvent(sessionState, { sessionId: sessionState.playgroundSessions[0]!.id, actionId: "post", actorName: "Alex", content: "What changed your mind about persistent agents?" });
    const target = state.mirrorObjects.find((item) => item.actorPresenceId !== state.presence!.id)!;
    state = applyOperation(state, { type: "askPresenceToReply", presenceId: state.presence!.id, objectId: target.id, sessionId: target.sessionId, optionalDirection: "Keep it concrete and lightly playful." });
    const directive = state.operatorDirectives[0]!;
    expect(directive).toMatchObject({ target: target.externalRef, requiredAct: "reply", initialAct: "no_op", provenance: "operator", optionalDirection: "Keep it concrete and lightly playful." });
    expect(state.socialIntents).toHaveLength(0);
    state = formSandboxIntent(state, { sessionId: target.sessionId!, affordance: "reply", format: "x.reply", text: "The useful shift was treating memory as a product surface, not a hidden implementation detail.", target: target.externalRef, perceptionTarget: target.externalRef, operatorDirectiveId: directive.id });
    expect(state.socialIntents[0]).toMatchObject({ source: "operator", operatorDirectiveId: directive.id, target: target.externalRef });
    expect(state.executions[0]).toMatchObject({ source: "operator", operatorDirectiveId: directive.id });
  });

  it("allows an explicit operator reply while the Presence is paused", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { status: "paused", execution: { ...state.presence!.execution, reply: "auto" } } });
    state = formXReplyIntent(state, "A concrete reply from the paused Presence.", "post-1", "directive-paused");
    expect(state.socialIntents[0]).toMatchObject({ source: "operator", operatorDirectiveId: "directive-paused" });
    expect(state.executions[0]).toMatchObject({ source: "operator", operatorDirectiveId: "directive-paused", target: { type: "x.post", id: "post-1" } });
  });

  it("reopens an operator reply directive when its previous request has no execution", () => {
    let state = createAgent(input);
    const sessionState = startPlaygroundSession(state, state.presence!.id);
    state = addSandboxEvent(sessionState, { sessionId: sessionState.playgroundSessions[0]!.id, actionId: "post", actorName: "Maya Chen", content: "A post that needs a retry." });
    const target = state.mirrorObjects.find((item) => item.actorPresenceId !== state.presence!.id)!;
    state = applyOperation(state, { type: "askPresenceToReply", presenceId: state.presence!.id, objectId: target.id, sessionId: target.sessionId });
    state.operatorDirectives[0]!.status = "expressed";
    state = applyOperation(state, { type: "askPresenceToReply", presenceId: state.presence!.id, objectId: target.id, sessionId: target.sessionId, optionalDirection: "Retry with one concrete point." });
    expect(state.operatorDirectives[0]).toMatchObject({ status: "requested", optionalDirection: "Retry with one concrete point." });
  });

  it("does not create an operator reply directive when Replies are off", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { execution: { ...state.presence!.execution, reply: "off" } } });
    const sessionState = startPlaygroundSession(state, state.presence!.id);
    state = addSandboxEvent(sessionState, { sessionId: sessionState.playgroundSessions[0]!.id, actionId: "post", actorName: "Alex", content: "A question for Jenny." });
    const target = state.mirrorObjects.find((item) => item.actorPresenceId !== state.presence!.id)!;
    state = applyOperation(state, { type: "askPresenceToReply", presenceId: state.presence!.id, objectId: target.id, sessionId: target.sessionId });
    expect(state.operatorDirectives).toHaveLength(0);
  });

  it("records an operator-directed ignore without creating intent or delivery", () => {
    let state = createAgent(input);
    const sessionState = startPlaygroundSession(state, state.presence!.id);
    state = addSandboxEvent(sessionState, { sessionId: sessionState.playgroundSessions[0]!.id, actionId: "post", actorName: "Alex", content: "A post the operator wants left alone." });
    const target = state.mirrorObjects.find((item) => item.actorPresenceId !== state.presence!.id)!;

    state = applyOperation(state, { type: "askPresenceToIgnore", presenceId: state.presence!.id, objectId: target.id, sessionId: target.sessionId });

    expect(state.operatorDirectives[0]).toMatchObject({ target: target.externalRef, requiredAct: "no_op", initialAct: "no_op", provenance: "operator", status: "expressed" });
    expect(state.socialIntents).toHaveLength(0);
    expect(state.executions).toHaveLength(0);
    expect(state.events[0]).toMatchObject({ title: `The operator asked ${state.presence!.name} to ignore this post`, sourceObjectId: target.id, tone: "quiet" });

    const eventCount = state.events.length;
    state = applyOperation(state, { type: "askPresenceToIgnore", presenceId: state.presence!.id, objectId: target.id, sessionId: target.sessionId });
    expect(state.operatorDirectives).toHaveLength(1);
    expect(state.events).toHaveLength(eventCount);
  });

  it("keeps observed inbound messages separate from messages already judged", () => {
    let state = createAgent(input);
    state = recordPublicFooting(state, state.presence!.id, { postsPublished: 1, recentPostIds: ["post-1"], recentInboundIds: ["new-mention", "old-mention"], observedAt: new Date().toISOString() });
    state = markInboundJudged(state, state.presence!.id, "old-mention");
    expect(state.presence?.context.publicFooting?.recentInboundIds).toEqual(["new-mention", "old-mention"]);
    expect(state.presence?.context.publicFooting?.judgedInboundIds).toEqual(["old-mention"]);
    expect(state.presence?.context.publicFooting?.judgedInboundIds).not.toContain("new-mention");
  });

  it("gives each Presence its own brief without changing the Agent meaning files", () => {
    let state = createAgent(input);
    const originalFiles = Object.fromEntries(state.files.filter((file) => ["MISSION", "SOUL", "TASTE"].includes(file.kind)).map((file) => [file.kind, file.content]));
    const firstId = state.presence!.id;
    state = applyOperation(state, { type: "setPresence", patch: { brief: { ...state.presence!.brief, purpose: "Become a recognizable voice among founders.", primaryTerritory: ["Persistent agents", "Agent memory"] } } });
    state = applyOperation(state, { type: "createPresence", input: { channel: "linkedin", handle: "@jenny-builds", mode: "agent", accent: "#D68754" } });
    const secondId = state.presence!.id;
    state = applyOperation(state, { type: "setPresence", patch: { brief: { ...state.presence!.brief, purpose: "Help product teams make AI understandable.", primaryTerritory: ["Product design", "AI teams"] } } });
    expect(state.presences.find((item) => item.id === firstId)?.brief.primaryTerritory).toEqual(["Persistent agents", "Agent memory"]);
    expect(state.presences.find((item) => item.id === secondId)?.brief.primaryTerritory).toEqual(["Product design", "AI teams"]);
    expect(Object.fromEntries(state.files.filter((file) => ["MISSION", "SOUL", "TASTE"].includes(file.kind)).map((file) => [file.kind, file.content]))).toEqual(originalFiles);
  });

  it("keeps Presence boundaries in judgment context without hiding Social Mirror objects", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { brief: { ...state.presence!.brief, boundaries: ["Partisan politics"] } } });
    const session = startPlaygroundSession(state, state.presence!.id);
    state = addSandboxEvent(session, { sessionId: session.playgroundSessions[0]!.id, actionId: "post", actorName: "Maya", content: "A political claim that this Presence should understand before deciding whether to engage." });
    expect(state.mirrorObjects.some((item) => item.content?.text?.includes("political claim"))).toBe(true);
    expect(compilePresenceContext(state.presence!).brief.boundaries).toEqual(["Partisan politics"]);
  });

  it("compiles only the active Presence Brief and keeps Ghost specialization local", () => {
    let state = createAgent(input);
    const firstId = state.presence!.id;
    state = applyOperation(state, { type: "setPresence", patch: { brief: { ...state.presence!.brief, primaryTerritory: ["Persistent agents"] } } });
    state = applyOperation(state, { type: "createPresence", input: { channel: "x", handle: "@jenny-ghost", mode: "ghost", accent: "#D68754" } });
    const ghostId = state.presence!.id;
    state = applyOperation(state, { type: "setPresence", patch: { brief: { ...state.presence!.brief, primaryTerritory: ["Alex's public work"] } } });
    expect(compilePresenceContext(state.presences.find((item) => item.id === firstId)!).brief.primaryTerritory).toEqual(["Persistent agents"]);
    expect(compilePresenceContext(state.presences.find((item) => item.id === ghostId)!).brief.primaryTerritory).toEqual(["Alex's public work"]);
    expect(state.presences.find((item) => item.id === ghostId)?.mode).toBe("ghost");
  });

  it("persists Presence Brief changes from typed conversation without rewriting protected meaning", () => {
    let state = createAgent(input);
    const originalFiles = Object.fromEntries(state.files.filter((file) => ["MISSION", "SOUL", "TASTE"].includes(file.kind)).map((file) => [file.kind, file.content]));
    state = applyOperation(state, { type: "sendMessage", content: "Make this account mostly about persistent agents." });
    state = applyOperation(state, { type: "sendMessage", content: "Founders and agent builders are the audience." });
    state = applyOperation(state, { type: "sendMessage", content: "Don’t get involved in culture-war arguments here." });
    state = applyOperation(state, { type: "sendMessage", content: "Technical AI infrastructure is adjacent, but not the main thing." });
    expect(state.presence?.brief.primaryTerritory).toEqual(["persistent agents"]);
    expect(state.presence?.brief.audience).toBe("Founders and agent builders");
    expect(state.presence?.brief.boundaries).toContain("culture-war arguments");
    expect(state.presence?.brief.adjacentTerritory).toContain("Technical AI infrastructure");
    expect(state.files.find((file) => file.kind === "PRESENCE")?.content).toContain("Presence brief");
    expect(state.changeSets.filter((item) => item.summary.includes("Presence Brief"))).toHaveLength(4);
    expect(Object.fromEntries(state.files.filter((file) => ["MISSION", "SOUL", "TASTE"].includes(file.kind)).map((file) => [file.kind, file.content]))).toEqual(originalFiles);
  });

  it("records a native delivery failure without inventing an external outcome", () => {
    let state = createAgent(input);
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "jenny_ai", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state = formChatPostIntent(state, "A useful first point of view.");
    const executionId = state.executions[0]!.id;
    state = failNativeExecution(state, executionId, "X rejected this action: write permission unavailable.");
    state = markNativeConnectionNeedsAttention(state, state.presence!.id, "X rejected this action: write permission unavailable.");
    expect(state.executions[0]?.status).toBe("failed");
    expect(state.executions[0]?.externalRef).toBeUndefined();
    expect(state.outcomes[0]?.status).toBe("failed");
    expect(state.nativeConnections[0]?.status).toBe("needs-attention");
    expect(deriveActivitySummary(state).current.label).toBe("X connection needs attention");
  });

  it("marks duplicate X content as non-retryable", () => {
    let state = createAgent(input);
    state = formChatPostIntent(state, "A repeated public expression.");
    const executionId = state.executions[0]!.id;
    state = failNativeExecution(state, executionId, "X rejected this action: You are not allowed to create a Tweet with duplicate content.");
    expect(state.executions[0]?.failure).toMatchObject({ code: "DUPLICATE_CONTENT", retryable: false });
    expect(state.executions[0]?.reviewReason).toContain("duplicate content");
    expect(applyOperation(state, { type: "retryExecution", id: executionId }).executions[0]?.status).toBe("failed");
  });

  it("does not retry a failure after it has been reviewed", () => {
    let state = createAgent(input);
    state = formChatPostIntent(state, "A reply that needs operator review.");
    const executionId = state.executions[0]!.id;
    state = failNativeExecution(state, executionId, "The X channel rejected delivery.");

    state = applyOperation(state, {
      type: "reviewFailedExecution",
      id: executionId,
      disposition: "operator_action_required",
      note: "The account or permission boundary needs operator action before another attempt.",
    });
    const reviewed = state.executions[0]!;
    expect(reviewed.failure).toMatchObject({ reviewDisposition: "operator_action_required", reviewedAt: expect.any(String) });
    expect(applyOperation(state, { type: "retryExecution", id: executionId }).executions[0]).toMatchObject({ status: "failed", failure: { reviewedAt: reviewed.failure?.reviewedAt } });
    expect(deriveActivitySummary(state).current.label).not.toBe("X delivery failed");
  });

  it("closes a failed delivery without implying that it was sent", () => {
    let state = createAgent(input);
    state = formChatPostIntent(state, "A delivery that cannot be verified.");
    const executionId = state.executions[0]!.id;
    state = failNativeExecution(state, executionId, "Account check failed. Expected @example_agent.");

    state = applyOperation(state, {
      type: "reviewFailedExecution",
      id: executionId,
      disposition: "closed_non_retryable",
      note: "Closed after reconciliation found no verifiable public result.",
    });

    const closed = state.executions[0]!;
    expect(closed.status).toBe("failed");
    expect(closed.externalRef).toBeUndefined();
    expect(closed.failure).toMatchObject({
      reviewedAt: expect.any(String),
      reviewDisposition: "closed_non_retryable",
      reviewNote: "Closed after reconciliation found no verifiable public result.",
    });
    expect(state.outcomes[0]?.status).toBe("failed");
    expect(state.events[0]?.title).toBe("Failure reviewed");
  });

  it("requeues the same failed execution when the operator retries it", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { execution: { post: "auto" } } });
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "jenny_ai", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state = formChatPostIntent(state, "A useful first point of view.");
    const execution = state.executions[0]!;
    const originalIntentId = execution.socialIntentId;
    const originalIntentCount = state.socialIntents.length;
    state = failNativeExecution(state, execution.id, "X temporarily rejected this action.");

    state = applyOperation(state, { type: "retryExecution", id: execution.id });

    expect(state.executions[0]).toMatchObject({ id: execution.id, socialIntentId: originalIntentId, status: "queued" });
    expect(state.executions[0]?.failure).toBeUndefined();
    expect(state.socialIntents).toHaveLength(originalIntentCount);
    expect(state.events[0]?.title).toBe("Retry requested");
  });

  it("keeps a native retry behind durable backoff and cancellation fences it", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { execution: { post: "auto" } } });
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "jenny_ai", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state = formChatPostIntent(state, "A retry that must wait before another connector attempt.");
    const execution = state.executions[0]!;
    state = failNativeExecution(state, execution.id, "Temporary connector failure.");
    state = applyOperation(state, { type: "retryExecution", id: execution.id });

    const queued = state.executions.find((item) => item.id === execution.id)!;
    expect(queued.status).toBe("queued");
    expect(queued.retryAt).toEqual(expect.any(String));
    expect(new Date(queued.retryAt!).getTime()).toBeGreaterThan(Date.now());

    state = applyOperation(state, { type: "cancelExecution", id: execution.id });
    expect(state.executions.find((item) => item.id === execution.id)).toMatchObject({ status: "cancelled", retryAt: undefined });
  });

  it("keeps operator wake state when native delivery is blocked by X billing", () => {
    let state = createAgent(input);
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "jenny_ai", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state = markNativeConnectionNeedsAttention(state, state.presence!.id, "X has no API credits remaining for this app.");
    expect(state.nativeConnections[0]?.status).toBe("connected");
    expect(state.nativeConnections[0]?.deliveryError).toContain("no API credits");
    expect(state.nativeConnections[0]?.healthMessage).toBeUndefined();
    expect(state.presence?.status).toBe("live");
    const manifest = derivePresenceCapabilityManifest(state, state.presence!.id);
    for (const capability of ["post", "quote", "reply", "like", "image", "video"]) {
      expect(manifest.items.find((item) => item.capability === capability)?.canExecute).toBe(false);
    }
  });

  it("preserves both awake and operator-paused state across normalization during an X billing block", () => {
    const state = createAgent(input);
    state.presence!.status = "live";
    state.presence!.environment = "live";
    state.presences[0]!.status = "live";
    state.presences[0]!.environment = "live";
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read-write", deliveryError: "X has no API credits remaining for this app.", account: { id: "account-1", username: "jenny_ai", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    const normalized = normalizeState(state);
    expect(normalized.presence?.status).toBe("live");
    expect(normalized.presences[0]?.status).toBe("live");
    const paused = applyOperation(normalized, { type: "pausePresence", presenceId: normalized.presence!.id });
    expect(normalizeState(paused).presence?.status).toBe("paused");
  });

  it("keeps the native connection healthy when X rejects a reply target", () => {
    let state = createAgent(input);
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "jenny_ai", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state = markNativeConnectionNeedsAttention(state, state.presence!.id, "X rejected this action: You can only reply to or quote posts where you are mentioned or are the author.");
    expect(state.nativeConnections[0]?.status).toBe("connected");
    expect(state.nativeConnections[0]?.deliveryError).toContain("only reply");
    expect(state.nativeConnections[0]?.healthMessage).toBeUndefined();
  });

  it("does not hand X an ineligible quote target, while eligible quotes keep their route", () => {
    let state = createAgent(input);
    state.presence!.execution.quote = "auto";
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "jenny_ai", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state.bridges = [{ id: "bridge-1", presenceId: state.presence!.id, name: "OpenPresence Chrome · Genny", kind: "bridge", channelId: "x", state: "online", lastHeartbeatAt: new Date().toISOString(), accountIdentity: { username: "jenny_ai", status: "verified", observedAt: new Date().toISOString() }, browserAdapters: verifiedBrowserAdapters({ username: "jenny_ai", status: "verified", observedAt: new Date().toISOString() }), capabilities: { inbound: true, reconcile: true, affordances: ["quote", "reply"], formats: ["x.quote", "x.reply"], metrics: [] }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state = recordNativeMirror(state, { connectionId: "native-x", presenceId: state.presence!.id, post: { id: "unmentioned-post", text: "A post without mentioning the handle.", authorId: "author-99", authorUsername: "third_party", authorName: "Third Party" } });
    state = recordNativeMirror(state, { connectionId: "native-x", presenceId: state.presence!.id, post: { id: "mentioned-post", text: "Hey @jenny_ai what do you think?", authorId: "author-99", authorUsername: "third_party", authorName: "Third Party" } });

    const unmentionedQuote = formXActionIntent(state, { affordance: "x.quote", target: { type: "x.post", id: "unmentioned-post" }, text: "A quote on unmentioned post." });
    expect(unmentionedQuote.executions).toHaveLength(0);

    const mentionedQuote = formXActionIntent(state, { affordance: "x.quote", target: { type: "x.post", id: "mentioned-post" }, text: "A quote on mentioned post." });
    expect(mentionedQuote.executions[0]?.connector).toBe("native");

    const browserReadyState = structuredClone(state);
    browserReadyState.presence!.browserAccess = { enabled: true };
    browserReadyState.presences = browserReadyState.presences.map((presence) => presence.id === browserReadyState.presence!.id ? { ...presence, browserAccess: { enabled: true } } : presence);
    browserReadyState.presence = browserReadyState.presences[0];
    const browserPreferredQuote = formXActionIntent(browserReadyState, { affordance: "x.quote", target: { type: "x.post", id: "mentioned-post" }, text: "Use the browser tool for this quote.", routePreference: "browser" });
    expect(browserPreferredQuote.executions[0]?.connector).toBe("bridge");
    const apiPreferredQuote = formXActionIntent(browserReadyState, { affordance: "x.quote", target: { type: "x.post", id: "mentioned-post" }, text: "Use the API tool for this quote.", routePreference: "api" });
    expect(apiPreferredQuote.executions[0]?.connector).toBe("native");

    const unknownQuote = formXActionIntent(browserReadyState, { affordance: "x.quote", target: { type: "x.post", id: "unknown-post" }, text: "A later quote after learning." });
    const learned = rerouteExecutionToBridge(unknownQuote, unknownQuote.executions[0]!.id, "The native API rejected this quote action.");
    const nextAttempt = formXActionIntent(learned, { affordance: "x.quote", target: { type: "x.post", id: "mentioned-post" }, text: "A later quote after learning." });
    expect(nextAttempt.executions[0]?.connector).toBe("bridge");
    expect(nextAttempt.presence?.browserAccess?.learnedFallbacks?.[0]?.action).toBe("x.quote");
  });

  it("recognizes an unmentioned quote target when a verified Chrome route is connected", () => {
    let state = createAgent(input);
    const presence = state.presence!;
    presence.execution.quote = "auto";
    presence.browserAccess = { enabled: true };
    const observedAt = new Date().toISOString();
    state.nativeConnections = [{ id: "native-x-verified", presenceId: presence.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: presence.handle, name: presence.name }, createdAt: observedAt, updatedAt: observedAt }];
    state.bridges = [{ id: "bridge-chrome-verified", presenceId: presence.id, name: "OpenPresence Chrome · Genny", kind: "bridge", channelId: "x", state: "online", lastHeartbeatAt: observedAt, accountIdentity: { username: presence.handle, status: "verified", observedAt }, browserAdapters: verifiedBrowserAdapters({ username: presence.handle, status: "verified", observedAt }), capabilities: { inbound: true, reconcile: true, affordances: ["quote"], formats: ["x.quote"], metrics: [] }, createdAt: observedAt, updatedAt: observedAt }];
    state.mirrorObjects.unshift({ id: "unmentioned-public-post", bridgeId: "bridge-chrome-verified", presenceId: presence.id, channelId: "x", externalRef: { type: "x.post", id: "unmentioned-public-post" }, objectType: "post", author: { displayName: "Public Author", handle: "public_author" }, content: { text: "A public post worth adding context to." }, observedAt, occurredAt: observedAt, visibility: "public", shareability: "presence-only", environment: "live", source: "native", trust: "untrusted_world_content" });

    expect(xQuoteTargetHasAvailableRoute(state, presence, "unmentioned-public-post")).toBe(true);
    state = formXActionIntent(state, { affordance: "x.quote", target: { type: "x.post", id: "unmentioned-public-post" }, text: "A concrete detail worth carrying forward." });
    expect(state.executions[0]).toMatchObject({ affordance: "x.quote", connector: "bridge", status: "queued" });
  });

  it("does not offer a verified Chrome route after its account no longer matches the Presence", () => {
    const state = createAgent(input);
    const presence = state.presence!;
    presence.browserAccess = { enabled: true };
    const observedAt = new Date().toISOString();
    state.bridges = [{ id: "bridge-wrong-account", presenceId: presence.id, name: "OpenPresence Chrome · Jenny", kind: "bridge", channelId: "x", state: "online", lastHeartbeatAt: observedAt, accountIdentity: { username: "richardsondx", status: "verified", observedAt }, browserAdapters: verifiedBrowserAdapters({ username: "richardsondx", status: "verified", observedAt }), capabilities: { inbound: true, reconcile: true, affordances: ["quote"], formats: ["x.quote"], metrics: [] }, createdAt: observedAt, updatedAt: observedAt }];
    state.mirrorObjects.unshift({ id: "unmentioned-post-wrong-account", bridgeId: "bridge-wrong-account", presenceId: presence.id, channelId: "x", externalRef: { type: "x.post", id: "unmentioned-post-wrong-account" }, objectType: "post", author: { displayName: "Public Author", handle: "public_author" }, content: { text: "A public post worth adding context to." }, observedAt, occurredAt: observedAt, visibility: "public", shareability: "presence-only", environment: "live", source: "native", trust: "untrusted_world_content" });

    expect(xQuoteTargetHasAvailableRoute(state, presence, "unmentioned-post-wrong-account")).toBe(false);
    expect(formXActionIntent(state, { affordance: "x.quote", target: { type: "x.post", id: "unmentioned-post-wrong-account" }, text: "Do not route through the wrong account." }).executions).toHaveLength(0);
  });

  it("automatically reroutes an execution to Chrome extension bridge when X rejects with mention restriction error", () => {
    const state = createAgent(input);
    state.presence!.execution.quote = "auto";
    state.presence!.browserAccess = { enabled: true };
    const observedAt = new Date().toISOString();
    state.bridges = [{ id: "bridge-chrome", presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", channelId: "x", state: "online", lastHeartbeatAt: observedAt, accountIdentity: { username: state.presence!.handle, status: "verified", observedAt }, browserAdapters: verifiedBrowserAdapters({ username: state.presence!.handle, status: "verified", observedAt }), capabilities: { inbound: true, reconcile: true, affordances: ["quote", "reply"], formats: ["x.quote", "x.reply"], metrics: [] }, createdAt: observedAt, updatedAt: observedAt }];

    const quoteResult = formXActionIntent(state, { affordance: "x.quote", target: { type: "x.post", id: "third-party-quote" }, text: "Insightful quote" });
    const execution = quoteResult.executions[0]!;
    expect(execution).toBeDefined();

    const errorMsg = "X rejected this action: You can only reply to or quote posts where you are mentioned or are the author.";
    expect(isMentionRestrictedError(errorMsg)).toBe(true);

    const reroutedState = rerouteExecutionToBridge(quoteResult, execution.id, errorMsg);
    const reroutedExecution = reroutedState.executions.find((e) => e.id === execution.id);

    expect(reroutedExecution?.connector).toBe("bridge");
    expect(reroutedExecution?.bridgeId).toBe("bridge-chrome");
    expect(reroutedExecution?.status).toBe("queued");
    expect(reroutedExecution?.failure).toBeUndefined();
    expect(reroutedState.events[0]?.title).toBe("Browser route learned");
  });

  it("reroutes repost delivery to Chrome when native X rejects the action", () => {
    const state = createAgent(input);
    state.presence!.execution.repost = "auto";
    state.presence!.browserAccess = { enabled: true };
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "jenny_ai", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    const observedAt = new Date().toISOString();
    state.bridges = [{ id: "bridge-chrome", presenceId: state.presence!.id, name: "OpenPresence Chrome", kind: "bridge", channelId: "x", state: "online", lastHeartbeatAt: observedAt, accountIdentity: { username: state.presence!.handle, status: "verified", observedAt }, browserAdapters: verifiedBrowserAdapters({ username: state.presence!.handle, status: "verified", observedAt }), capabilities: { inbound: true, reconcile: true, affordances: ["repost", "quote"], formats: ["x.repost", "x.quote"], metrics: [] }, createdAt: observedAt, updatedAt: observedAt }];
    const result = formXActionIntent(state, { affordance: "x.repost", target: { type: "x.post", id: "repost-target" } });
    const execution = result.executions[0]!;
    expect(execution.connector).toBe("native");

    const rerouted = rerouteExecutionToBridge(result, execution.id, "X rejected this action: You are not permitted to perform this action.");
    expect(rerouted.executions.find((item) => item.id === execution.id)).toMatchObject({ connector: "bridge", bridgeId: "bridge-chrome", status: "queued" });
  });

  it("does not quarantine every native capability for a generic action rejection", () => {
    let state = createAgent(input);
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "jenny_ai", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state = markNativeConnectionNeedsAttention(state, state.presence!.id, "X rejected this action: You are not permitted to perform this action.");
    expect(state.nativeConnections[0]?.status).toBe("connected");
    expect(state.nativeConnections[0]?.deliveryError).toContain("not permitted");
    expect(state.nativeConnections[0]?.healthMessage).toBeUndefined();
    const manifest = derivePresenceCapabilityManifest(state, state.presence!.id);
    expect(manifest.items.find((item) => item.capability === "post")).toMatchObject({ availability: "available", provider: "Native X" });
    expect(manifest.items.find((item) => item.capability === "reply")).toMatchObject({ availability: "available", provider: "Native X" });
    expect(manifest.items.find((item) => item.capability === "follow")).toMatchObject({ availability: "available", provider: "Native X" });
  });

  it("pauses the Presence deterministically", () => {
    const state = createAgent(input);
    const paused = applyOperation(state, { type: "setPresence", patch: { status: "paused" } });
    const before = paused.events.length;
    const afterPulse = applyOperation(paused, { type: "runPulse" });
    expect(afterPulse.events.length).toBe(before);
    expect(afterPulse.presence?.status).toBe("paused");
  });

  it("wakes a paused Presence and immediately runs its first attention cycle", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { status: "paused" } });
    const beforeActions = state.actions.length;
    const awake = applyOperation(state, { type: "wakePresence" });
    expect(awake.presence?.status).toBe("live");
    expect(awake.actions.length).toBe(beforeActions + 1);
    expect(awake.events.some((item) => item.title === "Jenny woke up")).toBe(true);
    expect(awake.events.some((item) => item.title === "Pulse completed")).toBe(true);
    expect(awake.actions[0]?.intent).toBe("no_op");
    expect(awake.metrics.opportunitiesIgnored).toBe(36);
  });

  it("derives truthful now, next, and rhythm state for Activity", () => {
    let state = createAgent(input);
    let summary = deriveActivitySummary(state);
    expect(summary.current.label).toBe("Waiting for the next meaningful event");
    expect(summary.nextAttention.label).toBe("On demand");
    expect(summary.nextAttention.detail).toContain("No automatic scan");
    expect(summary.rhythm.publishing).toBe("Review");
    expect(summary.rhythm.replies).toBe("Review");
    expect(summary.lastPulseAt).toBeUndefined();

    state = applyOperation(state, { type: "runPulse" });
    summary = deriveActivitySummary(state);
    expect(summary.current.label).toBe("Waiting for a better moment");
    expect(summary.lastPulseAt).toBeDefined();

    state = applyOperation(state, { type: "setPresence", patch: { status: "paused" } });
    summary = deriveActivitySummary(state);
    expect(summary.current.label).toBe("Asleep");
    expect(summary.nextAttention.label).toBe("After waking");
    expect(summary.rhythm.attention).toBe("Asleep");
  });

  it("scopes Activity summary to the Presence environment", () => {
    let state = startPlaygroundSession(createAgent(input));
    const session = state.playgroundSessions[0]!;
    state.events.unshift({ id: "sandbox-pulse", type: "system", title: "Pulse completed", detail: "Sandbox pulse", time: new Date().toISOString(), tone: "positive", presenceId: state.presence!.id, sessionId: session.id });
    expect(deriveActivitySummary(state).lastPulseAt).toBeDefined();

    state = applyOperation(state, { type: "setPresence", patch: { connectionMode: "native" } });
    expect(deriveActivitySummary(state).lastPulseAt).toBeUndefined();
  });

  it("persists custom rhythm and quiet hours without changing execution permissions", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { pacing: "custom", attentionIntervalMinutes: 30, quietHours: { enabled: true, start: "22:00", end: "07:00" } } });
    expect(state.presence).toMatchObject({ pacing: "custom", attentionIntervalMinutes: 30, quietHours: { enabled: true, start: "22:00", end: "07:00" } });
    expect(state.presence?.execution.post).toBe("review");
    expect(deriveActivitySummary(state).rhythm.quietHours).toBe("22:00–07:00");
  });

  it("derives publishing pace from verified original Mirror objects only", () => {
    let state = createAgent(input);
    const presenceId = state.presence!.id;
    const timestamp = new Date().toISOString();
    state = applyOperation(state, { type: "setPresence", patch: { publishingInitiative: { ...defaultPublishingInitiative(), mode: "pace", target: { count: 2, period: "day" }, timezone: "UTC" } } });
    state.mirrorObjects.unshift(
      { id: "verified-original", bridgeId: "sandbox:test", presenceId, channelId: "x", externalRef: { type: "x.post", id: "verified-original" }, objectType: "post", actorPresenceId: presenceId, content: { text: "A verified original." }, occurredAt: timestamp, observedAt: timestamp, visibility: "public", shareability: "presence-only", environment: "sandbox", sessionId: "pace-session" },
      { id: "reply-not-original", bridgeId: "sandbox:test", presenceId, channelId: "x", externalRef: { type: "x.reply", id: "reply-not-original" }, objectType: "reply", actorPresenceId: presenceId, content: { text: "A reply." }, occurredAt: timestamp, observedAt: timestamp, visibility: "public", shareability: "presence-only", environment: "sandbox", sessionId: "pace-session" },
    );
    const progress = derivePublishingProgress(state, presenceId, timestamp);
    expect(progress).toMatchObject({ mode: "pace", target: 2, verifiedOriginals: 1, remaining: 1, status: "seeking" });
  });

  it("keeps standing publishing responsibility after a local no-op", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { publishingInitiative: { ...defaultPublishingInitiative(), mode: "pace", target: { count: 5, period: "day" }, timezone: "UTC" } } });
    state = applyOperation(state, { type: "runPulse" });
    expect(state.actions[0]?.intent).toBe("no_op");
    expect(derivePublishingProgress(state).status).toBe("seeking");
    expect(state.presence?.publishingInitiative.mode).toBe("pace");
  });

  it("moves automatic observation past an overnight quiet-hours window", () => {
    const state = createAgent(input);
    const next = nextObservationAt({ ...state.presence!, pacing: "custom", attentionIntervalMinutes: 30, quietHours: { enabled: true, start: "22:00", end: "07:00" } }, new Date(2026, 7, 13, 21, 50).getTime());
    const nextDate = new Date(next);
    expect(nextDate.getHours()).toBe(7);
    expect(nextDate.getMinutes()).toBe(0);
  });

  it("backs off repeated zero-delta observations without removing explicit wake responsiveness", () => {
    const state = createAgent(input);
    const presence = { ...state.presence!, pacing: "custom" as const, attentionIntervalMinutes: 30 };
    const base = Date.parse("2026-08-21T12:00:00.000Z");
    const firstRetry = Date.parse(nextObservationAt(presence, base, 1));
    const quietRetry = Date.parse(nextObservationAt(presence, base, 10));
    expect(firstRetry - base).toBe(60 * 60_000);
    expect(quietRetry - base).toBe(2 * 60 * 60_000);
    expect(nextObservationAt(presence, base, 0)).toBe(nextObservationAt(presence, base));
  });

  it("treats a successfully reconciled empty Mirror as up to date", () => {
    const state = createAgent(input);
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read", account: { id: "account-1", username: "jenny_ai", name: "Jenny" }, observation: { status: "up-to-date", lastObservedAt: new Date().toISOString(), nextObservationAt: new Date(Date.now() + 300_000).toISOString(), ownPostCount: 0, mentionCount: 0, conversationCount: 0 }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    const summary = deriveActivitySummary(state);
    expect(summary.current.label).toBe("Watching X");
    expect(summary.nextAttention.label).toBe("Next X observation");
    expect(summary.rhythm.attention).toBe("Every 5 min");
  });

  it("does not let an old delivery mask a newer Mirror observation", () => {
    let state = createAgent(input);
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read", account: { id: "account-1", username: "jenny_ai", name: "Jenny" }, observation: { status: "up-to-date", lastObservedAt: new Date().toISOString(), nextObservationAt: new Date(Date.now() + 300_000).toISOString(), ownPostCount: 1, mentionCount: 0, conversationCount: 0 }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state = formChatPostIntent(state, "A useful point of view.");
    state.executions[0]!.status = "succeeded";
    state.executions[0]!.updatedAt = new Date(Date.now() - 60_000).toISOString();
    state.events.unshift({ id: "mirror-now", type: "system", title: "Social Mirror updated", detail: "Observed 1 public post and 0 inbound mentions.", time: new Date().toISOString(), tone: "positive", presenceId: state.presence!.id });
    expect(deriveActivitySummary(state).current.label).toBe("Watching X");
  });

  it("surfaces a scheduled Assignment as the next explicit responsibility", () => {
    const state = applyOperation(createAgent(input), { type: "addSlot", instruction: "Teach one useful thing", day: "Tuesday", time: "08:00", objective: "education", executionWindow: "08:00–11:00" });
    const summary = deriveActivitySummary(state);
    expect(summary.nextAttention.label).toBe("Next Assignment");
    expect(summary.nextAttention.detail).toContain("Tuesday at 08:00");
    expect(summary.nextIntent.label).toContain("Teach one useful thing");
  });

  it("reopens a Calendar slot when its schedule moves after an evaluation", () => {
    let state = applyOperation(createAgent(input), { type: "addSlot", instruction: "Teach one useful thing", day: "Wednesday", time: "08:00", objective: "education", executionWindow: "08:00–11:00" });
    state.calendar[0]!.lastEvaluatedAt = new Date().toISOString();
    state = applyOperation(state, { type: "editSlot", id: state.calendar[0]!.id, instruction: "Teach one useful thing", day: "Wednesday", time: "09:00", objective: "education", executionWindow: "09:00–10:00" });
    expect(state.calendar[0]!.lastEvaluatedAt).toBeUndefined();
    expect(state.standingIntents[0]!.trigger.config.time).toBe("09:00");
    expect(state.standingIntents[0]!.executionWindow).toEqual({ startsAt: "09:00", endsAt: "10:00" });
  });

  it("shows a Calendar no-op as the current truth instead of an older delivery", () => {
    let state = applyOperation(createAgent(input), { type: "addSlot", instruction: "Teach one useful thing", day: "Wednesday", time: "08:00", objective: "education", executionWindow: "08:00–11:00" });
    state = recordStandingIntentNoOp(state, state.presence!.id, state.calendar[0]!.instruction, "No specific, timely contribution was available.");
    const summary = deriveActivitySummary(state);
    expect(summary.current.label).toBe("Waiting for a better moment");
    expect(summary.current.detail).toContain("No specific, timely contribution was available.");
  });

  it("projects only delivered public expression into Calendar history", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { execution: { post: "auto" } } });
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "hourandcode", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state = formChatPostIntent(state, "A durable public point of view.");
    const execution = state.executions[0]!;
    execution.status = "succeeded";
    execution.externalRef = { type: "x.post", id: "verified-1" };
    execution.executedAt = new Date().toISOString();
    state.mirrorObjects.unshift({ id: "verified-mirror", bridgeId: "native:test", presenceId: state.presence!.id, channelId: "x", externalRef: execution.externalRef, objectType: "post", actorPresenceId: state.presence!.id, originExecutionId: execution.id, content: { text: "A durable public point of view." }, occurredAt: execution.executedAt, observedAt: execution.executedAt, visibility: "public", shareability: "presence-only" });
    state.outcomes.unshift({ id: "outcome-verified", socialIntentId: execution.socialIntentId, executionId: execution.id, presenceId: execution.presenceId, status: "succeeded", observedAt: new Date().toISOString(), metrics: { follows: 7 } });
    state.mirrorObjects.unshift({ id: "private-observation", bridgeId: "native:test", presenceId: state.presence!.id, channelId: "x", externalRef: { type: "x.post", id: "inbound-1" }, objectType: "post", author: { displayName: "Someone else" }, content: { text: "A private-to-the-model observation" }, occurredAt: new Date().toISOString(), observedAt: new Date().toISOString(), visibility: "private-thread", shareability: "presence-only" });
    const history = derivePublicHistory(state, state.presence!.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ kind: "post", text: "A durable public point of view.", externalRef: { id: "verified-1" }, externalUrl: "https://x.com/hourandcode/status/verified-1", metrics: { follows: 7 } });
  });

  it("projects an observed Presence-authored Mirror object without an OpenPresence execution", () => {
    const state = createAgent(input);
    state.mirrorObjects.unshift({ id: "ghost-mirror", bridgeId: "native:ghost", presenceId: state.presence!.id, channelId: "x", externalRef: { type: "x.post", id: "observed-1" }, objectType: "post", actorPresenceId: state.presence!.id, content: { text: "Published outside the runtime." }, occurredAt: new Date().toISOString(), observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only" });
    const history = derivePublicHistory(state, state.presence!.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ text: "Published outside the runtime.", externalRef: { id: "observed-1" } });
    expect(history[0]?.executionId).toBeUndefined();
  });

  it("excludes public history from before Presence creation even when it was observed later", () => {
    const state = createAgent(input);
    const presence = state.presence!;
    const createdAt = "2026-08-13T00:00:00.000Z";
    state.presence = { ...presence, createdAt };
    state.presences = state.presences.map((item) => item.id === presence.id ? { ...item, createdAt } : item);
    state.mirrorObjects.unshift(
      { id: "pre-presence-public-history", bridgeId: "native:history", presenceId: presence.id, channelId: "x", externalRef: { type: "x.post", id: "before-presence" }, objectType: "post", actorPresenceId: presence.id, author: { displayName: "Genny", handle: presence.handle }, content: { text: "Account history before this Presence existed." }, occurredAt: "2026-08-12T12:00:00.000Z", observedAt: "2026-08-14T12:00:00.000Z", visibility: "public", shareability: "presence-only" },
      { id: "post-presence-public-history", bridgeId: "native:history", presenceId: presence.id, channelId: "x", externalRef: { type: "x.post", id: "after-presence" }, objectType: "post", actorPresenceId: presence.id, author: { displayName: "Genny", handle: presence.handle }, content: { text: "History after this Presence started." }, occurredAt: "2026-08-14T12:00:00.000Z", observedAt: "2026-08-14T12:00:00.000Z", visibility: "public", shareability: "presence-only" },
    );
    expect(derivePublicHistory(state, presence.id).map((item) => item.text)).toEqual(["History after this Presence started."]);
  });

  it("projects verified agent-authored quote, repost, and like actions into Feed and Calendar history", () => {
    const state = createAgent(input);
    const presenceId = state.presence!.id;
    const target = { type: "x.post" as const, id: "attention-target" };
    const timestamp = new Date().toISOString();
    for (const [index, kind] of (["quote", "repost", "like"] as const).entries()) {
      const executionId = `attention-execution-${kind}`;
      const externalRef = kind === "quote" ? { type: "x.post" as const, id: `quoted-${index}` } : { type: `x.${kind}` as const, id: target.id };
      state.executions.unshift({ id: executionId, socialIntentId: `intent-${kind}`, presenceId, affordance: `x.${kind}`, mode: "auto", status: "succeeded", attempts: 1, externalRef, target, connector: "bridge", idempotencyKey: `key-${kind}`, createdAt: timestamp, updatedAt: timestamp, executedAt: timestamp, environment: "live", source: "agent" });
      state.outcomes.unshift({ id: `outcome-${kind}`, socialIntentId: `intent-${kind}`, executionId, presenceId, status: "succeeded", observedAt: timestamp, metrics: {}, evidence: [externalRef] });
      state.mirrorObjects.unshift({ id: `mirror-${kind}`, bridgeId: "bridge-attention", presenceId, channelId: "x", externalRef, parentExternalRef: kind === "quote" ? undefined : target, referencedExternalRefs: kind === "quote" ? [target] : undefined, objectType: kind, actorPresenceId: presenceId, author: { displayName: "Genny", handle: state.presence!.handle }, content: kind === "quote" ? { text: "A grounded quote from Genny's own attention." } : undefined, occurredAt: timestamp, observedAt: timestamp, visibility: "public", shareability: "presence-only", originExecutionId: executionId, environment: "live" });
    }
    const history = derivePublicHistory(state, presenceId);
    expect(history.map((item) => item.kind)).toEqual(expect.arrayContaining(["quote", "repost", "like"]));
    expect(history.find((item) => item.kind === "like")).toMatchObject({ externalRef: { type: "x.like", id: target.id }, externalUrl: "https://x.com/jenny_ai/status/attention-target", executionId: "attention-execution-like" });
    expect(history.find((item) => item.kind === "repost")?.externalUrl).toBe("https://x.com/jenny_ai/status/attention-target");
  });

  it("keeps a verified like on a threaded source post classified as a like", () => {
    const state = createAgent(input);
    const presenceId = state.presence!.id;
    const timestamp = new Date().toISOString();
    const executionId = "threaded-source-like";
    const target = { type: "x.post" as const, id: "threaded-source" };
    state.executions.unshift({ id: executionId, socialIntentId: "intent-threaded-like", presenceId, affordance: "x.like", mode: "auto", status: "succeeded", attempts: 1, externalRef: { type: "x.like", id: target.id }, target, connector: "native", idempotencyKey: executionId, createdAt: timestamp, updatedAt: timestamp, executedAt: timestamp, environment: "live", source: "agent" });
    state.outcomes.unshift({ id: "outcome-threaded-like", socialIntentId: "intent-threaded-like", executionId, presenceId, status: "succeeded", observedAt: timestamp, metrics: {}, evidence: [target] });
    state.mirrorObjects.unshift({ id: "threaded-source-mirror", bridgeId: "native:x", presenceId, channelId: "x", externalRef: target, parentExternalRef: { type: "x.post", id: "thread-root" }, objectType: "post", author: { displayName: "Someone", handle: "someone" }, content: { text: "A source reply that was liked." }, occurredAt: timestamp, observedAt: timestamp, visibility: "public", shareability: "presence-only", originExecutionId: executionId, environment: "live" });
    const history = derivePublicHistory(state, presenceId);
    expect(history).toEqual([expect.objectContaining({ kind: "like", externalRef: { type: "x.like", id: target.id }, externalUrl: "https://x.com/someone/status/threaded-source", executionId })]);
  });

  it("projects a native verified quote with its referenced post so Feed can render the quote preview", () => {
    let state = createAgent(input);
    const presenceId = state.presence!.id;
    state.presence!.execution.quote = "auto";
    state.nativeConnections = [{ id: "native-quote", presenceId, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "jenny_ai", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state = recordNativeMirror(state, { connectionId: "native-quote", presenceId, post: { id: "target-quote", text: "Hey @jenny_ai, the original post is worth adding context to.", authorId: "author-1", authorUsername: "source_author", authorName: "Source Author" } });
    state = formXActionIntent(state, { affordance: "x.quote", target: { type: "x.post", id: "target-quote" }, text: "The missing distinction is what makes this useful." });
    const execution = state.executions[0]!;
    expect(execution.connector).toBe("native");
    execution.publication = undefined;
    const verified = completeNativeExecution(state, execution.id, { type: "x.post", id: "quote-created" });
    const quote = verified.mirrorObjects.find((item) => item.originExecutionId === execution.id);
    const history = derivePublicHistory(verified, presenceId);
    expect(quote).toMatchObject({ objectType: "quote", referencedExternalRefs: [{ type: "x.post", id: "target-quote" }] });
    expect(history[0]).toMatchObject({ kind: "quote", parentExternalRef: { type: "x.post", id: "target-quote" } });
  });

  it("keeps a verified quote classification when native reconciliation also stores the same X post as an original", () => {
    const state = createAgent(input);
    const presenceId = state.presence!.id;
    const timestamp = new Date().toISOString();
    const externalRef = { type: "x.post" as const, id: "duplicate-quote" };
    const target = { type: "x.post" as const, id: "quoted-target" };
    state.mirrorObjects.unshift(
      { id: "native-original", bridgeId: "native:x", presenceId, channelId: "x", externalRef, referencedExternalRefs: [target], objectType: "post", actorPresenceId: presenceId, author: { displayName: "Jenny", handle: state.presence!.handle }, content: { text: "A quote recovered from native reconciliation." }, occurredAt: timestamp, observedAt: timestamp, visibility: "public", shareability: "presence-only", environment: "live" },
      { id: "verified-quote", bridgeId: "bridge:x", presenceId, channelId: "x", externalRef, referencedExternalRefs: [target], objectType: "quote", actorPresenceId: presenceId, author: { displayName: "Jenny", handle: state.presence!.handle }, content: { text: "A quote recovered from native reconciliation." }, occurredAt: timestamp, observedAt: timestamp, visibility: "public", shareability: "presence-only", environment: "live" },
    );
    expect(derivePublicHistory(state, presenceId)).toEqual([expect.objectContaining({ kind: "quote", parentExternalRef: target })]);
  });

  it("does not regress a verified native quote to reply when X reports reply_to lineage", () => {
    let state = createAgent(input);
    const presenceId = state.presence!.id;
    state.presence!.execution.quote = "auto";
    state.nativeConnections = [{ id: "native-quote-reconcile", presenceId, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "jenny_ai", name: "Genny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state = recordNativeMirror(state, { connectionId: "native-quote-reconcile", presenceId, post: { id: "quote-target-reconcile", text: "Hey @jenny_ai, a target worth adding context to.", authorId: "author-1", authorUsername: "source_author", authorName: "Source Author" } });
    state = formXActionIntent(state, { affordance: "x.quote", target: { type: "x.post", id: "quote-target-reconcile" }, text: "A useful distinction." });
    const execution = state.executions[0]!;
    execution.status = "succeeded";
    execution.externalRef = { type: "x.post", id: "quote-created-reconcile" };
    state = recordNativeMirror(state, { connectionId: "native-quote-reconcile", presenceId, own: true, post: { id: "quote-created-reconcile", text: "A useful distinction.", parentId: "quote-target-reconcile", referencedPosts: [{ type: "replied_to", id: "quote-target-reconcile" }], authorId: "account-1", authorUsername: "jenny_ai", authorName: "Genny" } });
    expect(state.mirrorObjects.find((item) => item.originExecutionId === execution.id)).toMatchObject({ objectType: "quote", parentExternalRef: { type: "x.post", id: "quote-target-reconcile" } });
  });

  it("repairs a persisted quote classification at the read boundary after reconciliation", () => {
    const state = createAgent(input);
    const presenceId = state.presence!.id;
    state.executions.unshift({ id: "quote-read-repair", socialIntentId: "intent-read-repair", presenceId, affordance: "x.quote", mode: "auto", status: "succeeded", attempts: 1, connector: "bridge", target: { type: "x.post", id: "target-read-repair" }, externalRef: { type: "x.post", id: "created-read-repair" }, idempotencyKey: "quote-read-repair", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), environment: "live", source: "agent" });
    state.mirrorObjects.unshift({ id: "mirror-read-repair", bridgeId: "native:x", presenceId, channelId: "x", externalRef: { type: "x.post", id: "created-read-repair" }, parentExternalRef: { type: "x.post", id: "target-read-repair" }, objectType: "reply", originExecutionId: "quote-read-repair", author: { displayName: "Genny", handle: state.presence!.handle }, content: { text: "A useful distinction." }, occurredAt: new Date().toISOString(), observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", environment: "live" });
    const repaired = normalizeState(state);
    expect(repaired.mirrorObjects[0]).toMatchObject({ objectType: "quote", referencedExternalRefs: [{ type: "x.post", id: "target-read-repair" }] });
    expect(derivePublicHistory(repaired, presenceId)[0]).toMatchObject({ kind: "quote" });
  });

  it("rehydrates a verified native repost into the Social Mirror after restart", () => {
    const state = createAgent(input);
    const presenceId = state.presence!.id;
    state.executions.unshift({ id: "repost-rehydrate", socialIntentId: "intent-repost-rehydrate", presenceId, affordance: "x.repost", mode: "auto", status: "succeeded", attempts: 1, connector: "native", target: { type: "x.post", id: "target-repost-rehydrate" }, externalRef: { type: "x.repost", id: "target-repost-rehydrate" }, idempotencyKey: "repost-rehydrate", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), executedAt: new Date().toISOString(), environment: "live", source: "agent" });
    const repaired = normalizeState(state);
    expect(repaired.mirrorObjects.find((item) => item.originExecutionId === "repost-rehydrate")).toMatchObject({ objectType: "repost", externalRef: { type: "x.repost", id: "target-repost-rehydrate" } });
    expect(derivePublicHistory(repaired, presenceId)[0]).toMatchObject({ kind: "repost" });
  });

  it("retains a deleted X post with its original URL and explicit availability state", () => {
    const state = createAgent(input);
    state.nativeConnections = [{ id: "native-x", presenceId: state.presence!.id, channelId: "x", kind: "x", status: "connected", access: "read-write", account: { id: "account-1", username: "hourandcode", name: "Jenny" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    state.mirrorObjects.unshift({ id: "deleted-mirror", bridgeId: "native:test", presenceId: state.presence!.id, channelId: "x", externalRef: { type: "x.post", id: "deleted-1" }, objectType: "post", author: { displayName: "Jenny", handle: "example_agent" }, actorPresenceId: state.presence!.id, content: { text: "This was deleted on X." }, occurredAt: new Date().toISOString(), observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", archived: true });
    const history = derivePublicHistory(state, state.presence!.id);
    expect(history[0]).toMatchObject({ availability: "deleted", externalUrl: "https://x.com/example_agent/status/deleted-1", text: "This was deleted on X." });
  });

  it("attributes connected-channel history by the Presence identity handle", () => {
    const state = createAgent(input);
    state.mirrorObjects.unshift({ id: "identity-mirror", bridgeId: "bridge:identity", presenceId: state.presence!.id, channelId: "x", externalRef: { type: "x.post", id: "identity-1" }, objectType: "post", author: { displayName: "Jenny", handle: state.presence!.handle }, content: { text: "Observed from the connected account." }, occurredAt: new Date().toISOString(), observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only" });
    const history = derivePublicHistory(state, state.presence!.id);
    expect(history).toHaveLength(1);
    expect(history[0]?.text).toBe("Observed from the connected account.");
  });

  it("classifies an authored X reply as a reply when legacy ingestion stored it as a post", () => {
    const state = createAgent(input);
    const presenceId = state.presence!.id;
    const timestamp = new Date().toISOString();
    state.mirrorObjects.unshift(
      { id: "reply-parent", bridgeId: "bridge:reply", presenceId, channelId: "x", externalRef: { type: "x.post", id: "parent-1" }, objectType: "post", author: { displayName: "Someone", handle: "someone" }, content: { text: "The conversation starter." }, occurredAt: timestamp, observedAt: timestamp, visibility: "public", shareability: "presence-only" },
      { id: "legacy-reply", bridgeId: "bridge:reply", presenceId, channelId: "x", externalRef: { type: "x.post", id: "reply-1" }, parentExternalRef: { type: "x.post", id: "parent-1" }, objectType: "post", actorPresenceId: presenceId, author: { displayName: "Jenny", handle: state.presence!.handle }, content: { text: "A contextual answer." }, occurredAt: timestamp, observedAt: timestamp, visibility: "public", shareability: "presence-only" },
    );
    expect(derivePublicHistory(state, presenceId)).toEqual(expect.arrayContaining([expect.objectContaining({ externalRef: { type: "x.post", id: "reply-1" }, kind: "reply", parentExternalRef: { type: "x.post", id: "parent-1" } })]));
  });

  it("repairs a verified reply mirror that was observed before delivery lineage", () => {
    const state = createAgent(input);
    const presenceId = state.presence!.id;
    const timestamp = new Date().toISOString();
    const executionId = "verified-reply-lineage";
    state.executions.unshift({ id: executionId, socialIntentId: "intent-verified-reply", presenceId, affordance: "x.reply", mode: "auto", status: "succeeded", attempts: 1, connector: "bridge", target: { type: "x.post", id: "parent-verified" }, externalRef: { type: "x.reply", id: "reply-verified" }, idempotencyKey: executionId, createdAt: timestamp, updatedAt: timestamp, executedAt: timestamp, environment: "live", source: "agent" });
    state.outcomes.unshift({ id: "outcome-verified-reply", socialIntentId: "intent-verified-reply", executionId, presenceId, status: "succeeded", observedAt: timestamp, metrics: {} });
    state.mirrorObjects.unshift({ id: "observed-before-lineage", bridgeId: "native:x", presenceId, channelId: "x", externalRef: { type: "x.post", id: "reply-verified" }, objectType: "post", author: { displayName: "Jenny", handle: state.presence!.handle }, content: { text: "A contextual answer." }, occurredAt: timestamp, observedAt: timestamp, visibility: "public", shareability: "presence-only", environment: "live" });

    const repaired = normalizeState(state);
    const mirror = repaired.mirrorObjects.find((item) => item.externalRef.id === "reply-verified");
    expect(mirror).toMatchObject({ objectType: "reply", parentExternalRef: { type: "x.post", id: "parent-verified" }, originExecutionId: executionId });
    expect(derivePublicHistory(repaired, presenceId)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "reply", externalRef: { type: "x.post", id: "reply-verified" }, parentExternalRef: { type: "x.post", id: "parent-verified" } })]));
  });

  it("migrates the legacy X browser Bridge declaration to the shipped adapter capabilities", () => {
    const state = createAgent(input);
    const presenceId = state.presence!.id;
    const heartbeat = new Date(Date.now() - 10_000).toISOString();
    state.presence = { ...state.presence!, connectionMode: "bridge", status: "live" };
    state.presences = state.presences.map((presence) => presence.id === presenceId ? { ...presence, connectionMode: "bridge", status: "live" as const } : presence);
    state.bridges = [{ id: "legacy-x-bridge", presenceId, channelId: "x", name: "OpenPresence Chrome", kind: "bridge", state: "online", adapterStatus: "connected", lastHeartbeatAt: heartbeat, lastSeenAt: heartbeat, capabilities: { inbound: true, reconcile: true, affordances: ["post", "reply", "repost", "quote", "like", "message"], formats: ["x.post", "x.media-post", "x.thread"], metrics: ["replies", "reactions", "posts"] }, createdAt: heartbeat, updatedAt: heartbeat }];
    const manifest = derivePresenceCapabilityManifest(state, presenceId);
    expect(manifest.items.find((item) => item.capability === "reply")).toMatchObject({ availability: "temporarily-unavailable", canExecute: false });
    expect(manifest.items.find((item) => item.capability === "follow")).toMatchObject({ availability: "temporarily-unavailable", canExecute: false });
    expect(manifest.items.find((item) => item.capability === "follower_measurement")).toMatchObject({ availability: "temporarily-unavailable" });
    expect(manifest.items.find((item) => item.capability === "post_performance")).toMatchObject({ availability: "temporarily-unavailable" });
    expect(manifest.items.find((item) => item.capability === "image")).toMatchObject({ availability: "temporarily-unavailable", canExecute: false });
    expect(manifest.items.find((item) => item.capability === "video")).toMatchObject({ availability: "temporarily-unavailable", canExecute: false });
    const previouslyShipped = { ...state, bridges: [{ ...state.bridges[0], id: "previously-shipped-chrome", presenceId, channelId: "x" as const, name: "OpenPresence Chrome · Jenny", kind: "bridge" as const, state: "online" as const, adapterStatus: "connected" as const, lastHeartbeatAt: heartbeat, accountIdentity: { username: state.presence!.handle.replace(/^@/, ""), status: "verified" as const, observedAt: heartbeat }, browserAdapters: verifiedBrowserAdapters({ username: state.presence!.handle.replace(/^@/, ""), status: "verified" as const, observedAt: heartbeat }), capabilities: { inbound: true, reconcile: true, affordances: ["post", "reply", "repost", "quote", "like", "message", "follow"], formats: ["x.post", "x.media-post", "x.thread", "x.reply"], metrics: ["replies", "reactions", "posts", "followers", "public_metrics"], assetKinds: ["image", "video"] as ("image" | "video")[] } }] };
    const migrated = derivePresenceCapabilityManifest(previouslyShipped, presenceId);
    expect(migrated.items.find((item) => item.capability === "follow")).toMatchObject({ availability: "available", provider: "Browser Bridge", canExecute: true });
    expect(migrated.items.find((item) => item.capability === "reply")).toMatchObject({ availability: "available", provider: "Browser Bridge", canExecute: true });
    const narrow = { ...previouslyShipped, bridges: [{ ...previouslyShipped.bridges[0], name: "OpenPresence Chrome", capabilities: { inbound: true, reconcile: true, affordances: ["reply"], formats: ["x.reply"], metrics: ["followers", "public_metrics"] } }] };
    expect(derivePresenceCapabilityManifest(narrow, presenceId).items.find((item) => item.capability === "like")).toMatchObject({ availability: "available", provider: "Browser Bridge", canExecute: true });
    const created = applyOperation(state, { type: "createAssignment", presenceId, environment: "live", instruction: "Grow this Presence toward 100,000 followers." });
    expect(created.agentRequests.filter((request) => request.kind === "capability")).toHaveLength(0);
  });

  it("does not create public history from a successful execution without a Mirror object", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { execution: { post: "auto" } } });
    state = formChatPostIntent(state, "Awaiting observation.");
    const execution = state.executions[0]!;
    execution.status = "succeeded";
    execution.externalRef = { type: "x.post", id: "not-observed" };
    expect(derivePublicHistory(state, state.presence!.id)).toHaveLength(0);
  });

  it("repairs verified native reaction outcomes into attributed Mirror history", () => {
    const state = createAgent(input);
    const presenceId = state.presence!.id;
    const timestamp = new Date().toISOString();
    state.executions.unshift({ id: "native-like-repair", socialIntentId: "intent-like-repair", presenceId, affordance: "x.like", mode: "auto", status: "succeeded", attempts: 1, connector: "native", target: { type: "x.post", id: "repair-target" }, externalRef: { type: "x.like", id: "repair-target" }, idempotencyKey: "key-like-repair", createdAt: timestamp, updatedAt: timestamp, executedAt: timestamp, environment: "live", source: "agent" });
    const history = derivePublicHistory(state, presenceId);
    expect(history).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "like", externalRef: { type: "x.like", id: "repair-target" }, executionId: "native-like-repair" })]));
  });

  it("does not invent a live X destination for Sandbox history", () => {
    const state = createAgent(input);
    const createdAt = "2026-08-13T00:00:00.000Z";
    state.presence = { ...state.presence!, createdAt };
    state.presences = state.presences.map((presence) => presence.id === state.presence!.id ? { ...presence, createdAt } : presence);
    state.mirrorObjects.unshift({ id: "sandbox-post", bridgeId: "sandbox:test", presenceId: state.presence!.id, channelId: "x", externalRef: { type: "x.post", id: "sandbox-1" }, objectType: "post", actorPresenceId: state.presence!.id, content: { text: "A rehearsal only." }, occurredAt: "2026-08-13T23:03:35.853Z", observedAt: "2026-08-14T05:54:55.172Z", visibility: "public", shareability: "presence-only", environment: "sandbox", sessionId: "sandbox-session" });
    const history = derivePublicHistory(state, state.presence!.id);
    expect(history[0]).toMatchObject({ externalRef: { id: "sandbox-1" }, environment: "sandbox", occurredAt: "2026-08-13T23:03:35.853Z", observedAt: "2026-08-14T05:54:55.172Z" });
    expect(history[0]?.externalUrl).toBeUndefined();
  });

  it("keeps Feed history on the active Presence environment", () => {
    const state = createAgent(input);
    state.mirrorObjects.unshift(
      { id: "live-feed-post", bridgeId: "native:test", presenceId: state.presence!.id, channelId: "x", externalRef: { type: "x.post", id: "live-feed-1" }, objectType: "post", actorPresenceId: state.presence!.id, content: { text: "Live history." }, occurredAt: new Date().toISOString(), observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", environment: "live" },
      { id: "sandbox-feed-post", bridgeId: "sandbox:test", presenceId: state.presence!.id, channelId: "x", externalRef: { type: "x.post", id: "sandbox-feed-1" }, objectType: "post", actorPresenceId: state.presence!.id, content: { text: "Sandbox history." }, occurredAt: new Date().toISOString(), observedAt: new Date().toISOString(), visibility: "public", shareability: "presence-only", environment: "sandbox", sessionId: "sandbox-session" },
    );
    const liveState = applyOperation(state, { type: "setPresence", patch: { connectionMode: "native" } });
    const liveHistory = derivePublicHistory(liveState, liveState.presence!.id).filter((item) => publicHistoryMatchesPresence(item, liveState.presence));
    expect(liveHistory.map((item) => item.text)).toEqual(["Live history."]);
    const sandboxState = applyOperation(liveState, { type: "setPresence", patch: { connectionMode: "sandbox" } });
    const sandboxHistory = derivePublicHistory(sandboxState, sandboxState.presence!.id).filter((item) => publicHistoryMatchesPresence(item, sandboxState.presence));
    expect(sandboxHistory.map((item) => item.text)).toEqual(["Sandbox history."]);
  });

  it("keeps Ghost representation Presence-scoped and reviewable", () => {
    const state = createAgent(input);
    const originalSoul = state.files.find((file) => file.kind === "SOUL")?.content;
    const ghost = applyOperation(state, { type: "setPresence", patch: { mode: "ghost" } });
    expect(ghost.presence?.ghostProfile?.subject).toBe("Me / my organization");
    expect(ghost.presence?.context.ghostProfile?.priorities).toBe("");
    const configured = applyOperation(ghost, { type: "setPresence", patch: { ghostProfile: { subject: "Alex Rivera", representation: { kind: "individual", individual: { firstName: "Alex", middleName: "", lastName: "Rivera" }, organization: { name: "", website: "" } }, priorities: "Build trustworthy open-source AI products.", preferences: "Prefer clear evidence and useful depth over hype.", voice: "Warm, direct, and technically sharp.", boundaries: "Never invent my views or disclose private community context." } } });
    expect(configured.presence?.ghostProfile?.subject).toBe("Alex Rivera");
    expect(configured.presence?.ghostProfile?.representation?.individual.firstName).toBe("Alex");
    expect(configured.presence?.ghostProfile?.representation?.individual.lastName).toBe("Rivera");
    expect(configured.presence?.context.ghostProfile?.boundaries).toContain("private community");
    expect(configured.files.find((file) => file.kind === "SOUL")?.content).toBe(originalSoul);
    const agentOwned = applyOperation(configured, { type: "setPresence", patch: { mode: "agent" } });
    expect(agentOwned.presence?.context.ghostProfile).toBeUndefined();
    expect(agentOwned.presence?.ghostProfile?.subject).toBe("Alex Rivera");
  });

  it("starts cleanly without an agent", () => {
    expect(initialState().onboarded).toBe(false);
  });

  it("keeps multiple Presences separate and derives native capabilities", () => {
    const state = createAgent(input);
    const next = applyOperation(state, { type: "createPresence", input: { channel: "linkedin", handle: "@jenny_work", mode: "agent", accent: "#D68754" } });
    expect(next.presences).toHaveLength(2);
    expect(next.presence?.channel).toBe("linkedin");
    expect(next.presence?.capabilities.map((item) => item.id)).toContain("connect");
    expect(next.presence?.capabilities.map((item) => item.id)).not.toContain("quote");
  });

  it("keeps every channel Presence available when one Presence is selected", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "createPresence", input: { channel: "linkedin", handle: "@jenny_work", mode: "agent", accent: "#4F7CAC" } });
    const selectedId = state.presence!.id;
    const scoped = stateForContext(state, { presenceId: selectedId });

    expect(scoped.presence?.id).toBe(selectedId);
    expect(scoped.presences.map((presence) => presence.channel)).toEqual(["x", "linkedin"]);
    expect(scoped.presences.map((presence) => presence.handle)).toEqual(["@jenny_ai", "@jenny_work"]);
  });

  it("edits Presence and Agent names without crossing identity boundaries", () => {
    let state = createAgent(input);
    const originalHandle = state.presence!.handle;
    const soul = state.files.find((file) => file.kind === "SOUL")?.content;
    state = applyOperation(state, { type: "setPresence", patch: { name: "Jenny in Founders" } });
    expect(state.presence?.name).toBe("Jenny in Founders");
    expect(state.presence?.handle).toBe(originalHandle);
    expect(state.presence?.context.publicIdentity.displayName).toBe("Jenny in Founders");
    state = applyOperation(state, { type: "setPresence", patch: { handle: "@genny" } });
    expect(state.presence?.handle).toBe("@genny");
    expect(state.presence?.context.publicIdentity.handle).toBe("@genny");
    state = applyOperation(state, { type: "renameAgent", name: "Juno" });
    expect(state.agent?.name).toBe("Juno");
    expect(state.agents[0]?.name).toBe("Juno");
    expect(state.presence?.name).toBe("Jenny in Founders");
    expect(state.files.find((file) => file.kind === "SOUL")?.content).toBe(soul);
  });

  it("scopes Pulse activity to the requested Presence", () => {
    let state = createAgent(input);
    const firstPresence = state.presence!.id;
    state = applyOperation(state, { type: "createPresence", input: { channel: "linkedin", handle: "@jenny_work", mode: "agent", accent: "#D68754" } });
    const secondPresence = state.presence!.id;
    const beforePulse = state.events.length;
    state = applyOperation(state, { type: "runPulse", presenceId: firstPresence });
    expect(state.events[0]?.presenceId).toBe(firstPresence);
    expect(state.events.slice(0, state.events.length - beforePulse).some((item) => item.presenceId === secondPresence)).toBe(false);
  });

  it("persists the agent-level model selection", () => {
    const state = applyOperation(createAgent(input), { type: "setModel", model: "gpt-5.6-luna", provider: "openai", quality: "high" });
    expect(state.modelProfiles[0]?.model).toBe("gpt-5.6-luna");
    expect(state.modelProfiles[0]?.provider).toBe("openai");
    expect(state.modelProfiles[0]?.quality).toBe("high");
  });

  it("edits a calendar intent without changing its Presence", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "addSlot", instruction: "Teach one useful thing", day: "Tuesday", time: "08:00", objective: "education", executionWindow: "08:00–11:00" });
    const slot = state.calendar[0]!;
    const edited = applyOperation(state, { type: "editSlot", id: slot.id, instruction: "Teach one edited useful thing", day: "Wednesday", time: "09:00", objective: "relationship", executionWindow: "09:00–12:00" });
    expect(edited.calendar[0]?.instruction).toBe("Teach one edited useful thing");
    expect(edited.calendar[0]?.presence).toBe(slot.presence);
    expect(edited.standingIntents[0]?.trigger.config.day).toBe("Wednesday");
  });

  it("keeps the Calendar projection coherent when supervision changes Agent-owned work", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "addSlot", instruction: "Publish the weekly evidence note", day: "Tuesday", time: "08:00", objective: "education", executionWindow: "08:00–11:00" });
    const assignment = state.assignments[0]!;
    state = applyOperation(state, { type: "updateAssignmentPlan", assignmentId: assignment.id, plan: { summary: "Publish useful evidence.", dailyTargets: ["Publish one useful note."], publishingApproach: ["Use a concrete example."], discoveryDirections: ["Relevant builder conversations."], relationshipFocus: ["AI builders."], hypotheses: ["Specific evidence earns attention."], source: "agent" } });
    const slot = state.calendar.find((item) => item.assignmentId === assignment.id)!;
    state = applyOperation(state, { type: "planIntervention", assignmentId: assignment.id, action: "postpone", note: "Move this to Thursday.", schedule: { day: "Thursday", time: "10:00", executionWindow: "10:00–13:00" } });
    expect(state.calendar.find((item) => item.id === slot.id)).toMatchObject({ day: "Thursday", time: "10:00", executionWindow: "10:00–13:00" });
    expect(state.assignments.find((item) => item.id === assignment.id)?.planHistory).toHaveLength(2);
    expect(state.assignments.find((item) => item.id === assignment.id)?.plan?.dailyTargets[0]).toContain("Thursday at 10:00");
    state = applyOperation(state, { type: "planIntervention", assignmentId: assignment.id, action: "constrain", note: "Use only verified benchmark evidence.", instruction: "Use only verified benchmark evidence." });
    const projected = state.calendar.find((item) => item.id === slot.id)!;
    expect(projected.instruction).toContain("Use only verified benchmark evidence.");
    expect(state.standingIntents.find((item) => item.id === projected.standingIntentId)?.instruction).toContain("Use only verified benchmark evidence.");
    expect(state.assignments.find((item) => item.id === assignment.id)?.plan?.summary).toContain("Use only verified benchmark evidence.");
    state = applyOperation(state, { type: "planIntervention", assignmentId: assignment.id, action: "cancel", note: "Cancel this plan." });
    expect(state.calendar.find((item) => item.id === slot.id)?.enabled).toBe(false);
  });

  it("creates an enabled skill and configures providers without allowing connection renames", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "createSkill", name: "Founder brief", description: "Turn research into a founder brief." });
    expect(state.skills.some((skill) => skill.name === "Founder brief")).toBe(true);
    expect(state.agentSkills.some((binding) => binding.enabled && binding.skillId === state.skills.at(-1)?.id)).toBe(true);
    const skillId = state.skills.at(-1)!.id;
    state = applyOperation(state, { type: "editSkill", id: skillId, name: "Founder brief", description: "Turn research into a concise, evidence-backed founder brief." });
    expect(state.skills.find((skill) => skill.id === skillId)?.description).toBe("Turn research into a concise, evidence-backed founder brief.");
    expect(state.agentSkills.find((binding) => binding.skillId === skillId)?.enabled).toBe(true);
    state = applyOperation(state, { type: "configureProvider", provider: "ollama", label: "Ollama local", endpoint: "http://localhost:11434" });
    expect(state.providerConnections.find((connection) => connection.provider === "ollama")?.label).toBe("Ollama");
    expect(state.providerConnections.find((connection) => connection.provider === "ollama")?.status).toBe("local");
    expect(state.providerConnections.find((connection) => connection.provider === "ollama")?.endpoint).toBe("http://localhost:11434");
    state = applyOperation(state, { type: "configureProvider", provider: "openrouter", label: "My renamed router", hasSecret: true, secret: "not-stored-by-runtime" });
    expect(state.providerConnections.find((connection) => connection.provider === "openrouter")).toMatchObject({ label: "OpenRouter", status: "available", secretConfigured: true });
    state = applyOperation(state, { type: "configureProvider", provider: "openrouter", label: "Another attempted rename" });
    expect(state.providerConnections.find((connection) => connection.provider === "openrouter")?.label).toBe("OpenRouter");
  });

  it("switches between isolated Agent workspaces", () => {
    let state = createAgent(input);
    const jennyId = state.agent!.id;
    state = applyOperation(state, { type: "sendMessage", content: "Jenny-only note" });
    state = applyOperation(state, { type: "createAdditionalAgent", input: { name: "Atlas", description: "Research carefully.", audience: "researchers", mode: "agent", handle: "@atlas", accent: "#7A8FD8" } });
    expect(state.agent?.name).toBe("Atlas");
    expect(state.agents.map((agent) => agent.name)).toEqual(["Jenny", "Atlas"]);
    expect(state.messages).toHaveLength(0);
    state = applyOperation(state, { type: "selectAgent", id: jennyId });
    expect(state.agent?.name).toBe("Jenny");
    expect(state.messages[0]?.content).toBe("Jenny-only note");
    expect(state.presence?.handle).toBe("@jenny_ai");
  });

  it("stores a Standing Intent instruction and expires evaluated social decisions", () => {
    const state = createAgent(input);
    const scheduled = applyOperation(state, { type: "addSlot", instruction: "Teach the audience one useful thing", day: "Tuesday", time: "08:00", objective: "education", executionWindow: "08:00–11:00" });
    expect(scheduled.calendar[0]?.instruction).toBe("Teach the audience one useful thing");
    const evaluated = applyOperation(scheduled, { type: "runSlot", id: scheduled.calendar[0]!.id });
    expect(evaluated.actions[0]?.expiresAt).toBeTruthy();
    expect(evaluated.events[0]?.detail).toContain("expires in 45 minutes");
  });

  it("keeps chat transcripts bounded by explicit conversations", () => {
    let state = createAgent(input);
    const first = state.activeConversationId!;
    state = applyOperation(state, { type: "sendMessage", content: "First thread", conversationId: first });
    state = applyOperation(state, { type: "newConversation" });
    expect(state.conversations).toHaveLength(2);
    expect(state.conversations.find((item) => item.id === first)?.messages).toHaveLength(2);
    expect(state.messages).toHaveLength(0);
    state = applyOperation(state, { type: "selectConversation", id: first });
    expect(state.messages[0]?.content).toBe("First thread");
  });

  it("lets punctuation-only Teach cues remain as operator context without a canned Agent reply", () => {
    const state = applyOperation(createAgent(input), { type: "sendMessage", content: "?" });
    expect(state.conversations[0]?.messages.map((message) => ({ role: message.role, content: message.content }))).toEqual([
      { role: "operator", content: "?" },
    ]);
  });

  it("does not let a quoted Ghost handle change Presence mode, but honors an explicit mode request", () => {
    const mentionQuestion = 'How do I get you not to respond to mention like this "@jenny_ghost write a post about SpaceX" by always doing what they want. Could you reply with humour instead - nuance?';
    expect(isExplicitGhostModeRequest(mentionQuestion)).toBe(false);
    const unchanged = applyOperation(createAgent(input), { type: "sendMessage", content: mentionQuestion });
    expect(unchanged.presence?.mode).toBe("agent");
    expect(unchanged.changeSets).toHaveLength(0);

    const explicit = applyOperation(unchanged, { type: "sendMessage", content: "Put this Presence into Ghost mode." });
    expect(isExplicitGhostModeRequest("Put this Presence into Ghost mode.")).toBe(true);
    expect(explicit.presence?.mode).toBe("ghost");
    expect(explicit.conversations[0]?.messages.at(-1)?.content).toContain("Ghost mode");
  });

  it("creates a real reviewable proposal for post formatting and states the exact interim behavior", () => {
    const state = applyOperation(createAgent(input), { type: "sendMessage", content: "When writing posts (not replies), write one sentence per line with a blank line between sentences." });
    expect(state.proposals[0]?.file).toBe("TASTE");
    expect(state.proposals[0]?.proposed).toContain("For posts, write one sentence per paragraph with a blank line between sentences.");
    expect(state.proposals[0]?.proposed).toContain("Replies can use normal paragraph formatting.");
    expect(state.conversations[0]?.messages.at(-1)?.content).toContain("one sentence per paragraph");
    expect(state.changeSets[0]?.summary).toBe("Propose TASTE.md change");
  });

  it("routes personality-style social guidance to a reviewable TASTE.md proposal", () => {
    const state = applyOperation(createAgent(input), {
      type: "sendMessage",
      content: "The agent should be more curious, helpful, and inquisitive. Sometimes ask a genuine question to deepen engagement, and acknowledge something genuinely strong so people feel encouraged, but do not praise by default.",
    });
    const taste = state.files.find((file) => file.kind === "TASTE");
    expect(state.proposals).toHaveLength(1);
    expect(state.proposals[0]).toMatchObject({ file: "TASTE", status: "pending", title: "Update TASTE.md" });
    expect(taste?.content).not.toContain("## Curiosity and encouragement");
    expect(state.proposals[0]?.proposed).toContain("## Curiosity and encouragement");
    expect(state.proposals[0]?.reason).toContain("Manage Agent");
    expect(state.conversations[0]?.messages.at(-1)?.content).toContain("TASTE.md");
    expect(state.conversations[0]?.messages.at(-1)?.change).toBe("Taste proposal created");
  });

  it("routes absurdist blue humor into a guarded TASTE proposal", () => {
    const state = applyOperation(createAgent(input), {
      type: "sendMessage",
      content: "Update Genny's personality to have great absurdist and sophomoric blue humor, but never use that humor around bodymorphia, gender, sex, or race.",
    });
    const proposed = state.proposals[0]?.proposed ?? "";
    expect(state.proposals).toHaveLength(1);
    expect(state.proposals[0]).toMatchObject({ file: "TASTE", status: "pending", title: "Update TASTE.md" });
    expect(proposed).toContain("## Absurdist and blue humor");
    expect(proposed).toContain("body dysmorphia or body image");
    expect(proposed).toContain("gender identity or expression");
    expect(proposed).toContain("sex or sexuality");
    expect(proposed).toContain("race or ethnicity");
    expect(proposed).toContain("switch to direct, respectful language");
    expect(state.files.find((file) => file.kind === "TASTE")?.content).not.toContain("## Absurdist and blue humor");
    expect(state.conversations[0]?.messages.at(-1)?.content).toContain("playful absurdist");
    expect(state.conversations[0]?.messages.at(-1)?.change).toBe("Taste proposal created");
  });

  it("turns contextual humor calibration plus an update request into a durable Taste proposal", () => {
    let state = applyOperation(createAgent(input), {
      type: "sendMessage",
      content: "I want the agent to use light sarcasm and an occasional emoji when a response can add humor to the context. ‘I was promised networking, not a funeral 😭’ is a good example.",
    });
    expect(state.proposals).toHaveLength(1);
    expect(state.proposals[0]?.proposed).toContain("## Contextual humor and emoji");
    expect(state.proposals[0]?.proposed).toContain("use one familiar emoji");
    expect(state.files.find((file) => file.kind === "TASTE")?.content).not.toContain("## Contextual humor and emoji");

    state = applyOperation(state, { type: "sendMessage", content: "can you update taste with that" });
    expect(state.proposals).toHaveLength(1);
    expect(state.conversations[0]?.messages.at(-1)?.content).toContain("reviewable TASTE.md proposal");
    expect(state.conversations[0]?.messages.at(-1)?.content).not.toContain("working context");
    expect(state.conversations[0]?.messages.at(-1)?.change).toBe("Taste proposal created");
  });

  it("does not pretend to update Taste when the follow-up has no prior preference", () => {
    const state = applyOperation(createAgent(input), { type: "sendMessage", content: "can you update taste with that" });
    expect(state.proposals).toHaveLength(0);
    expect(state.conversations[0]?.messages.at(-1)?.content).toContain("need the preference");
    expect(state.conversations[0]?.messages.at(-1)?.change).toBe("Taste update needs a preference");
  });

  it("turns a follow-up request to propose the rule into the existing Taste proposal", () => {
    let state = applyOperation(createAgent(input), {
      type: "sendMessage",
      content: "Be more curious and ask genuine questions when they can help someone think further. Encourage people selectively when they share something meaningful.",
    });
    state = applyOperation(state, { type: "sendMessage", content: "propose the rule" });
    expect(state.proposals).toHaveLength(1);
    expect(state.proposals[0]?.status).toBe("pending");
    expect(state.conversations[0]?.messages.at(-1)?.content).toContain("submitted the rule");
    expect(state.conversations[0]?.messages.at(-1)?.change).toBe("Taste proposal created");
  });

  it("keeps operator embodiment out of the cognition-safe PresenceContext", () => {
    const state = createAgent(input);
    const context = compilePresenceContext(state.presence!);
    const serialized = JSON.stringify(context);
    expect(context.publicIdentity.mode).toBe("agent");
    expect(context.availableAffordances).toContain("post");
    expect(serialized).not.toMatch(/approval|queue|retry|rate.?limit|api.?key|connection.?health|transport/i);
    expect(serialized).not.toContain("executionEnvelope");
  });

  it("records ChangeSet provenance without making it current state", () => {
    const state = createAgent(input);
    const next = applyOperation(state, { type: "saveFile", kind: "TASTE", content: "# revised taste" });
    expect(next.changeSets[0]?.summary).toContain("Propose TASTE.md change");
    expect(next.files.find((file) => file.kind === "TASTE")?.content).not.toBe("# revised taste");
    expect(next.proposals[0]?.changeSetId).toBe(next.changeSets[0]?.id);
  });

  it("keeps review Execution separate from Social Intent until approval", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { execution: { post: "review" } } });
    state = applyOperation(state, { type: "addSlot", instruction: "Explain one useful idea", day: "Tuesday", time: "08:00", objective: "education", executionWindow: "08:00–11:00" });
    state = applyOperation(state, { type: "runSlot", id: state.calendar[0]!.id });
    expect(state.socialIntents[0]?.state).toBe("active");
    expect(state.executions[0]?.status).toBe("awaiting-review");
    const before = state.outcomes.length;
    state = applyOperation(state, { type: "executeIntent", id: state.socialIntents[0]!.id });
    expect(state.outcomes).toHaveLength(before);
    state = applyOperation(state, { type: "approveExecution", id: state.executions[0]!.id });
    state = applyOperation(state, { type: "executeIntent", id: state.socialIntents[0]!.id });
    expect(state.executions[0]?.status).toBe("succeeded");
    expect(state.outcomes).toHaveLength(before + 1);
  });

  it("cannot execute an expired Social Intent", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresence", patch: { execution: { post: "review" } } });
    state = applyOperation(state, { type: "addSlot", instruction: "Explain one useful idea", day: "Tuesday", time: "08:00", objective: "education", executionWindow: "08:00–11:00" });
    state = applyOperation(state, { type: "runSlot", id: state.calendar[0]!.id });
    state.socialIntents[0]!.validity.expiresAt = new Date(Date.now() - 1).toISOString();
    state = applyOperation(state, { type: "approveExecution", id: state.executions[0]!.id });
    state = applyOperation(state, { type: "executeIntent", id: state.socialIntents[0]!.id });
    expect(state.socialIntents[0]?.state).toBe("expired");
    expect(state.executions[0]?.status).toBe("expired");
    expect(state.outcomes).toHaveLength(0);
  });

  it("supports a custom channel with a Bridge-backed outbox", () => {
    const definition = { id: "founder-community", name: "Founder Community", icon: "community", domain: "https://www.skool.com/", entities: [{ id: "member", label: "Member" }, { id: "post", label: "Post" }], affordances: [{ id: "post", label: "Posts", description: "Publish a post." }], formats: [{ id: "founder-community.text-post", label: "Text post", description: "A text post.", channel: "founder-community" }], relationships: [], metrics: [], privacyDefaults: { visibility: "private-community" as const, shareability: "presence-only" as const }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    let state = createAgent(input);
    state = applyOperation(state, { type: "createPresence", input: { channel: definition.id, handle: "Jenny in Founders", mode: "agent", accent: "#D68754", channelDefinition: definition } });
    state.presence!.environment = "sandbox";
    state.presences = state.presences.map((item) => item.id === state.presence!.id ? { ...item, environment: "sandbox" as const } : item);
    expect(state.channelDefinitions.find((item) => item.id === definition.id)?.domain).toBe("https://www.skool.com/");
    expect(state.presence?.name).toBe("Jenny in Founders");
    state = applyOperation(state, { type: "updateChannel", definition: { ...definition, name: "SaaSpreneur Academy", domain: "https://www.skool.com/saaspreneur-academy", supportedAssetKinds: ["image", "gif"], updatedAt: new Date().toISOString() } });
    expect(state.channelDefinitions.find((item) => item.id === definition.id)).toMatchObject({ name: "SaaSpreneur Academy", domain: "https://www.skool.com/saaspreneur-academy", supportedAssetKinds: ["image", "gif"] });
    state = applyOperation(state, { type: "setPresence", patch: { execution: { post: "auto" } } });
    const result = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "Founder Bridge", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["post"], formats: ["founder-community.text-post"], metrics: [] } } });
    state = result.state;
    state.presence!.environment = "sandbox";
    state.presences = state.presences.map((item) => item.id === state.presence!.id ? { ...item, environment: "sandbox" as const } : item);
    state = applyOperation(state, { type: "addSlot", instruction: "Ask the founders what they are learning", day: "Tuesday", time: "08:00", objective: "relationship", executionWindow: "08:00–11:00" });
    state = applyOperation(state, { type: "runSlot", id: state.calendar[0]!.id });
    state.executions[0]!.environment = "sandbox";
    expect(state.executions[0]?.status).toBe("queued");
    expect(state.executions[0]?.publication?.payload).toEqual({ text: "Ask the founders what they are learning" });
    writeState(state);
    const bridge = state.bridges[0]!;
    expect(bridge.adapterStatus).toBe("waiting");
    const beforeHeartbeatVersion = readStateVersion();
    const heartbeat = heartbeatBridge(bridge, "bridge-test");
    expect(heartbeat.status).toBe("connected");
    expect(heartbeat.bridge.lastHeartbeatAt).toBeTruthy();
    expect(readStateVersion()).toBe(beforeHeartbeatVersion);
    expect(readBridgeById(bridge.id)).toMatchObject({ state: "online", adapterStatus: "connected" });
    const ingested = ingestEvents(bridge, { events: [{ sourceEventId: "evt-1", event: "created", object: { externalRef: { type: "post", id: "28381" }, objectType: "post", author: { displayName: "Maya" }, content: { text: "How are people handling memory?" }, visibility: "private-community", shareability: "presence-only" } }] });
    expect(ingested.mirrorObjects[0]?.externalRef.id).toBe("28381");
    const claimed = claimExecutions(bridge, { executorId: "bridge-test", limit: 1 });
    expect(claimed.executions).toHaveLength(0);
    expect(readState().executions.find((execution) => execution.environment === "sandbox")?.status).toBe("queued");
  });

  it("projects verified Bridge likes, reposts, and quotes into authored Social Mirror history", () => {
    let state = applyOperation(createAgent(input), { type: "setPresence", patch: { connectionMode: "bridge", execution: { like: "auto", repost: "auto", quote: "auto" } } });
    const result = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "X Attention Bridge", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["like", "repost", "quote"], formats: ["x.like", "x.repost", "x.quote"], metrics: [] } } });
    state = result.state;
    const bridge = state.bridges[0]!;
    const targets = { like: "target-like", repost: "target-repost", quote: "target-quote" };
    for (const affordance of ["x.like", "x.repost", "x.quote"] as const) {
      state = formXActionIntent(state, { affordance, target: { type: "x.post", id: targets[affordance.replace(/^x\./, "") as keyof typeof targets] }, text: affordance === "x.quote" ? "A verified quote." : undefined });
    }
    for (const target of Object.values(targets)) state = recordNativeMirror(state, { connectionId: "bridge-reaction-test", presenceId: state.presence!.id, post: { id: target, text: "A grounded target post.", language: "en", authorUsername: "someone_else", authorName: "Someone Else" } });
    state.mirrorObjects.find((item) => item.externalRef.type === "x.post" && item.externalRef.id === targets.quote)!.environment = "sandbox";
    state.executions.forEach((execution) => { execution.status = "claimed"; execution.connector = "bridge"; execution.bridgeId = bridge.id; execution.environment = execution.affordance === "x.quote" ? "sandbox" : "live"; execution.lease = { executorId: "bridge-reaction-test", claimedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() }; });
    writeState(state);
    reportBridgeIdentity(bridge, { executorId: "bridge-reaction-test", username: "jenny_ai" });
    for (const execution of [...state.executions]) {
      const affordance = execution.affordance.replace(/^x\./, "");
      const externalRef = affordance === "quote" ? { type: "x.post", id: `quote-${execution.target?.id}` } : { type: `x.${affordance}`, id: execution.target!.id };
      acknowledgeExecution(bridge, execution.id, { executorId: "bridge-reaction-test", externalRef });
      const duplicateAck = acknowledgeExecution(bridge, execution.id, { executorId: "bridge-reaction-test", externalRef });
      expect(duplicateAck.execution.status).toBe("succeeded");
    }
    const persisted = readState();
    expect(persisted.outcomes.filter((item) => item.status === "succeeded" && item.executionId && state.executions.some((execution) => execution.id === item.executionId))).toHaveLength(3);
    expect(persisted.mirrorObjects.filter((item) => item.originExecutionId && ["like", "repost", "quote"].includes(item.objectType))).toEqual(expect.arrayContaining([
      expect.objectContaining({ objectType: "like", externalRef: { type: "x.like", id: targets.like }, actorPresenceId: state.presence!.id }),
      expect.objectContaining({ objectType: "repost", externalRef: { type: "x.repost", id: targets.repost }, actorPresenceId: state.presence!.id }),
      expect.objectContaining({ objectType: "quote", externalRef: { type: "x.post", id: `quote-${targets.quote}` }, referencedExternalRefs: [{ type: "x.post", id: targets.quote }], actorPresenceId: state.presence!.id }),
    ]));
  });

  it("archives deleted Mirror objects and rejects conflicting acknowledgements", () => {
    const state = createAgent(input);
    const result = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "Founder Bridge", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["post"], formats: [], metrics: [] } } });
    result.state.presence!.environment = "sandbox";
    result.state.presences = result.state.presences.map((item) => item.id === result.state.presence!.id ? { ...item, environment: "sandbox" as const } : item);
    const bridge = result.state.bridges[0]!;
    writeState(result.state);
    const created = ingestEvents(bridge, { events: [{ sourceEventId: "evt-delete", event: "created", object: { externalRef: { type: "post", id: "post-1" }, objectType: "post", content: { text: "A post" }, visibility: "public", shareability: "presence-only" } }] });
    expect(created.mirrorObjects[0]?.archived).toBe(false);
    const deleted = ingestEvents(bridge, { events: [{ sourceEventId: "evt-delete-2", event: "deleted", object: { externalRef: { type: "post", id: "post-1" }, objectType: "post", visibility: "public", shareability: "presence-only" } }] });
    expect(deleted.mirrorObjects[0]?.archived).toBe(true);
    let queued = applyOperation(deleted, { type: "setPresence", patch: { execution: { post: "auto" } } });
    queued = applyOperation(queued, { type: "addSlot", instruction: "Share one useful idea", day: "Tuesday", time: "08:00", objective: "education", executionWindow: "08:00–11:00" });
    queued = applyOperation(queued, { type: "runSlot", id: queued.calendar[0]!.id });
    queued.executions[0]!.environment = "sandbox";
    writeState(queued);
    const claimed = claimExecutions(bridge, { executorId: "bridge-test", limit: 1 });
    expect(claimed.executions).toHaveLength(0);
  });

  it("shows safe revoked Bridge credential metadata and removes the revoked Bridge", () => {
    const state = createAgent(input);
    const result = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "Revoked Community Bridge", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["post"], formats: [], metrics: [] } } });
    const bridgeId = result.bridge!.id;
    const revoked = revokeBridge(result.state, bridgeId);
    const revokedBridge = revoked.bridges.find((bridge) => bridge.id === bridgeId)!;
    expect(revokedBridge.state).toBe("offline");
    expect(revokedBridge.keyPrefix).toBe(result.bridge!.keyPrefix);
    expect(revokedBridge.credentialRevokedAt).toBeTruthy();
    expect(readBridgeCredentialMetadata(bridgeId)?.credentialRevokedAt).toBeTruthy();
    expect(JSON.stringify(revoked)).not.toContain(result.key!);

    const removed = removeBridge(revoked, bridgeId);
    expect(removed.bridges.some((bridge) => bridge.id === bridgeId)).toBe(false);
    expect(removed.bridgeSync.some((sync) => sync.bridgeId === bridgeId)).toBe(false);
    expect(removed.events[0]?.title).toBe("Bridge removed");
    expect(readBridgeCredentialMetadata(bridgeId)).toBeUndefined();
  });
});
