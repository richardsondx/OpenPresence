import type {
  Asset,
  AssetAccessScope,
  AssetCollection,
  AssetCollectionMembership,
  AssetLibraryOperation,
  AssetMetadataEdit,
  AssetPerception,
  AssetReadiness,
  AssetSemanticKind,
  AssetSourceOccurrence,
  AssetUsage,
  LibrarySource,
  OpenPresenceState,
  Presence,
} from "./types";
import { detectLibraryMedia, isSupportedLibraryMedia } from "./asset-media";

export const DEFAULT_ASSET_REUSE_COOLDOWN_MONTHS = 6;
const MAX_ASSET_REUSE_COOLDOWN_MONTHS = 120;

function timestamp() { return new Date().toISOString(); }
function validTimestamp(value: unknown, fallback: string) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return fallback;
  return value;
}
function recordId(prefix: string) {
  const uuid = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${uuid}`;
}

export type AssetByteWriter = (bytes: Buffer, options: { mimeType: string; suggestedName?: string }) => Promise<NonNullable<Asset["storage"]>>;

export function isSupportedLibraryImage(mimeType: string | undefined) {
  // Kept as a compatibility export for existing callers. The Asset Library
  // now accepts all visual media that the normalizer can hand to vision.
  return isSupportedLibraryMedia(mimeType);
}

export function defaultAssetAccessScope(): AssetAccessScope {
  return { mode: "all_agent_presences" };
}

export function assetSourceErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "Folder scan failed.";
  if (/\b(?:EPERM|EACCES)\b|operation not permitted|permission denied/i.test(message)) {
    return "OpenPresence cannot read this folder from the running app. Use Choose folder to import its assets, or grant the app permission to access this folder.";
  }
  if (/\bENOENT\b|no such file or directory|cannot find the path/i.test(message)) {
    return "This folder is no longer available. Use Choose folder to select it again.";
  }
  if (/^(?:OpenPresence cannot read this folder|This folder is no longer available)/i.test(message)) return message;
  if (/^Folder scan failed(?:: Folder scan failed)?\.?$/i.test(message)) return "OpenPresence cannot read this folder from the running app. Use Choose folder to import its assets, or grant the app permission to access this folder.";
  return `Folder scan failed: ${message}`;
}

/**
 * Legacy assets with a Presence association predate AssetAccessScope. Treat
 * that association as an explicit narrow scope so normalization can never
 * broaden an older Presence-only asset into another Presence.
 */
export function assetAccessScope(asset: Asset): AssetAccessScope {
  if (asset.accessScope?.mode === "selected_presences") {
    return { mode: "selected_presences", presenceIds: [...new Set(asset.accessScope.presenceIds)] };
  }
  if (asset.accessScope?.mode === "all_agent_presences") return { mode: "all_agent_presences" };
  if (asset.presenceId) return { mode: "selected_presences", presenceIds: [asset.presenceId] };
  return defaultAssetAccessScope();
}

export function normalizeAssetLibraryState(state: OpenPresenceState) {
  state.assetCollections = state.assetCollections ?? [];
  state.assetCollectionMemberships = state.assetCollectionMemberships ?? [];
  state.assetMetadataEdits = state.assetMetadataEdits ?? [];
  state.assetProcessingJobs = state.assetProcessingJobs ?? [];
  state.librarySources = (state.librarySources ?? []).map((source) => ({
    ...source,
    status: source.status ?? "available",
    analysisPolicy: source.analysisPolicy ?? "index-only",
    lastError: source.lastError ? assetSourceErrorMessage(source.lastError) : undefined,
    createdAt: source.createdAt ?? timestamp(),
    updatedAt: source.updatedAt ?? timestamp(),
  }));
  state.assets = (state.assets ?? []).map((asset) => {
    const createdAt = validTimestamp(asset.createdAt, timestamp());
    const updatedAt = validTimestamp(asset.updatedAt, createdAt);
    const thirdPartyDiscovery = isThirdPartyDiscovery(asset);
    const expiresAt = validTimestamp(asset.expiresAt, thirdPartyDiscovery ? new Date(Date.parse(updatedAt) + 72 * 60 * 60 * 1000).toISOString() : "");
    const latestSocialPerception = (state.perceptions ?? [])
      .filter((perception) => perception.assetId === asset.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    const owningMirror = (state.mirrorObjects ?? []).find((object) => object.assetRefs?.some((ref) => ref.assetId === asset.id));
    const owner = owningMirror?.author?.handle ? `@${owningMirror.author.handle.replace(/^@/, "")}` : owningMirror?.author?.displayName;
    const postContext = owningMirror?.content?.text?.replace(/\s+/g, " ").trim().slice(0, 180);
    const contextualObservation = owningMirror
      ? `Visual attached to ${owner ?? "an observed X post"}${postContext ? ` discussing “${postContext}${postContext.length === 180 ? "…" : ""}”` : ""}. The pixels have not been inspected yet.`
      : "Temporary visual evidence has not been inspected yet.";
    return {
    ...asset,
    accessScope: asset.accessScope ?? assetAccessScope(asset),
    sourceOccurrences: asset.sourceOccurrences ?? [],
    retention: asset.retention ?? (isThirdPartyDiscovery(asset) ? "ephemeral" : "preserved"),
    createdAt,
    updatedAt,
    expiresAt: expiresAt || undefined,
    reusePermission: asset.reusePermission ?? (isThirdPartyDiscovery(asset) ? "reference_only" : "ready_to_use"),
    perception: asset.perception
      ?? (latestSocialPerception?.result ? { observation: latestSocialPerception.result.observation, likelyMeaning: latestSocialPerception.result.interpretation, visibleText: latestSocialPerception.result.visibleText ? [latestSocialPerception.result.visibleText] : undefined, uncertainty: [latestSocialPerception.result.uncertainty] } : undefined)
      ?? (isThirdPartyDiscovery(asset) ? {
        observation: contextualObservation,
        likelyMeaning: "Working-memory evidence only; not retained for reuse.",
        uncertainty: ["pixels not inspected", "not selected for reuse"],
      } : undefined),
    // A browser blob URL is not a replayable asset source. Do not keep a
    // broken card around after the originating X session is gone.
    archivedAt: asset.archivedAt ?? (asset.retention !== "preserved" && ((asset.provenance?.sourceUrl?.startsWith("blob:") ?? false) || (asset.expiresAt && Date.parse(asset.expiresAt) <= Date.now())) ? timestamp() : undefined),
    };
  });
  return state;
}

function isThirdPartyDiscovery(asset: Asset) {
  const origin = asset.provenance?.origin?.toLowerCase();
  return Boolean(origin && ["discovered", "native-x", "x-bridge", "mirror_observation"].includes(origin)
    && origin !== "operator_upload");
}

function presenceBelongsToAgent(state: OpenPresenceState, presenceId: string) {
  return state.presences.some((presence) => presence.id === presenceId);
}

function validateAccessScope(state: OpenPresenceState, scope: AssetAccessScope) {
  if (scope.mode !== "selected_presences") return { mode: "all_agent_presences" } as const;
  const presenceIds = [...new Set(scope.presenceIds)].filter((presenceId) => presenceBelongsToAgent(state, presenceId));
  if (presenceIds.length !== scope.presenceIds.length) throw new Error("Every selected Presence must belong to this Agent.");
  if (!presenceIds.length) throw new Error("Select at least one Presence, or make this Asset available to all Agent Presences.");
  return { mode: "selected_presences", presenceIds } as const;
}

export function assetIsEligibleForPresence(state: OpenPresenceState, asset: Asset, presenceId?: string) {
  if (!state.agent?.id || asset.agentId !== state.agent.id) return false;
  if (!presenceId || !presenceBelongsToAgent(state, presenceId)) return false;
  const scope = assetAccessScope(asset);
  return scope.mode === "all_agent_presences" || scope.presenceIds.includes(presenceId);
}

function latestLibraryPerception(state: OpenPresenceState, asset: Asset): AssetPerception | undefined {
  return (state.perceptions ?? [])
    .filter((perception) => perception.assetId === asset.id
      && perception.agentId !== undefined
      && perception.agentId === asset.agentId
      && perception.scope === "library"
      && !perception.socialObjectId
      && perception.sourceAssetVersion === (asset.checksum ?? asset.storage?.exactHash ?? asset.updatedAt))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

function latestMetadataEdit(state: OpenPresenceState, asset: Asset): AssetMetadataEdit | undefined {
  return (state.assetMetadataEdits ?? [])
    .filter((edit) => edit.assetId === asset.id && edit.agentId === asset.agentId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

export function effectiveAssetObservation(state: OpenPresenceState, asset: Asset) {
  const edit = latestMetadataEdit(state, asset);
  const perception = latestLibraryPerception(state, asset);
  return {
    observation: edit?.observation ?? perception?.result.observation ?? asset.perception?.observation,
    likelyMeaning: edit?.likelyMeaning ?? perception?.result.interpretation ?? asset.perception?.likelyMeaning,
    uncertainty: edit?.uncertainty?.join(" ") ?? perception?.result.uncertainty ?? asset.perception?.uncertainty?.join(" "),
    visibleText: edit?.visibleText ?? (perception?.result.visibleText ? [perception.result.visibleText] : asset.perception?.visibleText),
    semanticKind: edit?.semanticKind ?? perception?.result.visualForm ?? asset.semanticKind,
    reviewStatus: edit?.status ?? asset.metadataReview?.status,
  };
}

export function assetPerceptionNeedsReview(uncertainty: string | undefined) {
  return uncertainty !== "low" && uncertainty !== "medium";
}

export function deriveAssetReadiness(state: OpenPresenceState, asset: Asset): AssetReadiness {
  if (asset.status === "failed") return "failed";
  if (asset.archivedAt) return "unavailable";
  if (!asset.storage?.storeKey && !asset.storagePath && !asset.dataUrl && !asset.provenance.sourceUrl) return "unavailable";
  if (asset.status === "queued" || asset.status === "processing") return "processing";
  const edit = latestMetadataEdit(state, asset);
  const perception = latestLibraryPerception(state, asset);
  if (edit?.status === "open" || asset.metadataReview?.status === "open") return "needs_review";
  if (edit?.status === "resolved" && edit.observation?.trim()) return "ready";
  if (perception?.result.observation?.trim() && !assetPerceptionNeedsReview(perception.result.uncertainty)) return "ready";
  if (asset.perception?.observation?.trim() && !asset.perception.uncertainty?.some((item) => /insufficient|uncertain|unknown|high|poor|incomplete|unreadable/i.test(item))) return "ready";
  return "needs_review";
}

export function isLibraryAsset(asset: Asset) {
  // A publication asset created inside one isolated Playground session is
  // already part of the simulated execution envelope. It is not an
  // agent-wide library item merely because normalization filled in the
  // default `preserved` retention value. Library imports and explicitly
  // reused assets do not carry a session id and remain subject to the full
  // metadata/reuse contract.
  if (asset.environment === "sandbox" && asset.sessionId && !asset.sourceId && !asset.sourceOccurrences?.length) return false;
  return asset.retention === "preserved"
    || (!asset.retention && Boolean(asset.sourceId || asset.sourceOccurrences?.length || asset.provenance.origin === "operator_upload"));
}

export function normalizeAssetReuseCooldownMonths(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_ASSET_REUSE_COOLDOWN_MONTHS;
  return Math.max(0, Math.min(MAX_ASSET_REUSE_COOLDOWN_MONTHS, Math.round(value)));
}

function cooldownEndsAt(publishedAt: string, months: number) {
  const end = new Date(publishedAt);
  if (Number.isNaN(end.getTime())) return undefined;
  end.setUTCMonth(end.getUTCMonth() + months);
  return end.toISOString();
}

/** Return the end of the active no-reuse window for a library asset. */
export function assetPostingUnavailableUntil(state: OpenPresenceState, assetOrId: Asset | string, presenceId?: string, at = timestamp(), options?: { excludePublicationId?: string }) {
  const asset = typeof assetOrId === "string" ? state.assets.find((item) => item.id === assetOrId) : assetOrId;
  const presence = state.presences.find((item) => item.id === (presenceId ?? state.presence?.id)) ?? state.presence;
  if (!asset || !presence || !isLibraryAsset(asset)) return undefined;
  const cooldownMonths = normalizeAssetReuseCooldownMonths(presence.assetReuseCooldownMonths);
  if (cooldownMonths === 0) return undefined;
  const latest = state.assetUsages
    .filter((usage) => usage.assetId === asset.id && usage.presenceId === presence.id && usage.environment === "live" && usage.publicationId !== options?.excludePublicationId)
    .map((usage) => usage.publishedAt)
    .filter((publishedAt) => !Number.isNaN(new Date(publishedAt).getTime()))
    .sort((left, right) => right.localeCompare(left))[0];
  if (!latest) return undefined;
  const unavailableUntil = cooldownEndsAt(latest, cooldownMonths);
  return unavailableUntil && unavailableUntil > at ? unavailableUntil : undefined;
}

export function assetReviewReason(state: OpenPresenceState, assetId: string, options?: { presenceId?: string }) {
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset || !assetIsEligibleForPresence(state, asset, options?.presenceId ?? state.presence?.id)) return undefined;
  const reasons: string[] = [];
  if (asset.reusePermission === "reference_only" || asset.reusePermission === "needs_approval") reasons.push("it is reference-only and needs explicit reuse approval");
  const readiness = deriveAssetReadiness(state, asset);
  if (isLibraryAsset(asset) && readiness !== "ready") reasons.push(`its visual metadata is ${readiness.replace("_", " ")}`);
  return reasons.length ? `${asset.description ?? "This visual"} needs review because ${reasons.join(" and ")}.` : undefined;
}

export function assetSelectionFailure(state: OpenPresenceState, assetId: string, options?: { presenceId?: string; collectionId?: string; requireReady?: boolean; allowReviewable?: boolean }) {
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset) return "The selected Asset is no longer available.";
  if (!state.agent?.id || asset.agentId !== state.agent.id) return "That Asset belongs to another Agent and cannot be used here.";
  if (!assetIsEligibleForPresence(state, asset, options?.presenceId ?? state.presence?.id)) return "That Asset is not eligible for this Presence.";
  if (asset.archivedAt) return "That Asset is archived.";
  if (asset.retention === "ephemeral") return "That discovery is temporary evidence. Preserve it intentionally before using it in a post.";
  if (asset.reusePermission === "blocked") return "That Asset is blocked from reuse by its safety or rights assessment.";
  if (!options?.allowReviewable && (asset.reusePermission === "reference_only" || asset.reusePermission === "needs_approval")) return "That Asset is preserved as a reference, but it needs explicit reuse approval before publication.";
  const unavailableUntil = assetPostingUnavailableUntil(state, asset, options?.presenceId ?? state.presence?.id);
  if (unavailableUntil) return `That Asset was already published by this Presence and is unavailable for posting until ${new Date(unavailableUntil).toLocaleDateString()}.`;
  if (asset.rights?.status === "restricted") return "That Asset has restricted rights and cannot be published.";
  if ((options?.collectionId || options?.collectionId === "") && !collectionContainsAsset(state, options.collectionId, asset.id)) return "That Asset is not in the requested Collection.";
  const readiness = deriveAssetReadiness(state, asset);
  if (!options?.allowReviewable && options?.requireReady !== false && isLibraryAsset(asset) && readiness !== "ready") return `That Asset is ${readiness.replace("_", " ")} and cannot be published until its visual metadata is resolved.`;
  if (asset.status !== "ready" && !isLibraryAsset(asset)) return "That Asset is not ready for publication.";
  return undefined;
}

export function authorizeAssetSelection(state: OpenPresenceState, assetIds: string[], options?: { presenceId?: string; collectionId?: string; requireReady?: boolean; allowReviewable?: boolean }) {
  const failures = assetIds.map((assetId) => assetSelectionFailure(state, assetId, options)).filter((failure): failure is string => Boolean(failure));
  if (failures.length) throw new Error(failures[0]);
  return [...new Set(assetIds)];
}

const LIVE_VISUAL_REPEAT_DISTANCE = 6;

function visualHashDistance(left: string, right: string) {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) distance += 1;
  return distance;
}

function assetsRepresentSameVisual(left: Asset, right: Asset) {
  const leftExact = left.storage?.exactHash ?? left.checksum;
  const rightExact = right.storage?.exactHash ?? right.checksum;
  if (leftExact && rightExact && leftExact === rightExact) return true;
  const leftSource = left.provenance.sourceUrl?.trim();
  const rightSource = right.provenance.sourceUrl?.trim();
  if (leftSource && rightSource && leftSource === rightSource) return true;
  const leftPerceptual = left.storage?.perceptualHash;
  const rightPerceptual = right.storage?.perceptualHash;
  return Boolean(leftPerceptual && rightPerceptual && visualHashDistance(leftPerceptual, rightPerceptual) <= LIVE_VISUAL_REPEAT_DISTANCE);
}

/**
 * Live Presence media is a public identity signal. Do not publish the same
 * visual again merely because a new asset record or X media URL was created.
 * Include in-flight executions as well as verified usages so concurrent
 * workers cannot publish the same image twice before usage is recorded.
 */
export function liveAssetReuseReason(state: OpenPresenceState, presenceId: string, assetIds: string[], options?: { excludePublicationId?: string }) {
  if (!assetIds.length) return undefined;
  const candidateAssets = assetIds.map((assetId) => state.assets.find((asset) => asset.id === assetId)).filter((asset): asset is Asset => Boolean(asset));
  if (!candidateAssets.length) return undefined;
  const priorUsageAssetIds = new Set(state.assetUsages
    .filter((usage) => usage.presenceId === presenceId && usage.environment === "live" && usage.publicationId !== options?.excludePublicationId)
    .map((usage) => usage.assetId));
  const inFlightAssetIds = new Set<string>();
  for (const execution of state.executions) {
    if (execution.presenceId !== presenceId || execution.environment !== "live" || execution.publication?.id === options?.excludePublicationId) continue;
    if (!["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued", "claimed", "executing", "verification-pending"].includes(execution.status)) continue;
    for (const assetId of execution.publication?.assetIds ?? []) inFlightAssetIds.add(assetId);
  }
  const priorAssets = [...priorUsageAssetIds, ...inFlightAssetIds].map((assetId) => state.assets.find((asset) => asset.id === assetId)).filter((asset): asset is Asset => Boolean(asset));
  const repeated = candidateAssets.find((candidate) => inFlightAssetIds.has(candidate.id) || assetPostingUnavailableUntil(state, candidate, presenceId, timestamp(), options) || priorAssets.some((prior) => prior.id !== candidate.id && assetsRepresentSameVisual(candidate, prior) && (inFlightAssetIds.has(prior.id) || !isLibraryAsset(candidate) || !isLibraryAsset(prior) || assetPostingUnavailableUntil(state, prior, presenceId, timestamp(), options))));
  if (repeated && (inFlightAssetIds.has(repeated.id) || priorAssets.some(prior => inFlightAssetIds.has(prior.id) && assetsRepresentSameVisual(repeated, prior)))) return "This visual is already part of an active live publication and cannot be selected for another one.";
  return repeated ? "This visual was already published by this Presence and cannot be used again in a live publication." : undefined;
}

/** Current publication availability, distinct from private viewing access. */
export function assetIsAvailableForPublication(state: OpenPresenceState, asset: Asset, presenceId?: string) {
  const selectedPresenceId = presenceId ?? state.presence?.id;
  const presence = state.presences.find(item => item.id === selectedPresenceId) ?? (state.presence?.id === selectedPresenceId ? state.presence : undefined);
  if (!presence || assetSelectionFailure(state, asset.id, { presenceId: presence.id, requireReady: false })) return false;
  return presence.environment !== "live" || !liveAssetReuseReason(state, presence.id, [asset.id]);
}

export function collectionContainsAsset(state: OpenPresenceState, collectionId: string, assetId: string) {
  const collection = (state.assetCollections ?? []).find((item) => item.id === collectionId && item.agentId === state.agent?.id && item.status === "active");
  const asset = state.assets.find((item) => item.id === assetId && item.agentId === state.agent?.id);
  return Boolean(collection && asset && (state.assetCollectionMemberships ?? []).some((membership) => membership.agentId === state.agent?.id && membership.collectionId === collectionId && membership.assetId === assetId && !membership.removedAt));
}

export interface AssetSearchResult {
  assetId: string;
  name: string;
  type: Asset["type"];
  semanticKind?: AssetSemanticKind;
  observation?: string;
  likelyMeaning?: string;
  visibleText?: string[];
  readiness: AssetReadiness;
  eligible: true;
  liveUseCount: number;
  sandboxTestCount: number;
  collectionIds: string[];
}

export function readEligibleAsset(state: OpenPresenceState, assetId: string, presenceId?: string) {
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset || !isLibraryAsset(asset) || asset.archivedAt || !assetIsEligibleForPresence(state, asset, presenceId ?? state.presence?.id)) return undefined;
  const selectedPresenceId = presenceId ?? state.presence?.id;
  const selectedPresence = state.presences.find(item => item.id === selectedPresenceId) ?? state.presence;
  const publicationReason = assetSelectionFailure(state, asset.id, { presenceId: selectedPresenceId, requireReady: false })
    ?? (selectedPresence?.environment === "live" && selectedPresenceId ? liveAssetReuseReason(state, selectedPresenceId, [asset.id]) : undefined);
  const effective = effectiveAssetObservation(state, asset);
  return {
    assetId: asset.id,
    publicationAvailability: { available: assetIsAvailableForPublication(state, asset, selectedPresenceId), reason: publicationReason, unavailableUntil: assetPostingUnavailableUntil(state, asset, selectedPresenceId) },
    agentId: asset.agentId,
    name: asset.description ?? asset.sourceOccurrences?.[0]?.fileName ?? `${asset.type} asset`,
    type: asset.type,
    mimeType: asset.storage?.mimeType ?? asset.mimeType,
    byteSize: asset.storage?.byteSize ?? asset.sizeBytes,
    exactHash: asset.storage?.exactHash ?? asset.checksum,
    accessScope: assetAccessScope(asset),
    readiness: deriveAssetReadiness(state, asset),
    observation: effective.observation,
    likelyMeaning: effective.likelyMeaning,
    visibleText: effective.visibleText,
    uncertainty: effective.uncertainty,
    semanticKind: effective.semanticKind,
    rights: asset.rights,
    sourceOccurrences: asset.sourceOccurrences ?? [],
    collectionIds: (state.assetCollectionMemberships ?? []).filter((membership) => membership.agentId === asset.agentId && membership.assetId === asset.id && !membership.removedAt).map((membership) => membership.collectionId),
    ...assetUsageSummary(state.assetUsages, asset.id),
  };
}

export function assetUsageSummary(usages: AssetUsage[], assetId: string) {
  const seen = new Set<string>();
  const history = usages.filter((usage) => {
    if (usage.assetId !== assetId) return false;
    const key = `${usage.assetId}:${usage.publicationId}:${usage.environment}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    liveUseCount: history.filter((usage) => usage.environment === "live").length,
    sandboxTestCount: history.filter((usage) => usage.environment === "sandbox").length,
  };
}

