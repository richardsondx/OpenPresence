export interface CandidateManifest {
  head: string;
  status: string;
  files: Array<{ path: string; bytes?: number; sha256: string | null; deleted?: boolean }>;
  generatedMetadata: string[];
  excluded: string[];
  hash: string;
  causalCone?: string[];
  contractHash?: string;
  causalConeHash?: string;
}
export interface ProofPacket {
  schemaVersion: number;
  packetType: string;
  contractHash: string;
  candidate: CandidateManifest;
  status: "PASS" | "FAIL" | "BLOCKED";
  gates: Array<{ id: string; status: string; [key: string]: unknown }>;
  reuse: { accepted: boolean; priorCandidate: string | null; changedPaths: string[]; reason: string } | null;
  path?: string;
  generatedAt: string;
}
export function createProofPack(repoRoot: string, options: {
  contract: string;
  evidence?: string;
  reuseFrom?: string;
  out?: string;
}): Promise<ProofPacket>;
export function candidate(repoRoot: string, excluded?: string[]): Promise<CandidateManifest>;
export function coneHash(candidate: CandidateManifest, cone: string[]): string;
