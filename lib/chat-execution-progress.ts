import type { Execution, OpenPresenceState, OperationalRun } from "./types";

function hasVerifiedOutcome(state: OpenPresenceState, execution: Execution) {
  return state.outcomes.some(outcome => outcome.executionId === execution.id && outcome.socialIntentId === execution.socialIntentId && outcome.presenceId === execution.presenceId && outcome.status === "succeeded" && outcome.environment === execution.environment && outcome.sessionId === execution.sessionId);
}

function statusMessage(state: OpenPresenceState, execution: Execution) {
  const rehearsal = execution.environment === "sandbox";
  const label = rehearsal ? "Rehearsal action" : "Action";
  if (execution.status === "succeeded") {
    const verified = hasVerifiedOutcome(state, execution);
    if (!verified) return undefined;
    return `${label} completed and verified.${execution.externalRef?.type === "x.post" || execution.externalRef?.type === "x.reply" ? ` [View on X](https://x.com/i/web/status/${encodeURIComponent(execution.externalRef.id)})` : ""}`;
  }
  if (execution.status === "awaiting-review" && execution.reviewReason) return `${execution.reviewReason} The saved post hasn’t been sent.`;
  if (execution.status === "awaiting-connector" && execution.failure?.code === "BROWSER_CONNECTOR_UPDATE_REQUIRED") return "The approved post is saved and hasn’t been sent. Reload the OpenPresence extension and refresh the X tab to restore image delivery; I’ll keep the same approved action.";
  if (execution.status === "approved" || execution.status === "queued") return `${label} approved. ${execution.connector === "bridge" ? "Waiting for the authorized browser to pick it up." : "Ready for delivery."} It has not been verified yet.`;
  if (execution.status === "verification-pending") return `${label} is awaiting delivery verification. I won’t send it again while its public result is uncertain.`;
  if (execution.status === "failed" && execution.failure?.code === "BROWSER_CONNECTOR_UNAVAILABLE") return "I couldn’t load the approved image because the browser connector was unavailable, so the post wasn’t sent. Reload the OpenPresence extension and refresh the X tab, then retry this saved action.";
  if (execution.status === "failed" && execution.failure?.code === "UNSUPPORTED_ASSET") return "I couldn’t load the approved image in the browser, so the post wasn’t sent. The approved post and image are saved; delivery needs another check.";
  if (execution.status === "failed" || execution.status === "blocked") return `${label} could not be completed. ${execution.failure?.message ?? execution.reviewReason ?? "Delivery is blocked."} No verified completion was recorded.`;
  if (execution.status === "cancelled" || execution.status === "expired") return `${label} ${execution.status === "cancelled" ? "cancelled" : "expired"}. No new delivery will be attempted.`;
  return undefined;
}

/** Persist factual follow-through in the exact Chat turn that formed the action. */
export function recordChatExecutionProgress(state: OpenPresenceState, previous?: OpenPresenceState, observedAt = new Date().toISOString()) {
  for (const conversation of state.operatorConversations ?? []) {
    if (conversation.agentId !== state.agent?.id) continue;
    const linked = new Map<string, string>();
    for (const message of conversation.messages) {
      if (message.role !== "system" || !message.replyToMessageId) continue;
      try {
        const receipt = JSON.parse(message.content);
        if (receipt.tool !== "social_action" || !Array.isArray(receipt.result)) continue;
        const ids = receipt.result.filter((item: { executionId?: string; status?: string }) => ["awaiting-review", "approved", "queued", "awaiting-connector"].includes(item.status ?? "")).map((item: { executionId?: string }) => item.executionId);
        for (const executionId of ids) if (typeof executionId === "string") linked.set(executionId, message.replyToMessageId);
      } catch { /* Ordinary system notes are not tool receipts. */ }
    }
    for (const [executionId, replyToMessageId] of linked) {
      const execution = state.executions.find(item => item.id === executionId && item.presenceId === conversation.presenceId);
      if (!execution || !conversation.messages.some(message => message.id === replyToMessageId && message.role === "operator")) continue;
      const cursor = conversation.executionProgress ??= {};
      const priorStatus = cursor[executionId] ?? previous?.executions.find(item => item.id === executionId && item.presenceId === conversation.presenceId)?.status;
      const currentStatus = execution.status === "succeeded" && hasVerifiedOutcome(state, execution) ? "succeeded_verified" : execution.status;
      cursor[executionId] = currentStatus;
      const statusKey = execution.status === "approved" ? "queued" : execution.status;
      const id = `execution-progress:${conversation.id}:${execution.id}:${statusKey}${execution.status === "failed" ? `:${execution.attempts}` : ""}`;
      const existing = conversation.messages.find(message => message.id === id);
      // Older follow-through notes used the execution clock. Repair only an
      // exact generated note that was placed before a later answer in its own
      // turn; repeated writes must neither reorder it again nor add a notice.
      if (existing && existing.timestamp === execution.updatedAt
        && conversation.messages.some(message => message.role === "presence" && message.replyToMessageId === replyToMessageId && !message.id.startsWith("execution-progress:") && message.timestamp > existing.timestamp)) {
        existing.timestamp = observedAt;
        conversation.updatedAt = observedAt;
      }
      // A connector can fail after Chat already answered or after review.
      // Persist a structured receipt, not another user request or write intent.
      if (execution.status === "failed" && execution.failure && priorStatus) {
        const failureId = `execution-failure-result:${conversation.id}:${execution.id}:${execution.attempts}`;
        if (!conversation.messages.some(message => message.id === failureId)) {
          conversation.messages.push({ id: failureId, role: "system", replyToMessageId, timestamp: observedAt,
            content: JSON.stringify({ tool: "delivery_failure", request: { kind: "inspect_execution", executionId }, result: { executionId, status: execution.status, failure: execution.failure, attempts: execution.attempts, verified: false }, instruction: "Delivery failed after the earlier Chat response. Inspect this same saved action and its actual failure. Do not claim X rejected an image unless an observed platform alert says so. Do not create a replacement publication or transfer approval. Reuse only the existing retry boundary; otherwise explain the exact dependency or request necessary user action." }) });
          conversation.updatedAt = observedAt;
        }
      }
      if (!priorStatus || priorStatus === currentStatus || existing) continue;
      const content = statusMessage(state, execution);
      if (!content) continue;
      // Communication time is independent of execution/world time, including
      // Sandbox virtual clocks and older operator-approved actions.
      const timestamp = observedAt;
      conversation.messages.push({ id, role: "presence", content, timestamp, replyToMessageId, milestone: execution.status === "succeeded" ? "verified" : ["failed", "blocked"].includes(execution.status) ? "failure" : "action", externalRefs: execution.status === "succeeded" && execution.externalRef ? [execution.externalRef] : undefined });
      conversation.updatedAt = timestamp;
    }
  }
  return state;
}


/** Durable sweep candidates; the existing indexed Chat run and lease own dispatch. */
export function chatExecutionContinuationCandidates(state: OpenPresenceState, observedAt = new Date().toISOString()): OperationalRun[] {
  const candidates: OperationalRun[] = [];
  for (const conversation of state.operatorConversations ?? []) {
    if (conversation.agentId !== state.agent?.id) continue;
    for (const message of conversation.messages) {
      if (message.role !== "system" || !message.id.startsWith("execution-failure-result:") || !message.replyToMessageId) continue;
      let receipt;
      try { receipt = JSON.parse(message.content) as { result?: { executionId?: string; attempts?: number } }; } catch { continue; }
      const execution = state.executions.find(item => item.id === receipt.result?.executionId && item.presenceId === conversation.presenceId);
      if (!execution || receipt.result?.attempts !== execution.attempts || execution.environment !== "live" || execution.status !== "failed" || execution.externalRef || execution.executedAt
        || state.outcomes.some(outcome => outcome.executionId === execution.id)
        || !["ASSET_UPLOAD_FAILED", "UNSUPPORTED_ASSET", "BROWSER_CONNECTOR_UNAVAILABLE", "COMPOSER_INPUT_FAILED", "COMPOSER_UNAVAILABLE", "ACCOUNT_NOT_READY", "ACCOUNT_MISMATCH"].includes(execution.failure?.code ?? "")) continue;
      const requestIndex = conversation.messages.findIndex(item => item.id === message.replyToMessageId && item.role === "operator");
      if (requestIndex < 0 || conversation.messages.slice(requestIndex + 1).some(item => item.role === "operator")) continue;
      const run = state.operationalRuns?.find(item => item.kind === "operator_chat" && item.presenceId === conversation.presenceId
        && item.metadata?.operatorMessageId === message.replyToMessageId && (!execution.runId || execution.runId === item.id));
      if (!run || !["succeeded", "failed"].includes(run.state) || (run.leaseOwner && run.leaseExpiresAt && Date.parse(run.leaseExpiresAt) > Date.parse(observedAt))
        || Number(run.metadata?.chatSteps ?? 0) >= 48 || candidates.some(item => item.id === run.id)) continue;
      const handled = Array.isArray(run.metadata?.deliveryFailureReceiptIds) ? run.metadata.deliveryFailureReceiptIds.filter((id): id is string => typeof id === "string") : [];
      if (handled.includes(message.id)) continue;
      const fingerprint = JSON.stringify({ code: execution.failure?.code, message: execution.failure?.message });
      const failures = Array.isArray(run.metadata?.deliveryFailureFingerprints) ? run.metadata.deliveryFailureFingerprints.filter((value): value is string => typeof value === "string") : [];
      // Initial failure plus one fresh decision; a second unchanged failure is
      // terminal evidence, not another automatic retry loop.
      const matchingReceipts = conversation.messages.filter(item => {
        if (item.role !== "system" || item.replyToMessageId !== message.replyToMessageId || !item.id.startsWith("execution-failure-result:")) return false;
        try { const saved = JSON.parse(item.content); return saved.result?.executionId === execution.id && JSON.stringify({ code: saved.result?.failure?.code, message: saved.result?.failure?.message }) === fingerprint; } catch { return false; }
      });
      if (failures.filter(value => value === fingerprint).length >= 1 || matchingReceipts.length >= 2) continue;
      const ignored = conversation.messages.filter(item => item.role === "presence" && item.replyToMessageId === message.replyToMessageId).map(item => item.id);
      candidates.push({ ...run, state: "queued", stage: "operator_chat.queued", eligibleAt: observedAt, lastProgressAt: observedAt,
        leaseOwner: undefined, leaseExpiresAt: undefined, nextWakeAt: undefined, blockedReason: undefined,
        metadata: { ...run.metadata, deliveryContinuationActive: true, deliveryContinuationExecutionId: execution.id,
          deliveryFailureReceiptIds: [...handled, message.id], deliveryFailureFingerprints: [...failures, fingerprint],
          deliveryContinuationIgnoredAnswerIds: ignored } });
    }
  }
  return candidates;
}
