import { readyBrowserForRead } from "./browser-channel-read";
import { isAgentToolEnabled } from "./types";
import { chatResearchCapabilities, researchRecoveryReady } from "./browser-research";
import { readNativeXCredentials } from "./x";
import { xNativeWriteUnavailable } from "./x-credits";
import type { OperatorChatStep } from "./operator-chat-harness";
import type { OpenPresenceState } from "./types";

export type ChatToolFailureCode = "credentials_unavailable" | "temporary_failure" | "login_required" | "capability_disabled" | "permission_boundary" | "tool_failure";
export interface ChatToolFailure {
  code: ChatToolFailureCode;
  message: string;
  retryable: boolean;
  requiresUserAction: boolean;
  userAction?: string;
}

/** A terminal answer cannot start work: only a saved responsibility can. */
export function unsupportedChatContinuationPromise(text: string, receipts: { content: string }[], operatorRequest = ""): boolean {
  // Requested draft copy can quote promises without making runtime promises.
  // Keep narration outside the quoted draft subject to the same evidence bar.
  const draftRequest = /\b(?:draft|write|compose|wording|copy|message|reply|post)\b/i.test(operatorRequest);
  const narration = draftRequest ? text.replace(/```[\s\S]*?```/g, "").replace(/^\s*>.*$/gm, "").replace(/“[^”]*”|"[^"\n]*"/g, "") : text;
  const promisesWork = /\b(?:I(?:[’']ll| will)|we(?:[’']ll| will))\s+(?:find|search|research|browse|read|try|attempt|proceed|get started|take a look|look (?:for|into)|investigate|start|begin|continue|work on|check|gather|monitor|follow up)\b|\b(?:starting|beginning) (?:the |a |my )?(?:search|research|work|investigation)\b|\b(?:just a moment|give me a moment|hold on for a moment|let me (?:check|read|search|research|initiate|start|begin|browse|investigate))\b|\bI\s+(?:need|want|plan|intend)\s+to\s+(?:use|initiate|search|research|read|browse|find|check|investigate)\b|\bI(?:[’']m| am)\s+(?:going to|about to)\s+(?:use|initiate|search|research|read|browse|find|check|investigate)\b|\b(?:searching|researching|browsing|investigating|reading|checking)\s+(?:now|for|the|that|this)\b/i.test(narration);
  if (!promisesWork) return false;
  return !receipts.some(({ content }) => {
    try {
      const receipt = JSON.parse(content);
      return !receipt.error && receipt.tool === "assignment" && receipt.assignmentId && !receipt.planningOnly && !["failed", "cancelled", "completed"].includes(receipt.status);
    } catch { return false; }
  });
}

/** Reject concrete completion claims when this turn has no matching receipt.
 * Source text and model-written success labels never establish delivery. */
export function unsupportedChatCompletionClaim(text: string, receipts: { content: string }[], operatorRequest = ""): string | undefined {
  const draftRequest = /\b(?:draft|write|compose|wording|copy|message|reply|post)\b/i.test(operatorRequest);
  const narration = draftRequest ? text.replace(/```[\s\S]*?```/g, "").replace(/^\s*>.*$/gm, "").replace(/“[^”]*”|"[^"\n]*"/g, "") : text;
  const results = receipts.flatMap(({ content }) => { try { const receipt = JSON.parse(content); return receipt.error ? [] : [receipt]; } catch { return []; } });
  const claimsDelivery = /\b(?:I|we)(?:[’']ve| have)?\s+(?:successfully\s+)?(?:posted|published|sent|delivered|reposted|followed)\b|\b(?:your|the) (?:post|reply|message) (?:is|was|has been) (?:now |successfully )?(?:posted|published|sent|delivered)\b/i.test(narration);
  const verifiedDelivery = results.some(receipt => {
    if (!["social_action", "inspect_execution", "retry_action"].includes(receipt.tool)) return false;
    const actions = Array.isArray(receipt.result) ? receipt.result : [receipt.result];
    return actions.some((action: { verified?: boolean; status?: string; environment?: string; outcomes?: Array<{ status?: string }> } | undefined) => action?.verified === true && action.status === "succeeded" && (action.environment === "live" || /\b(?:sandbox|rehearsal|simulat(?:ed|ion))\b/i.test(narration)) && action.outcomes?.some(outcome => outcome.status === "succeeded"));
  });
  if (claimsDelivery && !verifiedDelivery) return "The claimed delivery has no verified execution/outcome receipt in this turn. Describe the actual queued, blocked, review, or failed status instead.";
  const claimsScheduling = /\b(?:I|we)(?:[’']ve| have)?\s+(?:successfully\s+)?scheduled\b|\b(?:your|the) (?:post|reply|task) (?:is|was|has been) (?:now )?scheduled\b/i.test(narration);
  const scheduling = results.some(receipt => receipt.tool === "assignment" && receipt.assignmentId && !receipt.planningOnly && !["failed", "cancelled"].includes(receipt.status) || receipt.tool === "plan_intervention" && receipt.request?.schedule && !["cancel", "pause"].includes(receipt.request?.action));
  if (claimsScheduling && !scheduling) return "The claimed scheduling has no saved responsibility or schedule-change receipt in this turn. A proposed plan is not scheduled work.";
  const claimsResearch = /\b(?:I|we)(?:[’']ve| have)?\s+(?:researched|read|reviewed|consulted|checked|browsed)\s+(?:(?:the|these|those|two|three|four|five|several|multiple|\d+)\s+)?(?:public\s+)?(?:sources?|websites?|web pages?|articles?)\b/i.test(narration);
  const readSources = new Set<string>();
  for (const receipt of results) {
    if (receipt.tool === "read_web" && receipt.result?.content && receipt.result?.url) readSources.add(receipt.result.url);
    if (receipt.tool === "search_web" && receipt.result?.route === "api") for (const source of receipt.result.sources ?? []) if (source.content && source.url) readSources.add(source.url);
  }
  const countWords: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, several: 2, multiple: 2 };
  const countClaim = narration.match(/\b(two|three|four|five|several|multiple|\d+)\s+(?:public\s+)?sources?\b/i)?.[1]?.toLowerCase();
  const required = countClaim ? countWords[countClaim] ?? Number(countClaim) : 1;
  if (claimsResearch && readSources.size < required) return "The claimed source reading has insufficient source-text receipts in this turn. Search-result leads alone do not establish that sources were read.";
  return undefined;
}

/** Failures are evidence for the next decision, never authority to execute. */
export function classifyChatToolFailure(error: unknown): ChatToolFailure {
  const message = error instanceof Error ? error.message : "The tool could not finish.";
  if (/disabled for this Agent/i.test(message)) return { code: "capability_disabled", message, retryable: false, requiresUserAction: true, userAction: "Enable this tool in Agent settings if you want me to use it." };
  if (/signed in as|account.*(?:mismatch|verified)|sign.?in|not connected.*Presence|browser.*not connected|browser access is not enabled|enable browser access|reconnect.*browser|browser.*reconnect|open.*managed browser/i.test(message)) return { code: "login_required", message, retryable: false, requiresUserAction: true, userAction: message };
  if (/no .*credentials|no .*provider|no API key|add.*key|configure.*provider|API route.*unavailable|signed-in browser tool.*not.*ready/i.test(message)) return { code: "credentials_unavailable", message, retryable: false, requiresUserAction: true, userAction: "Connect an available browser or provider for this work. I’ll resume the saved request when access is ready." };
  if (/paused|permission|not authorized|restricted|cross.Presence|not available.*Presence|cannot transmit private|private credential parameters|private.*(?:URL|network)|public.*URL/i.test(message)) return { code: "permission_boundary", message, retryable: false, requiresUserAction: false };
  if (/429|rate.limit|timeout|timed out|deadline|temporar(?:y|ily)|HTTP 5\d\d|ECONN|fetch failed/i.test(message)) return { code: "temporary_failure", message, retryable: true, requiresUserAction: false };
  return { code: "tool_failure", message, retryable: false, requiresUserAction: false };
}

/** Only observed capability recovery can wake a user-action wait. */
export function chatRecoveryReady(state: OpenPresenceState, presenceId: string, step: OperatorChatStep): boolean {
  if (["refresh_channel", "search_posts"].includes(step.kind)) {
    const connection = state.nativeConnections.find((item) => item.presenceId === presenceId && item.kind === "x");
    const health = state.dependencyHealth?.find((item) => item.presenceId === presenceId && item.dependency === "native_x");
    if (health?.state === "waiting" && health.circuitUntil && Date.parse(health.circuitUntil) > Date.now()) return false;
    return Boolean(readyBrowserForRead(state, presenceId) || connection && !xNativeWriteUnavailable(connection) && readNativeXCredentials(connection.id) && (!health || health.state === "healthy"));
  }
  if (step.kind === "search_web") {
    const availability = chatResearchCapabilities(state, presenceId).search_web;
    return availability.enabled && (availability.apiConfigured || researchRecoveryReady(state, presenceId));
  }
  if (step.kind === "read_web") return isAgentToolEnabled(state.toolBindings, state.agent?.id, "web.search") && researchRecoveryReady(state, presenceId, "read_web");
  return false;
}
