import { z } from "zod";
import { activeAssignmentPursuitWindow, applyOperation, assignmentIsSatisfied, blockExecutionForLanguage, blockExecutionForTargetLanguage, cancelExecutionForBlockedTarget, clearPersonBlockFromExecution, curateRelationshipFromMirror, ensureCapabilityRequests, existingPublicActionExecution, isPersonBlockingError, isWatchPausedForExecution, languageValidationForExecution, recordPersonBlockedFromExecution, recordVerifiedCapabilityTrial, recordVerifiedFollow, settleCapabilityTrialVerificationFailure, targetIsBlockedByPerson, targetLanguageValidationForExecution } from "./runtime";
import { authenticateBridgeKey, cancelScheduledWake, deleteBridgeCredential, deleteBridgeIdentity, issueBridgeKey, readBridgeById, readBridgeCredentialMetadata, readBridgeIdentity, readBridgeIdentityForExecutor, readPublicActionDeliverySlot, readStateForBridge, releasePublicActionDelivery, reservePublicActionDelivery, revokeBridgeKey, updatePublicActionDelivery, upsertScheduledWake, writeBridgeHeartbeat, writeBridgeIdentity, writeState } from "./db";
import type { Asset, Bridge, Execution, LiveEvent, MirrorObject, OpenPresenceState, Outcome } from "./types";
import { bridgeAdapterStatus, bridgeIdentityReady } from "./bridge-contract";

// Chrome refreshes the signed-in identity on its own cadence. Keep the
// verified identity valid across a model-generation + browser-delivery turn;
// the bridge heartbeat still proves that the controlled adapter is alive.
const BRIDGE_IDENTITY_MAX_AGE_MS = 1_800_000;
import { PublicationSecurityError, sealExecutionForDelivery, verifyExecutionPermit } from "./publication-security";
import { cleanMirrorText, normalizeMirrorAuthor } from "./mirror-content";
import { languagesMatch } from "./language-policy";
import { findVerifiedXQuote, findVerifiedXReply, readNativeXCredentials, readXPostsByIds } from "./x";
import { settleAttentionForExecution } from "./attention-responsibility";
import { requestAttention } from "./attention-coordinator";
import { recordOperationalSuccess } from "./incident-engine";
import { detectDuplicatePublicOutcomes, detectDuplicateVerifiedExecutionOutcomes } from "./public-action-safety";
import { authorizeAssetSelection } from "./asset-library";

const entityRef = z.object({ type: z.string().min(1).max(80), id: z.string().min(1).max(240) });
const author = z.object({ externalRef: entityRef.optional(), displayName: z.string().min(1).max(160), handle: z.string().max(160).optional(), avatarUrl: z.string().url().max(2_000).optional() }).optional();
export const mirrorObjectInput = z.object({ externalRef: entityRef, parentExternalRef: entityRef.optional(), conversationExternalRef: z.string().max(240).optional(), referencedExternalRefs: z.array(entityRef).max(20).optional(), objectType: z.string().min(1).max(80), language: z.string().trim().max(20).optional(), author, content: z.object({ text: z.string().max(100_000).optional(), payload: z.unknown().optional(), language: z.string().trim().max(20).optional() }).optional(), media: z.array(z.object({ sourceUrl: z.string().url().max(4_000), kind: z.enum(["image", "video", "gif"]), altText: z.string().max(2_000).optional() })).max(8).optional(), occurredAt: z.string().datetime().optional(), visibility: z.enum(["public", "private-community", "private-thread", "direct-message", "unknown"]).default("unknown"), shareability: z.enum(["presence-only", "agent-wide", "public"]).default("presence-only"), originExecutionId: z.string().optional(), actorPresenceId: z.string().optional() });
export const inboundEventInput = z.object({ sourceEventId: z.string().min(1).max(240), event: z.enum(["created", "updated", "deleted"]), object: mirrorObjectInput });
export const eventsInput = z.object({ events: z.array(inboundEventInput).min(1).max(500) });
export const reconcileInput = z.object({ cursor: z.string().max(500).optional(), objects: z.array(mirrorObjectInput).max(2_000) });
export const claimInput = z.object({ executorId: z.string().min(1).max(160), limit: z.number().int().min(1).max(50).default(10) });
export const heartbeatInput = z.object({ executorId: z.string().min(1).max(160) });
export const identityInput = z.object({ executorId: z.string().min(1).max(160), username: z.string().trim().max(160).optional() });
export const ackInput = z.object({ executorId: z.string().min(1).max(160), externalRef: entityRef, observedAt: z.string().datetime().optional() });
export const failInput = z.object({ executorId: z.string().min(1).max(160), code: z.string().max(80).optional(), message: z.string().min(1).max(1_000), retryable: z.boolean().default(false) });
export const verifyInput = z.object({ executorId: z.string().min(1).max(160), candidateExternalRef: entityRef.optional(), observedAt: z.string().datetime().optional() });
export const closeVerificationInput = z.object({ executorId: z.string().min(1).max(160), note: z.string().trim().min(1).max(1_000) });
export const outcomeInput = z.object({ executionId: z.string().min(1), status: z.enum(["succeeded", "failed", "unknown"]), metrics: z.record(z.number()).default({}), evidence: z.array(entityRef).default([]) });
export const metricsInput = z.object({ audience: z.object({ followers: z.number().int().min(0), following: z.number().int().min(0).optional(), observedAt: z.string().datetime().optional() }).optional(), publications: z.array(z.object({ externalRef: entityRef, publicationAgeSeconds: z.number().int().min(0), metrics: z.object({ impressions: z.number().int().min(0).optional(), likes: z.number().int().min(0).optional(), replies: z.number().int().min(0).optional(), reposts: z.number().int().min(0).optional(), quotes: z.number().int().min(0).optional() }) })).max(100).default([]) });

const timestamp = () => new Date().toISOString();
const localId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const bridgeEvent = (state: OpenPresenceState, title: string, detail: string, tone: LiveEvent["tone"] = "neutral", executionId?: string): LiveEvent => ({ id: localId("evt"), type: "system", title, detail, time: timestamp(), tone, executionId });

export function bridgeFromRequest(request: Request): Bridge | undefined {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : request.headers.get("x-openpresence-bridge-key")?.trim();
  const bridgeId = token ? authenticateBridgeKey(token) : undefined;
  if (!bridgeId) return undefined;
  const direct = readBridgeById(bridgeId) as Bridge | undefined;
  if (direct) return direct.state !== "offline" ? direct : undefined;
  return readStateForBridge(bridgeId).bridges.find((bridge) => bridge.id === bridgeId && bridge.state !== "offline");
}

export function createBridgeWithKey(source: OpenPresenceState, input: Parameters<typeof applyOperation>[1] & { type: "createBridge" }) {
  const next = applyOperation(source, input);
  const bridge = next.bridges[0];
  if (!bridge || bridge.kind === "manual") { writeState(next); return { state: next, key: undefined, bridge }; }
  const key = issueBridgeKey(bridge.id);
  bridge.credentialId = bridge.id;
  bridge.keyPrefix = key.slice(0, 12);
  bridge.state = "online";
  const sync = next.bridgeSync.find((item) => item.bridgeId === bridge.id); if (sync) sync.status = "healthy";
  writeState(next);
  return { state: next, key, bridge };
}

export function rotateBridgeKey(source: OpenPresenceState, bridgeId: string) {
  const bridge = source.bridges.find((item) => item.id === bridgeId);
  if (!bridge) return { state: source, key: undefined };
  const next = applyOperation(source, { type: "rotateBridgeKey", id: bridgeId });
  const key = issueBridgeKey(bridgeId);
  deleteBridgeIdentity(bridgeId);
  const updated = next.bridges.find((item) => item.id === bridgeId);
  if (updated) { updated.credentialId = bridgeId; updated.keyPrefix = key.slice(0, 12); updated.accountIdentity = undefined; }
  writeState(next);
  return { state: next, key };
}

