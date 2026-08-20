import crypto from "node:crypto";
import type { Execution, MirrorObject, OperationalRun } from "./types";

export interface ActionFingerprint {
  presenceId: string;
  actionType: string;
  parentExternalId?: string;
  payloadHash: string;
  normalizedText?: string;
  mediaHash?: string;
  windowStart: string;
  windowEnd: string;
}

export function normalizePayloadText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function computePayloadHash(text: string): string {
  return crypto.createHash("sha256").update(normalizePayloadText(text)).digest("hex").slice(0, 16);
}

export function buildActionFingerprint(input: {
  presenceId: string;
  actionType: string;
  parentExternalId?: string;
  text?: string;
  mediaHash?: string;
  createdAt: string;
  windowMinutes?: number;
}): ActionFingerprint {
  const windowMinutes = input.windowMinutes ?? 15;
  const createdMs = new Date(input.createdAt).getTime();
  const windowMs = windowMinutes * 60 * 1000;
  const normalizedText = input.text ? normalizePayloadText(input.text) : undefined;
  const payloadHash = normalizedText ? computePayloadHash(normalizedText) : "no_text";

  return {
    presenceId: input.presenceId,
    actionType: input.actionType,
    parentExternalId: input.parentExternalId,
    payloadHash,
    normalizedText,
    mediaHash: input.mediaHash,
    windowStart: new Date(createdMs - windowMs).toISOString(),
    windowEnd: new Date(createdMs + windowMs).toISOString(),
  };
}

export type ReconciliationOutcome =
  | { status: "verified"; externalId: string; matchedMirrorObjectId?: string }
  | { status: "safe_to_retry"; reason: string }
  | { status: "reconciling"; reason: string }
  | { status: "needs_operator"; reason: string };

/**
 * Deterministically reconcile an uncertain public write against the Social Mirror and external reality.
 * 
 * Hard Invariant: A delivery_uncertain run is NEVER blindly retried without prior external confirmation.
 */
export function reconcileUncertainDelivery(input: {
  run: OperationalRun;
  execution: Execution;
  mirrorObjects: MirrorObject[];
  now?: Date;
  observerHealthy?: boolean;
}): ReconciliationOutcome {
  const { run, execution, mirrorObjects } = input;
  const now = input.now ?? new Date();
  const publicationPayload = execution.publication?.payload;
  const payloadText = publicationPayload && typeof publicationPayload === "object" && !Array.isArray(publicationPayload) && typeof publicationPayload.text === "string"
    ? publicationPayload.text
    : undefined;
  const text = execution.publication?.publicExpression?.text ?? payloadText ?? "";
  const fingerprint = buildActionFingerprint({
    presenceId: run.presenceId,
    actionType: execution.affordance,
    parentExternalId: execution.target?.id,
    text,
    mediaHash: execution.publication?.assetIds?.length ? execution.publication.assetIds.join(",") : undefined,
    createdAt: run.createdAt,
  });

  const nowMs = now.getTime();
  const createdMs = new Date(run.createdAt).getTime();
  const elapsedMinutes = Math.max(0, (nowMs - createdMs) / 60000);

  // 1. Search Social Mirror for matching external evidence
  for (const obj of mirrorObjects) {
    if (obj.presenceId !== run.presenceId) continue;
    const objTime = new Date(obj.observedAt || now).getTime();
    if (objTime < new Date(fingerprint.windowStart).getTime() || objTime > new Date(fingerprint.windowEnd).getTime()) {
      continue;
    }

    // Direct parent check if replying or quoting
    if (fingerprint.parentExternalId && obj.parentExternalRef?.id && obj.parentExternalRef.id !== fingerprint.parentExternalId) {
      continue;
    }

    // Content matching
    if (fingerprint.normalizedText && obj.content?.text) {
      const objHash = computePayloadHash(obj.content.text);
      const observedMediaHash = obj.assetRefs?.map((asset) => asset.assetId).join(",");
      const mediaMatches = !fingerprint.mediaHash || !observedMediaHash || fingerprint.mediaHash === observedMediaHash;
      if (objHash === fingerprint.payloadHash && mediaMatches) {
        return {
          status: "verified",
          externalId: obj.externalRef?.id ?? obj.id,
          matchedMirrorObjectId: obj.id,
        };
      }
    }

    // Action matching for Likes/Reposts
    if (["like", "repost", "follow"].includes(fingerprint.actionType) && obj.parentExternalRef?.id === fingerprint.parentExternalId) {
      return {
        status: "verified",
        externalId: obj.externalRef?.id ?? obj.id,
        matchedMirrorObjectId: obj.id,
      };
    }
  }

  // 2. If not found, evaluate propagation window
  // If at least 5 minutes have elapsed with verified mirror syncing and no write appeared,
  // we can conclude with high confidence the write did not reach the platform.
  if (input.observerHealthy !== false && elapsedMinutes >= 5 && elapsedMinutes < 20) {
    return {
      status: "safe_to_retry",
      reason: `External propagation window elapsed (${Math.round(elapsedMinutes)}m) with no matching public write observed. Safe to retry.`,
    };
  }

  // 3. If within propagation window, continue reconciling
  if (elapsedMinutes < 5) {
    return {
      status: "reconciling",
      reason: `Awaiting propagation window (${Math.round(elapsedMinutes)}m / 5m elapsed) before declaring write outcome.`,
    };
  }

  // 4. If elapsed over 20 minutes and still ambiguous, escalate to operator
  return {
    status: "needs_operator",
    reason: `Reconciliation budget exhausted (${Math.round(elapsedMinutes)}m elapsed) without definitive external proof. Operator verification required to prevent duplicate write.`,
  };
}
