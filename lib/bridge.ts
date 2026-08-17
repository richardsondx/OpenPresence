import { z } from "zod";
import { applyOperation, blockExecutionForLanguage, blockExecutionForTargetLanguage, curateRelationshipFromMirror, ensureCapabilityRequests, languageValidationForExecution, recordVerifiedFollow, targetLanguageValidationForExecution } from "./runtime";
import { authenticateBridgeKey, deleteBridgeCredential, issueBridgeKey, readBridgeCredentialMetadata, readStateForBridge, revokeBridgeKey, writeState } from "./db";
import type { Bridge, Execution, LiveEvent, MirrorObject, OpenPresenceState, Outcome } from "./types";
import { bridgeAdapterStatus } from "./bridge-contract";
import { PublicationSecurityError, sealExecutionForDelivery, verifyExecutionPermit } from "./publication-security";
import { cleanMirrorText, normalizeMirrorAuthor } from "./mirror-content";

const entityRef = z.object({ type: z.string().min(1).max(80), id: z.string().min(1).max(240) });
const author = z.object({ externalRef: entityRef.optional(), displayName: z.string().min(1).max(160), handle: z.string().max(160).optional(), avatarUrl: z.string().url().max(2_000).optional() }).optional();
export const mirrorObjectInput = z.object({ externalRef: entityRef, parentExternalRef: entityRef.optional(), conversationExternalRef: z.string().max(240).optional(), referencedExternalRefs: z.array(entityRef).max(20).optional(), objectType: z.string().min(1).max(80), language: z.string().trim().max(20).optional(), author, content: z.object({ text: z.string().max(100_000).optional(), payload: z.unknown().optional(), language: z.string().trim().max(20).optional() }).optional(), occurredAt: z.string().datetime().optional(), visibility: z.enum(["public", "private-community", "private-thread", "direct-message", "unknown"]).default("unknown"), shareability: z.enum(["presence-only", "agent-wide", "public"]).default("presence-only"), originExecutionId: z.string().optional(), actorPresenceId: z.string().optional() });
export const inboundEventInput = z.object({ sourceEventId: z.string().min(1).max(240), event: z.enum(["created", "updated", "deleted"]), object: mirrorObjectInput });
export const eventsInput = z.object({ events: z.array(inboundEventInput).min(1).max(500) });
export const reconcileInput = z.object({ cursor: z.string().max(500).optional(), objects: z.array(mirrorObjectInput).max(2_000) });
export const claimInput = z.object({ executorId: z.string().min(1).max(160), limit: z.number().int().min(1).max(50).default(10) });
export const heartbeatInput = z.object({ executorId: z.string().min(1).max(160) });
export const ackInput = z.object({ executorId: z.string().min(1).max(160), externalRef: entityRef, observedAt: z.string().datetime().optional() });
export const failInput = z.object({ executorId: z.string().min(1).max(160), code: z.string().max(80).optional(), message: z.string().min(1).max(1_000), retryable: z.boolean().default(false) });
export const outcomeInput = z.object({ executionId: z.string().min(1), status: z.enum(["succeeded", "failed", "unknown"]), metrics: z.record(z.number()).default({}), evidence: z.array(entityRef).default([]) });
export const metricsInput = z.object({ audience: z.object({ followers: z.number().int().min(0), following: z.number().int().min(0).optional(), observedAt: z.string().datetime().optional() }).optional(), publications: z.array(z.object({ externalRef: entityRef, publicationAgeSeconds: z.number().int().min(0), metrics: z.object({ impressions: z.number().int().min(0).optional(), likes: z.number().int().min(0).optional(), replies: z.number().int().min(0).optional(), reposts: z.number().int().min(0).optional(), quotes: z.number().int().min(0).optional() }) })).max(100).default([]) });

const timestamp = () => new Date().toISOString();
const localId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const bridgeEvent = (state: OpenPresenceState, title: string, detail: string, tone: LiveEvent["tone"] = "neutral", executionId?: string): LiveEvent => ({ id: localId("evt"), type: "system", title, detail, time: timestamp(), tone, executionId });