export function revokeBridge(source: OpenPresenceState, bridgeId: string) { const next = applyOperation(source, { type: "revokeBridge", id: bridgeId }); revokeBridgeKey(bridgeId); deleteBridgeIdentity(bridgeId); const metadata = readBridgeCredentialMetadata(bridgeId); const revoked = next.bridges.find((bridge) => bridge.id === bridgeId); if (metadata && revoked) Object.assign(revoked, metadata); if (revoked) revoked.accountIdentity = undefined; writeState(next); return next; }

export function removeBridge(source: OpenPresenceState, bridgeId: string) {
  const bridge = source.bridges.find((item) => item.id === bridgeId);
  if (!bridge) throw new Error("Bridge not found.");
  if (bridge.state !== "offline") throw new Error("Disconnect the Bridge before removing it.");
  const next = applyOperation(source, { type: "removeBridge", id: bridgeId });
  deleteBridgeCredential(bridgeId);
  deleteBridgeIdentity(bridgeId);
  writeState(next);
  return next;
}

function touchBridge(state: OpenPresenceState, bridge: Bridge, synced = false) {
  const now = timestamp();
  bridge.state = bridge.kind === "bridge" && !bridgeIdentityReady(bridge) ? "degraded" : "online";
  bridge.adapterStatus = "connected";
  bridge.lastSeenAt = now;
  if (synced) bridge.lastSyncAt = now;
  bridge.updatedAt = now;
  const sync = state.bridgeSync.find((item) => item.bridgeId === bridge.id) ?? ({ bridgeId: bridge.id, status: "idle" } as OpenPresenceState["bridgeSync"][number]);
  sync.status = "healthy"; sync.lastSyncAt = synced ? now : sync.lastSyncAt; sync.error = undefined; if (!state.bridgeSync.some((item) => item.bridgeId === bridge.id)) state.bridgeSync.unshift(sync);
}

const normalizedHandle = (value: string | undefined) => String(value ?? "").replace(/^@/, "").trim().toLowerCase();

function observedActorPresenceId(presence: OpenPresenceState["presence"], input: z.infer<typeof mirrorObjectInput>) {
  // Connector observations are world data by default. Only attribute an
  // observation to the current Presence when the provider says it came from
  // that Presence's own account, or when a verified execution projection
  // explicitly carries the authorship marker.
  if (input.actorPresenceId) return input.actorPresenceId;
  const expected = normalizedHandle(presence?.handle);
  const observed = normalizedHandle(input.author?.handle);
  return expected && observed && expected === observed ? presence?.id : undefined;
}

export function reportBridgeIdentity(bridge: Bridge, input: z.infer<typeof identityInput>) {
  const state = readStateForBridge(bridge.id);
  const current = state.bridges.find((item) => item.id === bridge.id);
  if (!current) throw new Error("Bridge not found");
  const presence = state.presences.find((item) => item.id === current.presenceId) ?? state.presence;
  const expected = normalizedHandle(presence?.handle);
  const actual = normalizedHandle(input.username);
  const status: NonNullable<Bridge["accountIdentity"]>["status"] = actual && expected && actual === expected ? "verified" : actual ? "mismatch" : "unknown";
  const message = status === "mismatch"
    ? `The controlled browser is signed in as @${actual}, but this Presence expects @${expected}.`
    : status === "unknown"
      ? `The controlled browser did not expose a verifiable signed-in account. Expected @${expected}.`
      : undefined;
  const observedAt = timestamp();
  const reportedIdentity = { username: actual || undefined, status, message, observedAt };
  current.updatedAt = observedAt;
  // Persist the account binding independently before any large workspace
  // mutation. Subsequent stale runtime snapshots are overlaid with this row.
  writeBridgeIdentity({ bridgeId: current.id, executorId: input.executorId, username: actual || undefined, status, message, observedAt });
  current.accountIdentity = readBridgeIdentity(current.id) ?? reportedIdentity;
  if (status === "mismatch" && current.accountIdentity?.status !== "verified") {
    current.state = "degraded";
    const sync = state.bridgeSync.find((item) => item.bridgeId === current.id);
    if (sync) { sync.status = "degraded"; sync.error = message; }
  } else if (status === "verified") {
    recordOperationalSuccess("user_attached_bridge", current.presenceId);
    current.state = "online";
    const sync = state.bridgeSync.find((item) => item.bridgeId === current.id);
    if (sync) { sync.status = "healthy"; sync.error = undefined; }
    // Work held behind identity verification is not stale work. Re-open its
    // delivery window when the expected account becomes available so the
    // adapter can claim it without operator babysitting or a false expiry.
    const renewal = new Date(Date.now() + 45 * 60 * 1000).toISOString();
    for (const execution of state.executions) {
      if (execution.bridgeId !== current.id || execution.environment !== "live" || !["queued", "awaiting-connector"].includes(execution.status)) continue;
      const intent = state.socialIntents.find((item) => item.id === execution.socialIntentId);
      if (intent && execution.deliveryHold?.reason === "bridge_identity" && intent.validity.expiresAt && new Date(intent.validity.expiresAt).getTime() <= Date.now()) {
        intent.validity.expiresAt = renewal;
        intent.state = "active";
      }
      if (execution.status === "awaiting-connector") execution.status = "queued";
      execution.connector = "bridge";
      delete execution.deliveryHold;
      execution.updatedAt = timestamp();
    }
  }
  state.events.unshift(bridgeEvent(state, status === "verified" ? "Browser account verified" : "Browser account check failed", message ?? `The controlled channel account matches @${expected}.`, status === "verified" ? "positive" : "warning"));
  // Identity changes are infrequent security state, not heartbeat telemetry.
  // Advance the revision so an older attention run must merge/retry instead of
  // overwriting resumed executions or the verified account event.
  writeState(state, { syncNormalized: false });
  return { state, identity: reportedIdentity, expectedHandle: presence?.handle };
}

export function heartbeatBridge(bridge: Bridge, executorId: string) {
  // Heartbeats identify the live connector but do not carry user-domain
  // changes. Persist only the small operational record; rewriting the full
  // Agent workspace here would turn a five-second liveness signal into a
  // multi-megabyte SQLite write and a new browser state revision.
  void executorId;
  const now = timestamp();
  bridge.adapterStatus = "connected";
  bridge.lastHeartbeatAt = now;
  bridge.lastSeenAt = now;
  // Preserve a failed or unknown account check. Heartbeats prove the
  // adapter process is alive; they do not prove which X account is active.
  bridge.state = bridge.kind === "bridge" && bridge.state === "degraded" && !bridgeIdentityReady(bridge) ? "degraded" : "online";
  bridge.updatedAt = now;
  writeBridgeHeartbeat({ bridgeId: bridge.id, state: bridge.state, adapterStatus: bridge.adapterStatus, lastHeartbeatAt: now, lastSeenAt: now });
  return { bridge, status: bridgeAdapterStatus(bridge) };
}

