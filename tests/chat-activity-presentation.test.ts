import { describe, expect, it } from "vitest";
import { chatToolReceipt, inspectionReportSummary, legacyInspectionEvidence, toolActivitySummary } from "../lib/chat-activity-presentation";

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
    expect(toolActivitySummary({ tool: "check_connection", result: { status: "failed", error: "X monthly spending limit reached" } })).toMatchObject({ status: "Failed", summary: "X monthly spending limit reached", failed: true });
    expect(toolActivitySummary({ tool: "social_action", result: [{ action: "reply", status: "verification-pending", verified: false }] }).status).toBe("Awaiting verification");
    expect(toolActivitySummary({ tool: "social_action", result: [{ action: "reply", status: "succeeded", verified: true }] }).status).toBe("Verified");
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
