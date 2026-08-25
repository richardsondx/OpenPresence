import type {
  KnowledgeCollection,
  KnowledgeContextPacket,
  KnowledgeDocument,
  KnowledgeEvidence,
  KnowledgeItem,
  KnowledgeRole,
  KnowledgeSegment,
  KnowledgeSourceType,
  KnowledgeUse,
  KnowledgeVersion,
  FileKind,
  OpenPresenceState,
  PresenceKnowledgeAccess,
} from "./types";

export const KNOWLEDGE_COLLECTION_DESCRIPTION_MAX_LENGTH = 20_000;

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const rank: Record<KnowledgeUse, number> = { none: 0, internal: 1, public: 2 };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function knowledgeUseLabel(use: KnowledgeUse) {
  return use === "public" ? "Public" : use === "internal" ? "Internal" : "Not available";
}

export function effectiveKnowledgeUse(collection: KnowledgeCollection, item: KnowledgeItem): KnowledgeUse {
  return item.useOverride ?? collection.defaultUse;
}

function documentUse(document: KnowledgeDocument) {
  return document.knowledgeUse;
}

function accessFor(state: OpenPresenceState, presenceId: string, agentId: string) {
  return (state.presenceKnowledgeAccess ?? []).find((access) => access.agentId === agentId && access.presenceId === presenceId && access.enabled);
}

export function effectivePresenceKnowledgeUse(state: OpenPresenceState, presenceId: string, document: KnowledgeDocument): KnowledgeUse;
export function effectivePresenceKnowledgeUse(state: OpenPresenceState, presenceId: string, collectionId: string, item: KnowledgeItem): KnowledgeUse;
export function effectivePresenceKnowledgeUse(state: OpenPresenceState, presenceId: string, documentOrCollectionId: KnowledgeDocument | string, legacyItem?: KnowledgeItem) {
  const document = typeof documentOrCollectionId === "string"
    ? (() => {
      const collection = (state.knowledgeCollections ?? []).find((candidate) => candidate.id === documentOrCollectionId && candidate.agentId === state.agent?.id && candidate.status === "active");
      const item = legacyItem && (state.knowledgeItems ?? []).find((candidate) => candidate.id === legacyItem.id && candidate.collectionId === documentOrCollectionId);
      if (!collection || !item || item.status !== "active") return undefined;
      return {
        id: item.id,
        agentId: collection.agentId,
        name: item.title,
        sourceType: item.sourceType,
        role: item.role,
        knowledgeUse: effectiveKnowledgeUse(collection, item),
        effectiveFrom: item.effectiveFrom,
        reviewAfter: item.reviewAfter,
        status: item.status,
        currentVersionId: item.currentVersionId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        legacyCollectionId: collection.id,
        legacyCollectionName: collection.name,
      } satisfies KnowledgeDocument;
    })()
    : documentOrCollectionId;
  if (!document || document.agentId !== state.agent?.id || document.status !== "active") return "none" as const;
  const access = accessFor(state, presenceId, document.agentId);
  if (!access || access.maximumUse === "none") return "none" as const;
  const sourceUse = documentUse(document);
  return (rank[sourceUse] <= rank[access.maximumUse] ? sourceUse : access.maximumUse) as KnowledgeUse;
}

function normalizeTokens(value: string) {
  const aliases: Record<string, string> = { identities: "identity", presences: "presence", publicly: "public", disclose: "public", authorized: "access", authorization: "access", permission: "access", permissions: "access", private: "internal", confidential: "internal", procedures: "procedure", procedural: "procedure", documents: "document", versions: "version", versioned: "version", sources: "source" };
  return value.toLowerCase().match(/[a-z0-9]+/g)?.map((token) => aliases[token] ?? token).filter((token) => token.length > 2) ?? [];
}

function tokenCount(value: string) {
  return normalizeTokens(value).length;
}

