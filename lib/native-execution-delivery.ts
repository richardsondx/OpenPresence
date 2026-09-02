import { randomUUID } from "node:crypto";
import {
  blockExecutionForLanguage,
  blockExecutionForTargetLanguage,
  completeNativeExecution,
  failNativeExecution,
  isMentionRestrictedError,
  isPersonBlockingError,
  languageValidationForExecution,
  markNativeConnectionNeedsAttention,
  nativeDeliveryFailureIsConnectionScoped,
  existingPublicActionExecution,
  recordResourceUsageEvent,
  recordRuntimeEvent,
  recordPersonBlockedFromExecution,
  cancelExecutionForBlockedTarget,
  targetIsBlockedByPerson,
  rerouteExecutionToBrowser,
  targetLanguageValidationForExecution,
  isWatchPausedForExecution,
  browserBridgeFor,
} from "./runtime";
import { deleteXPost, followXUser, likeXPost, publishSealedXPost, readNativeXCredentials, repostXPost } from "./x";
import { isTestRuntime } from "./test-runtime";
import { xCreditsExhausted } from "./x-credits";
import { PublicationSecurityError, sealExecutionForDelivery } from "./publication-security";
import { detectDuplicateVerifiedExecutionOutcomes } from "./public-action-safety";
import { hasObservedOwnReplyForTarget } from "./duplicate-public-outcome";
import type { OpenPresenceState } from "./types";
import { readStateSnapshotForContext, reservePublicActionDelivery, updatePublicActionDelivery } from "./db";
import { authorizeAssetSelection, liveAssetReuseReason } from "./asset-library";

function cancelDuplicateDelivery(state: OpenPresenceState, executionId: string, representedBy: string) {
  const execution = state.executions.find((item) => item.id === executionId);
  if (!execution) return;
  execution.status = "cancelled";
  execution.failure = { code: "DUPLICATE_EXECUTION", message: `A durable delivery slot for this target is already owned by execution ${representedBy}; no second connector request was sent.`, retryable: false };
  execution.reviewReason = "This Presence already has a public action in flight or verified for the same target.";
  execution.updatedAt = new Date().toISOString();
  const action = state.actions.find((item) => item.executionId === execution.id);
  if (action) action.status = "failed";
}

function cancelObservedReplyDelivery(state: OpenPresenceState, executionId: string) {
  const execution = state.executions.find((item) => item.id === executionId);
  if (!execution) return;
  execution.status = "cancelled";
  execution.failure = { code: "DUPLICATE_PUBLIC_OUTCOME", message: "The Social Mirror already contains an authored reply for this target; no second connector request was sent.", retryable: false };
  execution.reviewReason = "An authored reply is already visible for this target in the Social Mirror.";
  execution.updatedAt = new Date().toISOString();
  const action = state.actions.find((item) => item.executionId === execution.id);
  if (action) action.status = "failed";
}

function nativeConnectionCanWrite(connection: OpenPresenceState["nativeConnections"][number], expectedHandle?: string) {
  const identityMatches = !expectedHandle || Boolean(connection.account?.username && connection.account.username.replace(/^@/, "").trim().toLowerCase() === expectedHandle.replace(/^@/, "").trim().toLowerCase());
  if (!identityMatches) return false;
  const canAct = connection.status === "connected"
    || (connection.status === "needs-attention" && nativeDeliveryFailureIsConnectionScoped(connection.healthMessage ?? connection.deliveryError ?? ""));
  if (!canAct) return false;
  // Keep reads available while routing writes away from an API app with no
  // credits. A connected-but-creditless API must not strand browser work.
  return !/no API credits remaining|credits remaining|billing and usage|quota exhausted/i.test(`${connection.deliveryError ?? ""} ${connection.healthMessage ?? ""}`);
}

/**
 * Deliver newly formed native executions immediately, regardless of whether
 * they came from a request handler or the autonomous worker. Autonomous runs
 * used to persist queued executions and return without crossing this boundary,
 * leaving otherwise authorized actions to expire before any connector claim.
 */
