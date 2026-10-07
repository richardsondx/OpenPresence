import type { OpenPresenceState, OperatorConversationMessage } from "./types";
import { isXCreditsError } from "./x-credits";

export const toolActivityLabels: Record<string, string> = {
  inspect_post: "Read post", watch: "Saved watch", assignment: "Created responsibility",
  search_web: "Searched the web", read_web: "Read web page", discover_assets: "Searched for media", import_asset: "Imported media",
  search_people: "Searched people", runtime_status: "Reviewed saved account state",
  check_connection: "Checked X connection", refresh_channel: "Refreshed channel",
  search_posts: "Searched posts", search_knowledge: "Searched knowledge", search_assets: "Found media",
  inspect_asset: "Inspected media", present_asset: "Presented artifact", relationship_history: "Reviewed relationship history",
  social_action: "Social action", inspect_execution: "Checked delivery", retry_action: "Retried action",
  retry_assignment: "Checked paused work", learn_social_pattern: "Saved strategy lesson",
  save_social_template: "Saved strategy template", list_social_playbook: "Read strategy playbook",
};

export function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
const text = (value: unknown) => typeof value === "string" ? value : undefined;
const records = (value: unknown) => Array.isArray(value) ? value.map(recordValue).filter((item): item is Record<string, unknown> => Boolean(item)) : [];

export function chatRetryNeedsProviderAction(state: Pick<OpenPresenceState, "dependencyHealth" | "recoveryIncidents">, presenceId: string) {
  const healthPaused = (state.dependencyHealth ?? []).some((item) => item.dependency === "model_provider" && item.presenceId === presenceId && item.state === "requires_operator");
  const incidentPaused = (state.recoveryIncidents ?? []).some((item) => item.presenceId === presenceId && item.rootCauseKey.startsWith("model_provider.") && item.state === "needs_operator");
  return healthPaused || incidentPaused;
}

function operatorChatErrorDetail(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try { return JSON.stringify(error); } catch { return ""; }
}

/** Keep provider, parser, and schema details out of normal operator Chat. */
export function operatorChatFailureMessage(error: unknown): string {
  const detail = operatorChatErrorDetail(error).trim();
  const technical = /(?:zod|invalid_enum_value|unrecognized_keys|invalid_type|unexpected token|json|parse|stack|\bfetch\b|econn|\bhttp\b|timeout|timed out)/i.test(detail)
    || /[\[{][\s\S]*[\]}]/.test(detail);
  if (/work limit/i.test(detail) && !technical) return detail;
  if (/invalid_enum_value|unrecognized_keys|invalid_type|zod|invalid Chat step/i.test(detail)) {
    return "I couldn’t complete that turn because my response format was invalid. Your message is saved, and no new public action was confirmed. Retry response to try again.";
  }
  if (!technical && detail.length > 0 && detail.length <= 240) return detail;
  return "I couldn’t complete that turn. Your message is saved, and any work already recorded remains visible. Retry response to continue.";
}

