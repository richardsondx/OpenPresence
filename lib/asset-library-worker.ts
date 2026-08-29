import { randomUUID } from "node:crypto";
import { watch } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { readStateForContext, WorkspaceConflictError, writeState } from "./db";
import { assetSourceErrorMessage, ingestLibraryImages } from "./asset-library";
import { putAssetBytes } from "./asset-store";
import { detectLibraryMedia } from "./asset-media";
import { inspectDiscoveredAsset } from "./perception-runtime";
import type { AssetPerception, AssetProcessingJob, OpenPresenceState } from "./types";

const activeJobs = new Map<string, Promise<void>>();
const sourceWatchers = new Map<string, { close: () => void; timer?: ReturnType<typeof setTimeout> }>();
const leaseMs = 120_000;
const maxAttempts = 3;

function now() { return new Date().toISOString(); }

function jobFor(state: OpenPresenceState, agentId: string, assetId: string) {
  return state.assetProcessingJobs?.find((job) => job.agentId === agentId && job.assetId === assetId && job.status !== "completed");
}

function persistWithRetry(state: OpenPresenceState) {
  try {
    writeState(state);
    return true;
  } catch (error) {
    if (!(error instanceof WorkspaceConflictError)) throw error;
    return false;
  }
}

async function processOne(agentId: string, assetId: string) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let state = readStateForContext({ agentId });
    const job = jobFor(state, agentId, assetId);
    const asset = state.assets.find((item) => item.id === assetId && item.agentId === agentId);
    if (!job || !asset || asset.archivedAt) return;
    const source = asset.sourceId ? state.librarySources.find((item) => item.id === asset.sourceId && item.agentId === agentId) : undefined;
    if (source?.analysisPolicy === "index-only") {
      job.status = "completed";
      job.progress = 1;
      job.leaseOwner = undefined;
      job.leaseExpiresAt = undefined;
      job.updatedAt = now();
      asset.status = "ready";
      asset.updatedAt = now();
      persistWithRetry(state);
      return;
    }
    const leaseOwner = `asset-worker:${randomUUID()}`;
    job.status = "running";
    job.attempts = Math.max(job.attempts, attempt);
    job.leaseOwner = leaseOwner;
    job.leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString();
    job.progress = 0.1;
    job.updatedAt = now();
    asset.status = "processing";
    asset.updatedAt = now();
    if (!persistWithRetry(state)) continue;
    try {
      state = readStateForContext({ agentId });
      const currentAsset = state.assets.find((item) => item.id === assetId && item.agentId === agentId);
      const currentJob = state.assetProcessingJobs?.find((item) => item.id === job.id);
      const presenceId = state.presence?.id ?? state.presences[0]?.id;
      if (!currentAsset || !currentJob || !presenceId) throw new Error("The Asset no longer has a valid Agent and Presence context.");
      currentJob.progress = 0.35;
      currentJob.updatedAt = now();
      persistWithRetry(state);
      const run = await inspectDiscoveredAsset(state, currentAsset, { visualBrief: "Create durable, concise visual memory for the owning Agent." });
      const next = readStateForContext({ agentId });
      const nextAsset = next.assets.find((item) => item.id === assetId && item.agentId === agentId);
      const nextJob = next.assetProcessingJobs?.find((item) => item.id === job.id);
      if (!nextAsset || !nextJob) return;
      if (run.attempted) {
        const perception: AssetPerception = {
          id: `perception_${assetId}_library_${Date.now().toString(36)}`,
          assetId,
          agentId,
          presenceId,
          scope: "library",
          level: "resolve",
          result: run.result,
          providerId: run.providerId,
          modelId: run.modelId,
          sourceAssetVersion: nextAsset.checksum ?? nextAsset.updatedAt,
          supersedesId: next.perceptions.find((item) => item.assetId === assetId && item.scope === "library")?.id,
          createdAt: now(),
          environment: "live",
        };
        next.perceptions.unshift(perception);
        nextAsset.metadataReview = { status: run.error ? "open" : "resolved" };
        nextAsset.perception = { observation: run.result.observation, likelyMeaning: run.result.interpretation, visibleText: run.result.visibleText ? [run.result.visibleText] : undefined, uncertainty: [run.result.uncertainty] };
        nextAsset.status = "ready";
      } else {
        // No configured vision runtime is an honest review state, not a fake
        // READY state. The bytes are durable and the operator can resolve the
        // metadata or explicitly reanalyze later.
        nextAsset.status = "ready";
      }
      nextJob.status = run.error ? "failed" : "completed";
      nextJob.progress = 1;
      nextJob.lastError = run.error;
      nextJob.leaseOwner = undefined;
      nextJob.leaseExpiresAt = undefined;
      nextJob.updatedAt = now();
      if (run.error && attempt < maxAttempts) {
        nextJob.status = "queued";
        nextJob.progress = 0;
        nextJob.updatedAt = now();
        if (persistWithRetry(next)) continue;
      } else {
        persistWithRetry(next);
      }
      return;
    } catch (error) {
      const failed = readStateForContext({ agentId });
      const failedJob = failed.assetProcessingJobs?.find((item) => item.id === job.id);
      const failedAsset = failed.assets.find((item) => item.id === assetId && item.agentId === agentId);
      if (failedJob) {
        failedJob.lastError = error instanceof Error ? error.message : "Asset processing failed.";
        failedJob.status = attempt < maxAttempts ? "queued" : "failed";
        failedJob.progress = attempt < maxAttempts ? 0 : 1;
        failedJob.leaseOwner = undefined;
        failedJob.leaseExpiresAt = undefined;
        failedJob.updatedAt = now();
      }
      if (failedAsset && attempt >= maxAttempts) { failedAsset.status = "failed"; failedAsset.updatedAt = now(); }
      if (!persistWithRetry(failed)) continue;
    }
  }
}