export function searchEligibleAssets(state: OpenPresenceState, query: string, options?: { presenceId?: string; collectionId?: string; limit?: number }): AssetSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  const presenceId = options?.presenceId ?? state.presence?.id;
  return state.assets
    .filter((asset) => !asset.archivedAt && isLibraryAsset(asset) && (asset.reusePermission ?? "ready_to_use") === "ready_to_use" && asset.agentId === state.agent?.id && assetIsEligibleForPresence(state, asset, presenceId) && assetIsAvailableForPublication(state, asset, presenceId))
    .filter((asset) => !options?.collectionId || collectionContainsAsset(state, options.collectionId, asset.id))
    .map((asset) => {
      const effective = effectiveAssetObservation(state, asset);
      const searchable = [asset.description, asset.provenance.sourceUrl, ...(asset.sourceOccurrences ?? []).flatMap((occurrence) => [occurrence.path, occurrence.fileName]), effective.observation, effective.likelyMeaning, ...(effective.visibleText ?? []), effective.semanticKind].filter(Boolean).join(" ").toLowerCase();
      const score = !normalizedQuery ? 0 : normalizedQuery.split(/\s+/).filter(Boolean).reduce((sum, term) => sum + (searchable.includes(term) ? 1 : 0), 0);
      return { asset, effective, score };
    })
    .filter((item) => !normalizedQuery || item.score > 0)
    .sort((left, right) => right.score - left.score || right.asset.updatedAt.localeCompare(left.asset.updatedAt))
    .slice(0, options?.limit ?? 20)
    .map(({ asset, effective }) => ({
      assetId: asset.id,
      name: asset.description ?? asset.sourceOccurrences?.[0]?.fileName ?? `${asset.type} asset`,
      type: asset.type,
      semanticKind: effective.semanticKind,
      observation: effective.observation,
      likelyMeaning: effective.likelyMeaning,
      visibleText: effective.visibleText,
      readiness: deriveAssetReadiness(state, asset),
      eligible: true,
      ...assetUsageSummary(state.assetUsages, asset.id),
      collectionIds: (state.assetCollectionMemberships ?? []).filter((membership) => membership.assetId === asset.id && !membership.removedAt).map((membership) => membership.collectionId),
    }));
}

