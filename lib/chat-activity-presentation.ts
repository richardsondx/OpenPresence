import type { OperatorConversationMessage } from "./types";

export const toolActivityLabels: Record<string, string> = {
  inspect_post: "Read post", watch: "Saved watch", assignment: "Created responsibility",
  search_web: "Searched the web", discover_assets: "Searched for media", import_asset: "Imported media",
  search_people: "Searched people", runtime_status: "Reviewed saved account state",
  check_connection: "Checked X connection", refresh_channel: "Refreshed channel",
  search_posts: "Searched posts", search_knowledge: "Searched knowledge", search_assets: "Found media",
  inspect_asset: "Inspected media", relationship_history: "Reviewed relationship history",
  social_action: "Social action", inspect_execution: "Checked delivery", retry_action: "Retried action",
};

export function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
const text = (value: unknown) => typeof value === "string" ? value : undefined;
const records = (value: unknown) => Array.isArray(value) ? value.map(recordValue).filter((item): item is Record<string, unknown> => Boolean(item)) : [];

/** Only system-owned, recognizable tool receipts become activity UI. */
export function chatToolReceipt(message: Pick<OperatorConversationMessage, "role" | "content">) {
  if (message.role !== "system") return undefined;
  try {
    const receipt = recordValue(JSON.parse(message.content));
    return receipt && typeof receipt.tool === "string" && toolActivityLabels[receipt.tool] ? receipt : undefined;
  } catch { return undefined; }
}

export function toolActivitySummary(receipt: Record<string, unknown>) {
  const tool = String(receipt.tool);
  const result = recordValue(receipt.result);
  const error = text(receipt.error) ?? text(result?.error);
  const failed = Boolean(error || result?.status === "failed");
  if (tool === "check_connection") {
    const passed = result?.status === "passed";
    const account = text(result?.account)?.replace(/^@/, "");
    const checks = Array.isArray(result?.checks) ? result.checks : [];
    const confirmed = [checks.includes("account authentication") ? "account authentication" : "", checks.includes("recent-post read") ? "reading recent posts" : ""].filter(Boolean);
    return {
      title: toolActivityLabels[tool], status: failed ? "Failed" : passed ? "Passed" : "Finished", failed,
      summary: failed ? error ?? "The connection check failed." : passed ? `${account ? `@${account}: ` : ""}${confirmed.length ? `${confirmed.join(" and ")} worked.` : "The requested check passed."}` : "The check finished without a confirmed result.",
      limit: "Read-only check. Publishing and the credit balance were not tested.",
    };
  }
  const results = Array.isArray(receipt.result) ? records(receipt.result) : [];
  const deliveryResults = ["social_action", "inspect_execution", "retry_action"].includes(tool) ? (results.length ? results : result ? [result] : []) : [];
  const deliveryFailed = deliveryResults.some((item) => ["failed", "blocked", "verification-closed"].includes(String(item.status)));
  const status = failed || deliveryFailed ? "Failed"
    : deliveryResults.length ? deliveryResults.every((item) => item.verified === true) ? "Verified" : deliveryResults.some((item) => item.status === "awaiting-review") ? "Needs review" : "Awaiting verification"
    : result?.status === "not-dispatched" ? "Not sent" : result?.status === "verification-pending" ? "Awaiting verification" : result?.status === "awaiting-review" ? "Needs review" : "Finished";
  const searchKey: Record<string, string> = { search_web: "sources", search_posts: "posts", search_people: "people", discover_assets: "candidates" };
  const matches = searchKey[tool] && Array.isArray(result?.[searchKey[tool]]) ? result[searchKey[tool]] as unknown[] : tool === "search_assets" && Array.isArray(receipt.result) ? receipt.result : undefined;
  const summary = error ?? (matches ? `Found ${matches.length} ${searchKey[tool] ?? "media items"}.` : deliveryResults.length ? deliveryResults.map((item) => `${text(item.action) ?? "Action"}: ${item.verified === true ? "verified" : text(item.status)?.replaceAll("_", " ").replaceAll("-", " ") ?? "unconfirmed"}`).join(" · ") : text(result?.note) ?? text(receipt.query) ?? text(receipt.instruction) ?? text(recordValue(receipt.post)?.text) ?? "Result available below.");
  return { title: toolActivityLabels[tool], status, failed: failed || deliveryFailed, summary, limit: receipt.delivered === false ? "No public action was delivered." : undefined };
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
