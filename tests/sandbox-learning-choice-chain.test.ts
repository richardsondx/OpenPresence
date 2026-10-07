import { afterEach, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { POST } from "../app/api/state/route";
import { readStateSnapshot } from "../lib/db";
import { cloneState } from "../lib/runtime";

afterEach(() => vi.unstubAllEnvs());

function sessionIds(state: ReturnType<typeof readStateSnapshot>, collection: string, sessionId: string) {
  const values = (state as unknown as Record<string, unknown>)[collection];
  return new Set(Array.isArray(values)
    ? values.flatMap((value) => {
      if (!value || typeof value !== "object" || (value as { sessionId?: unknown }).sessionId !== sessionId && (value as { sandboxSessionId?: unknown }).sandboxSessionId !== sessionId) return [];
      return typeof (value as { id?: unknown }).id === "string" ? [(value as { id: string }).id] : [];
    })
    : []);
}

function compactRecord(value: unknown) {
  return value && typeof value === "object" ? structuredClone(value) : undefined;
}

it("carries generated original choices through measured learning into a later allocation", async () => {
  const baseUrl = process.env.LEARNING_CHOICE_APP_URL;
  const realModel = process.env.LEARNING_CHOICE_REAL_MODEL === "1";
  const realProvider = (process.env.LEARNING_CHOICE_PROVIDER ?? "openai") as "openai" | "openrouter";
  const realModelName = process.env.LEARNING_CHOICE_MODEL ?? (realProvider === "openrouter" ? "openai/gpt-4o-mini" : "gpt-5.6-luna");
  const realSecret = process.env.LEARNING_CHOICE_SECRET
    ?? (realProvider === "openrouter" ? process.env.TEXT_MODEL_API_KEY : process.env.LEARNING_CHOICE_OPENAI_SECRET);
  if (realProvider !== "openai" && realProvider !== "openrouter") throw new Error(`Unsupported learning proof provider: ${realProvider}`);
  // The real-model gate must exercise the real provider. A previous version
  // enabled the deterministic mock unconditionally, making that branch look
  // green without proving a provider invocation or model-owned attribution.
  vi.stubEnv("OPENPRESENCE_AI_MOCK", realModel ? "0" : "1");
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
      if (!baseUrl || !realSecret) throw new Error("Real-model proof requires an isolated app URL and configured QA provider secret.");
      await op({ type: "configureProvider", provider: realProvider, label: `Learning closure ${realProvider}`, secret: realSecret });
      state = await op({ type: "setModel", provider: realProvider, model: realModelName, quality: "medium", vision: realProvider === "openai" });
    }
    stage = "source-worker";
    await op({ type: "setPresence", patch: { execution: { post: "auto" } } });
    state = await op({ type: "startPlayground", presenceId, source: "fresh", seed: "measured-choice-chain" });
    const sessionId = state.playgroundSessions[0]!.id;
    const initialVirtualNow = Date.parse(state.playgroundSessions[0]!.virtualNow);
    // Keep the declared five-source-decision gate for both deterministic and
    // real-model runs; attribution must remain the model's choice.
    const configuredSourceRequired = Number(process.env.LEARNING_CHOICE_SOURCE_REQUIRED ?? 5);
    const sourceRequired = Number.isInteger(configuredSourceRequired) && configuredSourceRequired >= 2 && configuredSourceRequired <= 8 ? configuredSourceRequired : 5;
    const sourceInstruction = realModel
      ? `Publish exactly ${sourceRequired} short original posts. Each must explain one concrete mechanism from the Agent's own evidence-led workflow, stay under 160 characters, and avoid unsupported current claims, models, prompts, or internal tools.`
      : "Publish 5 distinct original posts explaining evidence-led agent decisions, with concrete mechanisms and useful proof.";
    state = await op({ type: "createAssignment", presenceId, sessionId, environment: "sandbox", instruction: sourceInstruction });
    const assignmentId = state.assignments[0]!.id;
    await op({ type: "startAssignment", id: assignmentId, sessionId });
    await op({ type: "workAssignment", id: assignmentId, sessionId });
    await vi.waitFor(async () => {
      state = await snapshot();
      expect(state.assignmentRuns?.some(run => run.assignmentId === assignmentId && !["published", "failed", "blocked", "cancelled"].includes(run.status)) ?? false).toBe(false);
    }, { timeout: baseUrl ? 180000 : 15000, interval: baseUrl ? 250 : 30 });
    stage = "two-measured-decisions";
    const decisions = state.socialDecisions.filter(d => d.sessionId === sessionId && d.socialStrategy?.selectedByAct.some(a => a.patternId));
    expect(decisions).toHaveLength(sourceRequired);
    expect(state.assignments.find(a => a.id === assignmentId)?.progress.verified).toBe(sourceRequired);
    expect(state.assignmentRuns?.find(run => run.assignmentId === assignmentId)?.status).toBe("published");
    expect(cloneState(cloneState(state)).assignments.find(a => a.id === assignmentId)?.progress.verified).toBe(sourceRequired);
    expect(Date.parse(state.playgroundSessions[0]!.virtualNow) - initialVirtualNow).toBeGreaterThanOrEqual(3_600_000);
    expect(state.playgroundSessions[0]!.temporalSnapshot!.trajectory.filter(t => t.kind === "learning")).toHaveLength(0);
    const comparablePair = decisions.find(decision => decisions.filter(other => other.socialStrategy?.selectedByAct[0]?.patternId === decision.socialStrategy?.selectedByAct[0]?.patternId).length >= 2);
    expect(comparablePair, "at least two naturally attributed uses of one pattern").toBeDefined();
    const pair = decisions.filter(decision => decision.socialStrategy?.selectedByAct[0]?.patternId === comparablePair?.socialStrategy?.selectedByAct[0]?.patternId).slice(0, 2);
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
    // The public projection intentionally omits the private checkpoint
    // snapshot. Freeze the visible pre-checkpoint world and its causal IDs
    // before creating the checkpoint; the returned digest then binds that
    // public state to the private stored snapshot without exposing it.
    const checkpointSource = structuredClone(state);
    const checkpointSourceSession = checkpointSource.playgroundSessions.find(item => item.id === sessionId)!;
    const checkpointDecisionIds = sessionIds(checkpointSource, "socialDecisions", sessionId);
    const checkpointIntentIds = sessionIds(checkpointSource, "socialIntents", sessionId);
    const checkpointExecutionIds = sessionIds(checkpointSource, "executions", sessionId);
    const checkpointOutcomeIds = sessionIds(checkpointSource, "outcomes", sessionId);
    state = await op({ type: "createSandboxCheckpoint", sessionId, label: "two measured decisions" });
    const checkpoint = state.sandboxCheckpoints!.find(c => c.sessionId === sessionId)!;
    expect(checkpoint).toBeDefined();
    const branches = [];
    for (const learning of ["retained", "removed"] as const) {
      stage = `${learning}-fork-worker`;
      const priorSessions = new Set(state.playgroundSessions.map(s => s.id));
      state = await op({ type: "forkSandboxCheckpoint", sessionId, checkpointId: checkpoint.id, learning });
      const fork = state.playgroundSessions.find(s => !priorSessions.has(s.id))!;
      expect(fork.virtualNow).toBe(checkpointSourceSession.virtualNow);
      expect(fork.temporalSnapshot).toEqual(checkpointSourceSession.temporalSnapshot);
      // A fork may namespace learning and Assignment identifiers, but the
      // checkpoint's causal world must be the same before new work begins.
      expect(sessionIds(state, "socialDecisions", fork.id)).toEqual(new Set([...checkpointDecisionIds].map(id => `${id}:sandbox:${fork.id}`)));
      expect(sessionIds(state, "socialIntents", fork.id)).toEqual(new Set([...checkpointIntentIds].map(id => `${id}:sandbox:${fork.id}`)));
      expect(sessionIds(state, "executions", fork.id)).toEqual(new Set([...checkpointExecutionIds].map(id => `${id}:sandbox:${fork.id}`)));
      expect(sessionIds(state, "outcomes", fork.id)).toEqual(new Set([...checkpointOutcomeIds].map(id => `${id}:sandbox:${fork.id}`)));
      const inheritedIds = [...sessionIds(state, "socialDecisions", fork.id)];
      expect(state.socialDecisions.filter(item => item.sessionId === fork.id).every(item => checkpointDecisionIds.has((item as typeof item & { checkpointOriginId?: string }).checkpointOriginId!))).toBe(true);
      const before = structuredClone(state);
      const preexistingAssignments = before.assignments.filter(a => a.sessionId === fork.id).map(a => ({ id: a.id, status: a.status, progress: a.progress }));
      state = await op({ type: "createAssignment", presenceId, sessionId: fork.id, environment: "sandbox", instruction: "Publish 1 original post." });
      const nextAssignment = state.assignments.find(a => a.sessionId === fork.id && !before.assignments.some(old => old.id === a.id))!;
      expect(nextAssignment).toBeDefined();
      expect(nextAssignment.id).not.toMatch(/:sandbox:/);
      await op({ type: "startAssignment", id: nextAssignment.id, sessionId: fork.id });
      await op({ type: "workAssignment", id: nextAssignment.id, sessionId: fork.id });
      await vi.waitFor(async () => {
        state = await snapshot();
        expect(state.assignmentRuns?.some(run => run.assignmentId === nextAssignment.id && !["published", "failed", "blocked", "cancelled"].includes(run.status)) ?? false).toBe(false);
      }, { timeout: baseUrl ? 180000 : 15000, interval: baseUrl ? 250 : 50 });
      const succeededExecution = state.executions.find(e => e.sessionId === fork.id && e.assignmentId === nextAssignment.id && e.status === "succeeded");
      expect(succeededExecution, `${learning}: fresh succeeded execution`).toBeDefined();
      const intent = state.socialIntents.find(item => item.id === succeededExecution?.socialIntentId && item.sessionId === fork.id);
      expect(intent, `${learning}: execution joins to a fresh intent`).toBeDefined();
      const fresh = state.socialDecisions.filter(d => d.sessionId === fork.id && !inheritedIds.includes(d.id) && d.socialIntentId === intent?.id);
      expect(fresh, `${learning}: execution joins to a post-checkpoint decision`).toHaveLength(1);
      const decision = fresh[0]!;
      expect(checkpointDecisionIds.has(decision.id)).toBe(false);
      expect(checkpointIntentIds.has(intent!.id)).toBe(false);
      expect(checkpointExecutionIds.has(succeededExecution!.id)).toBe(false);
      const outcome = state.outcomes.find(item => item.executionId === succeededExecution!.id && item.status === "succeeded");
      expect(outcome, `${learning}: execution has a verified outcome`).toBeDefined();
      expect(checkpointOutcomeIds.has(outcome!.id)).toBe(false);
      const mirror = state.mirrorObjects.find(item => item.originExecutionId === succeededExecution!.id);
      expect(mirror, `${learning}: outcome has an observable Sandbox mirror`).toBeDefined();
      const retrieval = decision.socialStrategy?.retrievalRunId
        ? state.socialStrategyRetrievalRuns?.find(item => item.id === decision.socialStrategy?.retrievalRunId)
        : undefined;
      expect(retrieval, `${learning}: decision has a persisted retrieval run`).toBeDefined();
      const usage = state.resourceUsageEvents.find(item => item.invocationId === succeededExecution!.invocationId && item.category === "model");
      if (realModel) {
        expect(usage, `${learning}: real provider invocation is persisted`).toMatchObject({ provider: realProvider, usage: expect.objectContaining({ requests: expect.any(Number) }) });
        expect(usage?.usage.requests ?? 0).toBeGreaterThan(0);
      }
      branches.push({
        learning,
        sessionId: fork.id,
        inheritedIds,
        checkpoint: { id: checkpoint.id, digest: checkpoint.digest, virtualNow: checkpointSourceSession.virtualNow, decisionIds: [...checkpointDecisionIds], intentIds: [...checkpointIntentIds], executionIds: [...checkpointExecutionIds], outcomeIds: [...checkpointOutcomeIds] },
        assignmentId: nextAssignment.id,
        preexistingAssignments,
        beforeSession: { virtualNow: fork.virtualNow, temporalSnapshot: compactRecord(fork.temporalSnapshot) },
        forward: { decision: compactRecord(decision), intent: compactRecord(intent), execution: compactRecord(succeededExecution), outcome: compactRecord(outcome), mirror: compactRecord(mirror), retrieval: compactRecord(retrieval), usage: compactRecord(usage) },
        afterCounts: { decisions: state.socialDecisions.filter(item => item.sessionId === fork.id).length, intents: state.socialIntents.filter(item => item.sessionId === fork.id).length, executions: state.executions.filter(item => item.sessionId === fork.id).length, outcomes: state.outcomes.filter(item => item.sessionId === fork.id).length },
      });
    }
    const trace = state.playgroundSessions.find(s => s.id === sessionId)!.temporalSnapshot!.trajectory;
    const learning = trace.filter(t => t.kind === "learning");
    expect(learning).toHaveLength(1);
    expect(learning[0]!.data).toMatchObject({ learningUpdateId: hypothesis!.id });
    expect(new Set(hypothesis!.supportingEvidenceIds.flatMap(id => state.growthEvidenceRecords!.find(e => e.id === id)!.causalDecisionIds))).toEqual(new Set(pair.map(d => d.id)));
    stage = "forward-choice";
    proof = { scope: realModel ? "real provider; controlled Sandbox metrics; public checkpoint forks" : "deterministic provider; controlled Sandbox metrics; public checkpoint forks", baseUrl, realModel, provider: realModel ? realProvider : "deterministic", model: realModel ? realModelName : "mock", checkpointId: checkpoint.id, checkpointDigest: checkpoint.digest, sourceSessionId: sessionId, hypothesis, pair: pair.map(compactRecord), branches };
    expect(branches[0]!.beforeSession.virtualNow).toBe(branches[1]!.beforeSession.virtualNow);
    expect(branches[0]!.beforeSession.temporalSnapshot).toEqual(branches[1]!.beforeSession.temporalSnapshot);
    for (const branch of branches) {
      const decision = branch.forward.decision as { id: string; socialIntentId?: string; socialStrategy?: { selectedByAct?: Array<{ patternId?: string }> } };
      const execution = branch.forward.execution as { id: string; socialIntentId?: string };
      const outcome = branch.forward.outcome as { id: string; executionId?: string };
      expect(decision.id).not.toBeUndefined();
      expect(decision.socialIntentId).toBe(execution.socialIntentId);
      expect(outcome.executionId).toBe(execution.id);
      expect(branch.afterCounts).toMatchObject({ decisions: expect.any(Number), intents: expect.any(Number), executions: expect.any(Number), outcomes: expect.any(Number) });
    }
    const retainedPattern = (branches[0]!.forward.decision as { socialStrategy?: { selectedByAct?: Array<{ patternId?: string }> } }).socialStrategy?.selectedByAct?.[0]?.patternId;
    const removedPattern = (branches[1]!.forward.decision as { socialStrategy?: { selectedByAct?: Array<{ patternId?: string }> } }).socialStrategy?.selectedByAct?.[0]?.patternId;
    if (!realModel) {
      expect(retainedPattern).toBe("social.x.v1.proof-led-original");
      expect(removedPattern).toBe("social.x.v1.community-showcase");
    }
    proof.forwardTransfer = retainedPattern !== removedPattern ? "demonstrated" : "not_demonstrated";
    expect(retainedPattern).not.toBe(removedPattern);
    stage = "complete";
  } finally {
    if (process.env.LEARNING_CHOICE_PROOF_PATH) {
      const stateSummary = state && typeof state === "object"
        ? { socialDecisions: state.socialDecisions?.length ?? 0, socialIntents: state.socialIntents?.length ?? 0, executions: state.executions?.length ?? 0, outcomes: state.outcomes?.length ?? 0, resourceUsageEvents: state.resourceUsageEvents?.length ?? 0 }
        : undefined;
      // Preserve raw causal records even when the first source gate fails.
      // Provider settings/secrets and the full private workspace are excluded.
      const sourceRecords = {
        sessions: state.playgroundSessions?.map(({ id, virtualNow, status }) => ({ id, virtualNow, status })),
        assignments: state.assignments?.map(({ id, sessionId, status, progress }) => ({ id, sessionId, status, progress })),
        runs: state.assignmentRuns?.map(({ id, assignmentId, status, lastError, attempts }) => ({ id, assignmentId, status, lastError, attempts })),
        decisions: state.socialDecisions?.map(compactRecord),
        intents: state.socialIntents?.map(compactRecord),
        executions: state.executions?.map(compactRecord),
        outcomes: state.outcomes?.map(compactRecord),
        usage: state.resourceUsageEvents?.filter(item => item.category === "model").map(compactRecord),
        checkpoints: state.sandboxCheckpoints?.map(({ id, sessionId, digest }) => ({ id, sessionId, digest })),
      };
      writeFileSync(process.env.LEARNING_CHOICE_PROOF_PATH, JSON.stringify({ ...proof, stage, realModel, provider: realModel ? realProvider : "deterministic", model: realModel ? realModelName : "mock", stateSummary, sourceRecords }, null, 2));
    }
  }
}, 600000);

