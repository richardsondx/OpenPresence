import { z } from "zod";
import { applyOperation, blockExecutionForLanguage, blockExecutionForTargetLanguage, curateRelationshipFromMirror, ensureCapabilityRequests, languageValidationForExecution, recordVerifiedCapabilityTrial, recordVerifiedFollow, targetLanguageValidationForExecution } from "./runtime";
import { authenticateBridgeKey, deleteBridgeCredential, issueBridgeKey, readBridgeById, readBridgeCredentialMetadata, readStateForBridge, revokeBridgeKey, writeBridgeHeartbeat, writeState } from "./db";
import type { Bridge, Execution, LiveEvent, MirrorObject, OpenPresenceState, Outcome } from "./types";
import { bridgeAdapterStatus } from "./bridge-contract";

// Chrome refreshes the signed-in identity on its own cadence. Keep the
// verified identity valid across a model-generation + browser-delivery turn;
// the bridge heartbeat still proves that the controlled adapter is alive.
const BRIDGE_IDENTITY_MAX_AGE_MS = 1_800_000;
import { PublicationSecurityError, sealExecutionForDelivery, verifyExecutionPermit } from "./publication-security";
import { cleanMirrorText, normalizeMirrorAuthor } from "./mirror-content";
import { languagesMatch } from "./language-policy";
import { findVerifiedXReply, readNativeXCredentials } from "./x";

const entityRef = z.object({ type: z.string().min(1).max(80), id: z.string().min(1).max(240) });
const author = z.object({ externalRef: entityRef.optional(), displayName: z.string().min(1).max(160), handle: z.string().max(160).optional(), avatarUrl: z.string().url().max(2_000).optional() }).optional();
export const mirrorObjectInput = z.object({ externalRef: entityRef, parentExternalRef: entityRef.optional(), conversationExternalRef: z.string().max(240).optional(), referencedExternalRefs: z.array(entityRef).max(20).optional(), objectType: z.string().min(1).max(80), language: z.string().trim().max(20).optional(), author, content: z.object({ text: z.string().max(100_000).optional(), payload: z.unknown().optional(), language: z.string().trim().max(20).optional() }).optional(), occurredAt: z.string().datetime().optional(), visibility: z.enum(["public", "private-community", "private-thread", "direct-message", "unknown"]).default("unknown"), shareability: z.enum(["presence-only", "agent-wide", "public"]).default("presence-only"), originExecutionId: z.string().optional(), actorPresenceId: z.string().optional() });
export const inboundEventInput = z.object({ sourceEventId: z.string().min(1).max(240), event: z.enum(["created", "updated", "deleted"]), object: mirrorObjectInput });
export const eventsInput = z.object({ events: z.array(inboundEventInput).min(1).max(500) });
export const reconcileInput = z.object({ cursor: z.string().max(500).optional(), objects: z.array(mirrorObjectInput).max(2_000) });
export const claimInput = z.object({ executorId: z.string().min(1).max(160), limit: z.number().int().min(1).max(50).default(10) });
export const heartbeatInput = z.object({ executorId: z.string().min(1).max(160) });
export const identityInput = z.object({ executorId: z.string().min(1).max(160), username: z.string().trim().max(160).optional() });
export const ackInput = z.object({ executorId: z.string().min(1).max(160), externalRef: entityRef, observedAt: z.string().datetime().optional() });
export const failInput = z.object({ executorId: z.string().min(1).max(160), code: z.string().max(80).optional(), message: z.string().min(1).max(1_000), retryable: z.boolean().default(false) });
export const verifyInput = z.object({ executorId: z.string().min(1).max(160), candidateExternalRef: entityRef.optional(), observedAt: z.string().datetime().optional() });
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
  const updated = next.bridges.find((item) => item.id === bridgeId);
  if (updated) { updated.credentialId = bridgeId; updated.keyPrefix = key.slice(0, 12); }
  writeState(next);
  return { state: next, key };
}

