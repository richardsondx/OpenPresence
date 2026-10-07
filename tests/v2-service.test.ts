import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { createServer } from "node:http";
import sharp from "sharp";
import { callV2Tool, getV2Workspace, V2_TOOL_DEFINITIONS } from "../lib/v2/service";

let folder: string;
const tenant = "service-test";
const past = new Date(Date.now() - 3_600_000).toISOString();
const baseProfile = { niche: "industrial decarbonization", audience: "technical founders", objective: "Build a returning technical audience", representation: "Independent research writer", capacityMinutesPerWeek: 120, channels: ["x", "linkedin"], voice: { description: "Precise and grounded", never: ["guaranteed growth"], examples: [], avoid: [] }, sources: [{ id: "source-1", title: "Research note", content: "Industrial heat systems have different temperature requirements.", visibility: "public", observedAt: past }] };
const mutate = (revision: number) => ({ requestId: crypto.randomUUID(), expectedRevision: revision });
beforeEach(() => { folder = fs.mkdtempSync(path.join(os.tmpdir(), "op-v2-service-")); vi.stubEnv("OPENPRESENCE_V2_DB_PATH", path.join(folder, "test.db")); vi.stubEnv("EVIDENCE_VISUAL_URL", ""); });
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(folder, { recursive: true, force: true }); });
async function onboard() { return callV2Tool(tenant, "update_social_profile", { ...mutate(0), userConfirmed: true, provenance: "User confirmed brief", changes: baseProfile }); }