function upsertObject(state: OpenPresenceState, bridge: Bridge, input: z.infer<typeof mirrorObjectInput>, sourceEventId?: string, archived = false): MirrorObject {
  const existing = state.mirrorObjects.find((item) => item.bridgeId === bridge.id && item.externalRef.type === input.externalRef.type && item.externalRef.id === input.externalRef.id);
  const text = cleanMirrorText(bridge.channelId, input.content?.text);
  const incomingHandle = normalizedHandle(input.author?.handle);
  const existingHandle = normalizedHandle(existing?.author?.handle);
  const preservesExistingActor = Boolean(!input.actorPresenceId && incomingHandle && existingHandle && incomingHandle === existingHandle);
  const actorPresenceId = input.actorPresenceId ?? (preservesExistingActor ? existing?.actorPresenceId : undefined);
  const preservesAuthoredProjection = Boolean(existing?.actorPresenceId === bridge.presenceId && actorPresenceId === bridge.presenceId && !input.originExecutionId && !input.actorPresenceId);
  const objectId = existing?.id ?? localId("mirror");
  const mediaRefs = (input.media ?? []).map((media) => {
    const sourcePageUrl = bridge.channelId === "x" && input.externalRef.type === "x.post"
      ? `https://x.com/${normalizedHandle(input.author?.handle) || "i/web"}/status/${input.externalRef.id}`
      : undefined;
    const existingAsset = state.assets.find((asset) => asset.presenceId === bridge.presenceId && asset.provenance.sourceUrl === media.sourceUrl && asset.provenance.sourcePageUrl === sourcePageUrl);
    const asset: Asset = existingAsset ?? { id: localId("asset"), agentId: state.agent?.id ?? "", presenceId: bridge.presenceId, type: media.kind, mediaKind: media.kind, status: "ready", nature: "observed", rights: { status: "unknown" }, provenance: { origin: `${bridge.channelId}-bridge`, sourceUrl: media.sourceUrl, sourcePageUrl, publisher: bridge.channelId === "x" ? "X" : bridge.name, author: input.author?.handle ?? input.author?.displayName, importedAt: timestamp(), sourceIdentityStatus: "unknown" }, description: media.altText ?? `${bridge.channelId} ${media.kind} attachment`, visibility: input.visibility, shareability: input.shareability, environment: "live", createdAt: timestamp(), updatedAt: timestamp() };
    if (!existingAsset) state.assets.unshift(asset);
    return { assetId: asset.id, kind: media.kind, role: "attachment" as const };
  });
  const object: MirrorObject = { id: objectId, bridgeId: bridge.id, presenceId: bridge.presenceId, channelId: bridge.channelId, externalRef: input.externalRef, parentExternalRef: input.parentExternalRef ?? existing?.parentExternalRef, conversationExternalRef: input.conversationExternalRef ?? existing?.conversationExternalRef, referencedExternalRefs: input.referencedExternalRefs ?? existing?.referencedExternalRefs, objectType: preservesAuthoredProjection ? existing!.objectType : input.objectType, language: input.language ?? input.content?.language ?? existing?.language, author: normalizeMirrorAuthor(bridge.channelId, input.content?.text, input.author ?? existing?.author), content: input.content ? { ...input.content, text } as MirrorObject["content"] : existing?.content, assetRefs: mediaRefs.length ? mediaRefs : existing?.assetRefs, occurredAt: input.occurredAt ?? existing?.occurredAt, observedAt: timestamp(), visibility: input.visibility ?? existing?.visibility, shareability: input.shareability ?? existing?.shareability, originExecutionId: input.originExecutionId ?? existing?.originExecutionId, actorPresenceId, sourceEventId, archived };
  if (existing) Object.assign(existing, object); else state.mirrorObjects.unshift(object);
  return object;
}

function recordVerifiedBridgeAttention(state: OpenPresenceState, bridge: Bridge, execution: Execution, externalRef: { type: string; id: string }) {
  const affordance = execution.affordance.replace(/^x\./, "");
  if (!execution.target || !["like", "repost", "quote"].includes(affordance)) return;
  const presence = state.presences.find((item) => item.id === execution.presenceId) ?? state.presence;
  const object = upsertObject(state, bridge, {
    externalRef,
    parentExternalRef: affordance === "like" || affordance === "repost" ? execution.target : undefined,
    referencedExternalRefs: affordance === "quote" ? [execution.target] : undefined,
    objectType: affordance,
    author: { displayName: presence?.name ?? "Presence", handle: presence?.handle },
    visibility: "public",
    shareability: "presence-only",
    originExecutionId: execution.id,
    actorPresenceId: execution.presenceId,
    occurredAt: execution.executedAt ?? timestamp(),
  }, `execution:${execution.id}:${affordance}:${externalRef.id}`);
  if (!state.mirrorEvents.some((event) => event.bridgeId === bridge.id && event.sourceEventId === object.sourceEventId)) {
    state.mirrorEvents.unshift({ id: localId("mirr_evt"), bridgeId: bridge.id, presenceId: execution.presenceId, sourceEventId: object.sourceEventId ?? `execution:${execution.id}`, event: "created", externalRef, object, receivedAt: timestamp() });
  }
}

function recordVerifiedLiveAssetUsage(state: OpenPresenceState, bridge: Bridge, execution: Execution) {
  const publication = execution.publication;
  if (!publication?.assetIds?.length) return;
  const usageType = publication.assetReuse?.usageType ?? "new";
  for (const assetId of publication.assetIds) {
    if (state.assetUsages.some((usage) => usage.assetId === assetId && usage.publicationId === publication.id && usage.environment === "live")) continue;
    state.assetUsages.unshift({ id: localId("asset-usage"), assetId, agentId: state.agent?.id ?? "", presenceId: execution.presenceId, publicationId: publication.id, socialIntentId: execution.socialIntentId, assignmentId: execution.assignmentId, channelId: bridge.channelId, environment: "live", usageType, reuseReason: publication.assetReuse?.reason, publishedAt: execution.executedAt ?? timestamp() });
  }
}

export function ingestEvents(bridge: Bridge, payload: z.infer<typeof eventsInput>) {
  const state = readStateForBridge(bridge.id); const current = state.bridges.find((item) => item.id === bridge.id); if (!current) throw new Error("Bridge not found");
  let receivedInbound = false;
  for (const item of payload.events) {
    if (state.mirrorEvents.some((event) => event.bridgeId === bridge.id && event.sourceEventId === item.sourceEventId)) continue;
    const presence = state.presences.find((candidate) => candidate.id === current.presenceId) ?? state.presence;
    const observedLanguage = item.object.language ?? item.object.content?.language;
    if (observedLanguage !== undefined && !languagesMatch(presence?.language, observedLanguage)) continue;
    const object = upsertObject(state, current, { ...item.object, actorPresenceId: observedActorPresenceId(presence, item.object) }, item.sourceEventId, item.event === "deleted");
    if (item.event !== "deleted" && object.actorPresenceId !== bridge.presenceId) receivedInbound = true;
    const curationTarget = object.actorPresenceId === bridge.presenceId && object.parentExternalRef
      ? state.mirrorObjects.find((item) => item.externalRef.type === object.parentExternalRef?.type && item.externalRef.id === object.parentExternalRef?.id)
      : object;
    Object.assign(state, curateRelationshipFromMirror(state, curationTarget ?? object, bridge.presenceId));
    state.mirrorEvents.unshift({ id: localId("mirr_evt"), bridgeId: bridge.id, presenceId: bridge.presenceId, sourceEventId: item.sourceEventId, event: item.event, externalRef: item.object.externalRef, object, receivedAt: timestamp() });
  }
  touchBridge(state, state.bridges.find((item) => item.id === bridge.id) ?? current); state.events.unshift(bridgeEvent(state, "Mirror updated", `${payload.events.length} external event${payload.events.length === 1 ? "" : "s"} received.`)); writeState(state);
  const presence = state.presences.find((item) => item.id === bridge.presenceId) ?? state.presence;
  // Inbound activity wakes a Resting Presence, never one the operator paused.
  if (receivedInbound && presence?.status === "live") requestAttention(bridge.presenceId, "inbound_event", new Date().toISOString(), "observe_inbound");
  return state;
}

