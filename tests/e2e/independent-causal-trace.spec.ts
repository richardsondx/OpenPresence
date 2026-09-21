import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

type RecordValue = Record<string, unknown>;
const cliPath = join(process.cwd(), "bin/openpresence.mjs");

function asRecord(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function asRecords(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function runCli(baseUrl: string, args: string[]) {
  return new Promise<RecordValue>((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, "playground", ...args, "--url", baseUrl], {
      cwd: process.cwd(),
      env: { ...process.env, OPENPRESENCE_AI_MOCK: "1", OPENPRESENCE_X_API_MOCK: "1" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("close", (code) => {
      const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
      if (code !== 0 || !line) reject(new Error(`CLI failed (${code}): ${stderr || stdout}`));
      else resolve(asRecord(JSON.parse(line)));
    });
  });
}

test.describe("Independent public causal-trace verifier", () => {
  test.setTimeout(120_000);

  test("reconstructs typed causal parents for every resulting world transition", async ({ request }) => {
    expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBe(true);
    const created = await request.post("/api/state", {
      data: { type: "createAgent", input: { name: "Causal Verifier", description: "Independent trace verification.", audience: "builders", mode: "agent", handle: "@causal_verifier", accent: "#777777" } },
    });
    expect(created.ok()).toBe(true);
    const presenceId = asRecord(asRecord(await created.json()).presence).id as string;
    const configured = await request.post("/api/state", {
      data: { type: "setPresence", patch: { execution: { post: "auto", reply: "auto", quote: "auto", repost: "auto", like: "auto", follow: "auto" } } },
    });
    expect(configured.ok()).toBe(true);
    const baseUrl = String(test.info().project.use.baseURL);
    const started = await runCli(baseUrl, ["start", "--presence", presenceId, "--source", "fresh", "--seed", "independent-causal-trace-seed"]);
    const sessionId = asRecord(started.session).id as string;
    expect(sessionId).toBeTruthy();
    await runCli(baseUrl, ["inject", "--actor", "Trace Author", "--handle", "@trace_author", "--action", "post", "--content", "A public event that must remain causally reconstructable.", "--session", sessionId]);
    await runCli(baseUrl, ["inject", "--actor", "Trace Break", "--handle", "@trace_break", "--action", "post", "--content", "Breaking evidence invalidates the previous plan; reassess it.", "--session", sessionId]);
    await runCli(baseUrl, ["advance", "--minutes", "1440", "--session", sessionId]);
    await runCli(baseUrl, ["retry", "--operation", "independent-causal-retry", "--max-attempts", "2", "--initial-delay", "60", "--session", sessionId]);
    await runCli(baseUrl, ["cancel-retry", "--operation", "independent-causal-retry", "--session", sessionId]);
    await runCli(baseUrl, ["advance", "--minutes", "120", "--session", sessionId]);

    const state = asRecord(await (await request.get("/api/state")).json());
    const session = asRecords(state.playgroundSessions).find((item) => item.id === sessionId);
    expect(session).toBeTruthy();
    const trace = asRecords(asRecord(session?.temporalSnapshot).trajectory);
    expect(trace.length).toBeGreaterThan(0);
    const artifactPath = test.info().outputPath("public-causal-trace.json");
    await writeFile(artifactPath, JSON.stringify({ sessionId, trace }, null, 2));
    await test.info().attach("public-causal-trace", { path: artifactPath, contentType: "application/json" });
    const observedKinds = new Set(trace.map((entry) => entry.kind));
    for (const required of ["observation", "decision", "intent", "permission_decision", "execution", "result", "outcome", "retry_scheduled"]) {
      expect(observedKinds.has(required), `The scenario did not exercise required transition ${required}`).toBe(true);
    }
    expect(new Set(trace.map((entry) => entry.sequence)).size, "Duplicate trajectory sequence numbers make causal reconstruction ambiguous.").toBe(trace.length);

    const transitionKinds = new Set(["event_fired", "event_stale", "event_cancelled", "observation", "decision", "intent", "permission_decision", "execution", "result", "outcome", "learning", "replan", "retry_scheduled", "retry_attempted", "retry_failed", "retry_succeeded", "retry_exhausted", "outcome_cancelled"]);
    const parentTypes = new Set(["mirror_object", "sandbox_event", "social_intent", "execution", "outcome", "permission_decision", "temporal_event", "learning_update", "plan_mutation", "assignment"]);
    const traceIds = new Set<string>();
    const traceEventIds = new Set<string>();
    const firstSeenAt = new Map<string, number>();
    for (const entry of trace) {
      if (typeof entry.id === "string") traceIds.add(entry.id);
      if (typeof entry.eventId === "string") traceEventIds.add(entry.eventId);
      const data = asRecord(entry.data);
      for (const key of ["id", "mirrorObjectId", "sourceEventId", "intentId", "executionId", "outcomeId", "planId", "assignmentId"]) {
        if (typeof data[key] === "string") traceIds.add(data[key] as string);
      }
      const externalRef = asRecord(data.externalRef);
      if (typeof externalRef.id === "string") traceIds.add(externalRef.id as string);
      const time = entry.time;
      expect(typeof time, `Trace entry ${String(entry.id)} has no virtual time.`).toBe("number");
      for (const id of [...traceIds, ...traceEventIds]) if (!firstSeenAt.has(id)) firstSeenAt.set(id, trace.indexOf(entry));
    }
    expect(trace.every((entry, index) => index === 0 || Number(entry.time) >= Number(trace[index - 1]?.time)), "Trace ordering is not monotonic.").toBe(true);

    const failures: string[] = [];
    for (const entry of trace) {
      const kind = typeof entry.kind === "string" ? entry.kind : "unknown";
      if (!transitionKinds.has(kind)) continue;
      const data = asRecord(entry.data);
      const causal = asRecord(data.causal);
      const parents = Array.isArray(causal.parentIds) ? causal.parentIds.filter((item): item is string => typeof item === "string") : [];
      const types = asRecord(causal.parentTypes);
      if (!Object.keys(causal).length) failures.push(`${kind}:${String(entry.id)} missing causal block`);
      if (!["observation", "event_fired", "decision", "intent", "plan_mutation"].includes(kind) && parents.length === 0) failures.push(`${kind}:${String(entry.id)} has no causal parent`);
      for (const parent of parents) {
        if (!traceIds.has(parent) && !traceEventIds.has(parent)) failures.push(`${kind}:${String(entry.id)} references missing parent ${parent}`);
        if (typeof types[parent] !== "string" || !parentTypes.has(types[parent] as string)) failures.push(`${kind}:${String(entry.id)} has untyped parent ${parent}`);
        if ((firstSeenAt.get(parent) ?? Infinity) > trace.indexOf(entry)) failures.push(`${kind}:${String(entry.id)} references a future cause ${parent}`);
      }
    }
    console.info(`[independent-causal-trace] ${JSON.stringify({ sessionId, records: trace.length, kinds: [...observedKinds], failures })}`);
    expect(failures, `Independent causal reconstruction failures: ${JSON.stringify(failures)}`).toEqual([]);
  });
});
