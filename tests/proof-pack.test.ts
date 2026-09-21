import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import { createProofPack } from "../.agents/skills/verify-app/scripts/proof-pack.mjs";

const execFileAsync = promisify(execFile);
const temporary: string[] = [];
const artifactSha = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

async function repo() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openpresence-proof-pack-"));
  temporary.push(root);
  await execFileAsync("git", ["init", "-q"], { cwd: root });
  await fs.writeFile(path.join(root, "runtime.ts"), "stable\n");
  await fs.writeFile(path.join(root, "docs.md"), "docs\n");
  await execFileAsync("git", ["add", "."], { cwd: root });
  await execFileAsync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"], { cwd: root });
  return root;
}

afterEach(async () => { await Promise.all(temporary.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("proof-pack", () => {
  it("keeps the pre-run candidate binding stable when declared generated evidence is written", async () => {
    const root = await repo();
    const contract = path.join(root, "contract.json");
    const evidence = path.join(root, "evidence.json");
    const definition = { id: "actual-run", runId: "r", traceId: "t", causalCone: ["runtime.ts"], artifacts: ["run.log"], gates: [{ id: "g" }] };
    await fs.writeFile(contract, JSON.stringify(definition));
    await fs.writeFile(evidence, "[]");
    const before = await createProofPack(root, { contract, evidence });
    await fs.writeFile(path.join(root, "run.log"), "Executed assertion passed\n");
    await fs.writeFile(evidence, JSON.stringify([{ gateId: "g", status: "PASS", candidateHash: before.candidate.hash, contractHash: before.contractHash, runId: "r", traceId: "t", artifactPath: "run.log", artifactSha256: artifactSha("Executed assertion passed\n") }]));
    const after = await createProofPack(root, { contract, evidence });
    expect(after.candidate.hash).toBe(before.candidate.hash);
    expect(after.status).toBe("PASS");
    await fs.writeFile(contract, JSON.stringify({ ...definition, artifacts: ["runtime.ts"] }));
    await expect(createProofPack(root, { contract, evidence })).rejects.toThrow(/cannot exclude causal-cone/);
  });
  it("binds evidence to the dirty candidate and distinguishes blocked from product failure", async () => {
    const root = await repo();
    await fs.writeFile(path.join(root, "runtime.ts"), "changed\n");
    const contract = path.join(root, "contract.json");
    const evidence = path.join(root, "evidence.json");
    await fs.writeFile(contract, JSON.stringify({ id: "recovery", goal: "resume", runId: "run-1", traceId: "trace-1", causalCone: ["runtime.ts"], gates: [
      { id: "failure", description: "failure persists" },
      { id: "resume", description: "same goal resumes" },
    ] }));
    await fs.writeFile(evidence, JSON.stringify([{ gateId: "failure", status: "PASS", candidateHash: "wrong", contractHash: "wrong", runId: "run-1", traceId: "trace-1", artifactPath: "runtime.ts", artifactSha256: artifactSha("changed\n") }]));
    const packet = await createProofPack(root, { contract, evidence });
    expect(packet.status).toBe("BLOCKED");
    expect(packet.gates.map((gate: { status: string }) => gate.status)).toEqual(["BLOCKED", "BLOCKED"]);

    await fs.writeFile(evidence, JSON.stringify([{ gateId: "failure", status: "FAIL", candidateHash: packet.candidate.hash, contractHash: packet.contractHash, runId: "run-1", traceId: "trace-1", artifactPath: "runtime.ts", artifactSha256: artifactSha("changed\n") }]));
    const failed = await createProofPack(root, { contract, evidence });
    expect(failed.status).toBe("FAIL");
  });

  it("reuses passing evidence only when the declared causal cone is unchanged", async () => {
    const root = await repo();
    const contract = path.join(root, "contract.json");
    const evidence = path.join(root, "evidence.json");
    await fs.writeFile(contract, JSON.stringify({ id: "ui", runId: "run-2", traceId: "trace-2", causalCone: ["runtime.ts"], gates: [{ id: "flow", description: "flow passes", oracle: "independent" }] }));
    await fs.writeFile(evidence, JSON.stringify([]));
    const seed = await createProofPack(root, { contract, evidence });
    await fs.writeFile(evidence, JSON.stringify([{ gateId: "flow", status: "PASS", oracle: "independent", candidateHash: seed.candidate.hash, contractHash: seed.contractHash, runId: "run-2", traceId: "trace-2", artifactPath: "runtime.ts", artifactSha256: artifactSha("stable\n") }]));
    const first = await createProofPack(root, { contract, evidence });
    await fs.writeFile(path.join(root, "docs.md"), "updated docs\n");
    const second = await createProofPack(root, { contract, reuseFrom: path.join(root, "first.json") });
    expect(second.status).toBe("BLOCKED");
    await fs.writeFile(path.join(root, "first.json"), JSON.stringify(first));
    const reused = await createProofPack(root, { contract, reuseFrom: path.join(root, "first.json") });
    expect(reused.status).toBe("PASS");
    expect(reused.reuse?.accepted).toBe(true);
    expect(reused.gates[0].oracle).toBe("independent");
  });

  it("requires contract and causal trace binding, and FAIL outranks PASS", async () => {
    const root = await repo();
    const contract = path.join(root, "contract.json");
    const evidence = path.join(root, "evidence.json");
    await fs.writeFile(contract, JSON.stringify({ id: "trace", runId: "r", traceId: "t", causalCone: ["runtime.ts"], gates: [{ id: "g", description: "g" }] }));
    await fs.writeFile(evidence, JSON.stringify([]));
    const seed = await createProofPack(root, { contract, evidence });
    await fs.writeFile(evidence, JSON.stringify([
      { gateId: "g", status: "PASS", candidateHash: seed.candidate.hash, contractHash: "wrong", runId: "r", traceId: "t", artifactPath: "runtime.ts", artifactSha256: artifactSha("stable\n") },
      { gateId: "g", status: "PASS", candidateHash: seed.candidate.hash, contractHash: seed.contractHash, runId: "wrong", traceId: "t", artifactPath: "runtime.ts", artifactSha256: artifactSha("stable\n") },
      { gateId: "g", status: "PASS", candidateHash: seed.candidate.hash, contractHash: seed.contractHash, runId: "r", traceId: "t", artifactPath: "runtime.ts", artifactSha256: artifactSha("stable\n") },
      { gateId: "g", status: "FAIL", candidateHash: seed.candidate.hash, contractHash: seed.contractHash, runId: "r", traceId: "t", artifactPath: "runtime.ts", artifactSha256: artifactSha("stable\n") },
    ]));
    const packet = await createProofPack(root, { contract, evidence });
    expect(packet.status).toBe("FAIL");
    expect(packet.gates[0].status).toBe("FAIL");
  });

  it("rejects empty evidence and validates artifact hashes", async () => {
    const root = await repo();
    const contract = path.join(root, "contract.json");
    const evidence = path.join(root, "evidence.json");
    await fs.writeFile(contract, JSON.stringify({ id: "artifact", runId: "r", traceId: "t", causalCone: ["runtime.ts"], gates: [{ id: "g", description: "g" }] }));
    await fs.writeFile(evidence, JSON.stringify([{ gateId: "g", status: "PASS", candidateHash: "x" }]));
    await expect(createProofPack(root, { contract, evidence })).rejects.toThrow(/needs artifactPath/);
    await fs.writeFile(evidence, JSON.stringify([{ gateId: "g", status: "PASS", artifactPath: "runtime.ts", artifactSha256: "wrong", candidateHash: "x" }]));
    await expect(createProofPack(root, { contract, evidence })).rejects.toThrow(/artifact hash mismatch/);
  });

  it("rejects an empty or unknown causal cone", async () => {
    const root = await repo();
    const contract = path.join(root, "contract.json");
    const evidence = path.join(root, "evidence.json");
    await fs.writeFile(evidence, "[]");
    await fs.writeFile(contract, JSON.stringify({ id: "empty", runId: "r", traceId: "t", causalCone: [], gates: [{ id: "g" }] }));
    await expect(createProofPack(root, { contract, evidence })).rejects.toThrow(/causalCone/);
    await fs.writeFile(contract, JSON.stringify({ id: "unknown", runId: "r", traceId: "t", causalCone: ["missing.ts"], gates: [{ id: "g" }] }));
    await expect(createProofPack(root, { contract, evidence })).rejects.toThrow(/not in the candidate/);
  });

  it("rejects duplicate, blank, and vacuous gate contracts", async () => {
    const root = await repo();
    const contract = path.join(root, "contract.json");
    const evidence = path.join(root, "evidence.json");
    await fs.writeFile(evidence, "[]");
    const base = { id: "shape", runId: "r", traceId: "t", causalCone: ["runtime.ts"] };
    await fs.writeFile(contract, JSON.stringify({ ...base, gates: [{ id: "g" }, { id: "g" }] }));
    await expect(createProofPack(root, { contract, evidence })).rejects.toThrow(/unique nonempty/);
    await fs.writeFile(contract, JSON.stringify({ ...base, gates: [{ id: " " }] }));
    await expect(createProofPack(root, { contract, evidence })).rejects.toThrow(/unique nonempty/);
    await fs.writeFile(contract, JSON.stringify({ ...base, gates: [{ id: "optional", required: false }] }));
    await expect(createProofPack(root, { contract, evidence })).rejects.toThrow(/required gate/);
  });

  it("does not accept forged reuse markers or noncanonical nested artifact paths", async () => {
    const root = await repo();
    const contract = path.join(root, "contract.json");
    const evidence = path.join(root, "evidence.json");
    await fs.writeFile(contract, JSON.stringify({ id: "trust", runId: "r", traceId: "t", causalCone: ["runtime.ts"], gates: [{ id: "g" }] }));
    await fs.writeFile(evidence, JSON.stringify([{ gateId: "g", status: "PASS", reusedFrom: "forged", candidateHash: "old", causalConeHash: "forged", contractHash: "forged", runId: "r", traceId: "t", artifactPath: "runtime.ts", artifactSha256: artifactSha("stable\n") }]));
    const forged = await createProofPack(root, { contract, evidence });
    expect(forged.status).toBe("BLOCKED");
    await fs.writeFile(evidence, JSON.stringify([{ gateId: "g", status: "PASS", __proofPackValidatedReuse: true, reusedFrom: "forged", candidateHash: "old", causalConeHash: forged.candidate.causalConeHash, contractHash: forged.contractHash, runId: "r", traceId: "t", artifactPath: "runtime.ts", artifactSha256: artifactSha("stable\n") }]));
    expect((await createProofPack(root, { contract, evidence })).status).toBe("BLOCKED");

    await fs.writeFile(evidence, JSON.stringify([{ gateId: "g", status: "PASS", candidateHash: "old", contractHash: "old", runId: "r", traceId: "t", artifactPath: "nested/../../runtime.ts", artifactSha256: artifactSha("stable\n") }]));
    await expect(createProofPack(root, { contract, evidence })).rejects.toThrow(/canonical repository-relative path/);
  });

  it("rejects a prior packet whose reused artifact path traverses a nested directory", async () => {
    const root = await repo();
    const contract = path.join(root, "contract.json");
    const evidence = path.join(root, "evidence.json");
    const priorPath = path.join(root, "prior.json");
    await fs.writeFile(contract, JSON.stringify({ id: "reuse-shape", runId: "r", traceId: "t", causalCone: ["runtime.ts"], gates: [{ id: "g" }] }));
    await fs.writeFile(evidence, "[]");
    const seed = await createProofPack(root, { contract, evidence });
    await fs.writeFile(evidence, JSON.stringify([{ gateId: "g", status: "PASS", candidateHash: seed.candidate.hash, contractHash: seed.contractHash, runId: "r", traceId: "t", artifactPath: "runtime.ts", artifactSha256: artifactSha("stable\n") }]));
    const prior = await createProofPack(root, { contract, evidence });
    prior.gates[0].artifactPath = "nested/../../runtime.ts";
    await fs.writeFile(priorPath, JSON.stringify(prior));
    const reused = await createProofPack(root, { contract, reuseFrom: priorPath });
    expect(reused.status).toBe("BLOCKED");
    expect(reused.reuse?.accepted).toBe(false);
  });
});