export function reconcileBridge(bridge: Bridge, payload: z.infer<typeof reconcileInput>) {
  const state = readStateForBridge(bridge.id); const current = state.bridges.find((item) => item.id === bridge.id); if (!current) throw new Error("Bridge not found");
  for (const input of payload.objects) {
    const presence = state.presences.find((candidate) => candidate.id === current.presenceId) ?? state.presence;
    const observedLanguage = input.language ?? input.content?.language;
    if (observedLanguage !== undefined && !languagesMatch(presence?.language, observedLanguage)) continue;
    const object = upsertObject(state, current, { ...input, actorPresenceId: observedActorPresenceId(presence, input) }, `reconcile:${payload.cursor ?? "latest"}:${input.externalRef.type}:${input.externalRef.id}`);
    const curationTarget = object.actorPresenceId === bridge.presenceId && object.parentExternalRef
      ? state.mirrorObjects.find((item) => item.externalRef.type === object.parentExternalRef?.type && item.externalRef.id === object.parentExternalRef?.id)
      : object;
    Object.assign(state, curateRelationshipFromMirror(state, curationTarget ?? object, bridge.presenceId));
  }
  detectDuplicatePublicOutcomes(state, bridge.presenceId);
  const sync = state.bridgeSync.find((item) => item.bridgeId === bridge.id); if (sync) sync.cursor = payload.cursor;
  touchBridge(state, state.bridges.find((item) => item.id === bridge.id) ?? current, true); state.events.unshift(bridgeEvent(state, "Mirror reconciled", `${payload.objects.length} external object${payload.objects.length === 1 ? "" : "s"} reconciled.`)); writeState(state); return state;
}

function expireIfNeeded(state: OpenPresenceState, execution: Execution) {
  const intent = state.socialIntents.find((item) => item.id === execution.socialIntentId);
  if (intent?.validity.expiresAt && new Date(intent.validity.expiresAt).getTime() <= Date.now()) { intent.state = "expired"; execution.status = "expired"; execution.updatedAt = timestamp(); return true; }
  return false;
}

export function claimExecutions(bridge: Bridge, input: z.infer<typeof claimInput>) {
  const state = readStateForBridge(bridge.id); const current = state.bridges.find((item) => item.id === bridge.id); if (!current) throw new Error("Bridge not found"); const now = Date.now(); const expiresAt = new Date(now + 120_000).toISOString();
  let expiredClaimedWork = false;
  for (const execution of state.executions) {
    if (execution.bridgeId !== bridge.id || execution.status !== "queued" || execution.environment !== "live" || !isWatchPausedForExecution(state, execution)) continue;
    execution.status = "cancelled";
    execution.failure = { code: "WATCH_PAUSED", message: "The source Watch was paused before Bridge delivery. No external action was attempted.", retryable: false };
    execution.reviewReason = "The operator paused the source Watch before delivery.";
    execution.updatedAt = timestamp();
    const action = state.actions.find((item) => item.executionId === execution.id);
    if (action) { action.status = "skipped"; action.reason = "The source Watch was paused before Bridge delivery; no external action was attempted."; }
  }
  // Relationship boundaries are stronger than the queue. An action that was
  // queued before X revealed the block must not be claimed by a later poll.
  for (const execution of state.executions) {
    if (execution.bridgeId !== bridge.id || execution.status !== "queued" || execution.environment !== "live") continue;
    if (!targetIsBlockedByPerson(state, execution.presenceId, execution.target) || execution.operatorDirectiveId) continue;
    Object.assign(state, cancelExecutionForBlockedTarget(state, execution.id));
    expiredClaimedWork = true;
  }
  const liveWork = state.executions.some((execution) => execution.bridgeId === bridge.id && execution.status === "queued" && execution.environment === "live");
  const executorIdentity = readBridgeIdentityForExecutor(bridge.id, input.executorId);
  const identityFresh = executorIdentity?.status === "verified"
    && Date.now() - new Date(executorIdentity.observedAt).getTime() <= BRIDGE_IDENTITY_MAX_AGE_MS;
  if (liveWork && !identityFresh) {
    let held = false;
    for (const execution of state.executions) {
      if (execution.bridgeId !== bridge.id || execution.status !== "queued" || execution.environment !== "live") continue;
      if (!execution.deliveryHold) {
        execution.deliveryHold = { reason: "bridge_identity", at: timestamp() };
        execution.updatedAt = timestamp();
        held = true;
      }
    }
    if (held) writeState(state, { advanceWorkspaceRevision: false, syncNormalized: false });
    return { state, executions: [], retryAfterIdentity: true };
  }
  for (const execution of state.executions) {
    if (execution.bridgeId !== bridge.id || execution.status !== "claimed" || !execution.lease?.expiresAt) continue;
    if (new Date(execution.lease.expiresAt).getTime() <= now) {
      expiredClaimedWork = true;
      const deliverySlot = readPublicActionDeliverySlot(execution);
      // Once work has crossed into a browser, a lost acknowledgement is an
      // uncertain external outcome. Requeueing here can publish a second reply.
      // Keep it sealed behind reconciliation even if the browser lease expires.
      execution.status = deliverySlot?.executionId === execution.id ? "verification-pending" : "queued";
      execution.lease = undefined;
      if (execution.status === "verification-pending") {
        execution.failure = { code: "DELIVERY_ACK_LOST", message: "The browser lease expired after connector handoff. OpenPresence is verifying external reality and will not retry this public action blindly.", retryable: false };
        updatePublicActionDelivery(execution.id, "uncertain");
      } else {
        execution.permit = undefined;
        if (execution.publication?.publicExpression) execution.publication.publicExpression.safetyStatus = "candidate";
      }
      execution.updatedAt = timestamp();
    }
  }
  const hasActiveExecution = state.executions.some((execution) =>
    execution.bridgeId === bridge.id
    && execution.status === "claimed"
  );
  if (hasActiveExecution) return { state, executions: [], retryAfterIdentity: false };

  // Walk the queue in FIFO order (oldest first) until we have enough live work.
  // A stale execution can sit ahead of current work; slicing before expiry
  // handling would repeatedly inspect the same expired item and leave the rest
  // of the queue stranded.
  const candidates: Execution[] = [];
  let expiredQueuedWork = false;
  const queuedExecutions = state.executions
    .filter((execution) => execution.bridgeId === bridge.id && execution.status === "queued")
    .sort((left, right) => {
      const cmp = (left.createdAt || "").localeCompare(right.createdAt || "");
      if (cmp !== 0) return cmp;
      return state.executions.indexOf(right) - state.executions.indexOf(left);
    });
  for (const execution of queuedExecutions) {
    // Re-check immediately before sealing/claiming as well. Another request
    // may have recorded the boundary after the first queue sweep above.
    if (targetIsBlockedByPerson(state, execution.presenceId, execution.target) && !execution.operatorDirectiveId) {
      Object.assign(state, cancelExecutionForBlockedTarget(state, execution.id));
      expiredQueuedWork = true;
      continue;
    }
    if (isWatchPausedForExecution(state, execution)) {
      execution.status = "cancelled";
      execution.failure = { code: "WATCH_PAUSED", message: "The source Watch was paused before Bridge delivery. No external action was attempted.", retryable: false };
      execution.reviewReason = "The operator paused the source Watch before delivery.";
      execution.updatedAt = timestamp();
      const action = state.actions.find((item) => item.executionId === execution.id);
      if (action) { action.status = "skipped"; action.reason = "The source Watch was paused before Bridge delivery; no external action was attempted."; }
      expiredQueuedWork = true;
      continue;
    }
    const duplicateOf = existingPublicActionExecution(state, execution);
    if (duplicateOf) {
      execution.status = "cancelled";
      execution.failure = { code: "DUPLICATE_EXECUTION", message: `This public action is already represented by execution ${duplicateOf.id}; the browser did not receive a second write request.`, retryable: false };
      execution.reviewReason = "A matching public action is already in flight or verified.";
      execution.updatedAt = timestamp();
      expiredQueuedWork = true;
      continue;
    }
    if (expireIfNeeded(state, execution)) {
      expiredQueuedWork = true;
      continue;
    }
    if (candidates.length < input.limit) candidates.push(execution);
  }
  const claimed: Execution[] = [];
  for (const execution of candidates) {
    if (execution.environment === "live" && execution.publication?.publicExpression) {
      try {
        authorizeAssetSelection(state, execution.publication.assetIds ?? [], { presenceId: execution.presenceId, requireReady: true });
        // Claim polling is intentionally idempotent. A browser service-worker
        // restart or a second claim request can observe an execution after
        // the first claimant has sealed it but before the DOM action returns;
        // sealing that same artifact again incorrectly treats it as stale.
        const expression = execution.publication.publicExpression;
        if (expression.safetyStatus === "sealed" && execution.permit) verifyExecutionPermit(execution, expression);
        else sealExecutionForDelivery(execution);
      } catch (error) {
        execution.status = "blocked";
        execution.failure = { code: error instanceof PublicationSecurityError ? error.code : "PUBLICATION_SECURITY_BLOCKED", message: error instanceof Error ? error.message : "Live publication security validation failed.", retryable: false };
        execution.reviewReason = "Live delivery requires a sealed Public Expression and valid execution permit.";
        execution.updatedAt = timestamp();
        state.events.unshift(bridgeEvent(state, "Live publication blocked", "The Bridge did not receive a valid sealed Public Expression.", "warning", execution.id));
        continue;
      }
    }
    if (!targetLanguageValidationForExecution(state, execution).valid) {
      const blocked = blockExecutionForTargetLanguage(state, execution.id);
      Object.assign(state, blocked);
      continue;
    }
    if (!languageValidationForExecution(state, execution).valid) {
      const blocked = blockExecutionForLanguage(state, execution.id);
      Object.assign(state, blocked);
      continue;
    }
    const reservation = reservePublicActionDelivery(execution);
    if (!reservation.acquired) {
      execution.status = "cancelled";
      execution.failure = { code: "DUPLICATE_EXECUTION", message: `A durable delivery slot for this target is already owned by execution ${reservation.slot.executionId}; the browser did not receive a second write request.`, retryable: false };
      execution.reviewReason = "This Presence already has a public action in flight or verified for the same target.";
      execution.updatedAt = timestamp();
      expiredQueuedWork = true;
      continue;
    }
    claimed.push(execution);
  }
  for (const execution of claimed) {
    execution.status = "claimed";
    execution.attempts += 1;
    execution.lease = { executorId: input.executorId, claimedAt: new Date(now).toISOString(), expiresAt };
    execution.updatedAt = timestamp();
    updatePublicActionDelivery(execution.id, "handed_off");
  }
  if (claimed.length || candidates.length || expiredQueuedWork || expiredClaimedWork) {
    touchBridge(state, current); writeState(state);
  }
  return { state, executions: claimed, retryAfterIdentity: false };
}

