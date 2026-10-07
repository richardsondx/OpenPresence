import { beforeEach, afterEach, expect, it } from "vitest";
import { callV2Tool } from "../lib/v2/service";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";

const previous = { db: process.env.OPENPRESENCE_V2_DB_PATH, visual: process.env.EVIDENCE_VISUAL_URL };
let dir: string, counter: number;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "v2-boundaries-")); counter = 0; process.env.OPENPRESENCE_V2_DB_PATH = join(dir, "isolated.sqlite"); delete process.env.EVIDENCE_VISUAL_URL; });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); for (const [name, value] of [["OPENPRESENCE_V2_DB_PATH", previous.db], ["EVIDENCE_VISUAL_URL", previous.visual]]) { if (value === undefined) delete process.env[name!]; else process.env[name!] = value; } });
const read = (tenant = "isolated") => callV2Tool(tenant, "get_social_workspace", {});
async function write(name: string, args: Record<string, unknown>, tenant = "isolated") {
  const { revision } = await read(tenant); return callV2Tool(tenant, name, { expectedRevision: revision, requestId: `boundary-request-${++counter}`, ...args });
}
async function experiment(channel: string, statement = "Specific explainers attract qualified readers") {
  const result = await write("register_social_experiment", { channel, statement, comparison: "Compare at equal age", primaryMetric: "qualifiedFollowers" });
  return result.experiment as { id: string; canonicalHypothesisId: string };
}

it("rejects explicit private source material and cross-tenant source references", async () => {
  await expect(write("update_social_profile", { userConfirmed: true, provenance: "User source", changes: { sources: [{ id: "source-private", title: "Private notes", content: "Never expose this", visibility: "private", observedAt: new Date().toISOString() }] } })).rejects.toThrow("public");
  await write("update_social_profile", { userConfirmed: true, provenance: "User source", changes: { sources: [{ id: "source-public", title: "Approved notes", content: "Approved source", visibility: "public", observedAt: new Date().toISOString() }] } });
  await expect(callV2Tool("other", "prepare_social_action", { channel: "x", situation: "Use a source", sourceIds: ["source-public"] })).rejects.toThrow("Sources not found");
});

it("keeps explicitly channel-scoped draft corrections out of other channels", async () => {
  await write("record_social_feedback", { scope: "draft", draftId: "draft-42", channel: "linkedin", userConfirmed: true, feedback: "LinkedIn-only preference" });
  const other = await callV2Tool("isolated", "check_social_draft", { channel: "x", draftId: "draft-42", draft: "Useful draft" });
  expect(JSON.stringify(other.feedback)).not.toContain("LinkedIn-only preference");
  const matching = await callV2Tool("isolated", "check_social_draft", { channel: "linkedin", draftId: "draft-42", draft: "Useful draft" });
  expect(JSON.stringify(matching.feedback)).toContain("LinkedIn-only preference");
});

it("does not let nested hypothesis actions override the requested review channel", async () => {
  const target = await experiment("x");
  await expect(write("review_social_results", { channel: "linkedin", hypothesisActions: [{ action: "retire", channel: "x", hypothesisId: target.canonicalHypothesisId, evidenceIds: [] }] })).rejects.toThrow();
});

it("requires evidence lineage to the hypothesis experiment, not merely the same channel", async () => {
  const target = await experiment("x", "Deep technical posts attract qualified readers");
  const unrelated = await experiment("x", "Short jokes attract qualified readers");
  const publishedAt = new Date(Date.now() - 86400000).toISOString();
  const activity = await write("record_social_activity", { channel: "x", action: "published", summary: "Unrelated joke", hostReceipt: "Host reports publication", sourceUrl: "https://x.example/post", experimentId: unrelated.id, observedAt: publishedAt });
  const review = await write("review_social_results", { channel: "x", observations: [{ activityId: (activity.activity as { id: string }).id, observedAt: new Date().toISOString(), publicationAgeHours: 24, metrics: { qualifiedFollowers: 0 }, sourceUrl: "https://x.example/metrics", hostReceipt: "Observed metrics" }] });
  const evidenceId = (review.observations as { id: string }[])[0].id;
  await expect(write("review_social_results", { channel: "x", hypothesisActions: [{ action: "weaken", hypothesisId: target.canonicalHypothesisId, evidenceIds: [evidenceId] }] })).rejects.toThrow();
});

it("does not advertise mislabeled non-image payloads as inspectable pixels", async () => {
  const provider = createServer((request, response) => {
    if (request.url === "/v1/search") { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ results: [{ id: "malformed", title: "Fake chart", sourceUrl: "https://publisher.example/chart" }] })); }
    else { response.setHeader("Content-Type", "image/png"); response.end("<html>This is not an image</html>"); }
  });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
  process.env.EVIDENCE_VISUAL_URL = `http://127.0.0.1:${(provider.address() as { port: number }).port}`;
  try {
    const result = await callV2Tool("isolated", "find_visual_evidence", { claim: "Heat is rising", query: "heat" });
    const candidate = (result.candidates as { image?: unknown; pixelStatus: string }[])[0];
    expect(candidate.image).toBeUndefined(); expect(candidate.pixelStatus).toBe("unavailable_not_inspected");
  } finally { await new Promise<void>(resolve => provider.close(() => resolve())); }
});
