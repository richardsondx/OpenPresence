import crypto from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { initialState } from "../runtime";
import { applyGrowthHypothesisActions, compileSocialStrategyContext } from "../social-strategy";
import type { GrowthHypothesis, OpenPresenceState, Presence } from "../types";
import { EvidenceVisualAssetDiscoveryProvider } from "../asset-discovery";
import { readV2State, mutateV2State, recordV2Call, V2Error, validTenant } from "./store";
export { V2Error } from "./store";
export { V2_SKILL, V2_SKILL_URI, V2_SKILL_VERSION } from "./skill";

const text = z.string().trim().min(1).max(6000);
const short = z.string().trim().min(1).max(500);
const channel = z.enum(["x", "linkedin", "instagram", "facebook", "threads", "newsletter", "community", "other"]);
const date = z.string().datetime({ offset: true }).refine(value => Date.parse(value) <= Date.now() + 300_000, "Observation dates cannot be in the future.");
const futureDate = z.string().datetime({ offset: true });
const publicUrl = z.string().url().refine(value => /^https?:\/\//.test(value), "Use an HTTP source reference.");
const voice = z.object({ description: text, examples: z.array(text).max(12).default([]), avoid: z.array(short).max(20).default([]), never: z.array(short).max(20).default([]) }).strict();
const profile = z.object({
  niche: short.optional(), audience: short.optional(), objective: text.optional(), representation: short.optional(),
  capacityMinutesPerWeek: z.number().int().min(0).max(10080).optional(), targetFollowers: z.number().int().positive().max(1e9).optional(),
  baselineFollowers: z.number().int().nonnegative().max(1e9).optional(), timezone: short.refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Use an IANA timezone.").optional(),
  channels: z.array(channel).max(8).optional(), voice: voice.optional(), channelVoices: z.record(channel, voice).optional(),
  intendedAccounts: z.array(z.object({ channel, handle: short, userConfirmed: z.literal(true) }).strict()).max(16).optional(),
  managedAccounts: z.array(z.object({ channel, handle: short, hostAccountId: short, userConfirmed: z.literal(true) }).strict()).max(16).optional(),
  sources: z.array(z.object({ id: short, title: short, content: text, url: publicUrl.optional(), visibility: z.literal("public"), observedAt: date }).strict()).max(30).optional(),
}).strict();
const mutation = { requestId: z.string().min(8).max(120), expectedRevision: z.number().int().nonnegative() };
const scope = z.enum(["public_voice", "draft", "channel"]);
const metrics = z.object({ impressions: z.number().nonnegative().optional(), qualifiedFollowers: z.number().nonnegative().optional(), returningReaders: z.number().nonnegative().optional(), relevantReplies: z.number().nonnegative().optional(), subscribers: z.number().nonnegative().optional(), customers: z.number().nonnegative().optional() }).strict().refine(value => Object.keys(value).length > 0, "At least one observed metric is required.");
const toolSchemas = {
  get_social_workspace: z.object({ channel: channel.optional() }).strict(),
  update_social_profile: z.object({ ...mutation, userConfirmed: z.literal(true), provenance: text, changes: profile.optional(), restoreRevision: z.number().int().nonnegative().optional(), restoreScope: z.enum(["public_voice", "channel_voice"]).optional(), restoreChannel: channel.optional() }).strict()
    .refine(value => Boolean(value.changes) !== (value.restoreRevision !== undefined), "Provide either changes or restoreRevision.")
    .refine(value => value.restoreScope === undefined || value.restoreRevision !== undefined, "restoreScope requires restoreRevision.")
    .refine(value => value.restoreScope !== "channel_voice" || value.restoreChannel !== undefined, "Channel voice restoration requires restoreChannel.")
    .refine(value => value.restoreChannel === undefined || value.restoreScope === "channel_voice", "restoreChannel is only valid for channel_voice restoration."),
  prepare_growth_plan: z.object({ channel: channel.optional(), backgroundScheduling: z.enum(["available", "unavailable", "unknown"]).default("unknown") }).strict(),
  prepare_social_action: z.object({ channel, situation: text, sourceIds: z.array(short).max(12).default([]), personId: short.optional() }).strict(),
  get_relationship_brief: z.object({ personId: short, channel: channel.optional() }).strict(),
  find_visual_evidence: z.object({ claim: text, query: short, corpus: short.optional(), limit: z.number().int().min(1).max(5).default(3), includePixels: z.boolean().default(true) }).strict(),
  check_social_draft: z.object({ channel, draft: text, draftId: short.optional(), sourceIds: z.array(short).max(12).default([]), assetIds: z.array(short).max(5).default([]) }).strict(),
  record_social_activity: z.object({ ...mutation, channel, action: z.enum(["draft", "scheduled", "published", "reply", "reaction", "follow", "no_action"]), summary: text, sourceUrl: publicUrl.optional(), hostReceipt: text, personId: short.optional(), experimentId: short.optional(), assetIds: z.array(short).max(5).default([]), observedAt: date }).strict(),
  record_social_feedback: z.object({ ...mutation, feedback: text, scope, channel: channel.optional(), draftId: short.optional(), userConfirmed: z.literal(true) }).strict().refine(value => value.scope !== "channel" || Boolean(value.channel), "Channel feedback requires a channel.").refine(value => value.scope !== "draft" || Boolean(value.draftId), "Draft feedback requires a draftId."),
  register_social_experiment: z.object({ ...mutation, channel, statement: text, comparison: text, primaryMetric: z.enum(["qualifiedFollowers", "returningReaders", "relevantReplies", "subscribers", "customers", "impressions"]), hypothesisId: short.optional(), patternIds: z.array(short).max(5).default([]) }).strict(),
  review_social_results: z.object({ channel: channel.optional(), ...mutation, observations: z.array(z.object({ activityId: short, observedAt: date, publicationAgeHours: z.number().nonnegative().max(1e6), metrics, sourceUrl: publicUrl, hostReceipt: text }).strict()).max(50).default([]), hypothesisActions: z.array(z.object({ action: z.enum(["create", "weaken", "disfavor", "retire"]), hypothesisId: short.optional(), statement: text.optional(), evidenceIds: z.array(short).max(20).default([]), channel: channel.optional() }).strict()).max(12).default([]) }).strict(),
  record_host_plan: z.object({ ...mutation, host: short, taskId: short, status: z.enum(["confirmed", "paused", "cancelled", "failed"]), schedule: short, timezone: short, nextWake: futureDate.optional(), hostReceipt: text, backgroundScheduling: z.literal(true) }).strict().refine(value => value.status !== "confirmed" || Boolean(value.nextWake), "Confirmed tasks require the host's next wake."),
};

const descriptions: Record<keyof typeof toolSchemas, string> = {
  get_social_workspace: "Read scoped social profile, public voice, feedback, sources, experiments and host plan receipts. Start here; identify missing onboarding inputs. Includes a fresh server verification marker.",
  update_social_profile: "Persist a user-confirmed social profile or restore a prior profile version. Requires expected revision and unique retry-safe request ID. Never changes host identity or public accounts.",
  prepare_growth_plan: "Get grounded growth priorities, sustainable cadence, measurement needs and host scheduling instructions. Returns recommendations, never creates tasks or promises growth.",
  prepare_social_action: "Retrieve canonical social strategy candidates, public sources, scoped feedback and relationship context for your own social judgment. The host writes and chooses the action; silence is valid.",
  get_relationship_brief: "Read recorded host-reported interactions with one person. No discovery, messaging, or invented relationship facts.",
  find_visual_evidence: "Search the configured Evidence8/EvidenceVisual index for candidate charts and figures. Returns actual image bytes when available, source provenance, inspection limitations and reuse history. Retrieval is not verification.",
  check_social_draft: "Check explicit voice constraints, source availability and channel length; returns editorial review questions for facts and visuals. Does not claim semantic verification or publish.",
  record_social_activity: "Record a host action receipt as reported activity. Scheduled is not published, and host reports are not independently verified world outcomes. Idempotent, scoped, durable.",
  record_social_feedback: "Persist the user's explicit correction for a draft, channel or public voice. Survives fresh conversations; preferences do not become audience-performance evidence.",
  register_social_experiment: "Register a bounded social hypothesis and comparison using canonical Growth records. Experiments start as testing with low confidence; never promise virality.",
  review_social_results: "Record attributable host-reported measurements and return comparisons, canonical hypotheses, contradictions and next-step questions. Can create/weaken/retire hypotheses; host reports cannot promote effectiveness to verified support.",
  record_host_plan: "Record or reconcile an actual task created by the host's native scheduler. Requires task ID, timezone and receipt. Confirmation is host-reported; OpenPresence never runs the scheduler.",
};
export const V2_TOOL_DEFINITIONS = Object.entries(toolSchemas).map(([name, schema]) => ({ name, description: descriptions[name as keyof typeof toolSchemas], inputSchema: zodToJsonSchema(schema, { $refStrategy: "none" }) as Record<string, unknown> }));
export const V2_TOOL_SCHEMAS = toolSchemas;
export const V2_WRITE_TOOLS = new Set(["update_social_profile", "record_social_activity", "record_social_feedback", "register_social_experiment", "review_social_results", "record_host_plan"]);

type Profile = z.infer<typeof profile>;
type Activity = z.infer<typeof toolSchemas.record_social_activity> & { id: string; verification: "host_reported" };
type Feedback = z.infer<typeof toolSchemas.record_social_feedback> & { id: string; at: string };
type Experiment = z.infer<typeof toolSchemas.register_social_experiment> & { id: string; canonicalHypothesisId: string; createdAt: string };
type Observation = z.infer<typeof toolSchemas.review_social_results>["observations"][number] & { id: string; verification: "host_reported" };
type HostPlan = z.infer<typeof toolSchemas.record_host_plan> & { recordedAt: string; verification: "host_reported" };
type Candidate = { id: string; title: string; sourceUrl: string; mediaUrl: string; retrievedAt: string; pixelStatus: string; image?: { data: string; mimeType: string }; [key: string]: unknown };
export type V2Workspace = { revision: number; profile: Profile; versions: Array<{ revision: number; profile: Profile; at: string; provenance: string }>; activities: Activity[]; feedback: Feedback[]; experiments: Experiment[]; observations: Observation[]; hypotheses: GrowthHypothesis[]; hostPlans: HostPlan[]; candidates: Candidate[] };
function emptyWorkspace(): V2Workspace { return { revision: 0, profile: {}, versions: [{ revision: 0, profile: {}, at: new Date().toISOString(), provenance: "Empty workspace" }], activities: [], feedback: [], experiments: [], observations: [], hypotheses: [], hostPlans: [], candidates: [] }; }
export function getV2Workspace(tenantId: string) { return readV2State(tenantId, emptyWorkspace); }
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const now = () => new Date().toISOString();
function presentChannel(p: Profile, requested?: string) { return requested || p.channels?.[0] || "x"; }
function voiceFor(w: V2Workspace, c: string) {
  const base = w.profile.voice;
  const specialized = w.profile.channelVoices?.[c as z.infer<typeof channel>];
  if (!specialized) return base || null;
  return { ...specialized, never: [...new Set([...(base?.never || []), ...specialized.never])] };
}
function scopedFeedback(w: V2Workspace, c: string) { return w.feedback.filter(item => item.scope === "public_voice" || item.scope === "channel" && item.channel === c).slice(-20); }
function accountPolicy(w: V2Workspace, c?: string) {
  const accounts = (w.profile.managedAccounts || []).filter(account => !c || account.channel === c);
  return { publicActionsRequireConfirmation: true, targetSelection: accounts.length ? "user_confirmed_accounts_only" : "no_account_selected", intendedAccounts: (w.profile.intendedAccounts || []).filter(account => !c || account.channel === c), managedAccounts: accounts, authority: "draft_only_until_target_and_each_public_action_are_confirmed", instruction: "Never use the host's default, primary, or currently logged-in social account implicitly. Confirm the separate account by handle and host account ID. Ask the user before every publication, reply, reaction, follow, or other public action; scheduling does not grant permission. OpenPresence does not execute public actions." };
}
function missingInputs(p: Profile) {
  const questions: Array<{ field: string; question: string; why: string }> = [];
  if (!p.niche) questions.push({ field: "niche", question: "What niche should your audience associate you with?", why: "Choose relevant opportunities and avoid generic reach." });
  if (!p.audience) questions.push({ field: "audience", question: "Who do you most want to reach?", why: "Define qualified audience growth." });
  if (!p.objective) questions.push({ field: "objective", question: "What should this audience help you accomplish?", why: "Select meaningful outcomes to measure." });
  if (!p.representation) questions.push({ field: "representation", question: "Who are we representing publicly?", why: "Ground public facts and authorship." });
  if (p.capacityMinutesPerWeek === undefined) questions.push({ field: "capacityMinutesPerWeek", question: "How much time can you give this each week?", why: "Make the approach sustainable." });
  return questions;
}

/** Safe internal canonical projection: no standalone DB, credentials, schedules, or live connectors. */
function canonicalState(tenant: string, w: V2Workspace, c: string): { state: OpenPresenceState; presence: Presence } {
  const state = initialState();
  // These identities are internal lineage only; neither claims a connected account.
  state.agent = { id: `v2:${tenant}` } as OpenPresenceState["agent"];
  const presence = { id: `v2:${tenant}:${c}`, channel: c, brief: { audience: w.profile.audience || "Audience not yet confirmed", primaryTerritory: w.profile.niche ? [w.profile.niche] : [], adjacentTerritory: [], boundaries: [] }, updatedAt: now() } as unknown as Presence;
  state.presence = presence; state.presences = [presence]; state.activePresenceId = presence.id;
  state.growthHypotheses = w.hypotheses;
  return { state, presence };
}
function strategies(tenant: string, w: V2Workspace, c: string, situation: string) {
  const { state, presence } = canonicalState(tenant, w, c);
  const compiled = compileSocialStrategyContext(state, presence, { invocation: "host_mcp", objective: `${w.profile.objective || "Useful audience growth"}. ${situation}`, availableActions: ["original_post", "reply", "quote", "repost", "like", "follow"] });
  return { candidates: compiled.retrievalRun.consideredPatterns, hypotheses: w.hypotheses.filter(h => h.originatingPresenceId === presence.id && !["retired", "disfavored"].includes(h.status)), playbookVersion: compiled.retrievalRun.playbookVersion || null, coverage: c === "x" ? "canonical_x_playbook" : "general_guidance_only", noPatternReason: compiled.retrievalRun.noPatternReason || null };
}
const channelGuidance: Record<string, string[]> = {
  x: ["Make one worthwhile point; choose short post, thread, quote or reply according to the source and moment.", "Verify the account's actual length/media affordances through host tools; standard short posts use 280 weighted characters."],
  linkedin: ["Explain the professional implication with a concrete example or source.", "Keep claims about your own experience grounded; write for the intended professional audience."],
  instagram: ["Plan a useful visual or sequence and a caption that adds context.", "Inspect media and confirm supported formats through the host's account connector."],
  newsletter: ["Develop a coherent argument with source links and enough depth to reward returning readers."],
  community: ["Read community norms and the actual thread; make a specific contribution before suggesting promotion."],
};

function relationships(w: V2Workspace, personId: string, c?: string) {
  const interactions = w.activities.filter(item => item.personId === personId && (!c || item.channel === c));
  return { personId, interactions: interactions.slice(-15), lastInteraction: interactions.at(-1) || null, status: interactions.length ? "host_reported_history" : "no_recorded_history", guidance: "Read the current thread before continuing; a reply is useful only if it adds something." };
}

async function visualEvidence(tenant: string, w: V2Workspace, input: z.infer<typeof toolSchemas.find_visual_evidence>) {
  const endpoint = process.env.EVIDENCE_VISUAL_URL;
  if (!endpoint) return { status: "unavailable", candidates: [], reason: "No Evidence8/EvidenceVisual workspace is configured. Set EVIDENCE_VISUAL_URL on the server. The public website is not an API endpoint.", alternatives: ["Research original sources with host tools", "Render a chart from grounded data", "Use text when a visual adds no value"] };
  try {
    const provider = new EvidenceVisualAssetDiscoveryProvider(endpoint, input.corpus);
    const candidates = await provider.searchAssets({ query: input.query, limit: input.limit });
    const results: Candidate[] = [];
    for (const candidate of candidates) {
      let image: Candidate["image"];
      let pixelStatus = "not_requested";
      if (input.includePixels) {
        // Only fetch the configured provider's exact content route. No candidate-controlled SSRF.
        const origin = new URL(endpoint).origin;
        const assetId = candidate.id.replace(/^evidence_/, "");
        const contentUrl = new URL(`/v1/assets/${encodeURIComponent(assetId)}/content`, origin);
        try {
          const response = await fetch(contentUrl, { redirect: "error", signal: AbortSignal.timeout(8000) });
          const mimeType = (response.headers.get("content-type") || "").split(";")[0];
          const length = Number(response.headers.get("content-length") || 0);
          if (!response.ok || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mimeType) || length > 4_000_000) throw new Error("Unsupported or unavailable image.");
          const reader = response.body?.getReader();
          if (!reader) throw new Error("Missing image body.");
          const chunks: Uint8Array[] = []; let size = 0;
          while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 4_000_000) { await reader.cancel(); throw new Error("Image too large."); } chunks.push(value); }
          const pixels = await sharp(Buffer.concat(chunks), { limitInputPixels: 40_000_000 }).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).png().toBuffer();
          image = { data: pixels.toString("base64"), mimeType: "image/png" }; pixelStatus = "available_for_host_inspection";
        } catch { pixelStatus = "unavailable_not_inspected"; }
      }
      results.push({ id: candidate.id, title: candidate.title || candidate.name, sourceUrl: candidate.sourcePageUrl!, mediaUrl: candidate.mediaUrl || "", publisher: candidate.publisher || null, publishedAt: candidate.publishedAt || null, description: candidate.description || null, retrievedAt: now(), pixelStatus, image, claim: input.claim, semanticVerification: "not_evaluated", rights: "unknown_check_original_source", reuseHistory: w.activities.filter(a => a.assetIds.includes(candidate.id)).map(a => ({ activityId: a.id, sourceUrl: a.sourceUrl, channel: a.channel, observedAt: a.observedAt })) });
    }
    // Retrieval cache is non-authoritative, separate from profile revisions; persist through the same transaction boundary.
    const fresh = getV2Workspace(tenant);
    const retrievalId = id("visual-search");
    mutateV2State(tenant, retrievalId, fresh.revision, { retrievalId }, emptyWorkspace, next => {
      next.candidates = [...next.candidates.filter(old => !results.some(item => item.id === old.id)), ...results.map(result => { const item = { ...result }; delete item.image; return item; })].slice(-50);
      return { revision: next.revision };
    });
    return { status: results.length ? "candidates" : "no_results", candidates: results, revision: getV2Workspace(tenant).revision, interpretation: "Inspect actual pixels and original source. Lexical matches are candidates, not verified claim support. Coverage is selected; no result does not imply no evidence exists." };
  } catch (error) { return { status: "unavailable", candidates: [], reason: error instanceof Error ? error.message : "Evidence provider failed.", verification: "not_performed" }; }
}