function leasedExecution(state: OpenPresenceState, bridge: Bridge, executionId: string, executorId: string) {
  const execution = state.executions.find((item) => item.id === executionId && item.bridgeId === bridge.id); if (!execution) throw new Error("Execution not found");
  if (execution.status === "claimed" && execution.lease?.expiresAt && new Date(execution.lease.expiresAt).getTime() < Date.now()) { execution.status = "queued"; execution.lease = undefined; throw new Error("Execution lease expired"); }
  if (!execution.lease || execution.lease.executorId !== executorId || execution.status !== "claimed") throw new Error("Execution is not leased to this executor");
  return execution;
}

export function acknowledgeExecution(bridge: Bridge, executionId: string, input: z.infer<typeof ackInput>, options: { apiVerified?: boolean } = {}) {
  let state = readStateForBridge(bridge.id); const execution = state.executions.find((item) => item.id === executionId && item.bridgeId === bridge.id);
  if (!execution) throw new Error("Execution not found");
  if (execution.status === "succeeded") { if (execution.externalRef?.id !== input.externalRef.id || execution.externalRef?.type !== input.externalRef.type) throw new Error("Execution already acknowledged with a different external reference"); return { state, execution }; }
  if (targetIsBlockedByPerson(state, execution.presenceId, execution.target) && !execution.operatorDirectiveId) {
    execution.status = "verification-closed";
    execution.failure = { ...execution.failure, code: "TARGET_BLOCKED_PRESENCE", message: "The target person has blocked this Presence. The browser reported an outcome after the relationship boundary was known; no delivery was counted.", retryable: false, reviewedAt: timestamp(), reviewDisposition: "operator_action_required", reviewNote: "The external outcome was unresolved when the durable relationship boundary was re-checked." };
    execution.reviewReason = "The target block was known before the Bridge acknowledgement arrived.";
    execution.lease = undefined;
    execution.updatedAt = timestamp();
    state.events.unshift(bridgeEvent(state, "Bridge acknowledgement closed", "The target relationship boundary was already known, so this browser outcome was not counted as a successful delivery.", "warning", execution.id));
    touchBridge(state, bridge);
    state = settleAttentionForExecution(state, execution);
    writeState(state);
    return { state, execution };
  }
  leasedExecution(state, bridge, executionId, input.executorId);
  const accountIdentity = readBridgeIdentityForExecutor(bridge.id, input.executorId);
  const identityFresh = accountIdentity?.status === "verified"
    && Date.now() - new Date(accountIdentity.observedAt).getTime() <= BRIDGE_IDENTITY_MAX_AGE_MS;
  const apiVerifiedReply = options.apiVerified === true && input.externalRef.type === "x.reply" && ["reply", "x.reply"].includes(execution.affordance);
  if (execution.environment === "live" && !identityFresh && !apiVerifiedReply) {
    execution.status = "failed";
    execution.failure = { code: "ACCOUNT_MISMATCH", message: "The Bridge account was not verified against the Presence before delivery.", retryable: false };
    execution.lease = undefined;
    execution.updatedAt = timestamp();
    state.events.unshift(bridgeEvent(state, "Bridge acknowledgement blocked", execution.failure.message, "warning", execution.id));
    state = settleAttentionForExecution(state, execution);
    writeState(state);
    return { state, execution };
  }
  if (execution.environment === "live" && execution.publication?.publicExpression) {
    try {
      authorizeAssetSelection(state, execution.publication.assetIds ?? [], { presenceId: execution.presenceId, requireReady: true });
    } catch (error) {
      execution.status = "blocked";
      execution.failure = { code: "ASSET_AUTHORIZATION_FAILED", message: error instanceof Error ? error.message : "The selected Asset cannot be used by this Presence.", retryable: false };
      execution.lease = undefined;
      execution.updatedAt = timestamp();
      state.events.unshift(bridgeEvent(state, "Asset authorization blocked delivery", execution.failure.message, "warning", execution.id));
      touchBridge(state, bridge);
      state = settleAttentionForExecution(state, execution);
      writeState(state);
      return { state, execution };
    }
    try { verifyExecutionPermit(execution); } catch (error) {
      execution.status = "blocked";
      execution.failure = { code: error instanceof PublicationSecurityError ? error.code : "PUBLICATION_SECURITY_BLOCKED", message: error instanceof Error ? error.message : "Live publication security validation failed.", retryable: false };
      execution.lease = undefined;
      execution.updatedAt = timestamp();
      state.events.unshift(bridgeEvent(state, "Live publication blocked", "The Bridge acknowledgement did not match a valid sealed Public Expression.", "warning", execution.id));
      touchBridge(state, bridge);
      state = settleAttentionForExecution(state, execution);
      writeState(state);
      return { state, execution };
    }
  }
  if (!targetLanguageValidationForExecution(state, execution).valid) {
    execution.status = "blocked";
    execution.failure = { code: "TARGET_LANGUAGE_MISMATCH", message: "Delivery blocked because the target post language does not match the Presence language or could not be confirmed.", retryable: false };
    execution.lease = undefined;
    execution.updatedAt = timestamp();
    state.events.unshift(bridgeEvent(state, "Target language blocked delivery", execution.failure.message, "warning", execution.id));
    touchBridge(state, bridge);
    state = settleAttentionForExecution(state, execution);
    writeState(state);
    return { state, execution };
  }
  if (!languageValidationForExecution(state, execution).valid) {
    execution.status = "blocked";
    execution.failure = { code: "LANGUAGE_POLICY_VIOLATION", message: "Delivery blocked by the current Never use language policy.", retryable: false };
    execution.lease = undefined;
    execution.updatedAt = timestamp();
    state.events.unshift(bridgeEvent(state, "Language policy blocked delivery", execution.failure.message, "warning", execution.id));
    touchBridge(state, bridge);
    state = settleAttentionForExecution(state, execution);
    writeState(state);
    return { state, execution };
  }
  execution.status = "succeeded"; execution.externalRef = input.externalRef; execution.executedAt = input.observedAt ?? timestamp(); execution.updatedAt = timestamp(); execution.lease = undefined;
  updatePublicActionDelivery(execution.id, "verified", input.externalRef);
  const outcome: Outcome = { id: localId("outcome"), socialIntentId: execution.socialIntentId, executionId: execution.id, presenceId: execution.presenceId, attentionEpisodeId: execution.attentionEpisodeId, status: "succeeded", observedAt: timestamp(), metrics: {}, evidence: [input.externalRef] }; state.outcomes.unshift(outcome); recordVerifiedCapabilityTrial(state, execution, outcome);
  recordVerifiedBridgeAttention(state, bridge, execution, input.externalRef);
  recordVerifiedLiveAssetUsage(state, bridge, execution);
  const action = state.actions.find((item) => item.executionId === execution.id);
  if (action) { action.status = "executed"; action.outcomeId = outcome.id; }
  if (execution.affordance === "x.follow" && execution.target?.type === "x.user") state = recordVerifiedFollow(state, execution.presenceId, execution.target);
  state = clearPersonBlockFromExecution(state, execution.id);
  state.events.unshift(bridgeEvent(
    state,
    apiVerifiedReply ? "Chrome reply verified on X" : "Bridge execution completed",
    apiVerifiedReply ? "The X API confirmed the exact public reply from the expected account." : "The external executor acknowledged the action.",
    "positive",
    execution.id,
  )); touchBridge(state, bridge); state = settleAttentionForExecution(state, execution); state = detectDuplicateVerifiedExecutionOutcomes(state, execution.id); writeState(state); return { state, execution };
}