export function queueAssetProcessing(agentId: string, assetIds: string[]) {
  for (const assetId of [...new Set(assetIds)]) {
    const key = `${agentId}:${assetId}`;
    if (activeJobs.has(key)) continue;
    const task = new Promise<void>((resolve) => {
      setTimeout(() => { void processOne(agentId, assetId).finally(resolve); }, 0);
    }).finally(() => activeJobs.delete(key));
    activeJobs.set(key, task);
  }
}

export function createAssetProcessingJobs(state: OpenPresenceState, agentId: string, assetIds: string[], options: { force?: boolean } = {}) {
  const at = now();
  state.assetProcessingJobs = state.assetProcessingJobs ?? [];
  for (const assetId of [...new Set(assetIds)]) {
    const existing = state.assetProcessingJobs.find((job) => job.agentId === agentId && job.assetId === assetId);
    if (existing && !options.force && existing.status !== "failed") continue;
    if (existing && options.force) {
      existing.status = "queued";
      existing.attempts = 0;
      existing.progress = 0;
      existing.lastError = undefined;
      existing.leaseOwner = undefined;
      existing.leaseExpiresAt = undefined;
      existing.updatedAt = at;
      continue;
    }
    const job: AssetProcessingJob = { id: `asset-job_${randomUUID()}`, agentId, assetId, status: "queued", attempts: 0, maxAttempts, progress: 0, createdAt: at, updatedAt: at };
    state.assetProcessingJobs.unshift(job);
  }
}

async function visualFilesAt(root: string) {
  const files: Array<{ bytes: Buffer; mimeType: string; assetType: "image" | "gif" | "video"; fileName: string; path: string }> = [];
  async function visit(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) { await visit(fullPath); continue; }
      if (!entry.isFile()) continue;
      const info = await stat(fullPath);
      if (info.size > 25 * 1024 * 1024) continue;
      const bytes = await readFile(fullPath);
      const detected = detectLibraryMedia(entry.name, "", bytes);
      if (!detected) continue;
      files.push({ bytes, mimeType: detected.mimeType, assetType: detected.assetType, fileName: entry.name, path: fullPath });
      if (files.length >= 500) return;
    }
  }
  await visit(root);
  return files;
}

export async function scanAssetSourceNow(agentId: string, sourceId: string) {
  let state = readStateForContext({ agentId });
  const source = state.librarySources.find((item) => item.id === sourceId && item.agentId === agentId);
  if (!source) throw new Error("That Asset Source does not belong to the active Agent.");
  if (source.status === "paused") return { imported: 0, queuedAssetIds: [] as string[] };
  source.status = "indexing";
  source.lastError = undefined;
  source.updatedAt = now();
  persistWithRetry(state);
  try {
    const files = await visualFilesAt(source.location);
    state = readStateForContext({ agentId });
    const result = await ingestLibraryImages(state, { agentId, sourceId, files, storeBytes: putAssetBytes });
    const allSourceAssetIds = result.state.assets
      .filter((asset) => asset.agentId === agentId && (asset.sourceId === sourceId || asset.sourceOccurrences?.some((occurrence) => occurrence.sourceId === sourceId)))
      .map((asset) => asset.id);
    const queuedAssetIds = source.analysisPolicy === "analyze-existing-and-new" ? allSourceAssetIds : result.newAssetIds;
    createAssetProcessingJobs(result.state, agentId, queuedAssetIds, { force: source.analysisPolicy === "analyze-existing-and-new" });
    const currentSource = result.state.librarySources.find((item) => item.id === sourceId);
    if (currentSource) { currentSource.status = "available"; currentSource.lastScannedAt = now(); currentSource.updatedAt = now(); }
    persistWithRetry(result.state);
    queueAssetProcessing(agentId, queuedAssetIds);
    return { imported: result.assets.length, queuedAssetIds };
  } catch (error) {
    const message = assetSourceErrorMessage(error);
    const failed = readStateForContext({ agentId });
    const currentSource = failed.librarySources.find((item) => item.id === sourceId && item.agentId === agentId);
    if (currentSource) { currentSource.status = "failed"; currentSource.lastError = message; currentSource.updatedAt = now(); }
    persistWithRetry(failed);
    throw new Error(message);
  }
}

export function startAssetSourceWatcher(agentId: string, sourceId: string, location: string) {
  if (sourceWatchers.has(sourceId)) return;
  try {
    const watcher = watch(location, { recursive: true }, () => {
      const existing = sourceWatchers.get(sourceId);
      if (!existing) return;
      if (existing.timer) clearTimeout(existing.timer);
      existing.timer = setTimeout(() => { void scanAssetSourceNow(agentId, sourceId).catch(() => undefined); }, 750);
    });
    sourceWatchers.set(sourceId, watcher);
  } catch {
    // A source may be connected before its folder is mounted. The next
    // explicit rescan can retry the watcher without making the API unsafe.
  }
}