export function segmentKnowledgeContent(content: string): KnowledgeSegment[] {
  const segments: KnowledgeSegment[] = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const headingPath: string[] = [];
  let block: string[] = [];
  let blockStart = 0;
  let offset = 0;
  const flush = () => {
    const text = block.join("\n").trim();
    if (!text) return;
    const start = blockStart + block.join("\n").indexOf(text);
    segments.push({ id: id("knowledge-segment"), knowledgeVersionId: "__pending__", ordinal: segments.length, headingPath: headingPath.filter(Boolean), text, textRange: { start, end: start + text.length }, contentHash: hash(text), tokenCount: tokenCount(text), indexStatus: "ready" });
    block = [];
  };
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      flush();
      const level = heading[1]!.length;
      headingPath.splice(level - 1);
      headingPath[level - 1] = heading[2]!.trim();
      offset += line.length + 1;
      blockStart = offset;
      continue;
    }
    if (!line.trim()) {
      flush();
      offset += 1;
      blockStart = offset;
      continue;
    }
    if (!block.length) blockStart = offset;
    block.push(line);
    offset += line.length + 1;
    if (block.join("\n").length >= 1400) flush();
  }
  flush();
  return segments;
}

function legacyDocuments(state: OpenPresenceState) {
  const collections = state.knowledgeCollections ?? [];
  const items = state.knowledgeItems ?? [];
  return items.flatMap((item) => {
    const collection = collections.find((candidate) => candidate.id === item.collectionId);
    if (!collection) return [];
    return [{
      id: item.id,
      agentId: collection.agentId,
      name: item.title,
      sourceType: item.sourceType,
      role: item.role,
      knowledgeUse: effectiveKnowledgeUse(collection, item),
      effectiveFrom: item.effectiveFrom,
      reviewAfter: item.reviewAfter,
      status: item.status,
      currentVersionId: item.currentVersionId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      legacyCollectionId: collection.id,
      legacyCollectionName: collection.name,
    } satisfies KnowledgeDocument];
  });
}

function uniqueDocumentNames(documents: KnowledgeDocument[]) {
  const seen = new Map<string, number>();
  return documents.map((document) => {
    const key = `${document.agentId}:\u0000${document.name}`;
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (count === 0) return document;
    const suffix = document.legacyCollectionName ? ` — ${document.legacyCollectionName}` : "";
    let candidate = `${document.name}${suffix}`;
    let serial = 2;
    while (documents.some((other) => other !== document && other.agentId === document.agentId && other.name === candidate)) candidate = `${document.name}${suffix} (${serial++})`;
    return { ...document, name: candidate };
  });
}

/** Idempotently projects legacy Collection/Item payloads into Agent-owned documents. */
export function migrateKnowledgeState(source: OpenPresenceState): OpenPresenceState {
  const state = clone(source);
  state.mindFileKnowledgeBindings = state.mindFileKnowledgeBindings ?? [];
  const existing = state.knowledgeDocuments ?? [];
  const migrated = uniqueDocumentNames([...existing, ...legacyDocuments(state).filter((legacy) => !existing.some((document) => document.id === legacy.id))]);
  state.knowledgeDocuments = migrated;
  const access = new Map<string, PresenceKnowledgeAccess>();
  for (const item of state.presenceKnowledgeAccess ?? []) access.set(`${item.agentId}:${item.presenceId}`, item);
  for (const binding of state.presenceKnowledgeBindings ?? []) {
    const key = `${binding.agentId}:${binding.presenceId}`;
    const maximumUse = binding.enabled ? binding.maximumUse : "none";
    const previous = access.get(key);
    if (!previous || rank[maximumUse] < rank[previous.maximumUse]) access.set(key, { id: previous?.id ?? id("knowledge-access"), agentId: binding.agentId, presenceId: binding.presenceId, maximumUse, enabled: maximumUse !== "none", createdAt: previous?.createdAt ?? binding.createdAt, updatedAt: binding.updatedAt });
  }
  state.presenceKnowledgeAccess = [...access.values()];
  state.knowledgeRetrievalRuns = state.knowledgeRetrievalRuns.map((run) => ({ ...run, knowledgeAccess: run.knowledgeAccess ?? "none", accessibleDocumentIds: run.accessibleDocumentIds ?? [] }));
  state.knowledgeCitations = state.knowledgeCitations.map((citation) => ({ ...citation, knowledgeDocumentId: citation.knowledgeDocumentId ?? citation.knowledgeItemId ?? "" }));
  return state;
}

