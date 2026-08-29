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

function timestamp() { return new Date().toISOString(); }
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
  state.assets = (state.assets ?? []).map((asset) => ({
    ...asset,
    accessScope: asset.accessScope ?? assetAccessScope(asset),
    sourceOccurrences: asset.sourceOccurrences ?? [],
  }));
  return state;
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

export function deriveAssetReadiness(state: OpenPresenceState, asset: Asset): AssetReadiness {
  if (asset.status === "failed") return "failed";
  if (asset.archivedAt) return "unavailable";
  if (!asset.storage?.storeKey && !asset.storagePath && !asset.dataUrl) return "unavailable";
  if (asset.status === "queued" || asset.status === "processing") return "processing";
  const edit = latestMetadataEdit(state, asset);
  const perception = latestLibraryPerception(state, asset);
  if (edit?.status === "open") return "needs_review";
  if (edit?.status === "resolved" && edit.observation?.trim()) return "ready";
  if (perception?.result.observation?.trim() && ["low", "medium"].includes(perception.result.uncertainty)) return "ready";
  if (asset.perception?.observation?.trim() && !asset.perception.uncertainty?.some((item) => /insufficient|uncertain|unknown|high|poor|incomplete|unreadable/i.test(item))) return "ready";
  return "needs_review";
}

export function isLibraryAsset(asset: Asset) {
  return Boolean(asset.sourceId || asset.sourceOccurrences?.length || asset.provenance.origin === "operator_upload");
}

export function assetSelectionFailure(state: OpenPresenceState, assetId: string, options?: { presenceId?: string; collectionId?: string; requireReady?: boolean }) {
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset) return "The selected Asset is no longer available.";
  if (!state.agent?.id || asset.agentId !== state.agent.id) return "That Asset belongs to another Agent and cannot be used here.";
  if (!assetIsEligibleForPresence(state, asset, options?.presenceId ?? state.presence?.id)) return "That Asset is not eligible for this Presence.";
  if (asset.archivedAt) return "That Asset is archived.";
  if (asset.rights?.status === "restricted") return "That Asset has restricted rights and cannot be published.";
  if ((options?.collectionId || options?.collectionId === "") && !collectionContainsAsset(state, options.collectionId, asset.id)) return "That Asset is not in the requested Collection.";
  const readiness = deriveAssetReadiness(state, asset);
  if (options?.requireReady !== false && isLibraryAsset(asset) && readiness !== "ready") return `That Asset is ${readiness.replace("_", " ")} and cannot be published until its visual metadata is resolved.`;
  if (asset.status !== "ready" && !isLibraryAsset(asset)) return "That Asset is not ready for publication.";
  return undefined;
}

export function authorizeAssetSelection(state: OpenPresenceState, assetIds: string[], options?: { presenceId?: string; collectionId?: string; requireReady?: boolean }) {
  const failures = assetIds.map((assetId) => assetSelectionFailure(state, assetId, options)).filter((failure): failure is string => Boolean(failure));
  if (failures.length) throw new Error(failures[0]);
  return [...new Set(assetIds)];
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
  const effective = effectiveAssetObservation(state, asset);
  return {
    assetId: asset.id,
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
    .filter((asset) => !asset.archivedAt && isLibraryAsset(asset) && asset.agentId === state.agent?.id && assetIsEligibleForPresence(state, asset, presenceId))
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