export async function callV2Tool(tenantId: string, name: string, args: unknown): Promise<Record<string, unknown>> {
  validTenant(tenantId);
  const tool = name as keyof typeof toolSchemas;
  const schema = toolSchemas[tool];
  if (!schema) throw new V2Error("NOT_FOUND", `Unknown OpenPresence tool: ${name}`);
  const parsed = schema.safeParse(args);
  if (!parsed.success) throw new V2Error("INVALID_ARGUMENT", parsed.error.issues.map(issue => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; "));
  const requestMarker = id("call");
  try {
    const result = await executeTool(tenantId, tool, parsed.data);
    recordV2Call(tenantId, name, "succeeded", requestMarker);
    return { ...result, accountPolicy: accountPolicy(getV2Workspace(tenantId), (parsed.data as { channel?: string }).channel), requestMarker, recordedAt: now(), executionOwner: "host_agent" };
  } catch (error) { recordV2Call(tenantId, name, "failed", requestMarker); throw error; }
}

async function executeTool(tenant: string, tool: keyof typeof toolSchemas, args: unknown): Promise<Record<string, unknown>> {
  const w = getV2Workspace(tenant);
  const c = presentChannel(w.profile, (args as { channel?: string }).channel);
  if (tool === "get_social_workspace") {
    return { revision: w.revision, verificationMarker: id("workspace"), profile: w.profile, voice: voiceFor(w, c), voiceVersions: w.versions.map(v => ({ revision: v.revision, at: v.at, provenance: v.provenance, channel: c, publicVoice: v.profile.voice || null, channelVoice: v.profile.channelVoices?.[c as z.infer<typeof channel>] || null, effectiveVoice: voiceFor({ ...w, profile: v.profile }, c) })), feedback: scopedFeedback(w, c), missingInputs: missingInputs(w.profile), sources: w.profile.sources || [], experiments: w.experiments.filter(e => e.channel === c), hypotheses: strategies(tenant, w, c, "Review the current social objective").hypotheses, recentActivities: w.activities.filter(a => a.channel === c).slice(-10), observations: w.observations.filter(o => w.activities.some(a => a.id === o.activityId && a.channel === c)), observationReliability: "host_reported_not_independently_verified", hostPlans: w.hostPlans, capability: { publishing: "host_tools_only", scheduling: "host_native_tasks_only", evidenceVisual: process.env.EVIDENCE_VISUAL_URL ? "configured_not_verified" : "unavailable", growthLift: "unproven" } };
  }
  if (tool === "update_social_profile") {
    const a = args as z.infer<typeof toolSchemas.update_social_profile>;
    return mutateV2State(tenant, a.requestId, a.expectedRevision, { tool, args }, emptyWorkspace, next => {
      if (a.restoreRevision !== undefined) {
        const previous = next.versions.find(v => v.revision === a.restoreRevision);
        if (!previous) throw new V2Error("NOT_FOUND", "That profile revision is not available.");
        if (a.restoreScope === "public_voice") {
          if (previous.profile.voice) next.profile.voice = structuredClone(previous.profile.voice);
          else delete next.profile.voice;
        } else if (a.restoreScope === "channel_voice") {
          const selectedChannel = a.restoreChannel!;
          const priorVoice = previous.profile.channelVoices?.[selectedChannel];
          const scopedVoices = { ...next.profile.channelVoices };
          if (priorVoice) scopedVoices[selectedChannel] = structuredClone(priorVoice);
          else delete scopedVoices[selectedChannel];
          next.profile.channelVoices = scopedVoices;
        } else next.profile = structuredClone(previous.profile);
      } else next.profile = { ...next.profile, ...a.changes, channelVoices: { ...next.profile.channelVoices, ...a.changes?.channelVoices } };
      next.versions.push({ revision: next.revision, profile: structuredClone(next.profile), at: now(), provenance: a.provenance });
      return { revision: next.revision, profile: next.profile, changedScope: a.restoreScope || "social_profile", ...(a.restoreChannel ? { changedChannel: a.restoreChannel } : {}), missingInputs: missingInputs(next.profile), undoAvailable: true };
    });
  }
  if (tool === "prepare_growth_plan") {
    const a = args as z.infer<typeof toolSchemas.prepare_growth_plan>;
    const minutes = w.profile.capacityMinutesPerWeek;
    const allocated = minutes === undefined ? null : { preparation: Math.floor(minutes * .5), relationships: Math.floor(minutes * .3), measurement: minutes - Math.floor(minutes * .5) - Math.floor(minutes * .3) };
    return { revision: w.revision, status: "recommendation", objective: w.profile.objective || null, targetFollowers: w.profile.targetFollowers || null, baselineFollowers: w.profile.baselineFollowers ?? null, missingInputs: missingInputs(w.profile), capacity: { minutesPerWeek: minutes ?? null, proposedAllocation: allocated, note: "An initial allocation to discuss, not an empirically optimal cadence. Replan when capacity changes." }, priorities: ["Start with a useful contribution grounded in your public work", "Continue relevant conversations and relationships", "Measure qualified audience outcomes at comparable publication ages", "Test a bounded hypothesis and revisit contradictory evidence"], strategy: strategies(tenant, w, c, "Plan sustainable audience growth"), sources: w.profile.sources || [], channelGuidance: channelGuidance[c] || ["Inspect the channel's actual norms, formats and metrics with your host tools."], feedback: scopedFeedback(w, c), scheduling: { owner: "host_agent", readiness: a.backgroundScheduling, status: "not_created", instructions: a.backgroundScheduling === "available" ? "Create a native task with timezone, next wake, source inputs and approval behavior; then record_host_plan with the actual receipt." : "Background work is not confirmed. Offer on-demand help until the host's scheduling capability is established." }, measurement: { primary: "qualified audience outcomes chosen by the user", include: ["qualifiedFollowers", "returningReaders", "relevantReplies", "subscribers"], observeAt: "Choose comparable publication ages using the channel's reporting delay; refresh before drawing conclusions.", causalClaim: "not_established" } };
  }
  if (tool === "prepare_social_action") {
    const a = args as z.infer<typeof toolSchemas.prepare_social_action>;
    const selectedSources = (w.profile.sources || []).filter(source => a.sourceIds.includes(source.id));
    const unknownIds = a.sourceIds.filter(sourceId => !selectedSources.some(source => source.id === sourceId));
    if (unknownIds.length) throw new V2Error("NOT_FOUND", `Sources not found in this workspace: ${unknownIds.join(", ")}`);
    return { revision: w.revision, status: "context_for_host_judgment", situation: a.situation, objective: w.profile.objective || null, audience: w.profile.audience || null, strategy: strategies(tenant, w, c, a.situation), sources: selectedSources, voice: voiceFor(w, c), feedback: scopedFeedback(w, c), relationship: a.personId ? relationships(w, a.personId, c) : null, channelGuidance: channelGuidance[c] || ["Read current channel norms and formats."], choices: ["Create a grounded original contribution", "Continue a useful conversation", "Share an existing source with context", "Wait or remain silent"], draftingOwner: "host_agent", instruction: "Choose only when the contribution serves the audience. Write in the confirmed voice using sourced facts; do not invent experience or fill a posting quota." };
  }
  if (tool === "get_relationship_brief") { const a = args as z.infer<typeof toolSchemas.get_relationship_brief>; return relationships(w, a.personId, a.channel); }
  if (tool === "find_visual_evidence") return visualEvidence(tenant, w, args as z.infer<typeof toolSchemas.find_visual_evidence>);
  if (tool === "check_social_draft") {
    const a = args as z.infer<typeof toolSchemas.check_social_draft>;
    const v = voiceFor(w, c);
    const prohibited = (v?.never || []).filter(term => a.draft.toLocaleLowerCase().includes(term.toLocaleLowerCase()));
    const avoid = (v?.avoid || []).filter(term => a.draft.toLocaleLowerCase().includes(term.toLocaleLowerCase()));
    const unavailableSources = a.sourceIds.filter(sourceId => !(w.profile.sources || []).some(s => s.id === sourceId));
    const assets = w.candidates.filter(item => a.assetIds.includes(item.id));
    const unknownAssets = a.assetIds.filter(assetId => !assets.some(item => item.id === assetId));
    return { status: prohibited.length || unavailableSources.length || unknownAssets.length ? "needs_revision" : "requires_host_editorial_review", deterministicFindings: { prohibitedLiterals: prohibited, advisoryAvoid: avoid, unavailableSources, unknownAssets, unicodeCodePoints: [...a.draft].length, xLengthCheck: c === "x" ? "Host must check actual weighted length and account capabilities; code-point count is not the X publishing validator." : "not_applicable" }, semanticVerification: "not_performed", voice: v, feedback: [...scopedFeedback(w, c), ...w.feedback.filter(f => f.scope === "draft" && f.draftId === a.draftId && (!f.channel || f.channel === c))], sourceMaterial: (w.profile.sources || []).filter(s => a.sourceIds.includes(s.id)), assets, reviewQuestions: ["Which source supports each factual claim?", "Does this contribute something worthwhile to the intended audience?", "Do the visual's period, units, labels and population support the actual wording?", "Is expression faithful to the user's approved voice and channel context?"], publishing: "not_performed" };
  }
  if (tool === "record_social_activity") {
    const a = args as z.infer<typeof toolSchemas.record_social_activity>;
    return mutateV2State(tenant, a.requestId, a.expectedRevision, { tool, args }, emptyWorkspace, next => {
      if (a.experimentId && !next.experiments.some(e => e.id === a.experimentId && e.channel === a.channel)) throw new V2Error("NOT_FOUND", "Experiment is not in this channel/workspace.");
      if (a.assetIds.some(assetId => !next.candidates.some(candidate => candidate.id === assetId))) throw new V2Error("NOT_FOUND", "Asset is not in this workspace's retrieval history.");
      if (["published", "reply"].includes(a.action) && !a.sourceUrl) throw new V2Error("INVALID_ARGUMENT", "Reported public contributions need a source URL.");
      const activity: Activity = { ...a, id: id("activity"), verification: "host_reported" };
      next.activities.push(activity);
      return { revision: next.revision, activity, verifiedWorldOutcome: false };
    });
  }
  if (tool === "record_social_feedback") {
    const a = args as z.infer<typeof toolSchemas.record_social_feedback>;
    return mutateV2State(tenant, a.requestId, a.expectedRevision, { tool, args }, emptyWorkspace, next => {
      const feedback: Feedback = { ...a, id: id("feedback"), at: now() }; next.feedback.push(feedback);
      return { revision: next.revision, feedback, interpretation: "Durable user preference; not evidence of audience performance. Existing voice versions remain unchanged." };
    });
  }
  if (tool === "register_social_experiment") {
    const a = args as z.infer<typeof toolSchemas.register_social_experiment>;
    return mutateV2State(tenant, a.requestId, a.expectedRevision, { tool, args }, emptyWorkspace, next => {
      const { state, presence } = canonicalState(tenant, next, a.channel);
      const reviewId = id("experiment-review");
      if (a.hypothesisId && !next.hypotheses.some(h => h.id === a.hypothesisId && h.originatingPresenceId === presence.id)) throw new V2Error("NOT_FOUND", "Hypothesis is not in this channel/workspace.");
      if (!a.hypothesisId) applyGrowthHypothesisActions(state, presence.id, reviewId, [{ action: "create", statement: a.statement, scope: "presence", confidence: "low", patternIds: a.patternIds }]);
      next.hypotheses = state.growthHypotheses || [];
      const experiment: Experiment = { ...a, id: id("experiment"), canonicalHypothesisId: a.hypothesisId || `growth-hypothesis:${reviewId}:0`, createdAt: now() };
      next.experiments.push(experiment);
      return { revision: next.revision, experiment, confidence: "low", status: "testing", instruction: "Record attributable activities and comparable-age measurements. Impressions alone do not demonstrate qualified growth." };
    });
  }
  if (tool === "review_social_results") {
    const a = args as z.infer<typeof toolSchemas.review_social_results>;
    return mutateV2State(tenant, a.requestId, a.expectedRevision, { tool, args }, emptyWorkspace, next => {
      for (const observation of a.observations) {
        const activity = next.activities.find(item => item.id === observation.activityId && (!a.channel || item.channel === a.channel));
        if (!activity) throw new V2Error("NOT_FOUND", "Measurement activity is not in the requested workspace/channel.");
        if (!["published", "reply"].includes(activity.action)) throw new V2Error("INVALID_ARGUMENT", "Measure a reported public contribution, not a draft, schedule or no-action.");
        if (Date.parse(observation.observedAt) < Date.parse(activity.observedAt)) throw new V2Error("INVALID_ARGUMENT", "Measurement predates its activity.");
        const measuredAge = (Date.parse(observation.observedAt) - Date.parse(activity.observedAt)) / 3_600_000;
        if (Math.abs(measuredAge - observation.publicationAgeHours) > Math.max(1, measuredAge * .1)) throw new V2Error("INVALID_ARGUMENT", "Publication age does not match the recorded timestamps.");
        const duplicate = next.observations.some(o => o.activityId === observation.activityId && o.observedAt === observation.observedAt && o.sourceUrl === observation.sourceUrl);
        if (!duplicate) next.observations.push({ ...observation, id: id("observation"), verification: "host_reported" });
      }
      for (const action of a.hypothesisActions) {
        if (a.channel && action.channel && a.channel !== action.channel) throw new V2Error("INVALID_ARGUMENT", "Hypothesis actions cannot override the review's channel scope.");
        const target = action.hypothesisId ? next.hypotheses.find(h => h.id === action.hypothesisId) : undefined;
        const selectedChannel = action.channel || a.channel || (target?.originatingPresenceId.split(":").at(-1)) || c;
        const { state, presence } = canonicalState(tenant, next, selectedChannel);
        if (action.action !== "create" && (!target || target.originatingPresenceId !== presence.id)) throw new V2Error("NOT_FOUND", "Hypothesis is not in the requested channel/workspace.");
        if (action.action === "create" && !action.statement) throw new V2Error("INVALID_ARGUMENT", "New hypotheses require a statement.");
        for (const evidenceId of action.evidenceIds) {
          const observation = next.observations.find(item => item.id === evidenceId);
          const activity = observation && next.activities.find(item => item.id === observation.activityId && item.channel === selectedChannel);
          const experiment = activity && next.experiments.find(item => item.id === activity.experimentId);
          if (!activity || target && experiment?.canonicalHypothesisId !== target.id) throw new V2Error("NOT_FOUND", "Evidence must belong to the hypothesis experiment, channel and workspace.");
        }
        // Host observations remain STRATEGY_OBSERVATION: no fabricated verified WORLD_OUTCOME.
        state.growthEvidenceRecords = next.observations.filter(o => next.activities.some(activity => activity.id === o.activityId && activity.channel === selectedChannel)).map(o => ({ id: o.id, agentId: `v2:${tenant}`, presenceId: presence.id, kind: "STRATEGY_OBSERVATION", claimScope: "presence", statement: `Host reported ${JSON.stringify(o.metrics)} at ${o.publicationAgeHours} hours`, sourceRefs: [], verified: false, createdAt: o.observedAt }));
        applyGrowthHypothesisActions(state, presence.id, id("host-review"), [{ ...action, scope: "presence", confidence: "low" }]);
        next.hypotheses = state.growthHypotheses || [];
      }
      const observations = next.observations.filter(o => next.activities.some(activity => activity.id === o.activityId && (!a.channel || activity.channel === a.channel)));
      return { revision: next.revision, observations, experiments: next.experiments.filter(e => !a.channel || e.channel === a.channel), hypotheses: next.hypotheses.filter(h => !a.channel || h.originatingPresenceId === `v2:${tenant}:${a.channel}`), sourceReliability: "host_reported_not_independently_verified", questions: ["Are publication ages, audiences and distribution comparable?", "Which result reflects the intended audience outcome?", "Could topic, format, timing or distribution explain the difference?", "What would contradict the proposed explanation?"], nextStep: observations.length ? "Interpret these reports cautiously; register the next bounded test or weaken a contradicted hypothesis. Verify outcomes independently before claiming effectiveness." : "No measurements are recorded. Gather current source-linked metrics with host connectors; do not infer success.", causalClaim: "not_established" };
    });
  }
  if (tool === "record_host_plan") {
    const a = args as z.infer<typeof toolSchemas.record_host_plan>;
    try { new Intl.DateTimeFormat("en", { timeZone: a.timezone }); } catch { throw new V2Error("INVALID_ARGUMENT", "Use an IANA timezone."); }
    if (a.status === "confirmed" && Date.parse(a.nextWake!) <= Date.now()) throw new V2Error("INVALID_ARGUMENT", "A confirmed next wake must be in the future. Reconcile an overdue or paused task with the host.");
    return mutateV2State(tenant, a.requestId, a.expectedRevision, { tool, args }, emptyWorkspace, next => {
      const plan: HostPlan = { ...a, recordedAt: now(), verification: "host_reported" };
      next.hostPlans = [...next.hostPlans.filter(p => !(p.host === a.host && p.taskId === a.taskId)), plan];
      return { revision: next.revision, plan, schedulingOwner: a.host, independentlyVerified: false, instruction: "Confirm native task history and actual wake-up through the host. This record does not run a task." };
    });
  }
  throw new V2Error("NOT_FOUND", "Tool not implemented.");
}