function currentRuntime(source: OpenPresenceState, presenceId: string) {
  const state = migrateKnowledgeState(source);
  const documents = state.knowledgeDocuments.filter((document) => document.agentId === state.agent?.id && document.status === "active");
  const allowed = documents.filter((document) => effectivePresenceKnowledgeUse(state, presenceId, document) !== "none");
  const documentById = new Map(allowed.map((document) => [document.id, document]));
  const versions = state.knowledgeVersions.filter((version) => documentById.get(version.itemId)?.currentVersionId === version.id && version.parseStatus === "ready");
  return { state, documents, allowed, documentById, versions };
}

function evidenceFor(state: OpenPresenceState, presenceId: string, segment: KnowledgeSegment, version: KnowledgeVersion, sourceUse?: KnowledgeUse): KnowledgeEvidence | undefined {
  const document = state.knowledgeDocuments.find((candidate) => candidate.id === version.itemId);
  if (!document) return undefined;
  const effectiveUse = sourceUse ?? effectivePresenceKnowledgeUse(state, presenceId, document);
  if (effectiveUse === "none") return undefined;
  return { agentId: document.agentId, documentId: document.id, documentName: document.name, versionId: version.id, versionNumber: version.versionNumber, segmentId: segment.id, headingPath: segment.headingPath, pageNumber: segment.pageNumber, textRange: segment.textRange, excerpt: segment.text, effectiveUse, sourceType: document.sourceType, reviewAfter: document.reviewAfter, collectionId: document.legacyCollectionId, collectionName: document.legacyCollectionName, itemId: document.id, itemTitle: document.name };
}

function boundMindFileEvidence(state: OpenPresenceState, presenceId: string): Partial<Record<FileKind, KnowledgeEvidence[]>> {
  const bindings = (state.mindFileKnowledgeBindings ?? []).filter((binding) => binding.agentId === state.agent?.id && binding.enabled);
  const grouped: Partial<Record<FileKind, KnowledgeEvidence[]>> = {};
  for (const binding of bindings) {
    const document = state.knowledgeDocuments.find((candidate) => candidate.id === binding.knowledgeDocumentId && candidate.agentId === state.agent?.id && candidate.status === "active");
    if (!document || effectivePresenceKnowledgeUse(state, presenceId, document) === "none" || !document.currentVersionId) continue;
    const version = state.knowledgeVersions.find((candidate) => candidate.id === document.currentVersionId && candidate.parseStatus === "ready");
    if (!version) continue;
    const evidence = state.knowledgeSegments
      .filter((segment) => segment.knowledgeVersionId === version.id && segment.indexStatus === "ready")
      .slice(0, 32)
      .map((segment) => evidenceFor(state, presenceId, segment, version))
      .filter((item): item is KnowledgeEvidence => Boolean(item));
    if (evidence.length) grouped[binding.fileKind] = [...(grouped[binding.fileKind] ?? []), ...evidence];
  }
  return grouped;
}