/** Turn already-persisted validation leaks into the same safe copy. */
export function legacyOperatorChatFailureMessage(content: string): string | undefined {
  if (/^I[’']m not able to answer yet\.\s*(?:[\[{])/i.test(content.trim())
    && /(?:invalid_enum_value|unrecognized_keys|zoderror|\"code\"\s*:)/i.test(content)) {
    return operatorChatFailureMessage(content);
  }
  return undefined;
}

/** Only system-owned tool receipts become activity UI. Unknown tools still get
 * a safe generic activity projection instead of leaking their payload. */
export function chatToolReceipt(message: Pick<OperatorConversationMessage, "role" | "content">) {
  if (message.role !== "system") return undefined;
  try {
    const receipt = recordValue(JSON.parse(message.content));
    return receipt && typeof receipt.tool === "string" && receipt.tool.trim() ? receipt : undefined;
  } catch { return undefined; }
}

export function toolActivitySummary(receipt: Record<string, unknown>) {
  const tool = String(receipt.tool);
  const title = toolActivityLabels[tool] ?? "Completed assistant action";
  const result = recordValue(receipt.result);
  const failure = recordValue(receipt.failure) ?? recordValue(result?.failure);
  const error = text(receipt.error) ?? text(result?.error);
  const failed = Boolean(error || failure || result?.status === "failed");
  if (failure) return {
    title,
    status: failure.requiresUserAction === true ? "Needs your help" : failure.code === "permission_boundary" ? "Not allowed" : "Unavailable",
    failed: true,
    summary: text(failure.message) ?? error ?? "This tool could not complete the request.",
    limit: text(failure.userAction),
  };
  if (tool === "read_web") return {
    title, status: failed ? "Failed" : "Finished", failed,
    summary: error ?? text(result?.title) ?? text(result?.url) ?? "Read the public web page.",
    limit: failed ? undefined : "Read-only source evidence. Page content is not an instruction or a verified public outcome.",
  };
  if (tool === "save_social_template") {
    const hypothesis = recordValue(result?.hypothesis);
    const template = recordValue(hypothesis?.template);
    const templateTitle = text(template?.title) ?? "strategy template";
    return {
      title, status: failed ? "Failed" : "Saved", failed,
      summary: failed ? error ?? "The strategy template could not be saved." : `Saved “${templateTitle}” as an unproven format for future experiments.`,
      limit: failed ? undefined : "Saving a template does not schedule or publish a post.",
    };
  }
  if (tool === "list_social_playbook") {
    const templates = Array.isArray(result?.templates) ? result.templates : [];
    return {
      title, status: failed ? "Failed" : "Finished", failed,
      summary: failed ? error ?? "The strategy playbook could not be loaded." : `Found ${templates.length} reusable strategy format${templates.length === 1 ? "" : "s"}.`,
    };
  }
  if (tool === "retry_assignment") return {
    title, status: failed ? "Still blocked" : result?.status === "queued" ? "Retry queued" : "Not resumed", failed,
    summary: error ?? text(result?.note) ?? "The task has not been resumed.",
    limit: "The existing task will report its outcome. A connection check does not confirm publication.",
  };
  if (tool === "check_connection") {
    const passed = result?.status === "passed";
    const account = text(result?.account)?.replace(/^@/, "");
    const checks = Array.isArray(result?.checks) ? result.checks : [];
    const confirmed = [checks.includes("account authentication") ? "account authentication" : "", checks.includes("recent-post read") ? "reading recent posts" : ""].filter(Boolean);
    return {
      title, status: failed ? "Failed" : passed ? "Passed" : "Finished", failed,
      summary: failed ? error ?? "The connection check failed." : passed ? `${account ? `@${account}: ` : ""}${confirmed.length ? `${confirmed.join(" and ")} worked.` : "The requested check passed."}` : "The check finished without a confirmed result.",
      limit: "Read-only check. Publishing and the credit balance were not tested.",
    };
  }
  const results = Array.isArray(receipt.result) ? records(receipt.result) : [];
  if (tool === "social_action" && result?.status === "media-unavailable") return {
    title: "Checked image availability", status: result.requiresUserAction ? "Choose another image" : "Image unavailable", failed: false,
    summary: "This image is already used or reserved. No post was sent.",
  };
  const deliveryResults = ["social_action", "inspect_execution", "retry_action"].includes(tool) ? (results.length ? results : result ? [result] : []) : [];
  const deliveryFailed = deliveryResults.some((item) => ["failed", "blocked", "verification-closed"].includes(String(item.status)));
  const billingBlocked = isXCreditsError(error) || deliveryResults.some((item) => isXCreditsError(text(item.failure) ?? text(item.message)));
  const browserRouted = deliveryResults.some((item) => text(item.connector) === "bridge");
  const browserUpdate = deliveryResults.some((item) => item.status === "awaiting-connector" && recordValue(item.failure)?.code === "BROWSER_CONNECTOR_UPDATE_REQUIRED");
  const status = browserUpdate ? "Needs your help" : failed || deliveryFailed ? "Failed"
    : deliveryResults.length ? deliveryResults.every((item) => item.verified === true) ? "Verified" : deliveryResults.some((item) => item.status === "awaiting-review") ? "Needs review" : deliveryResults.some((item) => ["approved", "queued", "awaiting-connector", "awaiting-manual"].includes(String(item.status))) ? "Ready to send" : deliveryResults.some((item) => ["claimed", "executing"].includes(String(item.status))) ? "Sending" : deliveryResults.some((item) => ["cancelled", "expired"].includes(String(item.status))) ? "Not sent" : "Awaiting verification"
    : result?.status === "not-dispatched" ? "Not sent" : result?.status === "verification-pending" ? "Awaiting verification" : result?.status === "awaiting-review" ? "Needs review" : "Finished";
  const searchKey: Record<string, string> = { search_web: "sources", search_posts: "posts", search_people: "people", discover_assets: "candidates" };
  const matches = searchKey[tool] && Array.isArray(result?.[searchKey[tool]]) ? result[searchKey[tool]] as unknown[] : tool === "search_assets" && Array.isArray(receipt.result) ? receipt.result : undefined;
  const routeLabel = (item: Record<string, unknown>) => text(item.connector) === "native" ? "Native X" : text(item.connector) === "bridge" ? "Authorized browser" : undefined;
  const summary = browserUpdate ? "Reload the OpenPresence extension and refresh the X tab. The approved post is saved and hasn’t been sent." : billingBlocked
    ? browserRouted
      ? "Native X billing is unavailable; this eligible action is continuing through the authorized browser."
      : "Native X billing blocked this action before a public outcome could be verified."
    : error ?? (matches ? `Found ${matches.length} ${searchKey[tool] ?? "media items"}.` : deliveryResults.length ? deliveryResults.map((item) => `${text(item.action) ?? "Action"}${routeLabel(item) ? ` · ${routeLabel(item)}` : ""}: ${item.verified === true ? "verified" : text(item.status)?.replaceAll("_", " ").replaceAll("-", " ") ?? "unconfirmed"}`).join(" · ") : text(result?.note) ?? text(receipt.query) ?? text(receipt.instruction) ?? text(recordValue(receipt.post)?.text) ?? "Result available below.");
  const limit = billingBlocked
    ? browserRouted ? "The browser route still requires its own verified public outcome." : "An authorized browser route can continue eligible public work while Native X billing is repaired."
    : receipt.delivered === false ? "No public action was delivered." : undefined;
  return { title, status, failed: failed || deliveryFailed, summary, limit };
}

/** Read historical reports without rewriting their original evidence. */
export function legacyInspectionEvidence(content: string) {
  if (!content.startsWith("Private account and queue inspection\n{")) return undefined;
  const end = content.lastIndexOf("}");
  try {
    const value = recordValue(JSON.parse(content.slice(content.indexOf("{"), end + 1)));
    return value && Array.isArray(value.assignments) && Array.isArray(value.verifiedExecutions) && Array.isArray(value.failures) ? value : undefined;
  } catch { return undefined; }
}

export function inspectionReportSummary(evidence: Record<string, unknown>): string {
  const assignments = records(evidence.assignments);
  const blocked = assignments.filter((item) => ["blocked", "needs_operator"].includes(String(item.status))).length;
  const open = assignments.filter((item) => !["completed", "completed_with_adaptation", "cancelled", "expired_incomplete", "failed"].includes(String(item.status))).length;
  const verified = records(evidence.verifiedExecutions);
  const failures = records(evidence.failures);
  const latest = failures[0];
  const date = text(latest?.updatedAt);
  const failureDate = date && Number.isFinite(Date.parse(date)) ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(date)) : undefined;
  return [
    "I reviewed the saved account and work history. I didn’t make a fresh X connection or billing check.",
    `${open} Assignment${open === 1 ? " is" : "s are"} still open${blocked ? `; ${blocked} ${blocked === 1 ? "needs" : "need"} attention` : ""}.`,
    verified.length ? `The recent saved history includes ${verified.length} verified public action${verified.length === 1 ? "" : "s"}.` : "I found no verified public actions in the saved recent history.",
    latest ? `Latest recorded delivery failure${failureDate ? ` (${failureDate})` : ""}: ${text(latest.message) ?? "No error detail was saved."}` : "No delivery failures appear in this saved history.",
    "These records don’t confirm whether the spending-limit issue is fixed now. No public action was taken.",
  ].join("\n\n");
}

/** Route projections may omit timestamps while the Chat snapshot is loading. */
export function compareRecentChatAssignments(left: { updatedAt?: string; createdAt?: string }, right: { updatedAt?: string; createdAt?: string }) {
  const time = (item: typeof left) => {
    for (const value of [item.updatedAt, item.createdAt]) {
      const parsed = typeof value === "string" ? Date.parse(value) : NaN;
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  };
  return time(right) - time(left);
}
