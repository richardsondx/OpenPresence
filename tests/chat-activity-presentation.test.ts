import { describe, expect, it } from "vitest";
import { compareRecentChatAssignments, chatToolReceipt, inspectionReportSummary, legacyInspectionEvidence, toolActivitySummary } from "../lib/chat-activity-presentation";

describe("human-readable chat evidence", () => {
  const receipt = { tool: "check_connection", result: { status: "passed", account: "example_agent", access: "read-write", checks: ["account authentication", "recent-post read"], publicationTested: false } };
  it("recognizes old system receipts without a reply link, while preserving user JSON as prose", () => {
    expect(chatToolReceipt({ role: "system", content: JSON.stringify(receipt) })).toEqual(receipt);
    expect(chatToolReceipt({ role: "operator", content: JSON.stringify(receipt) })).toBeUndefined();
    expect(chatToolReceipt({ role: "system", content: "{malformed" })).toBeUndefined();
  });
  it("describes successful reads without claiming writes or billing passed", () => {
    const activity = toolActivitySummary(receipt);
    expect(activity.status).toBe("Passed");
    expect(activity.summary).toBe("@example_agent: account authentication and reading recent posts worked.");
    expect(activity.limit).toContain("Publishing and the credit balance were not tested");
    expect(activity.summary).not.toContain("read-write");
  });
  it("keeps the actual error visible and pending delivery distinct from success", () => {
    expect(toolActivitySummary({ tool: "retry_assignment", result: { status: "queued" } }).status).toBe("Retry queued");
    expect(toolActivitySummary({ tool: "retry_assignment", result: { status: "failed", error: "Credits still exhausted" } })).toMatchObject({ status: "Still blocked", failed: true });
    expect(toolActivitySummary({ tool: "check_connection", result: { status: "failed", error: "X monthly spending limit reached" } })).toMatchObject({ status: "Failed", summary: "X monthly spending limit reached", failed: true });
    expect(toolActivitySummary({ tool: "social_action", result: [{ action: "reply", status: "verification-pending", verified: false, connector: "native" }] }).status).toBe("Awaiting verification");
    expect(toolActivitySummary({ tool: "social_action", result: [{ action: "reply", status: "queued", verified: false, connector: "bridge" }] }).summary).toContain("reply · Authorized browser: queued");
    expect(toolActivitySummary({ tool: "social_action", result: [{ action: "reply", status: "succeeded", verified: true }] }).status).toBe("Verified");
  });
  it("turns template tool receipts into a compact saved-artifact activity", () => {
    const saved = { tool: "save_social_template", result: { hypothesis: { template: { title: "Principle to operating rule" } } } };
    expect(chatToolReceipt({ role: "system", content: JSON.stringify(saved) })).toEqual(saved);
    expect(toolActivitySummary(saved)).toMatchObject({ title: "Saved strategy template", status: "Saved", summary: "Saved “Principle to operating rule” as an unproven format for future experiments." });
    expect(toolActivitySummary(saved).summary).not.toContain('"hypothesis"');
  });
  it("keeps an unfamiliar system tool readable without exposing its payload", () => {
    const unfamiliar = { tool: "future_strategy_tool", result: { secret: "implementation detail" } };
    expect(chatToolReceipt({ role: "system", content: JSON.stringify(unfamiliar) })).toEqual(unfamiliar);
    expect(toolActivitySummary(unfamiliar)).toMatchObject({ title: "Completed assistant action", status: "Finished" });
    expect(toolActivitySummary(unfamiliar).summary).not.toContain("implementation detail");
  });
  it("summarizes historical inspection evidence without dumping identifiers or making a fresh health claim", () => {
    const evidence = { assignments: [{ id: "assignment_private_id", status: "blocked" }], verifiedExecutions: [], failures: [{ id: "execution_private_id", message: "X credits exhausted", updatedAt: "2026-09-12T12:00:00Z" }] };
    const legacy = `Private account and queue inspection\n${JSON.stringify(evidence)}\nNo public action was made.`;
    expect(legacyInspectionEvidence(legacy)).toEqual(evidence);
    const report = inspectionReportSummary(evidence);
    expect(report).toContain("1 Assignment is still open; 1 needs attention");
    expect(report).toContain("Latest recorded delivery failure (Sep 12): X credits exhausted");
    expect(report).not.toContain("assignment_private_id");
    expect(report).toContain("don’t confirm whether the spending-limit issue is fixed now");
    expect(legacyInspectionEvidence("Please explain this JSON: " + legacy)).toBeUndefined();
  });
});

it("orders Chat assignment context safely across partial route projections", () => {
  const partial: { id: string; updatedAt?: string; createdAt?: string } = { id: "partial" };
  const legacy = { id: "legacy", createdAt: "2026-09-11T10:00:00Z" };
  const current = { id: "current", createdAt: "2026-09-10T10:00:00Z", updatedAt: "2026-09-13T10:00:00Z" };
  const invalid = { id: "invalid", updatedAt: "invalid" };
  expect([partial, legacy, current, invalid].sort(compareRecentChatAssignments).map(item => item.id)).toEqual(["current", "legacy", "partial", "invalid"]);
});