export function assetHistory(state: OpenPresenceState, assetId: string, presenceId?: string) {
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset || !assetIsEligibleForPresence(state, asset, presenceId ?? state.presence?.id)) return undefined;
  return {
    assetId,
    sourceOccurrences: asset.sourceOccurrences ?? [],
    usages: state.assetUsages.filter((usage) => usage.assetId === assetId && usage.agentId === asset.agentId && (!presenceId || usage.presenceId === presenceId)),
    metadataEdits: (state.assetMetadataEdits ?? []).filter((edit) => edit.assetId === assetId && edit.agentId === asset.agentId),
  };
}

function ownedAsset(state: OpenPresenceState, assetId: string) {
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset || asset.agentId !== state.agent?.id) throw new Error("That Asset does not belong to the active Agent.");
  return asset;
}

function ownedCollection(state: OpenPresenceState, collectionId: string) {
  const collection = (state.assetCollections ?? []).find((item) => item.id === collectionId);
  if (!collection || collection.agentId !== state.agent?.id || collection.status === "archived") throw new Error("That Asset Collection does not belong to the active Agent.");
  return collection;
}

function addEvent(state: OpenPresenceState, title: string, detail: string, presenceId?: string) {
  const event = { id: recordId("event"), type: "system" as const, title, detail, tone: "neutral" as const, time: timestamp(), presenceId };
  state.events.unshift(event);
}