/**
 * Record a Bridge reaction after an independent, read-only X API lookup has
 * confirmed the authored post/reaction. This path intentionally does not
 * consume the browser permit again: permits authorize the write, while the
 * provider evidence authorizes the later verification transition.
 */
export function recordVerifiedBridgeReaction(source: OpenPresenceState, executionId: string, externalRef: import("./types").EntityRef) {
  let state = JSON.parse(JSON.stringify(source)) as OpenPresenceState;
  const execution = state.executions.find((item) => item.id === executionId && item.connector === "bridge");
  if (!execution || !["x.quote", "x.repost", "quote", "repost"].includes(execution.affordance)) return state;
  if (execution.status === "succeeded") return state;
  const bridge = state.bridges.find((item) => item.id === execution.bridgeId);
  if (!bridge) return state;
  const verifiedAt = timestamp();
  execution.status = "succeeded";
  execution.externalRef = externalRef;
  execution.executedAt = execution.executedAt ?? verifiedAt;
  execution.updatedAt = verifiedAt;
  execution.failure = undefined;
  execution.reviewReason = undefined;
  execution.lease = undefined;
  updatePublicActionDelivery(execution.id, "verified", externalRef);
  const outcome: Outcome = { id: localId("outcome"), socialIntentId: execution.socialIntentId, executionId: execution.id, presenceId: execution.presenceId, attentionEpisodeId: execution.attentionEpisodeId, status: "succeeded", observedAt: verifiedAt, metrics: {}, evidence: [externalRef], environment: execution.environment, sessionId: execution.sessionId, conversationEpisodeId: execution.conversationEpisodeId };
  state.outcomes.unshift(outcome);
  const mirror = state.mirrorObjects.find((item) => item.externalRef.type === externalRef.type && item.externalRef.id === externalRef.id && item.presenceId === execution.presenceId);
  if (mirror) {
    mirror.objectType = execution.affordance === "x.quote" || execution.affordance === "quote" ? "quote" : "repost";
    mirror.originExecutionId = execution.id;
    mirror.actorPresenceId = execution.presenceId;
    mirror.assignmentId = execution.assignmentId;
    if (execution.affordance === "x.quote" || execution.affordance === "quote") {
      mirror.parentExternalRef = mirror.parentExternalRef ?? execution.target;
      mirror.referencedExternalRefs = mirror.referencedExternalRefs?.length ? mirror.referencedExternalRefs : execution.target ? [execution.target] : mirror.referencedExternalRefs;
    }
  }
  if (execution.assignmentId) {
    const assignment = state.assignments.find((item) => item.id === execution.assignmentId);
    if (assignment) {
      assignment.progress.verified = Math.max(assignment.progress.verified, 1);
      const complete = assignmentIsSatisfied(assignment, state);
      assignment.status = complete ? "completed" : "active";
      assignment.work = { ...(assignment.work ?? { phase: "publishing", attempts: 0, maxAttempts: 4, storiesResearched: 0 }), phase: complete ? "completed" : "candidate_review" };
      assignment.lastOutcome = { class: complete ? "assignment_completed" : "incomplete", message: complete ? `Verified ${execution.affordance.replace(/^x\./, "")} satisfied the requested Assignment.` : "Verified social action recorded; more work remains.", at: verifiedAt };
      assignment.updatedAt = verifiedAt;
      state.events.unshift(bridgeEvent(state, complete ? "Assignment complete" : "Assignment progress updated", `${assignment.progress.verified} / ${assignment.progress.required} verified ${assignment.deliverable.type} delivered.`, "positive", execution.id));
    }
  }
  recordVerifiedCapabilityTrial(state, execution, outcome);
  recordVerifiedBridgeAttention(state, bridge, execution, externalRef);
  recordVerifiedLiveAssetUsage(state, bridge, execution);
  const action = state.actions.find((item) => item.executionId === execution.id);
  if (action) { action.status = "executed"; action.outcomeId = outcome.id; }
  state.events.unshift(bridgeEvent(state, "Chrome reaction verified on X", "The X API confirmed the authored Bridge reaction and its public target lineage.", "positive", execution.id));
  state = settleAttentionForExecution(state, execution);
  state = detectDuplicateVerifiedExecutionOutcomes(state, execution.id);
  return state;
}