function conflictMessages(results: KnowledgeEvidence[]) {
  const byDocument = new Map<string, KnowledgeEvidence[]>();
  for (const result of results) byDocument.set(result.documentId, [...(byDocument.get(result.documentId) ?? []), result]);
  if (byDocument.size < 2) return [];
  const numericSets = [...byDocument.values()].map((items) => new Set(items.flatMap((item) => item.excerpt.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [])));
  const distinctNumbers = new Set(numericSets.flatMap((values) => [...values]));
  return distinctNumbers.size > 1 && numericSets.some((values) => values.size > 0) ? ["Accessible sources contain conflicting numeric claims. The Agent should not silently merge them."] : [];
}

export interface KnowledgeSearchResult {
  retrievalRunId: string;
  results: KnowledgeEvidence[];
  knowledgeAccess: KnowledgeUse;
  accessibleDocumentIds: string[];
  accessibleCollectionIds?: string[];
  missingEvidence?: string[];
  unresolvedConflicts?: string[];
  staleWarnings?: string[];
}

export interface KnowledgeSearchInput { presenceId: string; query: string; purpose?: string; invocationId?: string; limit?: number; }

export function searchKnowledge(source: OpenPresenceState, input: KnowledgeSearchInput): { state: OpenPresenceState; result: KnowledgeSearchResult } {
  const runtime = currentRuntime(source, input.presenceId);
  const queryTokens = normalizeTokens(input.query);
  const segments = runtime.state.knowledgeSegments.filter((segment) => runtime.versions.some((version) => version.id === segment.knowledgeVersionId));
  const scored = segments.map((segment) => {
    const version = runtime.versions.find((candidate) => candidate.id === segment.knowledgeVersionId)!;
    const document = runtime.documentById.get(version.itemId)!;
    const searchable = `${document.name} ${(segment.headingPath ?? []).join(" ")} ${segment.text}`;
    const tokens = new Set(normalizeTokens(searchable));
    const overlap = queryTokens.filter((token) => tokens.has(token)).length;
    const phraseBoost = input.query.trim() && searchable.toLowerCase().includes(input.query.trim().toLowerCase()) ? 4 : 0;
    const headingBoost = queryTokens.filter((token) => (segment.headingPath ?? []).some((heading) => normalizeTokens(heading).includes(token))).length * 2;
    return { segment, version, score: overlap * 3 + phraseBoost + headingBoost };
  }).filter((candidate) => candidate.score > 0).sort((left, right) => right.score - left.score || left.segment.ordinal - right.segment.ordinal).slice(0, Math.max(1, Math.min(12, input.limit ?? 6)));
  const results = scored.map(({ segment, version }) => evidenceFor(runtime.state, input.presenceId, segment, version)).filter((item): item is KnowledgeEvidence => Boolean(item));
  const retrievalRunId = id("knowledge-retrieval");
  const access = accessFor(runtime.state, input.presenceId, runtime.state.agent?.id ?? "");
  const run = { id: retrievalRunId, agentId: runtime.state.agent?.id ?? "", presenceId: input.presenceId, invocationId: input.invocationId ?? id("invocation"), purpose: input.purpose ?? "operator_chat", query: input.query, knowledgeAccess: access?.maximumUse ?? "none", accessibleDocumentIds: runtime.allowed.map((document) => document.id), accessibleCollectionIds: runtime.allowed.map((document) => document.legacyCollectionId).filter((value): value is string => Boolean(value)), candidateSegmentIds: segments.map((segment) => segment.id), selectedSegmentIds: results.map((result) => result.segmentId), createdAt: now() };
  runtime.state.knowledgeRetrievalRuns.unshift(run);
  for (const result of results) runtime.state.knowledgeCitations.unshift({ id: id("knowledge-citation"), retrievalRunId, knowledgeDocumentId: result.documentId, knowledgeItemId: result.documentId, knowledgeVersionId: result.versionId, knowledgeSegmentId: result.segmentId, usage: "retrieved", createdAt: now() });
  const staleWarnings = results.filter((result) => result.reviewAfter && new Date(result.reviewAfter).getTime() < Date.now()).map((result) => `${result.documentName} is past its review date.`);
  const missingEvidence = results.length ? undefined : ["No accessible, current Knowledge source matched this question."];
  const unresolvedConflicts = conflictMessages(results);
  return { state: runtime.state, result: { retrievalRunId, results, knowledgeAccess: run.knowledgeAccess, accessibleDocumentIds: run.accessibleDocumentIds, accessibleCollectionIds: run.accessibleCollectionIds, ...(missingEvidence ? { missingEvidence } : {}), ...(unresolvedConflicts.length ? { unresolvedConflicts } : {}), ...(staleWarnings.length ? { staleWarnings } : {}) } };
}

