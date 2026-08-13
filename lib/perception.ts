import type { Asset, AssetPerception, MirrorObject, PerceptionLevel, PerceptionResult, Presence, SocialAssetKind } from "./types";

export interface PerceptionRequest {
  asset: Asset;
  level: PerceptionLevel;
  socialObject?: MirrorObject;
  question?: string;
}

export interface PerceptionProvider {
  id: string;
  supports: (kind: SocialAssetKind, level: PerceptionLevel) => boolean;
  perceive: (request: PerceptionRequest) => Promise<PerceptionResult>;
}

export interface PerceptionRequirement {
  requiredLevel: "none" | PerceptionLevel;
  reason: string;
  materiallyDependsOnAsset: boolean;
}

export function createUninterpretedPerception(asset: Asset): PerceptionResult {
  const label = asset.type === "link" ? "link" : `${asset.type} asset`;
  return {
    observation: `${/^[aeiou]/i.test(label) ? "An" : "A"} ${label} is attached. Its contents have not been successfully interpreted.`,
    uncertainty: "insufficient",
    missingContext: ["A capable perception provider is not configured for this asset."],
  };
}

export function createAssetPerception(input: { asset: Asset; presenceId: string; socialObjectId?: string; level?: PerceptionLevel; sessionId?: string; providerId?: string; result?: PerceptionResult; supersedesId?: string }): AssetPerception {
  const level = input.level ?? "glance";
  return {
    id: `perception_${input.asset.id}_${level}_${Date.now().toString(36)}`,
    assetId: input.asset.id,
    socialObjectId: input.socialObjectId,
    presenceId: input.presenceId,
    level,
    result: input.result ?? createUninterpretedPerception(input.asset),
    providerId: input.providerId,
    sourceAssetVersion: input.asset.checksum ?? input.asset.updatedAt,
    supersedesId: input.supersedesId,
    createdAt: new Date().toISOString(),
    environment: input.asset.environment,
    sessionId: input.sessionId,
  };
}

export function latestPerception(perceptions: AssetPerception[], assetId: string, minimumLevel: PerceptionLevel = "glance") {
  const rank: Record<PerceptionLevel, number> = { glance: 1, inspect: 2, resolve: 3 };
  return perceptions
    .filter((item) => item.assetId === assetId && rank[item.level] >= rank[minimumLevel])
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

export function hasUsablePerception(perceptions: AssetPerception[], assetId: string, minimumLevel: PerceptionLevel = "inspect") {
  const perception = latestPerception(perceptions, assetId, minimumLevel);
  return Boolean(perception && perception.result.uncertainty !== "insufficient");
}

export function mediaRequiresReview(perceptions: AssetPerception[], object: MirrorObject | undefined, presence: Presence, minimumLevel: PerceptionLevel = "inspect") {
  if (!object?.assetRefs?.length || presence.mediaPerceptionPolicy === "use-judgment") return false;
  if (presence.mediaPerceptionPolicy === "always-review") return true;
  return object.assetRefs.some((ref) => latestPerception(perceptions, ref.assetId, minimumLevel)?.result.uncertainty !== "low");
}

export function perceptionRequirement(object: MirrorObject | undefined, action: string, presence: Presence): PerceptionRequirement {
  const assets = object?.assetRefs ?? [];
  if (!assets.length || ["like", "reaction"].includes(action)) return { requiredLevel: "none", reason: "The action does not materially depend on attached media.", materiallyDependsOnAsset: false };
  if (["repost", "quote"].includes(action)) return { requiredLevel: "inspect", reason: "Sharing or endorsing attached media requires an inspection first.", materiallyDependsOnAsset: true };
  if (action === "reply" || action === "comment") return { requiredLevel: "inspect", reason: "The attached media may change what a useful reply means.", materiallyDependsOnAsset: true };
  return { requiredLevel: presence.mode === "ghost" ? "inspect" : "glance", reason: "This action includes attached media that may carry the meaning.", materiallyDependsOnAsset: true };
}

export function cognitionSafeAssetSummary(assets: Asset[], perceptions: AssetPerception[], object: MirrorObject): string {
  return (object.assetRefs ?? []).map((ref) => {
    const asset = assets.find((item) => item.id === ref.assetId);
    const perception = latestPerception(perceptions, ref.assetId);
    if (!asset) return `Attached ${ref.kind}: the raw asset is unavailable.`;
    if (!perception || perception.result.uncertainty === "insufficient") return `Attached ${ref.kind}: its contents have not been successfully interpreted. Do not infer what it contains.`;
    return `Attached ${ref.kind}: ${perception.result.observation}${perception.result.interpretation ? ` Likely meaning: ${perception.result.interpretation}` : ""} Uncertainty: ${perception.result.uncertainty}.`;
  }).join("\n");
}