export async function deliverNativeExecutions(source: OpenPresenceState, executionIds: Set<string>) {
  let next = source;
  for (const execution of next.executions.filter((item) => executionIds.has(item.id) && item.connector === "native" && ((item.status === "queued" && item.mode === "auto") || item.status === "approved"))) {
    // A long provider/model pass can outlive its original snapshot. Re-read
    // the durable target ledger immediately before crossing the external write
    // boundary so a restarted worker cannot replay an action already verified
    // by an earlier invocation of the same attention episode.
    const durable = readStateSnapshotForContext({ presenceId: execution.presenceId });
    if (targetIsBlockedByPerson(durable, execution.presenceId, execution.target) && !execution.operatorDirectiveId) {
      const blocked = cancelExecutionForBlockedTarget(durable, execution.id);
      Object.assign(next, blocked);
      continue;
    }
    if (isWatchPausedForExecution(durable, execution)) {
      const paused = next.executions.find((item) => item.id === execution.id);
      if (paused) {
        paused.status = "cancelled";
        paused.failure = { code: "WATCH_PAUSED", message: "The source Watch was paused before delivery. No external action was attempted.", retryable: false };
        paused.reviewReason = "The operator paused the source Watch before delivery.";
        paused.updatedAt = new Date().toISOString();
        const action = next.actions.find((item) => item.executionId === paused.id);
        if (action) { action.status = "skipped"; action.reason = "The source Watch was paused before delivery; no external action was attempted."; }
      }
      continue;
    }
    if (execution.affordance === "x.reply" && (hasObservedOwnReplyForTarget(durable, execution) || hasObservedOwnReplyForTarget(next, execution))) {
      cancelObservedReplyDelivery(next, execution.id);
      continue;
    }
    const duplicateOf = existingPublicActionExecution(durable, execution) ?? existingPublicActionExecution(next, execution);
    if (duplicateOf) {
      const duplicate = next.executions.find((item) => item.id === execution.id);
      if (duplicate) {
        duplicate.status = "cancelled";
        duplicate.failure = { code: "DUPLICATE_EXECUTION", message: `This public action is already represented by execution ${duplicateOf.id}; no second connector request was sent.`, retryable: false };
        duplicate.reviewReason = "A matching public action is already in flight or verified.";
        duplicate.updatedAt = new Date().toISOString();
        const action = next.actions.find((item) => item.executionId === duplicate.id);
        if (action) action.status = "failed";
      }
      continue;
    }
    const expectedHandle = next.presences.find((item) => item.id === execution.presenceId)?.handle ?? next.presence?.handle;
    const connection = next.nativeConnections.find((item) => item.presenceId === execution.presenceId && item.access === "read-write" && nativeConnectionCanWrite(item, expectedHandle));
    const creditlessConnection = next.nativeConnections.find((item) => item.presenceId === execution.presenceId && item.channelId === "x" && xCreditsExhausted(item));
    if (!connection && creditlessConnection && browserBridgeFor(next, execution.presenceId, execution.affordance)) {
      next = rerouteExecutionToBrowser(next, execution.id, "X API credits are exhausted; the authorized Chrome Bridge is the continuity route for this public action.");
      continue;
    }
    // Test and mock runtimes never retrieve live write credentials. The sealed
    // publication gate still runs first so the execution is recorded as a
    // security block rather than degrading into an ordinary connector error.
    const credentials = isTestRuntime() ? undefined : connection ? readNativeXCredentials(connection.id) : undefined;
    const languageResult = languageValidationForExecution(next, execution);
    if (!languageResult.valid) {
      next = blockExecutionForLanguage(next, execution.id);
      continue;
    }
    if (execution.publication) {
      try {
        authorizeAssetSelection(next, execution.publication.assetIds ?? [], { presenceId: execution.presenceId, requireReady: true });
        const liveAssetRepeatReason = liveAssetReuseReason(next, execution.presenceId, execution.publication.assetIds ?? [], { excludePublicationId: execution.publication.id });
        if (liveAssetRepeatReason) {
          const current = next.executions.find((item) => item.id === execution.id);
          if (current) {
            current.status = "blocked";
            current.failure = { code: "DUPLICATE_LIVE_ASSET", message: liveAssetRepeatReason, retryable: false };
            current.reviewReason = "The native writer refused a visual that this Presence already published.";
            current.updatedAt = new Date().toISOString();
          }
          next = recordRuntimeEvent(next, execution.presenceId, "Live media blocked", liveAssetRepeatReason, "warning", { executionId: execution.id, intentId: execution.socialIntentId });
          continue;
        }
        const sealed = sealExecutionForDelivery(execution);
        const targetLanguageResult = targetLanguageValidationForExecution(next, execution);
        if (!targetLanguageResult.valid) {
          next = blockExecutionForTargetLanguage(next, execution.id);
          continue;
        }
        if (!credentials) throw new Error("The native X connection is unavailable.");
        const reservation = reservePublicActionDelivery(execution);
        if (!reservation.acquired) {
          cancelDuplicateDelivery(next, execution.id, reservation.slot.executionId);
          continue;
        }
        const replyTo = execution.affordance === "x.reply" && execution.target?.type === "x.post" ? execution.target.id : undefined;
        const quoteTweetId = execution.affordance === "x.quote" && execution.target?.type === "x.post" ? execution.target.id : undefined;
        next = recordResourceUsageEvent(next, { presenceId: execution.presenceId, invocationId: execution.id, originKind: execution.assignmentId ? "assignment" : "publishing_initiative", attentionSource: execution.assignmentId ? "assignment" : "publishing", category: "channel_write", action: execution.affordance, provider: "x", usage: { requests: 1 } });
        updatePublicActionDelivery(execution.id, "handed_off");
        const externalRef = await publishSealedXPost(credentials, sealed.expression, sealed.permit, replyTo, next.assets, quoteTweetId);
        updatePublicActionDelivery(execution.id, "verified", externalRef);
        next = completeNativeExecution(next, execution.id, externalRef);
        next = detectDuplicateVerifiedExecutionOutcomes(next, execution.id);
        const publication = execution.publication;
        if (publication?.assetIds?.length) {
          const newUsage = publication.assetIds.filter((assetId) => !next.assetUsages.some((usage) => usage.assetId === assetId && usage.publicationId === publication.id && usage.environment === "live")).map((assetId) => ({ id: `asset-usage:${randomUUID()}`, assetId, agentId: next.agent?.id ?? "", presenceId: execution.presenceId, publicationId: publication.id, socialIntentId: execution.socialIntentId, assignmentId: execution.assignmentId, channelId: "x" as const, environment: "live" as const, usageType: "new" as const, publishedAt: new Date().toISOString() }));
          next.assetUsages = [...newUsage, ...next.assetUsages];
        }
      } catch (error) {
        updatePublicActionDelivery(execution.id, "uncertain");
        const message = error instanceof Error ? error.message : "X rejected the post.";
        if (error instanceof PublicationSecurityError) {
          const current = next.executions.find((item) => item.id === execution.id);
          if (current) {
            current.status = "blocked";
            current.failure = { code: error.code, message, retryable: false };
            current.reviewReason = "Live delivery was blocked by the publication security boundary.";
            current.updatedAt = new Date().toISOString();
          }
          next = recordRuntimeEvent(next, execution.presenceId, "Live publication blocked", "The native writer refused an execution that did not cross the sealed Public Expression boundary.", "warning", { executionId: execution.id, intentId: execution.socialIntentId });
        } else if (isPersonBlockingError(message)) {
          next = failNativeExecution(next, execution.id, message);
          next = recordPersonBlockedFromExecution(next, execution.id, message, "native_delivery");
        } else if (isMentionRestrictedError(message)) {
          console.log("Native channel action rejected; learning browser fallback", execution.id);
          next = rerouteExecutionToBrowser(next, execution.id, message);
          next = markNativeConnectionNeedsAttention(next, execution.presenceId, message);
        } else {
          console.warn("Native X post failed", message);
          next = failNativeExecution(next, execution.id, message);
          next = markNativeConnectionNeedsAttention(next, execution.presenceId, message);
        }
      }
    } else {
      const targetLanguageResult = targetLanguageValidationForExecution(next, execution);
      if (!targetLanguageResult.valid) {
        next = blockExecutionForTargetLanguage(next, execution.id);
        continue;
      }
      try {
        if (!credentials || !connection?.account?.id || !execution.target) throw new Error("The native X connection is unavailable or has no authenticated account context.");
        const reservation = reservePublicActionDelivery(execution);
        if (!reservation.acquired) {
          cancelDuplicateDelivery(next, execution.id, reservation.slot.executionId);
          continue;
        }
        next = recordResourceUsageEvent(next, { presenceId: execution.presenceId, invocationId: execution.id, originKind: execution.assignmentId ? "assignment" : "standing_intent", attentionSource: execution.assignmentId ? "assignment" : "publishing", category: "channel_write", action: execution.affordance, provider: "x", usage: { requests: 1 } });
        updatePublicActionDelivery(execution.id, "handed_off");
        let externalRef;
        if (execution.affordance === "x.like" && execution.target.type === "x.post") externalRef = await likeXPost(credentials, connection.account.id, execution.target.id);
        else if (execution.affordance === "x.repost" && execution.target.type === "x.post") externalRef = await repostXPost(credentials, connection.account.id, execution.target.id);
        else if (execution.affordance === "x.follow" && execution.target.type === "x.user") externalRef = await followXUser(credentials, connection.account.id, execution.target.id);
        else if (execution.affordance === "x.delete" && execution.target.type === "x.post") {
          const expectedHandle = (next.presences.find((presence) => presence.id === execution.presenceId)?.handle ?? "").replace(/^@/, "").toLowerCase();
          const mirrored = next.mirrorObjects.find((item) => item.presenceId === execution.presenceId && item.channelId === "x" && item.externalRef.type === "x.post" && item.externalRef.id === execution.target?.id && !item.archived && (item.actorPresenceId === execution.presenceId || (item.author?.handle ?? "").replace(/^@/, "").toLowerCase() === expectedHandle));
          if (!mirrored) throw new Error("OpenPresence refused to delete an X post that is not verified as this Presence's own live content.");
          externalRef = await deleteXPost(credentials, execution.target.id);
        }
        else throw new Error(`The native X writer does not support ${execution.affordance} with target ${execution.target.type}.`);
        updatePublicActionDelivery(execution.id, "verified", externalRef);
        next = completeNativeExecution(next, execution.id, externalRef);
        next = detectDuplicateVerifiedExecutionOutcomes(next, execution.id);
      } catch (error) {
        updatePublicActionDelivery(execution.id, "uncertain");
        const message = error instanceof Error ? error.message : "X rejected the action.";
        if (error instanceof PublicationSecurityError) {
          const current = next.executions.find((item) => item.id === execution.id);
          if (current) { current.status = "blocked"; current.failure = { code: error.code, message, retryable: false }; current.updatedAt = new Date().toISOString(); }
          next = recordRuntimeEvent(next, execution.presenceId, "Live action blocked", message, "warning", { executionId: execution.id, intentId: execution.socialIntentId });
        } else if (isPersonBlockingError(message)) {
          next = failNativeExecution(next, execution.id, message);
          next = recordPersonBlockedFromExecution(next, execution.id, message, "native_delivery");
        } else if (isMentionRestrictedError(message)) {
          console.log("Native channel action rejected; learning browser fallback", execution.id);
          next = rerouteExecutionToBrowser(next, execution.id, message);
          next = markNativeConnectionNeedsAttention(next, execution.presenceId, message);
        } else {
          next = failNativeExecution(next, execution.id, message);
          next = markNativeConnectionNeedsAttention(next, execution.presenceId, message);
        }
      }
    }
  }
  return next;
}
