import { describe, expect, it } from "vitest";
import { applyOperation, createAgent, normalizeState, recordSocialDecision } from "../lib/runtime";
import { compileSocialStrategyContext, saveSocialTemplate, socialPlaybookForPresence } from "../lib/social-strategy";
import { POST, GET } from "../app/api/state/route";
import { writeState } from "../lib/db";
import { recordPlaybookMilestones } from "../lib/playbook-milestones";
import { growthBrowserProjection } from "../lib/growth-browser-projection";
import type { Assignment, Asset, Execution, MirrorObject, OpenPresenceState, PublicationMetricSnapshot } from "../lib/types";

type TemplateHypothesisRecord = { id: string; template?: { title?: string } };
type ScheduledAssignmentRecord = { id: string; strategyTemplateId?: string; title?: string; description?: string; instruction?: string };
type ExecutionRecord = { assignmentId?: string };

describe("Growth playbook workflows", () => {
  it("hydrates bounded starter templates as unproven private hypotheses", () => {
    const state = createAgent({ name: "Starter", description: "Careful agent", mode: "agent", handle: "@starter", accent: "#123456" });
    const hydrated = normalizeState(state);
    const templates = socialPlaybookForPresence(hydrated, hydrated.presence!.id).filter((item) => item.template?.source === "bundled");
    expect(templates).toHaveLength(6);
    expect(templates.every((item) => item.status === "testing" && item.confidence === "low" && item.verifiedUses === 0 && item.supportingEvidenceIds.length === 0)).toBe(true);
    expect(templates.some((item) => item.template?.title === "Trend hypothesis: one idea, many hooks")).toBe(true);
    expect(templates.every((item) => Boolean(item.template?.visualGuidance))).toBe(true);
  });

  it("teaches social decisions to compare visual evidence with text-only", () => {
    const state = normalizeState(createAgent({ name: "Visual strategist", description: "Careful agent", mode: "agent", handle: "@visual_strategist", accent: "#123456" }));
    const context = compileSocialStrategyContext(state, state.presence!, { invocation: "assignment", objective: "publish an original X post about a concrete milestone", availableActions: ["post", "quote"] });
    expect(context.prompt).toContain("IMAGE DECISION RULE");
    expect(context.prompt).toContain("visual guidance:");
    expect(context.prompt).toContain("No durable authorized visual asset is currently available");
  });

  it("keeps explicitly decorative media out of later reusable-asset context", () => {
    const state = normalizeState(createAgent({ name: "Media allocator", description: "Choose evidence that fits the idea.", mode: "agent", handle: "@media_allocator", accent: "#123456" }));
    const presence = state.presence!;
    const now = new Date().toISOString();
    const asset = (id: string, name: string): Asset => ({ id, agentId: state.agent!.id, presenceId: presence.id, type: "image", status: "ready", retention: "preserved", rights: { status: "owned" }, provenance: { origin: "sandbox", importedAt: now }, description: name, environment: "sandbox", visibility: "public", shareability: "presence-only", createdAt: now, updatedAt: now });
    state.assets = [asset("asset-chart", "Relevant evidence chart"), asset("asset-stock", "Decorative stock photo")];
    state.perceptions = [
      { id: "perception-chart", assetId: "asset-chart", presenceId: presence.id, level: "inspect", result: { observation: "A chart is visible.", uncertainty: "low", visualForm: "chart", visualRole: "evidence", decorative: false }, sourceAssetVersion: now, createdAt: now, environment: "sandbox" },
      { id: "perception-stock", assetId: "asset-stock", presenceId: presence.id, level: "inspect", result: { observation: "A generic office photo is visible.", uncertainty: "low", visualForm: "photo", visualRole: "atmosphere", decorative: true }, sourceAssetVersion: now, createdAt: now, environment: "sandbox" },
    ];
    const context = compileSocialStrategyContext(state, presence, { invocation: "later media decision", objective: "Publish a grounded technical post", availableActions: ["post"] });
    expect(context.prompt).toContain("asset-chart");
    expect(context.prompt).not.toContain("asset-stock");
    expect(context.prompt).toContain("explicitly decorative or atmosphere-only media is excluded");
  });

  it("abstracts a bounded observed source set and carries it into Growth planning", () => {
    const state = createAgent({ name: "Observed format", description: "Careful agent", audience: "AI builders", mode: "agent", handle: "@observed_format", accent: "#123456" });
    const presence = state.presence!;
    presence.environment = "live";
    state.presences = state.presences.map((item) => item.id === presence.id ? presence : item);
    const sourceIds = Array.from({ length: 30 }, (_, index) => `observed-${index + 1}`);
    state.mirrorObjects = sourceIds.map((id) => ({
      id,
      presenceId: presence.id,
      channelId: "x",
      externalRef: { type: "x.post", id },
      objectType: "post",
      visibility: "public",
      environment: "live",
      archived: false,
      content: { text: `Observed example ${id}` },
      occurredAt: new Date().toISOString(),
      observedAt: new Date().toISOString(),
    } as OpenPresenceState["mirrorObjects"][number]));

    const saved = saveSocialTemplate(state, presence.id, {
      title: "Observed proof loop",
      body: "When [PROBLEM] appears, show [MECHANISM] and invite [AUDIENCE] to compare the result.",
      whenToUse: "Use when a concrete builder problem has a visible mechanism to explain.",
      visualGuidance: "Use a product screenshot only when it proves the mechanism; otherwise stay text-only.",
      source: "observed_post",
      mirrorObjectIds: sourceIds,
    });
    expect(saved.hypothesis.template).toMatchObject({ source: "observed_post", sourceCount: 30, sourceMirrorObjectIds: sourceIds });
    expect(saved.state.growthEvidenceRecords?.filter((record) => record.kind === "STRATEGY_OBSERVATION")).toHaveLength(30);

    const context = compileSocialStrategyContext(saved.state, presence, {
      invocation: "assignment",
      objective: "Publish one useful post for AI builders using the observed proof loop.",
      availableActions: ["original_post"],
      strategyTemplateId: saved.hypothesis.id,
    });
    expect(context.retrievalRun.selectedTemplateId).toBe(saved.hypothesis.id);
    expect(context.prompt).toContain(`${saved.hypothesis.id} · Observed proof loop`);
    expect(context.prompt).toContain("abstracted from 30 observed source posts");
    expect(context.prompt).toContain("GROWTH PROFILE");
    expect(context.prompt).toContain("audience: AI builders");
    expect(context.prompt).toContain("Use a product screenshot only when it proves the mechanism");

    const projected = growthBrowserProjection(saved.state, presence.id).growthBrowserSummary;
    expect(projected?.profile).toMatchObject({ audience: "AI builders", confidence: "low" });
  });

  it("infers placeholders and deduplicates replay", () => {
    const state = createAgent({ name: "Playbook", description: "Careful agent", mode: "agent", handle: "@playbook", accent: "#123456" });
    const p = state.presence!;
    const first = saveSocialTemplate(state, p.id, { title: "Question", body: "What changed for [AUDIENCE]?", source: "operator" });
    expect(first.hypothesis.template?.variables).toEqual(["AUDIENCE"]);
    const replay = saveSocialTemplate(first.state, p.id, { title: "Question", body: "What changed for [AUDIENCE]?", source: "operator" });
    expect(replay.state.growthHypotheses).toHaveLength(1);
    expect(replay.hypothesis.id).toBe(first.hypothesis.id);
  });

  it("lists scoped lessons with evidence buckets and preserves disfavored history", () => {
    const state = createAgent({ name: "Playbook", description: "Careful agent", mode: "agent", handle: "@playbook", accent: "#123456" });
    const p = state.presence!;
    const saved = saveSocialTemplate(state, p.id, { title: "Structure", body: "A [TOPIC] example", source: "operator" });
    saved.hypothesis.status = "disfavored";
    const listed = socialPlaybookForPresence(saved.state, p.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: saved.hypothesis.id, status: "disfavored", supportingEvidence: [], contradictingEvidence: [], usageCount: 0 });
  });

  it("persists a template through POST and schedules it without execution", async () => {
    const state = createAgent({ name: "API Playbook", description: "Careful agent", mode: "agent", handle: "@api_playbook", accent: "#123456" });
    writeState(state);
    const p = state.presence!;
    const post = await POST(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "saveSocialTemplate", presenceId: p.id, title: "API template", body: "Try [TOPIC]", }) }));
    expect(post.status).toBe(200);
    const saved = await post.json();
    const id = (saved.growthHypotheses as TemplateHypothesisRecord[]).find((h) => h.template?.title === "API template")!.id;
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const scheduled = await POST(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "scheduleSocialTemplate", presenceId: p.id, hypothesisId: id, startsAt: tomorrow, deadline: new Date(Date.now() + 90000000).toISOString() }) }));
    expect(scheduled.status).toBe(200);
    const after = await scheduled.json();
    expect((after.assignments as ScheduledAssignmentRecord[]).find((a) => a.strategyTemplateId === id)).toBeTruthy();
    const scheduledAssignment = (after.assignments as ScheduledAssignmentRecord[]).find((a) => a.strategyTemplateId === id);
    expect(scheduledAssignment).toBeDefined();
    if (!scheduledAssignment) throw new Error("Expected the scheduled template Assignment.");
    expect(scheduledAssignment).toMatchObject({ title: "Use API template", description: "Apply API template to a current audience-relevant idea and verify the result.", strategyTemplateId: id });
    expect(scheduledAssignment.instruction).toContain("Compare media with text-only");
    expect(scheduledAssignment.instruction).not.toContain("abstracted from 0 observed source posts");
    expect((after.executions as ExecutionRecord[]).filter((e) => e.assignmentId && e.assignmentId === scheduledAssignment.id)).toHaveLength(0);
    const fetched = await GET(new Request("http://localhost/api/state"));
    expect((await fetched.json()).growthHypotheses.some((h: TemplateHypothesisRecord) => h.id === id)).toBe(true);
  });

  it("keeps Agent-created template work attributable and measurable", () => {
    const state = normalizeState(createAgent({ name: "Agent Planner", description: "Careful agent", mode: "agent", handle: "@agent_planner", accent: "#123456" }));
    const presenceId = state.presence!.id;
    const template = state.growthHypotheses!.find((item) => item.template?.source === "bundled")!;
    const planned = applyOperation(state, {
      type: "createAssignment",
      presenceId,
      environment: "sandbox",
      createdBy: "agent",
      strategyTemplateId: template.id,
      instruction: `Use the saved template ${template.id} to prepare one private draft.`,
    });
    expect(planned.assignments[0]).toMatchObject({ createdBy: "agent", strategyTemplateId: template.id });
    expect(socialPlaybookForPresence(planned, presenceId).find((item) => item.id === template.id)?.usageCount).toBe(1);
    const decisionState = recordSocialDecision(planned, { decision: "original_post", presenceId, summary: "Prepare a useful draft using the saved format.", origin: { kind: "assignment", refId: planned.assignments[0]!.id } });
    expect(decisionState.socialDecisions[0]?.socialStrategy?.strategyTemplateId).toBe(template.id);
  });

  it("repairs legacy Chat task provenance from its saved template receipt", () => {
    const state = normalizeState(createAgent({ name: "Legacy Planner", description: "Careful agent", mode: "agent", handle: "@legacy_planner", accent: "#123456" }));
    const presenceId = state.presence!.id;
    const template = state.growthHypotheses!.find((item) => item.template?.source === "bundled")!;
    const seeded = applyOperation(state, { type: "createAssignment", presenceId, environment: "sandbox", instruction: "Prepare a private draft." });
    state.assignments = [{ ...seeded.assignments[0]!, id: "legacy-chat-assignment", presenceId, createdBy: "operator", instruction: `Use the saved template: ${template.id} to prepare a private draft.` }];
    state.operatorNudges = [{ id: "legacy-nudge", agentId: state.agent!.id, presenceId, privateConversation: true, conversationId: "conversation", messageId: "message", content: "Plan this.", status: "assignment_created", assignmentId: "legacy-chat-assignment", sourceUrls: [], attachmentIds: [], attentionEpisodeIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    const repaired = normalizeState(state).assignments.find((item) => item.id === "legacy-chat-assignment");
    expect(repaired).toMatchObject({ createdBy: "agent", strategyTemplateId: template.id });
  });

  it("records one milestone per review when a template becomes supported", () => {
    const state = createAgent({ name: "Milestone", description: "Careful agent", mode: "agent", handle: "@milestone", accent: "#123456" });
    const p = state.presence!;
    const saved = saveSocialTemplate(state, p.id, { title: "Milestone", body: "Use [TOPIC]", source: "operator" });
    const before = structuredClone(saved.state.growthHypotheses!);
    saved.hypothesis.status = "supported";
    recordPlaybookMilestones(saved.state, p.id, before, "review-once", new Date().toISOString());
    recordPlaybookMilestones(saved.state, p.id, before, "review-once", new Date().toISOString());
    expect(saved.state.operatorConversations?.flatMap((c) => c.messages).filter((m) => m.id === "playbook-review:review-once")).toHaveLength(1);
    expect(saved.state.operatorConversations?.flatMap((c) => c.messages).find((m) => m.id === "playbook-review:review-once")?.agentInitiated).toMatchObject({ kind: "breakthrough", dedupeKey: "playbook-review:review-once" });
    recordPlaybookMilestones(saved.state, p.id, saved.state.growthHypotheses!, "review-later", new Date().toISOString());
    expect(saved.state.operatorConversations?.flatMap((c) => c.messages).filter((m) => m.id.startsWith("playbook-review:")).length).toBe(1);
  });
});

