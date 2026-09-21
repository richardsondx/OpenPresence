import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const generatedMetadata = new Set(["next-env.d.ts"]);

function canonicalRepoRelativePath(repoRoot, value, label) {
  if (typeof value !== "string" || !value || path.isAbsolute(value) || value.includes("\\") || path.normalize(value) !== value) {
    throw new Error(`${label} must be a canonical repository-relative path: ${value ?? ""}`);
  }
  const resolved = path.resolve(repoRoot, value);
  const relative = path.relative(repoRoot, resolved);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || relative !== value) {
    throw new Error(`${label} must be a canonical repository-relative path: ${value}`);
  }
  return value;
}

function candidateHash(candidateValue) {
  const { hash: _hash, causalCone: _cone, contractHash: _contractHash, causalConeHash: _coneHash, ...manifest } = candidateValue ?? {};
  return sha256(JSON.stringify(manifest));
}

async function git(repoRoot, args) {
  const { stdout } = await execFileAsync("git", args, { cwd: repoRoot, maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}

async function candidate(repoRoot, excluded = []) {
  const head = (await git(repoRoot, ["rev-parse", "HEAD"])).trim();
  const rawStatus = await git(repoRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
  const listed = (await git(repoRoot, ["ls-files", "-co", "--exclude-standard", "-z"]))
    .split("\0").filter(Boolean);
  const excludedSet = new Set(excluded.map((file) => path.relative(repoRoot, path.resolve(repoRoot, file))));
  const tracked = (await git(repoRoot, ["ls-files", "-z"])).split("\0").filter(Boolean);
  const selected = [...new Set([...listed, ...tracked])].filter((file) => !generatedMetadata.has(file) && !excludedSet.has(file));
  const files = [];
  for (const relative of selected.sort()) {
    const absolute = path.join(repoRoot, relative);
    try {
      const stat = await fsp.stat(absolute);
      if (!stat.isFile()) continue;
      const content = await fsp.readFile(absolute);
      files.push({ path: relative, bytes: content.byteLength, sha256: sha256(content) });
    } catch (error) {
      if (error?.code === "ENOENT" && tracked.includes(relative)) files.push({ path: relative, deleted: true, sha256: null });
      else throw new Error(`Unable to hash candidate file '${relative}': ${error.message}`);
    }
  }
  const generated = listed.filter((file) => generatedMetadata.has(file));
  const excludedStatus = rawStatus.split("\n").filter((line) => ![...excludedSet, ...generatedMetadata].some((file) => line.endsWith(file))).join("\n");
  const manifest = { head, status: excludedStatus, files, generatedMetadata: generated, excluded: [...excludedSet].sort() };
  return { ...manifest, hash: sha256(JSON.stringify(manifest)) };
}

function coneHash(candidateValue, cone) {
  const files = new Map((candidateValue?.files ?? []).map((file) => [file.path, file]));
  return sha256(JSON.stringify([...cone].sort().map((file) => ({ path: file, content: files.get(file)?.sha256 ?? null, deleted: files.get(file)?.deleted ?? false }))));
}

function changedPaths(previous, current) {
  const before = new Map((previous?.files ?? []).map((file) => [file.path, file.sha256]));
  const after = new Map((current?.files ?? []).map((file) => [file.path, file.sha256]));
  return [...new Set([...before.keys(), ...after.keys()])].filter((file) => before.get(file) !== after.get(file)).sort();
}

function validateGateEvidence(contract, evidence, currentCandidate, reusable = []) {
  const allowed = new Set(["PASS", "FAIL", "BLOCKED"]);
  const byGate = new Map();
  const validatedReuse = new Set(reusable);
  for (const item of [...evidence, ...reusable]) {
    if (!item || typeof item.gateId !== "string" || !allowed.has(item.status)) continue;
    const exact = !validatedReuse.has(item) && !item.reusedFrom
      && item.candidateHash === currentCandidate.hash && item.contractHash === currentCandidate.contractHash;
    const reused = validatedReuse.has(item)
      && item.reusedFrom && item.causalConeHash === currentCandidate.causalConeHash && item.contractHash === currentCandidate.contractHash;
    if (!exact && !reused) continue;
    if (item.runId !== contract.runId || item.traceId !== contract.traceId) continue;
    const gate = contract.gates.find((entry) => entry.id === item.gateId);
    if (!gate || (gate.oracle === "independent" && item.oracle !== "independent")) continue;
    const existing = byGate.get(item.gateId);
    const rank = { PASS: 1, BLOCKED: 2, FAIL: 3 };
    if (!existing || rank[item.status] > rank[existing.status]) byGate.set(item.gateId, item);
  }
  const gates = contract.gates.map((gate) => {
    const result = byGate.get(gate.id);
    return { ...gate, status: result?.status ?? "BLOCKED", evidence: result?.evidence ?? null, artifactPath: result?.artifactPath ?? null, artifactSha256: result?.artifactSha256 ?? null, source: result?.source ?? "current", runId: result?.runId ?? null, traceId: result?.traceId ?? null, oracle: result?.oracle ?? gate.oracle ?? null };
  });
  const required = gates.filter((gate) => gate.required !== false);
  const status = required.some((gate) => gate.status === "FAIL")
    ? "FAIL"
    : required.every((gate) => gate.status === "PASS") ? "PASS" : "BLOCKED";
  return { status, gates };
}

export async function createProofPack(repoRoot, options) {
  const contractPath = path.resolve(options.contract);
  const contract = JSON.parse(await fsp.readFile(contractPath, "utf8"));
  if (!contract.id || !Array.isArray(contract.gates) || !contract.gates.length || !contract.runId || !contract.traceId) throw new Error("Contract must contain id, runId, traceId, and at least one gate.");
  const gateIds = contract.gates.map((gate) => gate?.id);
  if (gateIds.some((id) => typeof id !== "string" || !id.trim()) || new Set(gateIds).size !== gateIds.length) {
    throw new Error("Contract gates must have unique nonempty IDs.");
  }
  if (!contract.gates.some((gate) => gate.required !== false)) throw new Error("Contract must contain at least one required gate.");
  const coneValues = Array.isArray(contract.causalCone) ? contract.causalCone : [];
  if (!coneValues.length) throw new Error("Contract causalCone must contain at least one repository-relative path.");
  const cone = [...new Set(coneValues.map((file) => canonicalRepoRelativePath(repoRoot, file, "Contract causalCone entry")))];
  const artifacts = (contract.artifacts ?? []).map((file) => canonicalRepoRelativePath(repoRoot, file, "Contract artifact"));
  if (artifacts.some((file) => cone.includes(file))) throw new Error("Generated artifacts cannot exclude causal-cone source files.");
  const metadataPaths = [contractPath, options.evidence, options.out, ...artifacts].filter(Boolean);
  const current = await candidate(repoRoot, metadataPaths);
  current.causalCone = cone;
  current.contractHash = sha256(JSON.stringify(contract));
  const candidatePaths = new Set(current.files.map((file) => file.path));
  for (const file of cone) if (!candidatePaths.has(file)) throw new Error(`Contract causalCone path is not in the candidate: ${file}`);
  current.causalConeHash = coneHash(current, cone);
  const evidence = options.evidence ? JSON.parse(await fsp.readFile(path.resolve(options.evidence), "utf8")) : [];
  if (!Array.isArray(evidence)) throw new Error("Evidence must be a JSON array.");
  for (const item of evidence) {
    if (!item?.artifactPath || !item?.artifactSha256) throw new Error(`Evidence for gate '${item?.gateId ?? "unknown"}' needs artifactPath and artifactSha256.`);
    if (item.artifactPath) {
      canonicalRepoRelativePath(repoRoot, item.artifactPath, "Evidence artifact");
      const artifact = path.resolve(repoRoot, item.artifactPath);
      const bytes = await fsp.readFile(artifact);
      if (item.artifactSha256 !== sha256(bytes)) throw new Error(`Evidence artifact hash mismatch: ${item.artifactPath}`);
    }
  }
  let reusable = [];
  let reuse = null;
  const reuseFrom = options.reuseFrom ?? options["reuse-from"];
  if (reuseFrom) {
    const priorPath = path.resolve(reuseFrom);
    let prior;
    try { prior = JSON.parse(await fsp.readFile(priorPath, "utf8")); }
    catch { prior = undefined; }
    const validPriorPacket = prior?.schemaVersion === 1
      && prior.packetType === "openpresence-proof-pack"
      && prior.status === "PASS"
      && prior.contract?.id === contract.id
      && prior.contract?.runId === contract.runId
      && prior.contract?.traceId === contract.traceId
      && prior.candidate?.hash === candidateHash(prior.candidate)
      && Array.isArray(prior.gates)
      && prior.gates.some((gate) => gate.status === "PASS");
    if (!validPriorPacket || prior.contractHash !== current.contractHash) {
      reuse = { accepted: false, priorCandidate: prior?.candidate?.hash ?? null, changedPaths: [], reason: "prior packet missing, unreadable, or contract binding changed" };
    } else {
    const priorChanged = changedPaths(prior.candidate, current);
    const outsideCone = priorChanged.filter((file) => !cone.includes(file));
    if (prior.candidate?.causalConeHash === current.causalConeHash && outsideCone.length === priorChanged.length) {
      const priorPasses = (prior.gates ?? []).filter((gate) => gate.status === "PASS");
      let reuseArtifactFailure = false;
      for (const gate of priorPasses) {
        if (!gate.artifactPath || !gate.artifactSha256) { reuseArtifactFailure = true; continue; }
        try { canonicalRepoRelativePath(repoRoot, gate.artifactPath, "Reused evidence artifact"); }
        catch { reuseArtifactFailure = true; continue; }
        let bytes;
        try { bytes = await fsp.readFile(path.resolve(repoRoot, gate.artifactPath)); } catch { reuseArtifactFailure = true; continue; }
        if (sha256(bytes) !== gate.artifactSha256) { reuseArtifactFailure = true; continue; }
        reusable.push({
        gateId: gate.id, status: gate.status, evidence: gate.evidence, artifactPath: gate.artifactPath, artifactSha256: gate.artifactSha256, source: `reused:${prior.candidate.hash}`,
          candidateHash: prior.candidate.hash, causalConeHash: current.causalConeHash, contractHash: current.contractHash,
          reusedFrom: prior.candidate.hash, runId: contract.runId, traceId: contract.traceId, oracle: gate.oracle,
        });
      }
      reuse = { accepted: !reuseArtifactFailure, priorCandidate: prior.candidate.hash, changedPaths: priorChanged, reason: reuseArtifactFailure ? "prior artifact missing or changed" : "causal cone unchanged" };
    } else {
      reuse = { accepted: false, priorCandidate: prior.candidate?.hash ?? null, changedPaths: priorChanged, reason: "causal cone changed or prior packet missing binding" };
    }
    }
  }
  const result = validateGateEvidence(contract, evidence, current, reusable);
  const packet = {
    schemaVersion: 1,
    packetType: "openpresence-proof-pack",
    contract: { id: contract.id, goal: contract.goal ?? null, runId: contract.runId, traceId: contract.traceId, causalCone: cone, causalConeHash: current.causalConeHash },
    contractHash: current.contractHash,
    candidate: current,
    ...result,
    reuse,
    generatedAt: new Date().toISOString(),
  };
  if (options.out) {
    const outputPath = path.resolve(options.out);
    await fsp.mkdir(path.dirname(outputPath), { recursive: true });
    await fsp.writeFile(outputPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
    packet.path = outputPath;
  }
  return packet;
}

export { candidate, coneHash };
