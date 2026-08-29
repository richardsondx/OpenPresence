import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { readStateForContext, WorkspaceConflictError, writeState } from "@/lib/db";
import { createAssetProcessingJobs, queueAssetProcessing } from "@/lib/asset-library-worker";
import { ingestLibraryImages } from "@/lib/asset-library";
import { putAssetBytes } from "@/lib/asset-store";
import { detectLibraryMedia, supportedLibraryMediaLabel } from "@/lib/asset-media";
import { assertRuntimeScope, createRuntimeScope, stateForContext } from "@/lib/runtime";
import { readRuntimeScopeCookie } from "@/lib/runtime-scope";
import type { AssetSourceAnalysisPolicy, LibrarySource } from "@/lib/types";

function analysisPolicyFor(value: FormDataEntryValue | null): AssetSourceAnalysisPolicy {
  return value === "index-only" || value === "analyze-existing-and-new" ? value : "analyze-new";
}

export async function POST(request: Request) {
  const token = readRuntimeScopeCookie(request.headers.get("cookie"));
  if (!token) return NextResponse.json({ error: "A server-resolved RuntimeScope is required." }, { status: 401 });
  try {
    const stored = readStateForContext(token);
    const scope = createRuntimeScope(stored, { presenceId: token.presenceId });
    assertRuntimeScope(stored, scope);
    const form = await request.formData();
    const entries = form.getAll("files");
    const filePathsValue = form.get("filePaths");
    let filePaths: string[] = [];
    if (typeof filePathsValue === "string" && filePathsValue.trim()) {
      try {
        const parsed = JSON.parse(filePathsValue) as unknown;
        if (Array.isArray(parsed)) filePaths = parsed.filter((value): value is string => typeof value === "string");
      } catch {
        return NextResponse.json({ error: "The selected folder paths could not be read." }, { status: 400 });
      }
    }
    const files: Array<{ bytes: Buffer; mimeType: string; assetType: "image" | "gif" | "video"; fileName: string; path: string }> = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || !("arrayBuffer" in entry)) continue;
      const candidate = entry as File;
      const fileName = candidate.name || "uploaded-visual";
      const bytes = Buffer.from(await candidate.arrayBuffer());
      const detected = detectLibraryMedia(fileName, candidate.type || "", bytes);
      if (!detected) return NextResponse.json({ error: `${fileName} is not a supported visual file. OpenPresence accepts ${supportedLibraryMediaLabel}.` }, { status: 415 });
      files.push({ bytes, mimeType: detected.mimeType, assetType: detected.assetType, fileName, path: filePaths[files.length] || fileName });
    }
    if (!files.length) return NextResponse.json({ error: `Choose at least one supported visual file (${supportedLibraryMediaLabel}).` }, { status: 400 });
    const sourceIdValue = form.get("sourceId");
    const collectionIdValue = form.get("collectionId");
    const sourceNameValue = form.get("sourceName");
    const sourceId = typeof sourceIdValue === "string" && sourceIdValue.trim() ? sourceIdValue.trim() : undefined;
    const collectionId = typeof collectionIdValue === "string" && collectionIdValue.trim() ? collectionIdValue.trim() : undefined;
    const sourceName = typeof sourceNameValue === "string" && sourceNameValue.trim() ? sourceNameValue.trim().slice(0, 2000) : "Operator upload";
    const analysisPolicy = analysisPolicyFor(form.get("analysisPolicy"));
    const state = stateForContext(stored, { agentId: scope.agentId, presenceId: scope.presenceId });
    let effectiveSourceId = sourceId;
    if (!effectiveSourceId) {
      const at = new Date().toISOString();
      const source: LibrarySource = { id: `asset-source_${randomUUID()}`, agentId: scope.agentId, type: "content-drop", location: sourceName, access: "read", status: "available", analysisPolicy, createdAt: at, updatedAt: at };
      state.librarySources.unshift(source);
      effectiveSourceId = source.id;
    }
    const result = await ingestLibraryImages(state, { agentId: scope.agentId, sourceId: effectiveSourceId, collectionId, files, storeBytes: putAssetBytes });
    createAssetProcessingJobs(result.state, scope.agentId, result.newAssetIds);
    writeState(result.state);
    // Processing is deliberately asynchronous: the upload request only
    // durably stores bytes and creates the auditable worker jobs.
    queueAssetProcessing(scope.agentId, result.newAssetIds);
    return NextResponse.json({ sourceId: effectiveSourceId, assets: result.assets, queuedAssetIds: result.newAssetIds });
  } catch (error) {
    if (error instanceof WorkspaceConflictError) return NextResponse.json({ error: "The Asset Library changed while this import was being stored. Retry the import." }, { status: 409 });
    const message = error instanceof Error ? error.message : "The Asset import failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