export function compileKnowledgeContext(source: OpenPresenceState, input: KnowledgeSearchInput): { state: OpenPresenceState; packet: KnowledgeContextPacket } {
  const searched = searchKnowledge(source, input);
  const mindFileEvidence = boundMindFileEvidence(searched.state, input.presenceId);
  const styleEvidence = input.purpose === "social_planning" ? (mindFileEvidence.TASTE ?? []).slice(0, 24) : [];
  const styleSegmentIds = new Set(styleEvidence.map((item) => item.segmentId));
  const packet: KnowledgeContextPacket = { retrievalRunId: searched.result.retrievalRunId, publicEvidence: searched.result.results.filter((result) => result.effectiveUse === "public" && !styleSegmentIds.has(result.segmentId)), restrictedEvidence: searched.result.results.filter((result) => result.effectiveUse === "internal" && !styleSegmentIds.has(result.segmentId)), styleEvidence, mindFileEvidence, ...(searched.result.unresolvedConflicts ? { unresolvedConflicts: searched.result.unresolvedConflicts } : {}), ...(searched.result.missingEvidence ? { missingEvidence: searched.result.missingEvidence } : {}), ...(searched.result.staleWarnings ? { staleWarnings: searched.result.staleWarnings } : {}) };
  const boundEvidence = Object.values(mindFileEvidence).flatMap((items) => items ?? []);
  const reliedOn = new Set(searched.result.results.map((result) => result.segmentId));
  for (const result of boundEvidence) {
    if (!searched.state.knowledgeCitations.some((citation) => citation.retrievalRunId === packet.retrievalRunId && citation.knowledgeSegmentId === result.segmentId)) {
      searched.state.knowledgeCitations.unshift({ id: id("knowledge-citation"), retrievalRunId: packet.retrievalRunId, knowledgeDocumentId: result.documentId, knowledgeItemId: result.documentId, knowledgeVersionId: result.versionId, knowledgeSegmentId: result.segmentId, usage: "constraint", createdAt: now() });
    }
  }
  searched.state.knowledgeCitations = searched.state.knowledgeCitations.map((citation) => citation.retrievalRunId === packet.retrievalRunId && reliedOn.has(citation.knowledgeSegmentId) ? { ...citation, usage: "relied_on" as const } : citation);
  return { state: searched.state, packet };
}