export function applyAssetLibraryOperation(source: OpenPresenceState, operation: AssetLibraryOperation) {
  const state = JSON.parse(JSON.stringify(source)) as OpenPresenceState;
  normalizeAssetLibraryState(state);
  if (!state.agent?.id) throw new Error("Create an Agent before managing its Asset Library.");
  const collections = state.assetCollections ?? [];
  const memberships = state.assetCollectionMemberships ?? [];
  const metadataEdits = state.assetMetadataEdits ?? [];
  const processingJobs = state.assetProcessingJobs ?? [];
  if (operation.type === "connectAssetSource") {
    const location = operation.location.trim();
    if (!location) throw new Error("Choose a local folder to connect.");
    const at = timestamp();
    const sourceRecord: LibrarySource = { id: recordId("asset-source"), agentId: state.agent.id, type: "local-folder", location, access: "read", status: "indexing", analysisPolicy: operation.analysisPolicy, createdAt: at, updatedAt: at };
    state.librarySources.unshift(sourceRecord);
    addEvent(state, "Asset Source connected", `${location} is connected read-only with ${operation.analysisPolicy} analysis.`, state.presence?.id);
    return state;
  }
  if (operation.type === "rescanAssetSource" || operation.type === "pauseAssetSource" || operation.type === "resumeAssetSource") {
    const sourceRecord = state.librarySources.find((item) => item.id === operation.sourceId && item.agentId === state.agent!.id);
    if (!sourceRecord) throw new Error("That Asset Source does not belong to the active Agent.");
    sourceRecord.status = operation.type === "pauseAssetSource" ? "paused" : operation.type === "resumeAssetSource" ? "indexing" : "indexing";
    sourceRecord.updatedAt = timestamp();
    addEvent(state, operation.type === "pauseAssetSource" ? "Asset Source paused" : operation.type === "resumeAssetSource" ? "Asset Source resumed" : "Asset Source rescan requested", sourceRecord.location, state.presence?.id);
    return state;
  }
  if (operation.type === "createAssetCollection") {
    const at = timestamp();
    const collection: AssetCollection = { id: recordId("asset-collection"), agentId: state.agent.id, name: operation.name.trim(), description: operation.description?.trim() || undefined, reuseGuidance: operation.reuseGuidance?.trim() || undefined, defaultAccessScope: operation.defaultAccessScope ? validateAccessScope(state, operation.defaultAccessScope) : undefined, status: "active", createdAt: at, updatedAt: at };
    if (!collection.name) throw new Error("Name the Asset Collection.");
    collections.unshift(collection);
    return state;
  }
  if (operation.type === "updateAssetCollection") {
    const collection = ownedCollection(state, operation.collectionId);
    collection.name = operation.name.trim() || collection.name;
    collection.description = operation.description?.trim() || undefined;
    collection.reuseGuidance = operation.reuseGuidance?.trim() || undefined;
    if (operation.defaultAccessScope !== undefined) collection.defaultAccessScope = validateAccessScope(state, operation.defaultAccessScope);
    collection.updatedAt = timestamp();
    return state;
  }
  if (operation.type === "archiveAssetCollection") {
    const collection = ownedCollection(state, operation.collectionId);
    collection.status = "archived";
    collection.updatedAt = timestamp();
    return state;
  }
  if (operation.type === "addAssetToCollection") {
    const collection = ownedCollection(state, operation.collectionId);
    const asset = ownedAsset(state, operation.assetId);
    const existing = memberships.find((item) => item.collectionId === collection.id && item.assetId === asset.id);
    if (existing) { existing.removedAt = undefined; return state; }
    const membership: AssetCollectionMembership = { id: recordId("asset-membership"), agentId: state.agent.id, collectionId: collection.id, assetId: asset.id, addedAt: timestamp() };
    memberships.unshift(membership);
    return state;
  }
  if (operation.type === "removeAssetFromCollection") {
    ownedCollection(state, operation.collectionId);
    ownedAsset(state, operation.assetId);
    const membership = memberships.find((item) => item.collectionId === operation.collectionId && item.assetId === operation.assetId && !item.removedAt);
    if (membership) membership.removedAt = timestamp();
    return state;
  }
  if (operation.type === "setAssetAccessScope") {
    const asset = ownedAsset(state, operation.assetId);
    asset.accessScope = validateAccessScope(state, operation.accessScope);
    asset.updatedAt = timestamp();
    return state;
  }
  if (operation.type === "reanalyzeDiscoveredAssets") {
    const discovered = state.assets.filter((asset) => asset.agentId === state.agent!.id
      && !asset.archivedAt
      && ["image", "video", "gif"].includes(asset.type)
      && ["discovered", "native-x", "x-bridge", "mirror_observation"].includes(asset.provenance.origin.toLowerCase())
      && !asset.perception?.observation?.trim());
    const at = timestamp();
    for (const asset of discovered) {
      asset.status = "processing";
      asset.metadataReview = { status: "open" };
      const existingJob = processingJobs.find((job) => job.assetId === asset.id && job.agentId === state.agent!.id && job.status !== "completed");
      if (existingJob) {
        existingJob.status = "queued";
        existingJob.attempts = 0;
        existingJob.progress = 0;
        existingJob.lastError = undefined;
        existingJob.updatedAt = at;
      } else {
        processingJobs.unshift({ id: recordId("asset-job"), agentId: state.agent.id, assetId: asset.id, status: "queued", attempts: 0, maxAttempts: 3, progress: 0, createdAt: at, updatedAt: at });
      }
      asset.updatedAt = at;
    }
    if (discovered.length) addEvent(state, "Discovered media analysis requested", `${discovered.length} X-discovered visual${discovered.length === 1 ? "" : "s"} will receive durable visual metadata.`, state.presence?.id);
    return state;
  }
  if (operation.type === "preserveDiscoveredAsset") {
    const asset = ownedAsset(state, operation.assetId);
    if (!["discovered", "native-x", "x-bridge", "mirror_observation"].includes(asset.provenance.origin.toLowerCase())) throw new Error("Only an X-discovered visual can be promoted from temporary evidence.");
    const at = timestamp();
    asset.retention = "preserved";
    asset.expiresAt = undefined;
    asset.preservationReason = operation.reason.trim();
    asset.reusePermission = "needs_approval";
    asset.metadataReview = { status: "open" };
    asset.status = "processing";
    const existingJob = processingJobs.find((job) => job.assetId === asset.id && job.agentId === state.agent!.id && job.status !== "completed");
    if (existingJob) {
      existingJob.status = "queued";
      existingJob.attempts = 0;
      existingJob.progress = 0;
      existingJob.lastError = undefined;
      existingJob.updatedAt = at;
    } else {
      processingJobs.unshift({ id: recordId("asset-job"), agentId: state.agent.id, assetId: asset.id, status: "queued", attempts: 0, maxAttempts: 3, progress: 0, createdAt: at, updatedAt: at });
    }
    asset.updatedAt = at;
    addEvent(state, "Discovered visual preserved", `${asset.description ?? "The discovered visual"} was kept as a reference because: ${asset.preservationReason}`, state.presence?.id);
    return state;
  }
  if (["editAssetMetadata", "approveAssetMetadata", "resolveAssetReview"].includes(operation.type)) {
    const asset = ownedAsset(state, operation.assetId);
    const at = timestamp();
    const resolved = operation.type !== "editAssetMetadata";
    const previous = effectiveAssetObservation(state, asset);
    const observation = "observation" in operation ? operation.observation?.trim() : undefined;
    if (resolved && !observation && !previous.observation) throw new Error("Resolve the visual observation before approving this Asset metadata.");
    const metadataOperation = operation as Extract<AssetLibraryOperation, { type: "editAssetMetadata" | "approveAssetMetadata" | "resolveAssetReview" }>;
    const edit: AssetMetadataEdit = { id: recordId("asset-edit"), assetId: asset.id, agentId: state.agent.id, status: resolved ? "resolved" : "open", observation: observation || (resolved ? previous.observation : undefined), likelyMeaning: metadataOperation.likelyMeaning?.trim() || (resolved ? previous.likelyMeaning : undefined), visibleText: metadataOperation.visibleText ?? (resolved ? previous.visibleText : undefined), semanticKind: metadataOperation.semanticKind ?? (resolved ? previous.semanticKind : undefined), uncertainty: metadataOperation.uncertainty ?? (resolved ? (previous.uncertainty ? [previous.uncertainty] : undefined) : undefined), note: metadataOperation.note?.trim() || undefined, createdAt: at, resolvedAt: resolved ? at : undefined };
    metadataEdits.unshift(edit);
    asset.metadataReview = { status: edit.status, lastEditId: edit.id, resolvedAt: edit.resolvedAt };
    asset.perception = { observation: edit.observation ?? previous.observation ?? "", likelyMeaning: edit.likelyMeaning ?? previous.likelyMeaning, visibleText: edit.visibleText ?? previous.visibleText, uncertainty: edit.uncertainty ?? (previous.uncertainty ? [previous.uncertainty] : undefined) };
    if (edit.semanticKind) asset.semanticKind = edit.semanticKind;
    // `status` describes ingestion/storage progress. Metadata readiness is
    // derived separately, and an open edit must not silently approve a visual.
    if (resolved) asset.status = "ready";
    asset.updatedAt = at;
    addEvent(state, resolved ? "Asset metadata resolved" : "Asset metadata edited", `${asset.description ?? "The Asset"} has durable visual metadata for Agent cognition.`, state.presence?.id);
    return state;
  }
  if (operation.type === "reanalyzeAsset") {
    const asset = ownedAsset(state, operation.assetId);
    asset.status = "processing";
    asset.metadataReview = { status: "open" };
    const existingJob = processingJobs.find((job) => job.assetId === asset.id && job.agentId === state.agent!.id && job.status !== "completed");
    if (existingJob) {
      existingJob.status = "queued";
      existingJob.attempts = 0;
      existingJob.progress = 0;
      existingJob.lastError = undefined;
      existingJob.updatedAt = timestamp();
    } else {
      const at = timestamp();
      processingJobs.unshift({ id: recordId("asset-job"), agentId: state.agent.id, assetId: asset.id, status: "queued", attempts: 0, maxAttempts: 3, progress: 0, createdAt: at, updatedAt: at });
    }
    asset.updatedAt = timestamp();
    addEvent(state, "Asset reanalysis requested", `${asset.description ?? "The Asset"} will receive an explicit visual reanalysis.`, state.presence?.id);
    return state;
  }
  if (operation.type === "archiveAsset" || operation.type === "restoreAsset") {
    const asset = ownedAsset(state, operation.assetId);
    asset.archivedAt = operation.type === "archiveAsset" ? timestamp() : undefined;
    asset.updatedAt = timestamp();
    return state;
  }
  return state;
}

