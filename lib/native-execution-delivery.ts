import { randomUUID } from "node:crypto";
import {
  blockExecutionForLanguage,
  blockExecutionForTargetLanguage,
  completeNativeExecution,
  failNativeExecution,
  isMentionRestrictedError,
  languageValidationForExecution,
  markNativeConnectionNeedsAttention,
  nativeDeliveryFailureIsConnectionScoped,
  recordResourceUsageEvent,
  recordRuntimeEvent,
  rerouteExecutionToBrowser,
  targetLanguageValidationForExecution,
} from "./runtime";
import { followXUser, likeXPost, publishSealedXPost, readNativeXCredentials, repostXPost } from "./x";
import { isTestRuntime } from "./test-runtime";
import { PublicationSecurityError, sealExecutionForDelivery } from "./publication-security";
import type { OpenPresenceState } from "./types";

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
    const expectedHandle = next.presences.find((item) => item.id === execution.presenceId)?.handle ?? next.presence?.handle;
    const connection = next.nativeConnections.find((item) => item.presenceId === execution.presenceId && item.access === "read-write" && nativeConnectionCanWrite(item, expectedHandle));
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
        const sealed = sealExecutionForDelivery(execution);
        const targetLanguageResult = targetLanguageValidationForExecution(next, execution);
        if (!targetLanguageResult.valid) {
          next = blockExecutionForTargetLanguage(next, execution.id);
          continue;
        }
        if (!credentials) throw new Error("The native X connection is unavailable.");
        const replyTo = execution.affordance === "x.reply" && execution.target?.type === "x.post" ? execution.target.id : undefined;
        const quoteTweetId = execution.affordance === "x.quote" && execution.target?.type === "x.post" ? execution.target.id : undefined;
        next = recordResourceUsageEvent(next, { presenceId: execution.presenceId, invocationId: execution.id, originKind: execution.assignmentId ? "assignment" : "publishing_initiative", attentionSource: execution.assignmentId ? "assignment" : "publishing", category: "channel_write", action: execution.affordance, provider: "x", usage: { requests: 1 } });
        const externalRef = await publishSealedXPost(credentials, sealed.expression, sealed.permit, replyTo, next.assets, quoteTweetId);
        next = completeNativeExecution(next, execution.id, externalRef);
        const publication = execution.publication;
        if (publication?.assetIds?.length) {
          next.assetUsages = [...publication.assetIds.map((assetId) => ({ id: `asset-usage:${randomUUID()}`, assetId, agentId: next.agent?.id ?? "", presenceId: execution.presenceId, publicationId: publication.id, socialIntentId: execution.socialIntentId, assignmentId: execution.assignmentId, channelId: "x" as const, environment: "live" as const, usageType: "new" as const, publishedAt: new Date().toISOString() })), ...next.assetUsages];
        }
      } catch (error) {
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
        next = recordResourceUsageEvent(next, { presenceId: execution.presenceId, invocationId: execution.id, originKind: execution.assignmentId ? "assignment" : "standing_intent", attentionSource: execution.assignmentId ? "assignment" : "publishing", category: "channel_write", action: execution.affordance, provider: "x", usage: { requests: 1 } });
        let externalRef;
        if (execution.affordance === "x.like" && execution.target.type === "x.post") externalRef = await likeXPost(credentials, connection.account.id, execution.target.id);
        else if (execution.affordance === "x.repost" && execution.target.type === "x.post") externalRef = await repostXPost(credentials, connection.account.id, execution.target.id);
        else if (execution.affordance === "x.follow" && execution.target.type === "x.user") externalRef = await followXUser(credentials, connection.account.id, execution.target.id);
        else throw new Error(`The native X writer does not support ${execution.affordance} with target ${execution.target.type}.`);
        next = completeNativeExecution(next, execution.id, externalRef);
      } catch (error) {
        const message = error instanceof Error ? error.message : "X rejected the action.";
        if (error instanceof PublicationSecurityError) {
          const current = next.executions.find((item) => item.id === execution.id);
          if (current) { current.status = "blocked"; current.failure = { code: error.code, message, retryable: false }; current.updatedAt = new Date().toISOString(); }
          next = recordRuntimeEvent(next, execution.presenceId, "Live action blocked", message, "warning", { executionId: execution.id, intentId: execution.socialIntentId });
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