export function readKnowledge(source: OpenPresenceState, input: { presenceId: string; segmentId: string; invocationId?: string; purpose?: string }) {
  const runtime = currentRuntime(source, input.presenceId);
  const segment = runtime.state.knowledgeSegments.find((candidate) => candidate.id === input.segmentId);
  const version = segment && runtime.state.knowledgeVersions.find((candidate) => candidate.id === segment.knowledgeVersionId);
  const document = version && runtime.state.knowledgeDocuments.find((candidate) => candidate.id === version.itemId);
  if (!segment || !version || !document || effectivePresenceKnowledgeUse(runtime.state, input.presenceId, document) === "none" || document.currentVersionId !== version.id) throw new Error("That Knowledge passage is not available to this Presence.");
  const adjacent = runtime.state.knowledgeSegments.filter((candidate) => candidate.knowledgeVersionId === version.id && Math.abs(candidate.ordinal - segment.ordinal) <= 1).sort((left, right) => left.ordinal - right.ordinal);
  const retrievalRunId = id("knowledge-read");
  runtime.state.knowledgeRetrievalRuns.unshift({ id: retrievalRunId, agentId: runtime.state.agent?.id ?? "", presenceId: input.presenceId, invocationId: input.invocationId ?? id("invocation"), purpose: input.purpose ?? "operator_chat", query: `read:${segment.id}`, knowledgeAccess: effectivePresenceKnowledgeUse(runtime.state, input.presenceId, document), accessibleDocumentIds: [document.id], accessibleCollectionIds: document.legacyCollectionId ? [document.legacyCollectionId] : [], candidateSegmentIds: adjacent.map((candidate) => candidate.id), selectedSegmentIds: adjacent.map((candidate) => candidate.id), createdAt: now() });
  for (const candidate of adjacent) runtime.state.knowledgeCitations.unshift({ id: id("knowledge-citation"), retrievalRunId, knowledgeDocumentId: document.id, knowledgeItemId: document.id, knowledgeVersionId: version.id, knowledgeSegmentId: candidate.id, usage: "relied_on", createdAt: now() });
  return { state: runtime.state, retrievalRunId, evidence: adjacent.map((candidate) => evidenceFor(runtime.state, input.presenceId, candidate, version)).filter((item): item is KnowledgeEvidence => Boolean(item)) };
}

function sourceMime(name: string, sourceType: KnowledgeSourceType, explicit?: string) {
  if (explicit) return explicit;
  if (/\.json$/i.test(name)) return "application/json";
  if (sourceType === "markdown" || /\.md$/i.test(name)) return "text/markdown";
  return "text/plain";
}

function normalizedContent(value: string) {
  const content = value.replace(/\r\n/g, "\n").trim();
  if (!content) throw new Error("Knowledge needs readable text before it can be indexed.");
  return content;
}

export function createKnowledgeDocument(source: OpenPresenceState, input: { name: string; content: string; sourceType?: KnowledgeSourceType; mimeType?: string; originalAssetId?: string }) {
  const state = migrateKnowledgeState(source);
  if (!state.agent?.id) throw new Error("Create an Agent before adding Knowledge.");
  const name = input.name.trim();
  if (!name) throw new Error("Name the Knowledge document before saving it.");
  const content = normalizedContent(input.content);
  const timestamp = now();
  const sourceType = input.sourceType ?? (/\.md(?:own)?$/i.test(name) ? "markdown" : "pasted_text");
  const document: KnowledgeDocument = { id: id("knowledge-document"), agentId: state.agent.id, name, sourceType, role: "reference", knowledgeUse: "internal", status: "active", createdAt: timestamp, updatedAt: timestamp };
  const version: KnowledgeVersion = { id: id("knowledge-version"), itemId: document.id, versionNumber: 1, originalAssetId: input.originalAssetId, contentHash: hash(content), mimeType: sourceMime(name, sourceType, input.mimeType), normalizedContent: content, parseStatus: "ready", createdAt: timestamp };
  document.currentVersionId = version.id;
  const segments = segmentKnowledgeContent(content).map((segment) => ({ ...segment, knowledgeVersionId: version.id }));
  state.knowledgeDocuments.unshift(document);
  state.knowledgeVersions.unshift(version);
  state.knowledgeSegments.unshift(...segments);
  return state;
}