it("weakens and retires measured patterns through actual Assignment workers, preserving later avoidance", async () => {
  vi.stubEnv("OPENPRESENCE_AI_MOCK", "1");
  async function op(data: Record<string, unknown>) {
    const response = await POST(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) }));
    expect(response.ok, await response.clone().text()).toBe(true);
    return readStateSnapshot();
  }
  await op({ type: "reset" });
  let state = await op({ type: "createAgent", input: { name: "Learning retirement", description: "Evidence-led agent decisions", audience: "AI builders", mode: "agent", handle: "@learning_retirement", accent: "#777777" } });
  const presenceId = state.presence!.id;
  await op({ type: "setPresence", patch: { execution: { post: "auto" } } });
  state = await op({ type: "startPlayground", presenceId, source: "fresh", seed: "retirement-worker" });
  const sessionId = state.playgroundSessions[0]!.id;
  async function publish(count: number, instruction = `Publish ${count} distinct original posts explaining evidence-led agent decisions, with concrete mechanisms and useful proof.`) {
    const before = new Set(state.socialDecisions.map(item => item.id));
    state = await op({ type: "createAssignment", presenceId, sessionId, environment: "sandbox", instruction });
    const assignment = state.assignments.find(item => item.sessionId === sessionId)!;
    await op({ type: "startAssignment", id: assignment.id, sessionId });
    await op({ type: "workAssignment", id: assignment.id, sessionId });
    await vi.waitFor(() => {
      state = readStateSnapshot();
      expect(state.assignmentRuns?.some(run => run.assignmentId === assignment.id && !["published", "failed", "blocked", "cancelled"].includes(run.status))).toBe(false);
    }, { timeout: 15000, interval: 30 });
    expect(state.assignments.find(item => item.id === assignment.id)?.progress.verified).toBe(count);
    return state.socialDecisions.filter(item => item.sessionId === sessionId && !before.has(item.id));
  }
  async function measure(decision: ReturnType<typeof readStateSnapshot>["socialDecisions"][number], impressions: number) {
    const execution = state.executions.find(item => item.socialIntentId === decision.socialIntentId && item.status === "succeeded")!;
    expect(execution).toBeDefined();
    const mirror = state.mirrorObjects.find(item => item.originExecutionId === execution.id)!;
    expect(state.outcomes.some(item => item.executionId === execution.id && item.status === "succeeded")).toBe(true);
    state = await op({ type: "recordPublicationMetricSnapshot", presenceId, mirrorObjectId: mirror.id, publicationAgeSeconds: 3600, source: "sandbox", metrics: { impressions, likes: 1 } });
  }
  const source = await publish(5);
  expect(source).toHaveLength(5);
  const pattern = source[0]!.socialStrategy!.selectedByAct[0]!.patternId!;
  expect(source.every(item => item.socialStrategy?.selectedByAct[0]?.patternId === pattern)).toBe(true);
  const alternative = await publish(2, "Publish 2 original posts showcasing community projects from startup builders, inviting participation and useful engagement.");
  expect(alternative.map(item => item.socialStrategy?.selectedByAct[0]?.patternId)).not.toContain(pattern);
  await measure(source[0]!, 100);
  await measure(source[1]!, 100);
  const hypothesisId = state.growthHypotheses!.find(item => item.sandboxSessionId === sessionId && item.patternIds.includes(pattern))!.id;
  expect(state.growthHypotheses!.find(item => item.id === hypothesisId)?.status).toBe("supported");
  await measure(alternative[0]!, 1000);
  await measure(alternative[1]!, 1000);
  expect(state.growthHypotheses!.find(item => item.id === hypothesisId)?.status).toBe("weakened");
  await measure(source[2]!, 100);
  expect(state.growthHypotheses!.find(item => item.id === hypothesisId)?.status).toBe("disfavored");
  await measure(source[3]!, 100);
  expect(state.growthHypotheses!.find(item => item.id === hypothesisId)?.status).toBe("retired");
  const later = await publish(1, "Publish 1 original post.");
  expect(later[0]!.socialStrategy?.selectedByAct[0]?.patternId).not.toBe(pattern);
  const retrieval = state.socialStrategyRetrievalRuns!.find(item => item.id === later[0]!.socialStrategy?.retrievalRunId)!;
  expect(retrieval.relevantGrowthHypothesisIds).not.toContain(hypothesisId);
  const retired = state.growthHypotheses!.find(item => item.id === hypothesisId)!;
  expect(retired.reviewHistory.map(item => item.status)).toEqual(["supported", "weakened", "disfavored", "retired"]);
  expect(retired.contradictingEvidenceIds).toHaveLength(4);
  if (process.env.LEARNING_RETIREMENT_PROOF_PATH) writeFileSync(process.env.LEARNING_RETIREMENT_PROOF_PATH, JSON.stringify({ scope: "deterministic public API and actual Assignment workers; controlled Sandbox measurements", sessionId, hypothesis: retired, publicationMetricSnapshots: state.publicationMetricSnapshots.filter(item => state.mirrorObjects.some(mirror => mirror.id === item.mirrorObjectId && mirror.sessionId === sessionId)), intents: state.socialIntents.filter(item => item.sessionId === sessionId), mirrors: state.mirrorObjects.filter(item => item.sessionId === sessionId), decisions: [...source, ...alternative, ...later], retrieval, evidence: state.growthEvidenceRecords?.filter(item => item.sandboxSessionId === sessionId), executions: state.executions.filter(item => item.sessionId === sessionId), outcomes: state.outcomes.filter(item => item.sessionId === sessionId) }, null, 2));
}, 60000);