export function sourceOccurrence(input: { sourceId?: string; path?: string; fileName?: string; exactHash?: string; observedAt?: string }): AssetSourceOccurrence {
  return { id: recordId("asset-occurrence"), sourceId: input.sourceId, path: input.path, fileName: input.fileName, exactHash: input.exactHash, observedAt: input.observedAt ?? timestamp(), status: "present" };
}

export async function prepareImportedMedia(input: { agentId: string; sourceId?: string; path?: string; fileName?: string; bytes: Buffer; mimeType: string; assetType?: "image" | "gif" | "video"; description?: string; accessScope?: AssetAccessScope; collectionDefaultAccessScope?: AssetAccessScope; storeBytes: AssetByteWriter }): Promise<Asset> {
  const detected = detectLibraryMedia(input.fileName ?? "", input.mimeType, input.bytes);
  if (!detected) throw new Error("OpenPresence could not recognize this as a supported visual file.");
  const assetType = input.assetType ?? detected.assetType;
  const stored = await input.storeBytes(input.bytes, { mimeType: detected.mimeType, suggestedName: input.fileName });
  const at = timestamp();
  return {
    id: recordId("asset"),
    agentId: input.agentId,
    sourceId: input.sourceId,
    sourceOccurrences: [sourceOccurrence({ sourceId: input.sourceId, path: input.path, fileName: input.fileName, exactHash: stored.exactHash, observedAt: at })],
    accessScope: input.accessScope ?? input.collectionDefaultAccessScope ?? defaultAssetAccessScope(),
    type: assetType,
    mediaKind: assetType,
    storage: stored,
    storagePath: stored.storeKey,
    checksum: stored.exactHash,
    mimeType: stored.mimeType,
    sizeBytes: stored.byteSize,
    status: "queued",
    metadataReview: { status: "open" },
    nature: "observed",
    rights: { status: "unknown" },
    provenance: { origin: "operator_upload", importedAt: at },
    description: input.description?.trim() || input.fileName || "Imported visual",
    visibility: "private-community",
    shareability: "agent-wide",
    createdAt: at,
    updatedAt: at,
  };
}

