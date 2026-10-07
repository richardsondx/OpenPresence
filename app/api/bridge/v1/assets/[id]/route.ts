import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { BRIDGE_IDENTITY_MAX_AGE_MS, bridgeFromRequest } from "@/lib/bridge";
import { readBridgeIdentityForExecutor, readStateForBridge } from "@/lib/db";
import { readAssetBytes } from "@/lib/asset-store";
import { assetIsEligibleForPresence, authorizeAssetSelection } from "@/lib/asset-library";
import { verifyExecutionPermit } from "@/lib/publication-security";
import { detectLibraryMedia } from "@/lib/asset-media";
import { chromeBrowserBridgeSupportsImageMimeType } from "@/lib/bridge-contract";

export const dynamic = "force-dynamic";

const normalizedHandle = (value: string | undefined) => (value ?? "").replace(/^@/, "").trim().toLowerCase();

/**
 * Serve the exact bytes of an already-authorized live asset to its owning
 * Bridge. The normal /api/assets route is RuntimeScope-cookie protected for
 * browser UI callers; this route is the deliberately narrower Bridge path.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const bridge = bridgeFromRequest(request);
  if (!bridge) return NextResponse.json({ error: "Bridge authentication failed." }, { status: 401 });
  const { id } = await context.params;
  const executorId = request.headers.get("x-openpresence-executor-id")?.trim();
  const state = readStateForBridge(bridge.id);
  const presence = state.presences.find((candidate) => candidate.id === bridge.presenceId) ?? state.presence;
  const identity = executorId ? readBridgeIdentityForExecutor(bridge.id, executorId) : undefined;
  const identityAgeMs = identity?.observedAt ? Date.now() - new Date(identity.observedAt).getTime() : Number.POSITIVE_INFINITY;
  const identityFresh = Number.isFinite(identityAgeMs) && identityAgeMs >= 0 && identityAgeMs <= BRIDGE_IDENTITY_MAX_AGE_MS;
  if (!identity || identity.status !== "verified" || !identityFresh || normalizedHandle(identity.username) !== normalizedHandle(presence?.handle)) {
    return NextResponse.json({ error: "The Bridge account must be verified before retrieving an Asset." }, { status: 409 });
  }
  const asset = state.assets.find((candidate) => candidate.id === id);

  if (!asset || !assetIsEligibleForPresence(state, asset, bridge.presenceId)) {
    return NextResponse.json({ error: "Stored asset not found." }, { status: 404 });
  }
  const mimeType = (asset.storage?.mimeType ?? asset.mimeType ?? "").split(";", 1)[0]!.trim().toLowerCase();
  if (!chromeBrowserBridgeSupportsImageMimeType(mimeType)) {
    return NextResponse.json({ error: "The Chrome X Bridge supports PNG, JPEG, and GIF images only." }, { status: 415 });
  }

  const executionId = request.headers.get("x-openpresence-execution-id")?.trim();
  if (!executionId) return NextResponse.json({ error: "An active approved execution ID is required to retrieve publication media." }, { status: 409 });
  let exactMediaApproval = false;
  if (executionId) {
    const execution = state.executions.find(candidate => candidate.id === executionId && candidate.bridgeId === bridge.id && candidate.presenceId === bridge.presenceId && candidate.environment === "live");
    const lease = execution?.lease;
    if (!execution || !lease || !["claimed", "executing"].includes(execution.status) || lease.executorId !== executorId || !(Date.parse(lease.expiresAt) > Date.now())
      || !execution.publication?.assetIds.includes(asset.id) || !execution.publication.publicExpression?.mediaIds.includes(asset.id)) {
      return NextResponse.json({ error: "The Asset request does not belong to this executor’s active publication." }, { status: 409 });
    }
    try { verifyExecutionPermit(execution); }
    catch { return NextResponse.json({ error: "The active publication has no valid sealed execution permit." }, { status: 409 }); }
    const approval = execution.publication.operatorAssetApproval;
    if (approval?.assetHashes && approval.assetHashes[asset.id] !== (asset.storage?.exactHash ?? asset.checksum)) {
      return NextResponse.json({ error: "The selected image changed after approval and needs fresh review." }, { status: 409 });
    }
    exactMediaApproval = Boolean(approval && approval.assetIds.length === execution.publication.assetIds.length && execution.publication.assetIds.every(assetId => approval.assetIds.includes(assetId)));
  }

  try {
    // Repeat the same readiness and publication authorization used at claim
    // time. A Bridge cannot turn an observed or unresolved asset into a live
    // upload by guessing its ID.
    authorizeAssetSelection(state, [asset.id], { presenceId: bridge.presenceId, requireReady: !exactMediaApproval, allowReviewable: exactMediaApproval });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The selected Asset is not authorized for publication." }, { status: 409 });
  }

  const storeKey = asset.storage?.storeKey ?? asset.storagePath;
  const expectedHash = asset.storage?.exactHash ?? asset.checksum;
  if (!storeKey || !expectedHash) return NextResponse.json({ error: "The selected Asset has no immutable stored bytes." }, { status: 404 });

  try {
    const bytes = await readAssetBytes(storeKey);
    const actualHash = crypto.createHash("sha256").update(bytes).digest("hex");
    if (actualHash !== expectedHash) return NextResponse.json({ error: "The selected Asset bytes failed integrity verification." }, { status: 409 });
    const detected = detectLibraryMedia(storeKey, mimeType, bytes);
    if (!detected || !["image", "gif"].includes(detected.mediaKind) || detected.mimeType !== mimeType) return NextResponse.json({ error: "The selected Asset bytes are not a supported still image." }, { status: 415 });
    const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/", 2)[1] ?? "img";
    const safeName = `${asset.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.${extension}`;
    return new NextResponse(bytes as BodyInit, {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename="${safeName}"`,
        // Authorization is evaluated for every request. Do not let a browser
        // or intermediary replay bytes after an Asset is revoked or re-scoped.
        "Cache-Control": "private, no-store",
        "X-Content-Sha256": actualHash,
      },
    });
  } catch {
    return NextResponse.json({ error: "Stored asset is unavailable." }, { status: 404 });
  }
}
