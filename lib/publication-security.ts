import type { AgentModelProfile, Execution, ExecutionPermit, OpenPresenceState, Presence, PublicExpression, PublicExpressionArtifactKind } from "./types";
import { assertLiveWriteRuntimeAllowed, isAiMockEnabled, isTestRuntime } from "./test-runtime";
import { publicExpressionLeakageReason } from "./public-expression";

type NodeCryptoModule = {
  randomUUID: () => string;
  randomBytes: (size: number) => { toString: (encoding: string) => string };
  createHash: (...args: unknown[]) => { update: (value: string) => { digest: (encoding: string) => string } };
  createHmac: (...args: unknown[]) => { update: (value: string) => { digest: (encoding: string) => string } };
};
const nodeCrypto: NodeCryptoModule | undefined = typeof process !== "undefined" && typeof process.getBuiltinModule === "function" ? process.getBuiltinModule("crypto") as NodeCryptoModule : undefined;

function securityCrypto() {
  if (!nodeCrypto) throw new Error("Publication security is only available in the server runtime.");
  return nodeCrypto;
}

function randomId() {
  return nodeCrypto?.randomUUID?.() ?? globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class PublicationSecurityError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "PublicationSecurityError";
    this.code = code;
  }
}

const signingKey = process.env.OPENPRESENCE_PUBLICATION_SIGNING_KEY || (nodeCrypto ? nodeCrypto.randomBytes(32).toString("hex") : "browser-preview-key");
const usedPermitNonces = new Set<string>();

function canonical(value: unknown) {
  return JSON.stringify(value);
}

export function publicExpressionHash(expression: PublicExpression) {
  return securityCrypto().createHash("sha256").update(canonical({
    id: expression.id,
    agentId: expression.agentId,
    presenceId: expression.presenceId,
    environment: expression.environment,
    socialIntentId: expression.socialIntentId,
    channel: expression.channel,
    affordance: expression.affordance,
    text: expression.text,
    mediaIds: expression.mediaIds,
    provenance: expression.provenance,
  })).digest("hex");
}

function signatureFor(permit: Omit<ExecutionPermit, "signature">) {
  return securityCrypto().createHmac("sha256", signingKey).update(canonical(permit)).digest("hex");
}

export function createPublicExpressionCandidate(input: {
  state: OpenPresenceState;
  presence: Presence;
  affordance: string;
  text: string;
  format?: string;
  socialIntentId?: string;
  source?: "agent_model" | "operator_manual" | "operational";
  mediaIds?: string[];
}) {
  const profile: AgentModelProfile | undefined = input.state.modelProfiles.find((item) => item.agentId === input.state.agent?.id);
  const modelMode = isTestRuntime() || isAiMockEnabled() ? "test_stub" : "real";
  const artifactKind: PublicExpressionArtifactKind = modelMode === "test_stub" ? "test_stub" : input.source ?? "operational";
  return {
    id: `public-expression:${randomId()}`,
    agentId: input.state.agent?.id ?? "",
    presenceId: input.presence.id,
    environment: input.presence.environment ?? "live",
    socialIntentId: input.socialIntentId ?? "pending",
    channel: input.presence.channel,
    affordance: input.affordance,
    text: input.text.trim(),
    mediaIds: [...(input.mediaIds ?? [])],
    provenance: {
      cognitionPurpose: "public_expression" as const,
      artifactKind,
      modelMode,
      provider: profile?.provider ?? "unknown",
      model: profile?.model ?? "unknown",
      expressionRunId: `expression-run:${randomId()}`,
    },
    safetyStatus: "candidate" as const,
    createdAt: new Date().toISOString(),
  } satisfies PublicExpression;
}

function publicationFor(execution: Execution) {
  const publication = execution.publication;
  if (!publication?.publicExpression) throw new PublicationSecurityError("INVALID_PROVENANCE", "Execution has no Public Expression artifact.");
  return publication;
}