export async function prepareImportedImage(input: { agentId: string; sourceId?: string; path?: string; fileName?: string; bytes: Buffer; mimeType: string; description?: string; accessScope?: AssetAccessScope; collectionDefaultAccessScope?: AssetAccessScope; storeBytes: AssetByteWriter }): Promise<Asset> {
  return prepareImportedMedia({ ...input, assetType: "image" });
}

export function dedupedAssetForImport(state: OpenPresenceState, agentId: string, exactHash: string) {
  return state.assets.find((asset) => asset.agentId === agentId
    && isLibraryAsset(asset)
    && (asset.storage?.exactHash ?? asset.checksum) === exactHash
    && !asset.archivedAt);
}

export function appendAssetOccurrence(asset: Asset, occurrence: AssetSourceOccurrence) {
  const existing = asset.sourceOccurrences ?? [];
  if (existing.some((item) => item.sourceId === occurrence.sourceId && item.path === occurrence.path && item.fileName === occurrence.fileName)) return asset;
  return { ...asset, sourceOccurrences: [occurrence, ...existing], updatedAt: timestamp() };
}

export async function ingestLibraryImages(state: OpenPresenceState, input: {
  agentId: string;
  sourceId?: string;
  storeBytes: AssetByteWriter;
  files: Array<{ bytes: Buffer; mimeType: string; assetType?: "image" | "gif" | "video"; fileName?: string; path?: string }>;
  accessScope?: AssetAccessScope;
  collectionDefaultAccessScope?: AssetAccessScope;
  collectionId?: string;
}) {
  normalizeAssetLibraryState(state);
  if (state.agent?.id !== input.agentId) throw new Error("The import Agent does not match the active workspace.");
  if (input.sourceId && !state.librarySources.some((source) => source.id === input.sourceId && source.agentId === input.agentId)) throw new Error("That Asset Source does not belong to the active Agent.");
  const collection = input.collectionId ? state.assetCollections?.find((item) => item.id === input.collectionId && item.agentId === input.agentId && item.status === "active") : undefined;
  if (input.collectionId && !collection) throw new Error("That Asset Collection does not belong to the active Agent.");
  const imported: Asset[] = [];
  const newAssetIds: string[] = [];
  for (const file of input.files) {
    const prepared = await prepareImportedMedia({
      agentId: input.agentId,
      sourceId: input.sourceId,
      path: file.path,
      fileName: file.fileName,
      bytes: file.bytes,
      mimeType: file.mimeType,
      assetType: file.assetType,
      accessScope: input.accessScope,
      collectionDefaultAccessScope: collection?.defaultAccessScope ?? input.collectionDefaultAccessScope,
      storeBytes: input.storeBytes,
    });
    const existing = dedupedAssetForImport(state, input.agentId, prepared.checksum ?? prepared.storage!.exactHash);
    const asset = existing
      ? appendAssetOccurrence(existing, prepared.sourceOccurrences?.[0] ?? sourceOccurrence({ sourceId: input.sourceId, path: file.path, fileName: file.fileName, exactHash: prepared.storage!.exactHash }))
      : prepared;
    if (!existing) {
      state.assets.unshift(asset);
      newAssetIds.push(asset.id);
    } else {
      const index = state.assets.findIndex((item) => item.id === existing.id);
      if (index >= 0) state.assets[index] = asset;
    }
    if (collection && !collectionContainsAsset(state, collection.id, asset.id)) {
      state.assetCollectionMemberships!.unshift({ id: recordId("asset-membership"), agentId: input.agentId, collectionId: collection.id, assetId: asset.id, addedAt: timestamp() });
    }
    imported.push(asset);
  }
  return { state, assets: imported, newAssetIds };
}

export function presenceLabel(presence: Presence) { return `${presence.name} · ${presence.channel === "x" ? "X" : presence.channel}`; }