it("counts only verified live template deliveries and retains their latest measurements in Artifacts", async () => {
  const { agentLibraryBrowserProjection } = await import("../lib/agent-library-browser-projection");
  const initial = createAgent({ name: "Measured", description: "Careful agent", mode: "agent", handle: "@measured", accent: "#123456" });
  const { state, hypothesis } = saveSocialTemplate(initial, initial.presence!.id, { title: "Measured format", body: "Try [TOPIC]", source: "operator" });
  const presenceId = state.presence!.id;
  state.assignments.push({ id: "template-task", presenceId, strategyTemplateId: hypothesis.id } as Assignment);
  state.executions.push(...[
    { id: "delivered", status: "succeeded", environment: "live", externalRef: { type: "post", id: "123" } },
    { id: "draft", status: "awaiting-review", environment: "live", externalRef: { type: "post", id: "456" } },
    { id: "sandbox", status: "succeeded", environment: "sandbox", externalRef: { type: "post", id: "789" } },
  ].map(item => ({ ...item, presenceId, assignmentId: "template-task" }) as Execution));
  state.mirrorObjects.push({ id: "measured-post", presenceId, externalRef: { type: "post", id: "123" } } as MirrorObject);
  state.publicationMetricSnapshots.push(...[
    { id: "old", observedAt: "2026-09-01T00:00:00Z", impressions: 10 },
    { id: "new", observedAt: "2026-09-02T00:00:00Z", impressions: 30 },
  ].map(item => ({ ...item, presenceId, mirrorObjectId: "measured-post" }) as PublicationMetricSnapshot));
  const full = socialPlaybookForPresence(state, presenceId)[0];
  expect(full).toMatchObject({ verifiedUses: 1, measuredPosts: 1, performance: { impressions: 30, likes: undefined } });
  const compact = socialPlaybookForPresence(agentLibraryBrowserProjection(state, "assets"), presenceId)[0];
  expect(compact.verifiedUses).toBe(full.verifiedUses);
  expect(compact.performance).toEqual(full.performance);
});
