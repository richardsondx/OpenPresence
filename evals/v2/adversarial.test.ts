import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callV2Tool, getV2Workspace, V2_TOOL_DEFINITIONS } from "../../lib/v2/service";

const previous = process.env.OPENPRESENCE_V2_DB_PATH;
let directory: string;
const now = () => new Date().toISOString();
beforeAll(() => { directory = mkdtempSync(join(tmpdir(), "v2-independent-")); process.env.OPENPRESENCE_V2_DB_PATH = join(directory, "isolated.db"); });
afterAll(() => { if (previous === undefined) delete process.env.OPENPRESENCE_V2_DB_PATH; else process.env.OPENPRESENCE_V2_DB_PATH = previous; rmSync(directory, { recursive: true, force: true }); });

describe("independent V2 deterministic adversarial acceptance", () => {
  it("never exposes public execution or scheduling tools", () => {
    expect(V2_TOOL_DEFINITIONS.map(tool => tool.name)).not.toEqual(expect.arrayContaining(["publish", "schedule", "send_message", "runPulse"]));
    for (const tool of ["publish", "schedule", "send_message", "runPulse"]) {
      expect(V2_TOOL_DEFINITIONS.some(item => item.name === tool)).toBe(false);
    }
  });
  it("retains global Never constraints when a local voice specializes expression", async () => {
    await callV2Tool("independent-scope", "update_social_profile", { requestId: "scope-setup-1", expectedRevision: 0, userConfirmed: true, provenance: "User-approved synthetic setup", changes: { voice: { description: "plain", never: ["guaranteed"], examples: [], avoid: [] }, channelVoices: { linkedin: { description: "technical", never: ["disruptive"], examples: [], avoid: [] } } } });
    const result = await callV2Tool("independent-scope", "check_social_draft", { channel: "linkedin", draft: "Guaranteed disruptive growth" });
    const findings = result.deterministicFindings as { prohibitedLiterals: string[] };
    expect(findings.prohibitedLiterals).toEqual(expect.arrayContaining(["guaranteed", "disruptive"]));
  });
  it("retry conflicts and stale revisions cannot mutate or duplicate state", async () => {
    const input = { requestId: "durable-retry-1", expectedRevision: 0, userConfirmed: true, provenance: "Synthetic correction", changes: { niche: "Heat storage" } };
    await callV2Tool("independent-retry", "update_social_profile", input);
    await callV2Tool("independent-retry", "update_social_profile", input);
    expect(getV2Workspace("independent-retry").revision).toBe(1);
    await expect(callV2Tool("independent-retry", "update_social_profile", { ...input, changes: { niche: "Private replacement" } })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(callV2Tool("independent-retry", "update_social_profile", { ...input, requestId: "durable-retry-2", changes: { niche: "Private replacement" } })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect(getV2Workspace("independent-retry").profile.niche).toBe("Heat storage");
    expect(getV2Workspace("independent-other").profile).toEqual({});
  });
  it("rejects internal material at the public-source boundary", async () => {
    await expect(callV2Tool("independent-private", "update_social_profile", { requestId: "private-source-1", expectedRevision: 0, userConfirmed: true, provenance: "Synthetic source", changes: { sources: [{ id: "internal-1", title: "Client notes", content: "Private client list", visibility: "internal", observedAt: now() }] } })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    expect(getV2Workspace("independent-private").revision).toBe(0);
  });
  it("rejects self-attested independent verification", async () => {
    await expect(callV2Tool("independent-receipt", "record_social_activity", { requestId: "receipt-claim-1", expectedRevision: 0, channel: "x", action: "published", summary: "A host claim", sourceUrl: "https://example.com/post/1", hostReceipt: "posted", observedAt: now(), verification: "verified" })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    const result = await callV2Tool("independent-receipt", "record_social_activity", { requestId: "receipt-claim-2", expectedRevision: 0, channel: "x", action: "scheduled", summary: "Queued draft", hostReceipt: "queued", observedAt: now() });
    expect(result.verifiedWorldOutcome).toBe(false);
    expect(result.activity).toMatchObject({ action: "scheduled", verification: "host_reported" });
  });
  it("rejects an invalid timezone when recording an actual host task", async () => {
    await expect(callV2Tool("independent-task", "record_host_plan", { requestId: "invalid-task-1", expectedRevision: 0, host: "Synthetic Host", taskId: "task-1", status: "confirmed", schedule: "Weekly", timezone: "Mars/Fictional", nextWake: new Date(Date.now() + 60_000).toISOString(), hostReceipt: "Task created", backgroundScheduling: true })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    expect(getV2Workspace("independent-task").hostPlans).toHaveLength(0);
  });
  it("retrieves only the explicitly selected draft's correction", async () => {
    await callV2Tool("independent-draft", "record_social_feedback", { requestId: "draft-feedback-1", expectedRevision: 0, feedback: "Make this particular draft funnier", scope: "draft", draftId: "draft-a", userConfirmed: true });
    const selected = await callV2Tool("independent-draft", "check_social_draft", { channel: "x", draftId: "draft-a", draft: "A grounded heat-storage note" });
    const other = await callV2Tool("independent-draft", "check_social_draft", { channel: "x", draftId: "draft-b", draft: "Another heat-storage note" });
    expect(selected.feedback).toEqual(expect.arrayContaining([expect.objectContaining({ draftId: "draft-a" })]));
    expect(other.feedback).toEqual([]);
    expect(getV2Workspace("independent-draft").profile.voice).toBeUndefined();
  });
  it("restores the approved prior scoped voice without fabricating history", async () => {
    const tenant = "independent-undo";
    await callV2Tool(tenant, "update_social_profile", { requestId: "voice-version-1", expectedRevision: 0, userConfirmed: true, provenance: "First confirmed expression", changes: { channelVoices: { linkedin: { description: "Concise and technical", examples: [], never: [], avoid: [] } } } });
    await callV2Tool(tenant, "update_social_profile", { requestId: "voice-version-2", expectedRevision: 1, userConfirmed: true, provenance: "Second confirmed expression", changes: { channelVoices: { linkedin: { description: "Warm and expansive", examples: [], never: [], avoid: [] } } } });
    await callV2Tool(tenant, "update_social_profile", { requestId: "voice-version-3", expectedRevision: 2, userConfirmed: true, provenance: "User restores first version", restoreRevision: 1 });
    expect(getV2Workspace(tenant).profile.channelVoices?.linkedin?.description).toBe("Concise and technical");
    expect(getV2Workspace(tenant).versions.at(-1)?.provenance).toBe("User restores first version");
  });
  it("does not accept a past next wake as a newly confirmed task", async () => {
    await expect(callV2Tool("independent-past-task", "record_host_plan", { requestId: "past-task-1", expectedRevision: 0, host: "Synthetic Host", taskId: "task-old", status: "confirmed", schedule: "Daily", timezone: "America/Toronto", nextWake: new Date(Date.now() - 86_400_000).toISOString(), hostReceipt: "Task created", backgroundScheduling: true })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  });
  it("rolls back domain failure and permits a corrected retry of its unused request ID", async () => {
    const input = { requestId: "atomic-failure-1", expectedRevision: 0, channel: "x", action: "reply", summary: "A response", hostReceipt: "Posted", observedAt: now() };
    await expect(callV2Tool("independent-atomic", "record_social_activity", input)).rejects.toBeDefined();
    expect(getV2Workspace("independent-atomic").revision).toBe(0);
    await callV2Tool("independent-atomic", "record_social_activity", { ...input, sourceUrl: "https://example.com/post/2" });
    expect(getV2Workspace("independent-atomic").activities).toHaveLength(1);
  });
});