export function sealExecutionForDelivery(execution: Execution) {
  if (execution.environment !== "live") throw new PublicationSecurityError("EXECUTION_SCOPE_MISMATCH", "Only live executions may receive a live execution permit.");
  if (!execution.connector || !["native", "bridge"].includes(execution.connector)) throw new PublicationSecurityError("INVALID_CONNECTOR", "A live permit requires an isolated native or Bridge writer.");
  try {
    assertLiveWriteRuntimeAllowed();
  } catch (error) {
    throw new PublicationSecurityError(
      "LIVE_WRITE_BLOCKED_NON_PRODUCTION_RUNTIME",
      error instanceof Error ? error.message : "Live channel writes require a real runtime outside test mode and AI mock mode.",
    );
  }
  const publication = publicationFor(execution);
  const candidate = publication.publicExpression!;
  if (candidate.environment !== "live" || candidate.presenceId !== execution.presenceId || candidate.socialIntentId !== execution.socialIntentId) {
    throw new PublicationSecurityError("INVALID_PROVENANCE", "Public Expression scope does not match the execution.");
  }
  if (candidate.safetyStatus !== "candidate") throw new PublicationSecurityError("INVALID_PROVENANCE", "Public Expression is not a fresh candidate.");
  const modelExpression = candidate.provenance.artifactKind === "agent_model" && candidate.provenance.modelMode === "real";
  const explicitOperatorExpression = candidate.provenance.artifactKind === "operator_manual" && candidate.provenance.modelMode === "real" && execution.source === "operator";
  if (candidate.provenance.cognitionPurpose !== "public_expression" || (!modelExpression && !explicitOperatorExpression)) {
    throw new PublicationSecurityError("INVALID_PROVENANCE", "Only real public-expression output or an explicitly operator-authored action may cross the live publication boundary.");
  }
  const text = publication.payload && typeof publication.payload === "object" && "text" in publication.payload && typeof publication.payload.text === "string" ? publication.payload.text.trim() : "";
  if (!text || text !== candidate.text) throw new PublicationSecurityError("PAYLOAD_MISMATCH", "The sealed expression does not match the publication payload.");
  const publicExpressionReason = publicExpressionLeakageReason(text);
  if (publicExpressionReason) throw new PublicationSecurityError("PUBLIC_TEXT_INTERNAL_MARKER", publicExpressionReason);
  const payloadHash = publicExpressionHash({ ...candidate, text, safetyStatus: "sealed" });
  const sealed: PublicExpression = { ...candidate, text, safetyStatus: "sealed", payloadHash };
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const unsigned: Omit<ExecutionPermit, "signature"> = { executionId: execution.id, publicExpressionId: sealed.id, presenceId: execution.presenceId, environment: "live", channel: sealed.channel, affordance: execution.affordance, payloadHash, issuedAt, expiresAt, nonce: randomId() };
  const permit: ExecutionPermit = { ...unsigned, signature: signatureFor(unsigned) };
  execution.publication = { ...publication, publicExpression: sealed };
  execution.permit = permit;
  return { expression: sealed, permit };
}

export function verifyExecutionPermit(execution: Execution, expression: PublicExpression = execution.publication?.publicExpression as PublicExpression) {
  const permit = execution.permit;
  if (!permit || !expression) throw new PublicationSecurityError("MISSING_PERMIT", "Live writer requires a signed execution permit and sealed Public Expression.");
  const publicExpressionReason = publicExpressionLeakageReason(expression.text);
  if (publicExpressionReason) throw new PublicationSecurityError("PUBLIC_TEXT_INTERNAL_MARKER", publicExpressionReason);
  if (expression.safetyStatus !== "sealed" || !expression.payloadHash || publicExpressionHash(expression) !== expression.payloadHash) throw new PublicationSecurityError("PAYLOAD_MUTATION", "Public Expression hash does not match its sealed payload.");
  if (permit.executionId !== execution.id || permit.publicExpressionId !== expression.id || permit.presenceId !== execution.presenceId || permit.environment !== "live" || permit.channel !== expression.channel || permit.affordance !== execution.affordance || permit.payloadHash !== expression.payloadHash) throw new PublicationSecurityError("PERMIT_SCOPE_MISMATCH", "Execution permit scope does not match the sealed publication.");
  if (new Date(permit.expiresAt).getTime() <= Date.now()) throw new PublicationSecurityError("EXPIRED_PERMIT", "Execution permit has expired.");
  const { signature, ...unsigned } = permit;
  if (signature !== signatureFor(unsigned)) throw new PublicationSecurityError("INVALID_PERMIT", "Execution permit signature is invalid.");
  return permit;
}

export function consumeExecutionPermit(execution: Execution, expression: PublicExpression) {
  const permit = verifyExecutionPermit(execution, expression);
  if (usedPermitNonces.has(permit.nonce)) throw new PublicationSecurityError("REPLAYED_PERMIT", "Execution permit has already been consumed.");
  usedPermitNonces.add(permit.nonce);
  return permit;
}
