import { z } from "zod";
import { verifyExecutionPermit } from "./publication-security";
import type { Bridge, Execution } from "./types";

const id = z.string().min(1).max(240);
const time = z.string().datetime();
/** Evidence from the controlled website transport, never from post prose or model output. */
export const browserDeliveryProofSchema = z.object({
  version: z.literal(1), source: z.literal("x_website_response"), readback: z.literal(true),
  executionId: id, bridgeId: id, presenceId: id, executorId: id, permitNonce: id,
  observedAt: time, createdPostId: z.string().regex(/^\d+$/).max(240),
  post: z.object({ externalRef: z.object({ type: z.literal("x.post"), id: z.string().regex(/^\d+$/).max(240) }),
    permalink: z.string().url().max(4000), authorHandle: z.string().min(1).max(160), text: z.string().max(100000),
    createdAt: time, parentId: id.optional(), quotedTargetId: id.optional(), mediaIds: z.array(id).max(8) }),
  uploads: z.array(z.object({ assetId: id, sha256: z.string().regex(/^[a-f0-9]{64}$/), platformMediaId: id,
    executionId: id, permitNonce: id, uploadedAt: time })).max(8),
});
export type BrowserDeliveryProof = z.infer<typeof browserDeliveryProofSchema>;
export interface BrowserDeliveryProofContext {
  execution: Execution; bridge: Bridge; executorId: string; expectedHandle: string;
  /** Executor-specific identity read by the server, not an assertion from this proof. */
  identity: { username?: string; status: string; observedAt: string } | undefined;
  /** Persisted original claim time; verification may have released the lease. */
  claimedAt: string;
  assetHashes: Record<string, string>;
  /** Current canonical storage hashes must still equal the persisted claim snapshot. */
  currentAssetHashes: Record<string, string>;
  /** Remote objects already attributed to a different execution. */
  previouslyAttributedPostIds?: string[];
  now?: number;
}
const handle = (value: string | undefined) => value?.trim().replace(/^@/, "").toLowerCase();
const same = (left: string[], right: string[]) => left.length === right.length && left.every((value, index) => value === right[index]);
export type BrowserDeliveryProofResult = { verified: true; proof: BrowserDeliveryProof } | { verified: false; reason: string };