export function saveKnowledgeDocument(source: OpenPresenceState, input: { documentId: string; name: string; content: string; mimeType?: string; originalAssetId?: string }) {
  const state = migrateKnowledgeState(source);
  const document = state.knowledgeDocuments.find((candidate) => candidate.id === input.documentId && candidate.agentId === state.agent?.id && candidate.status === "active");
  if (!document) throw new Error("That Knowledge document is not available in this Agent.");
  const name = input.name.trim();
  if (!name) throw new Error("Name the Knowledge document before saving it.");
  const content = normalizedContent(input.content);
  const previous = document.currentVersionId ? state.knowledgeVersions.find((version) => version.id === document.currentVersionId) : undefined;
  document.name = name;
  document.updatedAt = now();
  if (previous?.normalizedContent === content) return state;
  const version: KnowledgeVersion = { id: id("knowledge-version"), itemId: document.id, versionNumber: (previous?.versionNumber ?? 0) + 1, supersedesVersionId: previous?.id, originalAssetId: input.originalAssetId, contentHash: hash(content), mimeType: sourceMime(name, document.sourceType, input.mimeType), normalizedContent: content, parseStatus: "ready", createdAt: now() };
  document.currentVersionId = version.id;
  state.knowledgeVersions.unshift(version);
  state.knowledgeSegments.unshift(...segmentKnowledgeContent(content).map((segment) => ({ ...segment, knowledgeVersionId: version.id })));
  return state;
}

export function setKnowledgeAccess(source: OpenPresenceState, input: { presenceId: string; maximumUse: KnowledgeUse; enabled?: boolean }) {
  const state = migrateKnowledgeState(source);
  if (!state.agent?.id || !state.presences.some((presence) => presence.id === input.presenceId)) throw new Error("That Presence is not available in this Agent.");
  const timestamp = now();
  const enabled = input.enabled ?? input.maximumUse !== "none";
  const current = state.presenceKnowledgeAccess.find((access) => access.agentId === state.agent?.id && access.presenceId === input.presenceId);
  const next: PresenceKnowledgeAccess = { id: current?.id ?? id("knowledge-access"), agentId: state.agent.id, presenceId: input.presenceId, maximumUse: enabled ? input.maximumUse : "none", enabled, createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp };
  state.presenceKnowledgeAccess = [next, ...state.presenceKnowledgeAccess.filter((access) => access.id !== next.id)];
  return state;
}

export function setMindFileKnowledgeBinding(source: OpenPresenceState, input: { fileKind: FileKind; knowledgeDocumentId: string; enabled: boolean }) {
  const state = migrateKnowledgeState(source);
  if (!state.agent?.id) throw new Error("Create an Agent before configuring meaning-file Knowledge.");
  const document = state.knowledgeDocuments.find((candidate) => candidate.id === input.knowledgeDocumentId && candidate.agentId === state.agent?.id && candidate.status === "active");
  if (!document) throw new Error("That Knowledge document is not available in this Agent.");
  const timestamp = now();
  const current = (state.mindFileKnowledgeBindings ?? []).find((binding) => binding.agentId === state.agent?.id && binding.fileKind === input.fileKind && binding.knowledgeDocumentId === input.knowledgeDocumentId);
  const next = { id: current?.id ?? id("mind-file-knowledge"), agentId: state.agent.id, fileKind: input.fileKind, knowledgeDocumentId: input.knowledgeDocumentId, enabled: input.enabled, createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp };
  state.mindFileKnowledgeBindings = [next, ...(state.mindFileKnowledgeBindings ?? []).filter((binding) => binding.id !== next.id)];
  return state;
}

export function archiveKnowledgeDocument(source: OpenPresenceState, documentId: string) {
  const state = migrateKnowledgeState(source);
  const document = state.knowledgeDocuments.find((candidate) => candidate.id === documentId && candidate.agentId === state.agent?.id);
  if (!document) throw new Error("That Knowledge document is not available in this Agent.");
  document.status = "archived";
  document.updatedAt = now();
  return state;
}

// Compatibility operations keep old clients and historical fixtures readable.
export function createKnowledgeCollection(source: OpenPresenceState, input: { name: string; description?: string; defaultRole: KnowledgeRole; defaultUse: KnowledgeUse }) {
  const state = clone(source);
  if (!state.agent?.id) throw new Error("Create an Agent before adding Knowledge.");
  const timestamp = now();
  state.knowledgeCollections = [{ id: id("knowledge-collection"), agentId: state.agent.id, name: input.name.trim(), description: input.description?.trim() || undefined, defaultRole: input.defaultRole, defaultUse: input.defaultUse, status: "active", createdAt: timestamp, updatedAt: timestamp }, ...(state.knowledgeCollections ?? [])];
  return state;
}