export function revokeBridge(source: OpenPresenceState, bridgeId: string) { const next = applyOperation(source, { type: "revokeBridge", id: bridgeId }); revokeBridgeKey(bridgeId); const metadata = readBridgeCredentialMetadata(bridgeId); const revoked = next.bridges.find((bridge) => bridge.id === bridgeId); if (metadata && revoked) Object.assign(revoked, metadata); writeState(next); return next; }

export function removeBridge(source: OpenPresenceState, bridgeId: string) {
  const bridge = source.bridges.find((item) => item.id === bridgeId);
  if (!bridge) throw new Error("Bridge not found.");
  if (bridge.state !== "offline") throw new Error("Disconnect the Bridge before removing it.");
  const next = applyOperation(source, { type: "removeBridge", id: bridgeId });
  deleteBridgeCredential(bridgeId);
  writeState(next);
  return next;
}

function touchBridge(state: OpenPresenceState, bridge: Bridge, synced = false) {
  const now = timestamp(); bridge.state = "online"; bridge.adapterStatus = "connected"; bridge.lastSeenAt = now; if (synced) bridge.lastSyncAt = now; bridge.updatedAt = now;
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
  const status = actual && expected && actual === expected ? "verified" : actual ? "mismatch" : "unknown";
  const message = status === "mismatch"
    ? `The controlled X tab is signed in as @${actual}, but this Presence expects @${expected}.`
    : status === "unknown"
      ? `The controlled X tab did not expose a verifiable signed-in account. Expected @${expected}.`
      : undefined;
  current.accountIdentity = { username: actual || undefined, status, message, observedAt: timestamp() };
  current.updatedAt = timestamp();
  if (status === "mismatch") {
    current.state = "degraded";
    const sync = state.bridgeSync.find((item) => item.bridgeId === current.id);
    if (sync) { sync.status = "degraded"; sync.error = message; }
  } else if (status === "verified") {
    current.state = "online";
    const sync = state.bridgeSync.find((item) => item.bridgeId === current.id);
    if (sync) { sync.status = "healthy"; sync.error = undefined; }
  }
  state.events.unshift(bridgeEvent(state, status === "verified" ? "Bridge account verified" : "Bridge account check failed", message ?? `The controlled channel account matches @${expected}.`, status === "verified" ? "positive" : "warning"));
  writeState(state, { advanceWorkspaceRevision: false, syncNormalized: false });
  return { state, identity: current.accountIdentity, expectedHandle: presence?.handle };
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
  bridge.state = "online";
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
  const object: MirrorObject = { id: existing?.id ?? localId("mirror"), bridgeId: bridge.id, presenceId: bridge.presenceId, channelId: bridge.channelId, externalRef: input.externalRef, parentExternalRef: input.parentExternalRef ?? existing?.parentExternalRef, conversationExternalRef: input.conversationExternalRef ?? existing?.conversationExternalRef, referencedExternalRefs: input.referencedExternalRefs ?? existing?.referencedExternalRefs, objectType: preservesAuthoredProjection ? existing!.objectType : input.objectType, language: input.language ?? input.content?.language ?? existing?.language, author: normalizeMirrorAuthor(bridge.channelId, input.content?.text, input.author ?? existing?.author), content: input.content ? { ...input.content, text } as MirrorObject["content"] : existing?.content, occurredAt: input.occurredAt ?? existing?.occurredAt, observedAt: timestamp(), visibility: input.visibility ?? existing?.visibility, shareability: input.shareability ?? existing?.shareability, originExecutionId: input.originExecutionId ?? existing?.originExecutionId, actorPresenceId, sourceEventId, archived };
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

export function ingestEvents(bridge: Bridge, payload: z.infer<typeof eventsInput>) {
  const state = readStateForBridge(bridge.id); const current = state.bridges.find((item) => item.id === bridge.id); if (!current) throw new Error("Bridge not found");
  for (const item of payload.events) {
    if (state.mirrorEvents.some((event) => event.bridgeId === bridge.id && event.sourceEventId === item.sourceEventId)) continue;
    const presence = state.presences.find((candidate) => candidate.id === current.presenceId) ?? state.presence;
    const observedLanguage = item.object.language ?? item.object.content?.language;
    if (observedLanguage !== undefined && !languagesMatch(presence?.language, observedLanguage)) continue;
    const object = upsertObject(state, current, { ...item.object, actorPresenceId: observedActorPresenceId(presence, item.object) }, item.sourceEventId, item.event === "deleted");
    const curationTarget = object.actorPresenceId === bridge.presenceId && object.parentExternalRef
      ? state.mirrorObjects.find((item) => item.externalRef.type === object.parentExternalRef?.type && item.externalRef.id === object.parentExternalRef?.id)
      : object;
    Object.assign(state, curateRelationshipFromMirror(state, curationTarget ?? object, bridge.presenceId));
    state.mirrorEvents.unshift({ id: localId("mirr_evt"), bridgeId: bridge.id, presenceId: bridge.presenceId, sourceEventId: item.sourceEventId, event: item.event, externalRef: item.object.externalRef, object, receivedAt: timestamp() });
  }
  touchBridge(state, state.bridges.find((item) => item.id === bridge.id) ?? current); state.events.unshift(bridgeEvent(state, "Mirror updated", `${payload.events.length} external event${payload.events.length === 1 ? "" : "s"} received.`)); writeState(state); return state;
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
  const liveWork = state.executions.some((execution) => execution.bridgeId === bridge.id && execution.status === "queued" && execution.environment === "live");
  const identityFresh = current.accountIdentity?.status === "verified"
    && Date.now() - new Date(current.accountIdentity.observedAt).getTime() <= BRIDGE_IDENTITY_MAX_AGE_MS;
  if (liveWork && !identityFresh) return { state, executions: [], retryAfterIdentity: true };
  for (const execution of state.executions) {
    if (execution.bridgeId !== bridge.id || execution.status !== "claimed" || !execution.lease?.expiresAt) continue;
    if (new Date(execution.lease.expiresAt).getTime() <= now) {
      execution.status = "queued";
      execution.lease = undefined;
      execution.updatedAt = timestamp();
    }
  }
  const hasActiveExecution = state.executions.some((execution) =>
    execution.bridgeId === bridge.id
    && (execution.status === "claimed" || execution.status === "verification-pending")
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
        sealExecutionForDelivery(execution);
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
    claimed.push(execution);
  }
  for (const execution of claimed) { execution.status = "claimed"; execution.attempts += 1; execution.lease = { executorId: input.executorId, claimedAt: new Date(now).toISOString(), expiresAt }; execution.updatedAt = timestamp(); }
  if (claimed.length || candidates.length || expiredQueuedWork) {
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
  leasedExecution(state, bridge, executionId, input.executorId);
  const accountIdentity = state.bridges.find((item) => item.id === bridge.id)?.accountIdentity;
  const identityFresh = accountIdentity?.status === "verified"
    && Date.now() - new Date(accountIdentity.observedAt).getTime() <= BRIDGE_IDENTITY_MAX_AGE_MS;
  const apiVerifiedReply = options.apiVerified === true && input.externalRef.type === "x.reply" && ["reply", "x.reply"].includes(execution.affordance);
  if (execution.environment === "live" && !identityFresh && !apiVerifiedReply) {
    execution.status = "failed";
    execution.failure = { code: "ACCOUNT_MISMATCH", message: "The Bridge account was not verified against the Presence before delivery.", retryable: false };
    execution.lease = undefined;
    execution.updatedAt = timestamp();
    state.events.unshift(bridgeEvent(state, "Bridge acknowledgement blocked", execution.failure.message, "warning", execution.id));
    writeState(state);
    return { state, execution };
  }
  if (execution.environment === "live" && execution.publication?.publicExpression) {
    try { verifyExecutionPermit(execution); } catch (error) {
      execution.status = "blocked";
      execution.failure = { code: error instanceof PublicationSecurityError ? error.code : "PUBLICATION_SECURITY_BLOCKED", message: error instanceof Error ? error.message : "Live publication security validation failed.", retryable: false };
      execution.lease = undefined;
      execution.updatedAt = timestamp();
      state.events.unshift(bridgeEvent(state, "Live publication blocked", "The Bridge acknowledgement did not match a valid sealed Public Expression.", "warning", execution.id));
      touchBridge(state, bridge);
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
    writeState(state);
    return { state, execution };
  }
  execution.status = "succeeded"; execution.externalRef = input.externalRef; execution.executedAt = input.observedAt ?? timestamp(); execution.updatedAt = timestamp(); execution.lease = undefined;
  const outcome: Outcome = { id: localId("outcome"), socialIntentId: execution.socialIntentId, executionId: execution.id, presenceId: execution.presenceId, status: "succeeded", observedAt: timestamp(), metrics: {}, evidence: [input.externalRef] }; state.outcomes.unshift(outcome); recordVerifiedCapabilityTrial(state, execution, outcome);
  recordVerifiedBridgeAttention(state, bridge, execution, input.externalRef);
  const action = state.actions.find((item) => item.executionId === execution.id);
  if (action) { action.status = "executed"; action.outcomeId = outcome.id; }
  if (execution.affordance === "x.follow" && execution.target?.type === "x.user") state = recordVerifiedFollow(state, execution.presenceId, execution.target);
  state.events.unshift(bridgeEvent(
    state,
    apiVerifiedReply ? "Chrome reply verified on X" : "Bridge execution completed",
    apiVerifiedReply ? "The X API confirmed the exact public reply from the expected account." : "The external executor acknowledged the action.",
    "positive",
    execution.id,
  )); touchBridge(state, bridge); writeState(state); return { state, execution };
}

export function failExecution(bridge: Bridge, executionId: string, input: z.infer<typeof failInput>) {
  const state = readStateForBridge(bridge.id); const execution = leasedExecution(state, bridge, executionId, input.executorId); execution.failure = { code: input.code, message: input.message, retryable: input.retryable }; execution.lease = undefined;
  const retrying = input.retryable && execution.attempts < 5;
  if (retrying) {
    // Claiming seals a live Public Expression. A retryable browser failure is
    // allowed to try that candidate again, so return it to candidate state and
    // issue a fresh permit on the next claim instead of permanently blocking
    // the execution as "not fresh".
    const publicExpression = execution.publication?.publicExpression;
    if (publicExpression) execution.publication = { ...execution.publication!, publicExpression: { ...publicExpression, safetyStatus: "candidate", payloadHash: undefined } };
    execution.permit = undefined;
  }
  execution.status = retrying ? "queued" : "failed"; execution.updatedAt = timestamp(); state.events.unshift(bridgeEvent(state, "Bridge execution failed", input.message, input.retryable ? "warning" : "neutral", execution.id)); touchBridge(state, bridge); writeState(state); return { state, execution };
}

function leaveExecutionVerificationPending(bridge: Bridge, state: OpenPresenceState, execution: Execution, message: string, input: z.infer<typeof verifyInput>, options: { code?: string; retryable?: boolean } = {}) {
  if (execution.status === "claimed") leasedExecution(state, bridge, execution.id, input.executorId);
  const code = options.code ?? "X_API_VERIFICATION_PENDING";
  const retryable = options.retryable ?? true;
  const unchanged = execution.status === "verification-pending" && execution.failure?.code === code && execution.failure?.message === message && execution.failure?.retryable === retryable;
  execution.status = "verification-pending";
  execution.failure = { code, message, retryable };
  execution.lease = undefined;
  execution.updatedAt = timestamp();
  if (!unchanged) state.events.unshift(bridgeEvent(state, "Waiting for X verification", message, "warning", execution.id));
  touchBridge(state, bridge);
  writeState(state);
  return { state, execution, verified: false };
}

/**
 * Reconcile a Chrome-written X reply through the official X API. DOM
 * visibility is intentionally only a submission hint: X's API must confirm
 * the exact author, parent post, and text before OpenPresence counts success.
 */
export async function verifyChromeExecution(bridge: Bridge, executionId: string, input: z.infer<typeof verifyInput>) {
  let state = readStateForBridge(bridge.id);
  const execution = state.executions.find((item) => item.id === executionId && item.bridgeId === bridge.id);
  if (!execution) throw new Error("Execution not found");
  if (execution.status === "succeeded") return { state, execution, verified: true };
  const canVerify = execution.status === "claimed"
    || execution.status === "verification-pending"
    || (execution.status === "failed" && ["RESULT_NOT_VERIFIED", "X_API_VERIFICATION_PENDING"].includes(execution.failure?.code ?? ""));
  if (!canVerify) throw new Error("Execution is not waiting for X verification");
  if (execution.affordance !== "reply" && execution.affordance !== "x.reply") throw new Error("Only X replies submitted through Chrome can be API-verified");
  if (execution.target?.type !== "x.post" || !execution.target.id) throw new Error("The Chrome reply has no target X post");

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
    return leaveExecutionVerificationPending(bridge, state, execution, "Chrome submitted the reply, but the connected X API cannot yet verify the account, credentials, or approved text.", input);
  }

  let verifiedReply;
  try {
    verifiedReply = await findVerifiedXReply(credentials, { targetId: execution.target.id, text, handle, candidateId: input.candidateExternalRef?.type === "x.reply" ? input.candidateExternalRef.id : undefined });
  } catch (error) {
    state = readStateForBridge(bridge.id);
    const latest = state.executions.find((item) => item.id === executionId && item.bridgeId === bridge.id);
    if (!latest) throw new Error("Execution not found");
    const message = error instanceof Error ? error.message : "X did not return a verification response.";
    const creditsExhausted = /no api credits|credits remaining|billing and usage|quota exhausted/i.test(message);
    return leaveExecutionVerificationPending(bridge, state, latest, creditsExhausted
      ? "Chrome submitted the reply, but X API verification is paused because the X API has no credits remaining. Restore X API access before checking this outcome again."
      : `Chrome submitted the reply, but X API verification is temporarily unavailable: ${message}`, input, creditsExhausted ? { code: "X_API_CREDITS_EXHAUSTED", retryable: false } : undefined);
  }
  if (!verifiedReply) {
    state = readStateForBridge(bridge.id);
    const latest = state.executions.find((item) => item.id === executionId && item.bridgeId === bridge.id);
    if (!latest) throw new Error("Execution not found");
    return leaveExecutionVerificationPending(bridge, state, latest, "Chrome submitted the reply. OpenPresence is waiting for X to return the matching public reply through the API.", input);
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
  const result = acknowledgeExecution(bridge, executionId, { executorId: input.executorId, externalRef: { type: "x.reply", id: verifiedReply.id }, observedAt: input.observedAt ?? timestamp() }, { apiVerified: true });
  return { ...result, verified: true };
}

export function reportOutcome(bridge: Bridge, input: z.infer<typeof outcomeInput>) { const state = readStateForBridge(bridge.id); const execution = state.executions.find((item) => item.id === input.executionId && item.bridgeId === bridge.id); if (!execution) throw new Error("Execution not found"); const outcome: Outcome = { id: localId("outcome"), socialIntentId: execution.socialIntentId, executionId: execution.id, presenceId: execution.presenceId, status: input.status, observedAt: timestamp(), metrics: input.metrics, evidence: input.evidence }; state.outcomes.unshift(outcome); touchBridge(state, bridge); writeState(state); return { state, outcome }; }

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
