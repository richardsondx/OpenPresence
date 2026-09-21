import { afterEach, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { POST } from "../app/api/state/route";
import { readStateSnapshot } from "../lib/db";
import { cloneState } from "../lib/runtime";

afterEach(() => vi.unstubAllEnvs());

it("carries generated original choices through measured learning into a later allocation", async () => {
  vi.stubEnv("OPENPRESENCE_AI_MOCK", "1");
  const baseUrl = process.env.LEARNING_CHOICE_APP_URL;
  const realModel = process.env.LEARNING_CHOICE_REAL_MODEL === "1";
  let stage = "setup";
  let state = {} as ReturnType<typeof readStateSnapshot>;
  let proof: Record<string, unknown> | undefined;
  try {
    const snapshot = async () => baseUrl ? await (await fetch(`${baseUrl}/api/state`)).json() as ReturnType<typeof readStateSnapshot> : readStateSnapshot();
    async function op(data: Record<string, unknown>) {
      const request = new Request(`${baseUrl ?? "http://localhost"}/api/state`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      const response = baseUrl ? await fetch(request) : await POST(request);
      expect(response.ok, await response.clone().text()).toBe(true);
      return snapshot();
    }
    await op({ type: "reset" });
    state = await op({ type: "createAgent", input: { name: "Measured choices", description: "Explain durable agent decisions through concrete evidence", audience: "AI builders", mode: "agent", handle: "@measured_choices", accent: "#777777" } });
    const presenceId = state.presence!.id;
    if (realModel) {
      if (!baseUrl || !process.env.LEARNING_CHOICE_OPENAI_SECRET) throw new Error("Real-model proof requires an isolated app URL and configured QA provider secret.");
      await op({ type: "configureProvider", provider: "openai", label: "Learning closure OpenAI", secret: process.env.LEARNING_CHOICE_OPENAI_SECRET });
      state = await op({ type: "setModel", provider: "openai", model: "gpt-5.6-luna", quality: "medium", vision: true });
    }
    stage = "source-worker";
    await op({ type: "setPresence", patch: { execution: { post: "auto" } } });
    state = await op({ type: "startPlayground", presenceId, source: "fresh", seed: "measured-choice-chain" });
    const sessionId = state.playgroundSessions[0]!.id;
    const initialVirtualNow = Date.parse(state.playgroundSessions[0]!.virtualNow);
    // Five genuine decisions put fatigue (2.25) near the original-post tag
    // advantage (2). Two measured outcomes add 0.38, crossing that boundary.
    // Keep this sensitivity probe fixed; never change runtime weights for a pass.
    state = await op({ type: "createAssignment", presenceId, sessionId, environment: "sandbox", instruction: "Publish 5 distinct original posts explaining evidence-led agent decisions, with concrete mechanisms and useful proof." });
    const assignmentId = state.assignments[0]!.id;
    await op({ type: "startAssignment", id: assignmentId, sessionId });
    await op({ type: "workAssignment", id: assignmentId, sessionId });
    await vi.waitFor(async () => {
      state = await snapshot();
      expect(state.assignmentRuns.some(run => run.assignmentId === assignmentId && !["published", "failed", "blocked", "cancelled"].includes(run.status))).toBe(false);
    }, { timeout: baseUrl ? 180000 : 15000, interval: baseUrl ? 250 : 30 });
    stage = "two-measured-decisions";
    const decisions = state.socialDecisions.filter(d => d.sessionId === sessionId && d.socialStrategy?.selectedByAct.some(a => a.patternId));
    expect(decisions).toHaveLength(5);
    expect(state.assignments.find(a => a.id === assignmentId)?.progress.verified).toBe(5);
    expect(state.assignmentRuns.find(run => run.assignmentId === assignmentId)?.status).toBe("published");
    expect(cloneState(cloneState(state)).assignments.find(a => a.id === assignmentId)?.progress.verified).toBe(5);
    expect(Date.parse(state.playgroundSessions[0]!.virtualNow) - initialVirtualNow).toBeGreaterThanOrEqual(3_600_000);
    expect(state.playgroundSessions[0]!.temporalSnapshot!.trajectory.filter(t => t.kind === "learning")).toHaveLength(0);
    const pair = decisions.slice(0, 2);
    expect(pair[0]!.socialStrategy!.selectedByAct[0]!.patternId).toBe(pair[1]!.socialStrategy!.selectedByAct[0]!.patternId);
    for (const [index, decision] of pair.entries()) {
      const execution = state.executions.find(e => e.socialIntentId === decision.socialIntentId && e.status === "succeeded")!;
      expect(execution).toBeDefined();
      const mirror = state.mirrorObjects.find(m => m.originExecutionId === execution.id)!;
      expect(mirror).toBeDefined();
      expect(state.outcomes.some(o => o.executionId === execution.id && o.status === "succeeded")).toBe(true);
      expect(state.socialStrategyRetrievalRuns?.some(r => r.id === decision.socialStrategy?.retrievalRunId)).toBe(true);
      state = await op({ type: "recordPublicationMetricSnapshot", presenceId, mirrorObjectId: mirror.id, publicationAgeSeconds: 3600, source: "sandbox", metrics: { impressions: 1000, likes: 100, replies: 20 } });
      if (index === 0) expect(state.growthHypotheses?.some(h => h.sandboxSessionId === sessionId && h.status === "supported")).toBe(false);
    }
    const hypothesis = state.growthHypotheses?.find(h => h.sandboxSessionId === sessionId && h.supportingEvidenceIds.length >= 2);
    expect(hypothesis).toBeDefined();
    state = await op({ type: "createSandboxCheckpoint", sessionId, label: "two measured decisions" });
    const checkpoint = state.sandboxCheckpoints!.find(c => c.sessionId === sessionId)!;
    const branches = [];
    for (const learning of ["retained", "removed"] as const) {
      stage = `${learning}-fork-worker`;
      const priorSessions = new Set(state.playgroundSessions.map(s => s.id));
      state = await op({ type: "forkSandboxCheckpoint", sessionId, checkpointId: checkpoint.id, learning });
      const fork = state.playgroundSessions.find(s => !priorSessions.has(s.id))!;
      const inheritedIds = state.socialDecisions.filter(d => d.sessionId === fork.id).map(d => d.id);
      const before = structuredClone(state);
      state = await op({ type: "createAssignment", presenceId, sessionId: fork.id, environment: "sandbox", instruction: "Publish 1 original post." });
      const nextAssignment = state.assignments.find(a => a.sessionId === fork.id && !before.assignments.some(old => old.id === a.id))!;
      await op({ type: "startAssignment", id: nextAssignment.id, sessionId: fork.id });
      await op({ type: "workAssignment", id: nextAssignment.id, sessionId: fork.id });
      await vi.waitFor(async () => {
        state = await snapshot();
        expect(state.assignmentRuns.some(run => run.assignmentId === nextAssignment.id && !["published", "failed", "blocked", "cancelled"].includes(run.status))).toBe(false);
      }, { timeout: baseUrl ? 180000 : 15000, interval: baseUrl ? 250 : 50 });
      const fresh = state.socialDecisions.filter(d => d.sessionId === fork.id && !inheritedIds.includes(d.id));
      branches.push({ learning, sessionId: fork.id, inheritedIds, before, after: structuredClone(state), fresh, assignmentId: nextAssignment.id });
    }
    const trace = state.playgroundSessions.find(s => s.id === sessionId)!.temporalSnapshot!.trajectory;
    const learning = trace.filter(t => t.kind === "learning");
    expect(learning).toHaveLength(1);
    expect(learning[0]!.data).toMatchObject({ learningUpdateId: hypothesis!.id });
    expect(new Set(hypothesis!.supportingEvidenceIds.flatMap(id => state.growthEvidenceRecords!.find(e => e.id === id)!.causalDecisionIds))).toEqual(new Set(pair.map(d => d.id)));
    stage = "forward-choice";
    proof = { scope: "deterministic provider; controlled Sandbox metrics; public checkpoint forks", baseUrl, realModel, checkpointId: checkpoint.id, sourceSessionId: sessionId, hypothesis, pair, branches };
    expect(branches[0]!.before.playgroundSessions.find(s => s.id === branches[0]!.sessionId)!.virtualNow)
      .toBe(branches[1]!.before.playgroundSessions.find(s => s.id === branches[1]!.sessionId)!.virtualNow);
    for (const branch of branches) {
      expect(branch.fresh, `${branch.learning}: eligible fresh decision`).toHaveLength(1);
      const decision = branch.fresh[0]!;
      expect(branch.after.executions.some(e => e.sessionId === branch.sessionId && e.socialIntentId === decision.socialIntentId && e.status === "succeeded")).toBe(true);
      if (realModel) {
        const execution = branch.after.executions.find(e => e.sessionId === branch.sessionId && e.socialIntentId === decision.socialIntentId)!;
        expect(branch.after.resourceUsageEvents.some(u => u.invocationId === execution.invocationId && u.provider === "openai" && (u.usage.requests ?? 0) > 0)).toBe(true);
      }
      expect(branch.after.assignments.find(a => a.id === branch.assignmentId)?.progress.verified).toBe(1);
    }
    expect(branches[0]!.fresh[0]!.socialStrategy!.selectedByAct[0]!.patternId).toBe("social.x.v1.proof-led-original");
    expect(branches[1]!.fresh[0]!.socialStrategy!.selectedByAct[0]!.patternId).toBe("social.x.v1.community-showcase");
    stage = "complete";
  } finally {
    if (process.env.LEARNING_CHOICE_PROOF_PATH) writeFileSync(process.env.LEARNING_CHOICE_PROOF_PATH, JSON.stringify({ ...proof, stage, realModel, state }, null, 2));
  }
}, 600000);