export function bridgeFromRequest(request: Request): Bridge | undefined {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : request.headers.get("x-openpresence-bridge-key")?.trim();
  const bridgeId = token ? authenticateBridgeKey(token) : undefined;
  return bridgeId ? readStateForBridge(bridgeId).bridges.find((bridge) => bridge.id === bridgeId && bridge.state !== "offline") : undefined;
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

export function heartbeatBridge(bridge: Bridge, executorId: string) {
  // Heartbeats identify the live connector but do not carry user-domain
  // changes. Keep the public API's executor context while avoiding the
  // expensive normalized projection rewrite for this high-frequency path.
  void executorId;
  const state = readStateForBridge(bridge.id);
  const current = state.bridges.find((item) => item.id === bridge.id);
  if (!current) throw new Error("Bridge not found");
  const now = timestamp();
  current.adapterStatus = "connected";
  current.lastHeartbeatAt = now;
  current.lastSeenAt = now;
  current.state = "online";
  current.updatedAt = now;
  const sync = state.bridgeSync.find((item) => item.bridgeId === current.id) ?? ({ bridgeId: current.id, status: "idle" } as OpenPresenceState["bridgeSync"][number]);
  sync.status = "healthy";
  sync.error = undefined;
  if (!state.bridgeSync.some((item) => item.bridgeId === current.id)) state.bridgeSync.unshift(sync);
  // Connector health is intentionally revision-neutral. A heartbeat is
  // operational telemetry, not a user workspace change, and must not make a
  // long-running Exploration or operator action stale every five seconds.
  writeState(state, { advanceWorkspaceRevision: false, syncNormalized: false });
  return { bridge: current, status: bridgeAdapterStatus(current) };
}

function upsertObject(state: OpenPresenceState, bridge: Bridge, input: z.infer<typeof mirrorObjectInput>, sourceEventId?: string, archived = false): MirrorObject {
  const existing = state.mirrorObjects.find((item) => item.bridgeId === bridge.id && item.externalRef.type === input.externalRef.type && item.externalRef.id === input.externalRef.id);
  const text = cleanMirrorText(bridge.channelId, input.content?.text);
  const object: MirrorObject = { id: existing?.id ?? localId("mirror"), bridgeId: bridge.id, presenceId: bridge.presenceId, channelId: bridge.channelId, externalRef: input.externalRef, parentExternalRef: input.parentExternalRef, conversationExternalRef: input.conversationExternalRef, referencedExternalRefs: input.referencedExternalRefs, objectType: input.objectType, language: input.language ?? input.content?.language, author: normalizeMirrorAuthor(bridge.channelId, input.content?.text, input.author), content: input.content ? { ...input.content, text } as MirrorObject["content"] : undefined, occurredAt: input.occurredAt, observedAt: timestamp(), visibility: input.visibility, shareability: input.shareability, originExecutionId: input.originExecutionId, actorPresenceId: input.actorPresenceId, sourceEventId, archived };
  if (existing) Object.assign(existing, object); else state.mirrorObjects.unshift(object);
  return object;
}

export function ingestEvents(bridge: Bridge, payload: z.infer<typeof eventsInput>) {
  const state = readStateForBridge(bridge.id); const current = state.bridges.find((item) => item.id === bridge.id); if (!current) throw new Error("Bridge not found");
  for (const item of payload.events) {
    if (state.mirrorEvents.some((event) => event.bridgeId === bridge.id && event.sourceEventId === item.sourceEventId)) continue;
    const object = upsertObject(state, current, item.object, item.sourceEventId, item.event === "deleted");
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
    const object = upsertObject(state, current, input, `reconcile:${payload.cursor ?? "latest"}:${input.externalRef.type}:${input.externalRef.id}`);
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
  for (const execution of state.executions) {
    if (execution.bridgeId !== bridge.id || execution.status !== "claimed" || !execution.lease?.expiresAt) continue;
    if (new Date(execution.lease.expiresAt).getTime() <= now) {
      execution.status = "queued";
      execution.lease = undefined;
      execution.updatedAt = timestamp();
    }
  }
  const candidates = state.executions.filter((execution) => execution.bridgeId === bridge.id && execution.status === "queued").slice(0, input.limit).filter((execution) => !expireIfNeeded(state, execution));
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
  if (claimed.length || candidates.length) {
    touchBridge(state, current); writeState(state);
  }
  return { state, executions: claimed };
}

function leasedExecution(state: OpenPresenceState, bridge: Bridge, executionId: string, executorId: string) {
  const execution = state.executions.find((item) => item.id === executionId && item.bridgeId === bridge.id); if (!execution) throw new Error("Execution not found");
  if (execution.status === "claimed" && execution.lease?.expiresAt && new Date(execution.lease.expiresAt).getTime() < Date.now()) { execution.status = "queued"; execution.lease = undefined; throw new Error("Execution lease expired"); }
  if (!execution.lease || execution.lease.executorId !== executorId || execution.status !== "claimed") throw new Error("Execution is not leased to this executor");
  return execution;
}

export function acknowledgeExecution(bridge: Bridge, executionId: string, input: z.infer<typeof ackInput>) {
  let state = readStateForBridge(bridge.id); const execution = state.executions.find((item) => item.id === executionId && item.bridgeId === bridge.id);
  if (!execution) throw new Error("Execution not found");
  if (execution.status === "succeeded") { if (execution.externalRef?.id !== input.externalRef.id || execution.externalRef?.type !== input.externalRef.type) throw new Error("Execution already acknowledged with a different external reference"); return { state, execution }; }
  leasedExecution(state, bridge, executionId, input.executorId);
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
  const outcome: Outcome = { id: localId("outcome"), socialIntentId: execution.socialIntentId, executionId: execution.id, presenceId: execution.presenceId, status: "succeeded", observedAt: timestamp(), metrics: {}, evidence: [input.externalRef] }; state.outcomes.unshift(outcome);
  if (execution.affordance === "x.follow" && execution.target?.type === "x.user") state = recordVerifiedFollow(state, execution.presenceId, execution.target);
  state.events.unshift(bridgeEvent(state, "Bridge execution completed", "The external executor acknowledged the action.", "positive", execution.id)); touchBridge(state, bridge); writeState(state); return { state, execution };
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