/** Pure read-only verifier. This authenticates evidence, never authorizes another write. */
export function verifyBrowserDeliveryProof(input: unknown, context: BrowserDeliveryProofContext): BrowserDeliveryProofResult {
  const fail = (reason: string): BrowserDeliveryProofResult => ({ verified: false, reason });
  const parsed = browserDeliveryProofSchema.safeParse(input);
  if (!parsed.success) return fail("Malformed website read-back proof");
  const proof = parsed.data;
  const { execution, bridge, identity } = context;
  const now = context.now ?? Date.now();
  const expected = handle(context.expectedHandle);
  if (!expected || !/^[a-z0-9_]{1,15}$/.test(expected) || identity?.status !== "verified" || handle(identity.username) !== expected
    || !Number.isFinite(Date.parse(identity.observedAt)) || Date.parse(identity.observedAt) > now || now - Date.parse(identity.observedAt) > 1800000) return fail("Fresh executor account identity is required");
  if (bridge.state === "offline" || bridge.channelId !== "x" || execution.environment !== "live" || (execution.sessionId && execution.sessionId !== `live:${execution.presenceId}`)
    || execution.connector !== "bridge" || execution.bridgeId !== bridge.id || execution.presenceId !== bridge.presenceId
    || proof.bridgeId !== bridge.id || proof.presenceId !== execution.presenceId || proof.executionId !== execution.id
    || proof.executorId !== context.executorId || (execution.lease && execution.lease.executorId !== context.executorId)
    || !["claimed", "verification-pending", "failed"].includes(execution.status)
    || (execution.status === "failed" && !["RESULT_NOT_VERIFIED", "X_API_VERIFICATION_PENDING"].includes(execution.failure?.code ?? ""))) return fail("Claim scope does not match the website proof");
  let permit;
  // A read-back can arrive after the short write permit expires. Signature,
  // immutable expression and original write interval remain mandatory.
  try { permit = verifyExecutionPermit(execution, undefined, { allowExpiredForPreWriteRetry: true }); } catch { return fail("Signed sealed publication does not match"); }
  if (proof.permitNonce !== permit.nonce) return fail("Receipt belongs to another delivery permit");
  const claimedAt = Date.parse(context.claimedAt);
  const issuedAt = Date.parse(permit.issuedAt);
  const expiresAt = Date.parse(permit.expiresAt);
  const observedAt = Date.parse(proof.observedAt);
  const createdAt = Date.parse(proof.post.createdAt);
  if (![claimedAt, issuedAt, expiresAt, observedAt, createdAt].every(Number.isFinite) || claimedAt < issuedAt - 1000 || claimedAt >= expiresAt
    || observedAt > now || now - observedAt > 300000 || observedAt < claimedAt
    || createdAt < Math.max(claimedAt, issuedAt) - 1000 || createdAt > expiresAt || createdAt > observedAt) return fail("Read-back or post creation is outside the delivery interval");
  if (proof.createdPostId !== proof.post.externalRef.id || context.previouslyAttributedPostIds?.includes(proof.post.externalRef.id)
    || (execution.externalRef && (!(["x.post", "x.reply", "x.quote"].includes(execution.externalRef.type)) || execution.externalRef.id !== proof.post.externalRef.id))) return fail("Created object identity is mismatched or replayed");
  const url = new URL(proof.post.permalink);
  if (url.protocol !== "https:" || !["x.com", "www.x.com"].includes(url.hostname.toLowerCase()) || url.username || url.password || url.port
    || url.pathname !== `/${expected}/status/${proof.post.externalRef.id}` || handle(proof.post.authorHandle) !== expected) return fail("Public permalink or author does not match the account");
  const expression = execution.publication!.publicExpression!;
  const payload = execution.publication!.payload;
  if (expression.socialIntentId !== execution.socialIntentId || expression.presenceId !== execution.presenceId || expression.environment !== "live"
    || expression.affordance !== execution.affordance || expression.channel !== "x"
    || !payload || typeof payload !== "object" || Array.isArray(payload) || payload.text !== expression.text) return fail("Sealed expression scope or publication payload changed");
  if (proof.post.text !== expression.text) return fail("Public text differs from the sealed expression");
  const action = execution.affordance;
  if (action === "x.post") {
    if (proof.post.parentId || proof.post.quotedTargetId) return fail("Original post unexpectedly has a reply or quote target");
  } else if (action === "x.reply" || action === "x.quote") {
    if (execution.target?.type !== "x.post" || !execution.target.id
      || (action === "x.reply" ? proof.post.parentId !== execution.target.id || Boolean(proof.post.quotedTargetId) : proof.post.quotedTargetId !== execution.target.id || Boolean(proof.post.parentId))) return fail("Public reply or quote lineage differs from the exact target");
  } else return fail("Unsupported publication action");
  const assets = execution.publication!.assetIds;
  if (!same(assets, expression.mediaIds) || proof.uploads.length !== assets.length || proof.post.mediaIds.length !== assets.length
    || new Set(assets).size !== assets.length || new Set(proof.post.mediaIds).size !== assets.length) return fail("Public media shape differs from the sealed expression");
  for (let index = 0; index < assets.length; index++) {
    const upload = proof.uploads[index];
    const assetId = assets[index];
    const approval = execution.publication!.operatorAssetApproval;
    const uploadTime = Date.parse(upload.uploadedAt);
    if (upload.assetId !== assetId || upload.executionId !== execution.id || upload.permitNonce !== permit.nonce
      || upload.platformMediaId !== proof.post.mediaIds[index] || !context.assetHashes[assetId]
      || upload.sha256 !== context.assetHashes[assetId] || context.currentAssetHashes[assetId] !== upload.sha256
      || (approval && (!approval.assetIds.includes(assetId) || approval.assetHashes?.[assetId] !== upload.sha256))
      || !Number.isFinite(uploadTime) || uploadTime < claimedAt || uploadTime > expiresAt || uploadTime > createdAt + 1000) return fail("Uploaded bytes and public platform media identity are not bound to the exact approved asset");
  }
  return { verified: true, proof };
}