export function failExecution(bridge: Bridge, executionId: string, input: z.infer<typeof failInput>) {
  let state = readStateForBridge(bridge.id); const execution = leasedExecution(state, bridge, executionId, input.executorId);
  const identityBlocked = execution.environment === "live" && ["ACCOUNT_MISMATCH", "ACCOUNT_NOT_READY"].includes(input.code ?? "");
  const blockedByPerson = isPersonBlockingError(input.message, input.code);
  execution.failure = { code: blockedByPerson ? "TARGET_BLOCKED_PRESENCE" : input.code, message: input.message, retryable: blockedByPerson ? false : identityBlocked ? true : input.retryable }; execution.lease = undefined;
  const provenPreWriteFailure = identityBlocked || ["COMPOSER_INPUT_FAILED", "COMPOSER_UNAVAILABLE", "ACCOUNT_NOT_READY", "ACCOUNT_MISMATCH"].includes(input.code ?? "");
  const retrying = !blockedByPerson && (identityBlocked || (provenPreWriteFailure && input.retryable)) && execution.attempts < 5;
  if (provenPreWriteFailure) releasePublicActionDelivery(execution.id);
  else updatePublicActionDelivery(execution.id, "uncertain");
  if (retrying) {
    // Claiming seals a live Public Expression. A retryable browser failure is
    // allowed to try that candidate again, so return it to candidate state and
    // issue a fresh permit on the next claim instead of permanently blocking
    // the execution as "not fresh".
    const publicExpression = execution.publication?.publicExpression;
    if (publicExpression) execution.publication = { ...execution.publication!, publicExpression: { ...publicExpression, safetyStatus: "candidate", payloadHash: undefined } };
    execution.permit = undefined;
  }
  if (identityBlocked) execution.deliveryHold = { reason: "bridge_identity", at: timestamp() };
  execution.status = retrying ? "queued" : !provenPreWriteFailure && input.retryable ? "verification-pending" : "failed"; execution.updatedAt = timestamp(); state.events.unshift(bridgeEvent(state, blockedByPerson ? "Contact unavailable" : identityBlocked ? "Delivery waiting for the expected account" : execution.status === "verification-pending" ? "Delivery outcome requires verification" : "Bridge execution failed", blockedByPerson ? "X reports that this person blocked the Presence. Future interaction candidates will be suppressed." : identityBlocked ? `${input.message} OpenPresence held the unsent action and will resume it automatically when the expected account is verified.` : execution.status === "verification-pending" ? `${input.message} OpenPresence will not retry because the public write may already exist.` : input.message, blockedByPerson || identityBlocked || input.retryable ? "warning" : "neutral", execution.id));
  if (blockedByPerson) state = recordPersonBlockedFromExecution(state, execution.id, input.message, "browser_delivery");
  const settledExecution = state.executions.find((item) => item.id === execution.id) ?? execution;
  const currentBridge = state.bridges.find((item) => item.id === bridge.id) ?? bridge;
  touchBridge(state, currentBridge); state = settleAttentionForExecution(state, settledExecution); writeState(state); return { state, execution: settledExecution };
}