describe("V2 shared domain services", () => {
  it("starts with honest missing inputs and a fresh marker, not a fake account", async () => {
    const first = await callV2Tool(tenant, "get_social_workspace", {});
    const second = await callV2Tool(tenant, "get_social_workspace", {});
    expect(first.profile).toEqual({}); expect(first.verificationMarker).not.toEqual(second.verificationMarker);
    expect(first.capability).toMatchObject({ publishing: "host_tools_only", growthLift: "unproven" });
    expect(first.missingInputs).toHaveLength(5);
  });
  it("persists confirmed profile, restores a previous version, and rejects stale writes", async () => {
    await onboard();
    expect(getV2Workspace(tenant).profile.niche).toBe(baseProfile.niche);
    await expect(callV2Tool(tenant, "update_social_profile", { ...mutate(0), userConfirmed: true, provenance: "stale", changes: { niche: "different" } })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await callV2Tool(tenant, "update_social_profile", { ...mutate(1), userConfirmed: true, provenance: "undo", restoreRevision: 0 });
    expect(getV2Workspace(tenant).profile).toEqual({}); expect(getV2Workspace(tenant).versions).toHaveLength(3);
  });
  it("restores scoped voice without reverting subsequent objective or other channel changes", async () => {
    await onboard();
    await callV2Tool(tenant, "update_social_profile", { ...mutate(1), userConfirmed: true, provenance: "Approved first channel voices", changes: { channelVoices: { linkedin: { description: "Technical", examples: [], avoid: [], never: [] }, x: { description: "Curious", examples: [], avoid: [], never: [] } } } });
    await callV2Tool(tenant, "update_social_profile", { ...mutate(2), userConfirmed: true, provenance: "Updated objective and expression", changes: { objective: "Grow subscribers for a new research letter", audience: "Industrial operators", voice: { description: "Warm", examples: [], avoid: [], never: [] }, channelVoices: { linkedin: { description: "Enthusiastic", examples: [], avoid: [], never: [] }, x: { description: "Direct", examples: [], avoid: [], never: [] } } } });
    const restored = await callV2Tool(tenant, "update_social_profile", { ...mutate(3), userConfirmed: true, provenance: "Restore LinkedIn voice only", restoreRevision: 2, restoreScope: "channel_voice", restoreChannel: "linkedin" });
    expect(restored.changedScope).toBe("channel_voice");
    expect(getV2Workspace(tenant).profile).toMatchObject({ objective: "Grow subscribers for a new research letter", audience: "Industrial operators", voice: { description: "Warm" }, channelVoices: { linkedin: { description: "Technical" }, x: { description: "Direct" } } });
    await callV2Tool(tenant, "update_social_profile", { ...mutate(4), userConfirmed: true, provenance: "Restore global public voice only", restoreRevision: 1, restoreScope: "public_voice" });
    expect(getV2Workspace(tenant).profile).toMatchObject({ objective: "Grow subscribers for a new research letter", audience: "Industrial operators", voice: { description: "Precise and grounded" }, channelVoices: { linkedin: { description: "Technical" }, x: { description: "Direct" } } });
    const workspace = await callV2Tool(tenant, "get_social_workspace", { channel: "linkedin" });
    expect(workspace.voiceVersions).toEqual(expect.arrayContaining([expect.objectContaining({ revision: 2, channel: "linkedin", channelVoice: expect.objectContaining({ description: "Technical" }), publicVoice: expect.objectContaining({ description: "Precise and grounded" }) })]));
  });
  it("validates voice restoration scope and removes an override absent in the selected revision", async () => {
    await onboard();
    await callV2Tool(tenant, "update_social_profile", { ...mutate(1), userConfirmed: true, provenance: "New LinkedIn specialization", changes: { channelVoices: { linkedin: { description: "Specialized", examples: [], avoid: [], never: [] } } } });
    await expect(callV2Tool(tenant, "update_social_profile", { ...mutate(2), userConfirmed: true, provenance: "Missing channel", restoreRevision: 1, restoreScope: "channel_voice" })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    await callV2Tool(tenant, "update_social_profile", { ...mutate(2), userConfirmed: true, provenance: "Restore inheritance", restoreRevision: 1, restoreScope: "channel_voice", restoreChannel: "linkedin" });
    expect(getV2Workspace(tenant).profile.channelVoices?.linkedin).toBeUndefined();
    expect(getV2Workspace(tenant).profile.voice?.description).toBe("Precise and grounded");
  });
  it("deduplicates identical retries and rejects reused request IDs with new input", async () => {
    const input = { ...mutate(0), userConfirmed: true, provenance: "user", changes: baseProfile };
    await callV2Tool(tenant, "update_social_profile", input); await callV2Tool(tenant, "update_social_profile", input);
    expect(getV2Workspace(tenant).revision).toBe(1);
    await expect(callV2Tool(tenant, "update_social_profile", { ...input, changes: { niche: "other" } })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("does not accept caller tenant overrides, private source material, or unconfirmed edits", async () => {
    await expect(callV2Tool(tenant, "get_social_workspace", { tenantId: "another" })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    await expect(callV2Tool(tenant, "update_social_profile", { ...mutate(0), userConfirmed: false, provenance: "not approved", changes: {} })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    await expect(callV2Tool(tenant, "update_social_profile", { ...mutate(0), userConfirmed: true, provenance: "user", changes: { sources: [{ ...baseProfile.sources[0], visibility: "private" }] } })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    expect(getV2Workspace(tenant).revision).toBe(0);
  });
  it("retrieves actual public source context and keeps channel playbook coverage truthful", async () => {
    await onboard();
    const x = await callV2Tool(tenant, "prepare_social_action", { channel: "x", situation: "Explain evidence from industrial heat research", sourceIds: ["source-1"] });
    expect(x.sources).toHaveLength(1); expect(x.strategy).toMatchObject({ coverage: "canonical_x_playbook" });
    const linked = await callV2Tool(tenant, "prepare_social_action", { channel: "linkedin", situation: "Explain a professional implication" });
    expect(linked.strategy).toMatchObject({ coverage: "general_guidance_only" });
    await expect(callV2Tool(tenant, "prepare_social_action", { channel: "x", situation: "Any", sourceIds: ["foreign"] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("applies durable draft feedback only to the matching draft", async () => {
    await callV2Tool(tenant, "record_social_feedback", { ...mutate(0), userConfirmed: true, scope: "draft", draftId: "draft-one", feedback: "Remove the unsupported personal anecdote" });
    const matching = await callV2Tool(tenant, "check_social_draft", { channel: "x", draft: "A useful explanation", draftId: "draft-one" });
    const other = await callV2Tool(tenant, "check_social_draft", { channel: "x", draft: "A useful explanation", draftId: "draft-two" });
    expect(matching.feedback).toHaveLength(1); expect(other.feedback).toEqual([]);
  });
  it("never creates host tasks or claims a proposed schedule is active", async () => {
    await onboard();
    const plan = await callV2Tool(tenant, "prepare_growth_plan", { backgroundScheduling: "unavailable" });
    expect(plan.scheduling).toMatchObject({ status: "not_created", readiness: "unavailable" });
    expect(getV2Workspace(tenant).hostPlans).toEqual([]);
    await expect(callV2Tool(tenant, "record_host_plan", { ...mutate(1), host: "Muse", taskId: "native-1", status: "confirmed", schedule: "Every Monday", timezone: "America/Toronto", nextWake: past, hostReceipt: "native receipt", backgroundScheduling: true })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  });
  it("records experiments using canonical Growth hypotheses and keeps measurements unverified", async () => {
    const experimentResult = await callV2Tool(tenant, "register_social_experiment", { ...mutate(0), channel: "x", statement: "Practical explanations attract relevant readers", comparison: "Compare explanation with broad commentary", primaryMetric: "qualifiedFollowers" });
    const experiment = experimentResult.experiment as { id: string };
    expect(getV2Workspace(tenant).hypotheses[0].status).toBe("testing");
    const activityResult = await callV2Tool(tenant, "record_social_activity", { ...mutate(1), channel: "x", action: "published", sourceUrl: "https://example.org/post/1", summary: "Explanation", hostReceipt: "host tool receipt", observedAt: past, experimentId: experiment.id });
    const activity = activityResult.activity as { id: string };
    expect(activityResult.verifiedWorldOutcome).toBe(false);
    const review = await callV2Tool(tenant, "review_social_results", { ...mutate(2), channel: "x", observations: [{ activityId: activity.id, sourceUrl: "https://example.org/analytics/1", hostReceipt: "host analytics receipt", observedAt: new Date().toISOString(), publicationAgeHours: 1, metrics: { qualifiedFollowers: 10, impressions: 1000 } }] });
    expect(review.sourceReliability).toBe("host_reported_not_independently_verified"); expect(review.causalClaim).toBe("not_established");
    const read = await callV2Tool(tenant, "get_social_workspace", { channel: "x" });
    expect(read.observations).toHaveLength(1);
    expect(read.observationReliability).toBe("host_reported_not_independently_verified");
    const otherChannel = await callV2Tool(tenant, "get_social_workspace", { channel: "linkedin" });
    expect(otherChannel.observations).toEqual([]);
    expect(getV2Workspace(tenant).revision).toBe(3);
    expect(getV2Workspace(tenant).hypotheses[0].status).toBe("testing");
  });
  it("rejects draft measurements and rolls the entire mutation back", async () => {
    const activityResult = await callV2Tool(tenant, "record_social_activity", { ...mutate(0), channel: "x", action: "draft", summary: "Draft", hostReceipt: "draft saved", observedAt: past });
    const activity = activityResult.activity as { id: string };
    await expect(callV2Tool(tenant, "review_social_results", { ...mutate(1), observations: [{ activityId: activity.id, sourceUrl: "https://example.org/metrics", hostReceipt: "incorrect", observedAt: new Date().toISOString(), publicationAgeHours: 1, metrics: { impressions: 1000 } }] })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    expect(getV2Workspace(tenant).revision).toBe(1); expect(getV2Workspace(tenant).observations).toEqual([]);
  });
  it("returns an explicit Evidence8 unavailable result, not a fabricated chart", async () => {
    const result = await callV2Tool(tenant, "find_visual_evidence", { claim: "Heat demand", query: "industrial heat" });
    expect(result.status).toBe("unavailable"); expect(result.candidates).toEqual([]);
    expect(V2_TOOL_DEFINITIONS).toHaveLength(12);
  });
  it("retrieves actual pixels from only the configured provider route", async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const server = createServer((req, res) => {
      if (req.url === "/v1/search") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ results: [{ id: "figure-1", title: "Test figure", sourceUrl: "https://example.org/original", visualUrl: "http://untrusted.invalid/secret", type: "chart" }] })); }
      else if (req.url === "/v1/assets/figure-1/content") { res.setHeader("content-type", "image/png"); res.end(png); }
      else { res.statusCode = 404; res.end(); }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number }; vi.stubEnv("EVIDENCE_VISUAL_URL", `http://127.0.0.1:${address.port}`);
    try {
      const result = await callV2Tool(tenant, "find_visual_evidence", { claim: "Check whether this supports the argument", query: "heat", limit: 1 });
      const candidates = result.candidates as Array<{ image: { data: string }; pixelStatus: string; semanticVerification: string }>;
      expect(Buffer.from(candidates[0].image.data, "base64").subarray(0, 8)).toEqual(png.subarray(0, 8)); expect(candidates[0].pixelStatus).toBe("available_for_host_inspection"); expect(candidates[0].semanticVerification).toBe("not_evaluated");
      expect(getV2Workspace(tenant).candidates[0].image).toBeUndefined();
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