export function updateKnowledgeCollection(source: OpenPresenceState, input: { collectionId: string; name: string; description?: string; defaultRole: KnowledgeRole; defaultUse: KnowledgeUse }) {
  const state = clone(source);
  const collection = (state.knowledgeCollections ?? []).find((candidate) => candidate.id === input.collectionId && candidate.agentId === state.agent?.id && candidate.status === "active");
  if (!collection) throw new Error("That Knowledge collection is not available in this Agent.");
  Object.assign(collection, { name: input.name.trim(), description: input.description?.trim() || undefined, defaultRole: input.defaultRole, defaultUse: input.defaultUse, updatedAt: now() });
  return state;
}

export function addKnowledgeItem(source: OpenPresenceState, input: { collectionId: string; title: string; sourceType: KnowledgeSourceType; role?: KnowledgeRole; useOverride?: KnowledgeUse; content: string; mimeType?: string; originalAssetId?: string }) {
  const state = migrateKnowledgeState(source);
  const collection = (state.knowledgeCollections ?? []).find((candidate) => candidate.id === input.collectionId && candidate.agentId === state.agent?.id && candidate.status === "active");
  if (!collection) throw new Error("That Knowledge collection is not available in this Agent.");
  const next = createKnowledgeDocument(state, { name: input.title, content: input.content, sourceType: input.sourceType, mimeType: input.mimeType, originalAssetId: input.originalAssetId });
  const document = next.knowledgeDocuments[0]!;
  document.legacyCollectionId = collection.id;
  document.legacyCollectionName = collection.name;
  document.role = input.role ?? collection.defaultRole;
  document.knowledgeUse = input.useOverride ?? collection.defaultUse;
  return next;
}

export function uploadKnowledgeVersion(source: OpenPresenceState, input: { itemId: string; content: string; mimeType?: string; originalAssetId?: string }) {
  return saveKnowledgeDocument(source, { documentId: input.itemId, name: (migrateKnowledgeState(source).knowledgeDocuments.find((document) => document.id === input.itemId)?.name ?? "Knowledge document"), content: input.content, mimeType: input.mimeType, originalAssetId: input.originalAssetId });
}

export function setKnowledgeBinding(source: OpenPresenceState, input: { presenceId: string; collectionId: string; maximumUse: KnowledgeUse; enabled?: boolean }) {
  const state = migrateKnowledgeState(source);
  const documents = state.knowledgeDocuments.filter((document) => document.legacyCollectionId === input.collectionId);
  const current = state.presenceKnowledgeAccess.find((access) => access.agentId === state.agent?.id && access.presenceId === input.presenceId);
  const requested = input.enabled === false ? "none" : input.maximumUse;
  const otherUses = documents.length ? documents.map((document) => document.knowledgeUse).reduce((minimum, use) => rank[use] < rank[minimum] ? use : minimum, "public" as KnowledgeUse) : requested;
  return setKnowledgeAccess(state, { presenceId: input.presenceId, maximumUse: rank[requested] < rank[otherUses] ? requested : otherUses, enabled: current?.enabled !== false && requested !== "none" });
}

export function archiveKnowledgeItem(source: OpenPresenceState, itemId: string) {
  return archiveKnowledgeDocument(source, itemId);
}

export function archiveKnowledgeCollection(source: OpenPresenceState, collectionId: string) {
  const state = migrateKnowledgeState(source);
  for (const document of state.knowledgeDocuments.filter((candidate) => candidate.legacyCollectionId === collectionId)) document.status = "archived";
  return state;
}
