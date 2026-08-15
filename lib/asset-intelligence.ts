import type { Asset, AssetUsage, ExpressionMode, GroundingStatus, Presence } from "./types";

export function epistemicState(expressionMode: ExpressionMode, groundingStatus?: GroundingStatus): Pick<NonNullable<import("./types").Publication>, "expressionMode" | "groundingStatus" | "factuality"> {
  const intentionallyFictional = ["satire", "parody", "fiction", "entertainment"].includes(expressionMode);
  return { expressionMode, groundingStatus: intentionallyFictional ? "not_required" : groundingStatus ?? "unknown", factuality: intentionallyFictional ? "intentionally_fictional" : "intended_factual" };
}

export function canAutonomouslyPublish(presence: Presence, asset: Asset, expressionMode: ExpressionMode, groundingStatus: GroundingStatus) {
  const policy = presence.evidencePolicy ?? presence.mediaPerceptionPolicy ?? "use-judgment";
  const fictional = ["satire", "parody", "fiction", "entertainment"].includes(expressionMode);
  if (fictional) return { allowed: asset.rights?.status !== "restricted", reason: asset.rights?.status === "restricted" ? "Asset rights are restricted." : undefined };
  if (groundingStatus === "supported" || policy === "use-judgment") return { allowed: true };
  if (policy === "always-review" || policy === "review-uncertain") return { allowed: false, reason: "Factual asset evidence needs operator review before autonomous delivery." };
  return { allowed: groundingStatus !== "unsupported", reason: groundingStatus === "unsupported" ? "Factual claim evidence is unsupported." : undefined };
}

export function usageFor(assetUsages: AssetUsage[], assetId: string) {
  return assetUsages.filter((usage) => usage.assetId === assetId).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function duplicateContext(asset: Asset, usages: AssetUsage[]) {
  const history = usageFor(usages, asset.id);
  return { exactUseCount: history.length, lastUsedAt: history[0]?.publishedAt, samePresence: history.some((item) => item.presenceId === asset.presenceId), usageTypes: [...new Set(history.map((item) => item.usageType))] };
}