function leaveExecutionVerificationPending(bridge: Bridge, state: OpenPresenceState, execution: Execution, message: string, input: z.infer<typeof verifyInput>, options: { code?: string; retryable?: boolean } = {}) {
  if (execution.status === "claimed") leasedExecution(state, bridge, execution.id, input.executorId);
  const code = options.code ?? "X_API_VERIFICATION_PENDING";
  const retryable = options.retryable ?? true;
  const unchanged = execution.status === "verification-pending" && execution.failure?.code === code && execution.failure?.message === message && execution.failure?.retryable === retryable;
  execution.status = "verification-pending";
  execution.failure = { code, message, retryable };
  execution.lease = undefined;
  const nowIso = timestamp();
  execution.updatedAt = nowIso;
  if (!unchanged) state.events.unshift(bridgeEvent(state, "Waiting for X verification", message, "warning", execution.id));
  touchBridge(state, bridge);
  // Keep the parent attention responsibility's stage aligned with the
  // execution even when verification is deferred or X quota is exhausted.
  state = settleAttentionForExecution(state, execution);
  writeState(state);
  const nextAttemptAt = retryable ? new Date(Date.now() + 30_000).toISOString() : undefined;
  const verificationWakeId = `wake_verification_${execution.id}`;
  if (nextAttemptAt) {
    upsertScheduledWake({
      id: verificationWakeId,
      presenceId: execution.presenceId,
      wakeAt: nextAttemptAt,
      kind: "verification",
      targetId: execution.id,
      payload: { executionId: execution.id },
      state: "pending",
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  } else {
    cancelScheduledWake(verificationWakeId);
  }
  return { state, execution, verified: false, nextAttemptAt };
}

/**
 * Reconcile a Chrome-written X reply or quote through the official X API. DOM
 * visibility is intentionally only a submission hint: X's API must confirm
 * the exact author, parent post, and text before OpenPresence counts success.
 */
export async function verifyChromeExecution(bridge: Bridge, executionId: string, input: z.infer<typeof verifyInput>) {
  let state = readStateForBridge(bridge.id);
  const execution = state.executions.find((item) => item.id === executionId && item.bridgeId === bridge.id);
  if (!execution) throw new Error("Execution not found");
  if (execution.status === "succeeded") return { state, execution, verified: true, nextAttemptAt: undefined };
  const canVerify = execution.status === "claimed"
    || execution.status === "verification-pending"
    || (execution.status === "failed" && ["RESULT_NOT_VERIFIED", "X_API_VERIFICATION_PENDING"].includes(execution.failure?.code ?? ""));
  if (!canVerify) throw new Error("Execution is not waiting for X verification");
  const action = execution.affordance.replace(/^x\./, "");
  if (action !== "reply" && action !== "quote") throw new Error("Only X replies and quotes submitted through Chrome can be API-verified");
  if (execution.target?.type !== "x.post" || !execution.target.id) throw new Error(`The Chrome ${action} has no target X post`);

  const presence = state.presences.find((item) => item.id === execution.presenceId) ?? state.presence;
  // The native X connection is the API credential source, not the browser
  // executor. A prior native write rejection may mark it needs-attention;
  // that must not prevent a read-only API reconciliation of a Chrome reply.
  const connection = state.nativeConnections.find((item) =>
    item.presenceId === execution.presenceId
    && item.channelId === "x"
    && ["connected", "needs-attention"].includes(item.status)
  );
  const credentials = connection ? readNativeXCredentials(connection.id) : undefined;
  const payload = execution.publication?.payload;
  const payloadText = payload && typeof payload === "object" && !Array.isArray(payload) && typeof payload.text === "string" ? payload.text : undefined;
  const text = typeof execution.publication?.publicExpression?.text === "string" ? execution.publication.publicExpression.text : payloadText;
  const handle = connection?.account?.username ?? presence?.handle;
  if (!credentials || !handle || !text) {
    return leaveExecutionVerificationPending(bridge, state, execution, `Chrome submitted the ${action}, but the connected X API cannot yet verify the account, credentials, or approved text.`, input);
  }

  let verifiedPost;
  try {
    const candidateId = input.candidateExternalRef?.id;
    verifiedPost = action === "quote"
      ? await findVerifiedXQuote(credentials, { targetId: execution.target.id, text, handle, candidateId })
      : await findVerifiedXReply(credentials, { targetId: execution.target.id, text, handle, candidateId });
  } catch (error) {
    state = readStateForBridge(bridge.id);
    const latest = state.executions.find((item) => item.id === executionId && item.bridgeId === bridge.id);
    if (!latest) throw new Error("Execution not found");
    const message = error instanceof Error ? error.message : "X did not return a verification response.";
    const creditsExhausted = /no api credits|credits remaining|billing and usage|quota exhausted/i.test(message);
    return leaveExecutionVerificationPending(bridge, state, latest, creditsExhausted
      ? `Chrome submitted the ${action}, but X API verification is paused because the X API has no credits remaining. Restore X API access before checking this outcome again.`
      : `Chrome submitted the ${action}, but X API verification is temporarily unavailable: ${message}`, input, creditsExhausted ? { code: "X_API_CREDITS_EXHAUSTED", retryable: false } : undefined);
  }
  if (!verifiedPost) {
    state = readStateForBridge(bridge.id);
    const latest = state.executions.find((item) => item.id === executionId && item.bridgeId === bridge.id);
    if (!latest) throw new Error("Execution not found");
    const pursuitAssignment = latest.assignmentId ? state.assignments.find((item) => item.id === latest.assignmentId && item.deliverable.type === "meaningful_engagement") : undefined;
    const pursuit = pursuitAssignment ? activeAssignmentPursuitWindow(state, pursuitAssignment.id) : undefined;
    if (pursuit && pursuitAssignment && latest.target?.type === "x.post") {
      let targetExists = true;
      try {
        targetExists = (await readXPostsByIds(credentials, [latest.target.id])).some((post) => post.id === latest.target?.id);
      } catch {
        // A temporary X API failure is not evidence that the candidate disappeared.
      }
      if (!targetExists) {
        const nowIso = timestamp();
        latest.status = "verification-closed";
        latest.failure = {
          code: "TARGET_DISAPPEARED",
          message: "The selected X conversation disappeared before delivery could be verified. OpenPresence skipped it and is moving on to another opportunity.",
          retryable: false,
          reviewedAt: nowIso,
          reviewDisposition: "closed_non_retryable",
          reviewNote: "The candidate post is no longer available on X; retrying the same action would be meaningless.",
        };
        latest.lease = undefined;
        latest.permit = undefined;
        latest.updatedAt = nowIso;
        const action = state.actions.find((item) => item.executionId === latest.id);
        if (action) { action.status = "skipped"; action.reason = "The candidate conversation disappeared before verification."; }
        pursuitAssignment.status = "active";
        pursuitAssignment.work = { ...(pursuitAssignment.work ?? { phase: "candidate_review", attempts: 0, maxAttempts: 4, storiesResearched: 0 }), phase: "candidate_review", blockedReason: undefined };
        pursuitAssignment.lastOutcome = { class: "candidate_rejected", message: "The selected conversation disappeared before verification, so the Agent skipped it and is moving on.", at: nowIso };
        pursuitAssignment.updatedAt = nowIso;
        pursuit.lastRunAt = nowIso;
        pursuit.nextRunAt = new Date(Date.now() + 2 * 60_000).toISOString();
        pursuit.updatedAt = nowIso;
        const run = state.assignmentRuns?.find((item) => item.id === latest.runId);
        if (run) { run.status = "deferred"; run.currentStage = "candidate_review"; run.completedAt = nowIso; run.lastError = undefined; run.leaseOwner = undefined; run.leaseExpiresAt = undefined; run.updatedAt = nowIso; }
        state.events.unshift(bridgeEvent(state, "Distribution candidate disappeared", "The candidate conversation was gone by verification time. I closed that stale attempt and kept the distribution push moving.", "neutral", latest.id));
        cancelScheduledWake(`wake_verification_${latest.id}`);
        state = settleAttentionForExecution(state, latest);
        writeState(state);
        return { state, execution: latest, verified: false, nextAttemptAt: undefined };
      }
    }
    return leaveExecutionVerificationPending(bridge, state, latest, `Chrome submitted the ${action}. OpenPresence is waiting for X to return the matching public ${action} through the API.`, input);
  }

  // Reuse the existing acknowledgement security boundary. For a later retry,
  // temporarily reacquire a short lease so the same account, permit, and
  // language checks run before the success is recorded.
  state = readStateForBridge(bridge.id);
  const latest = state.executions.find((item) => item.id === executionId && item.bridgeId === bridge.id);
  if (!latest) throw new Error("Execution not found");
  if (latest.status === "verification-pending" || latest.status === "failed") {
    latest.status = "claimed";
    latest.lease = { executorId: input.executorId, claimedAt: timestamp(), expiresAt: new Date(Date.now() + 30_000).toISOString() };
    latest.updatedAt = timestamp();
    writeState(state);
  }
  const result = acknowledgeExecution(bridge, executionId, { executorId: input.executorId, externalRef: { type: action === "quote" ? "x.post" : "x.reply", id: verifiedPost.id }, observedAt: input.observedAt ?? timestamp() }, { apiVerified: true });
  return { ...result, verified: true, nextAttemptAt: undefined };
}

/**
 * End a bounded browser-verification retry loop without inferring delivery.
 * A verification-pending execution has deliberately released its lease, so
 * the ordinary fail endpoint cannot close it after a service-worker restart.
 */
export function closeChromeVerification(bridge: Bridge, executionId: string, input: z.infer<typeof closeVerificationInput>) {
  let state = readStateForBridge(bridge.id);
  const execution = state.executions.find((item) => item.id === executionId && item.bridgeId === bridge.id);
  if (!execution) throw new Error("Execution not found");
  if (execution.status !== "verification-pending") throw new Error("Execution is not waiting for X verification");
  execution.status = "verification-closed";
  execution.failure = {
    ...execution.failure,
    code: execution.failure?.code ?? "X_API_VERIFICATION_TIMEOUT",
    message: execution.failure?.message ?? "The browser reported submission, but OpenPresence could not prove a public X object.",
    reviewedAt: timestamp(),
    reviewDisposition: "operator_action_required",
    reviewNote: input.note,
  };
  execution.reviewReason = input.note;
  execution.lease = undefined;
  execution.permit = undefined;
  execution.updatedAt = timestamp();
  const intent = state.socialIntents.find((item) => item.id === execution.socialIntentId);
  if (intent?.state === "active") { intent.state = "expired"; intent.updatedAt = timestamp(); }
  const action = state.actions.find((item) => item.executionId === execution.id);
  if (action) { action.status = "skipped"; action.reason = input.note; }
  if (execution.capabilityTrialId) settleCapabilityTrialVerificationFailure(state, execution.capabilityTrialId, input.note);
  state.events.unshift(bridgeEvent(state, "Unverified X outcome closed", input.note, "warning", execution.id));
  cancelScheduledWake(`wake_verification_${execution.id}`);
  state = settleAttentionForExecution(state, execution);
  writeState(state);
  return { state, execution };
}

export function reportOutcome(bridge: Bridge, input: z.infer<typeof outcomeInput>) { const state = readStateForBridge(bridge.id); const execution = state.executions.find((item) => item.id === input.executionId && item.bridgeId === bridge.id); if (!execution) throw new Error("Execution not found"); const outcome: Outcome = { id: localId("outcome"), socialIntentId: execution.socialIntentId, executionId: execution.id, presenceId: execution.presenceId, attentionEpisodeId: execution.attentionEpisodeId, status: input.status, observedAt: timestamp(), metrics: input.metrics, evidence: input.evidence }; state.outcomes.unshift(outcome); touchBridge(state, bridge); writeState(state); return { state, outcome }; }

export function reportMetrics(bridge: Bridge, input: z.infer<typeof metricsInput>) {
  let state = readStateForBridge(bridge.id);
  if (input.audience) state = applyOperation(state, { type: "recordAudienceSnapshot", presenceId: bridge.presenceId, followers: input.audience.followers, following: input.audience.following, source: "bridge", observedAt: input.audience.observedAt });
  for (const publication of input.publications) {
    const mirror = state.mirrorObjects.find((item) => item.bridgeId === bridge.id && item.presenceId === bridge.presenceId && item.externalRef.type === publication.externalRef.type && item.externalRef.id === publication.externalRef.id && !item.archived);
    if (!mirror) continue;
    state = applyOperation(state, { type: "recordPublicationMetricSnapshot", presenceId: bridge.presenceId, mirrorObjectId: mirror.id, publicationAgeSeconds: publication.publicationAgeSeconds, metrics: publication.metrics, source: "bridge" });
  }
  const current = state.bridges.find((item) => item.id === bridge.id);
  if (current) touchBridge(state, current);
  state = ensureCapabilityRequests(state, bridge.presenceId);
  writeState(state);
  return state;
}
