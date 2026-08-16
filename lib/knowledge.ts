import type {
  KnowledgeCollection,
  KnowledgeContextPacket,
  KnowledgeEvidence,
  KnowledgeItem,
  KnowledgeRole,
  KnowledgeSegment,
  KnowledgeSourceType,
  KnowledgeUse,
  KnowledgeVersion,
  OpenPresenceState,
  PresenceKnowledgeBinding,
} from "./types";

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const rank: Record<KnowledgeUse, number> = { none: 0, internal: 1, public: 2 };

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function knowledgeUseLabel(use: KnowledgeUse) {
  return use === "public" ? "Public" : use === "internal" ? "Internal" : "Not available";
}

export function effectiveKnowledgeUse(collection: KnowledgeCollection, item: KnowledgeItem): KnowledgeUse {
  return item.useOverride ?? collection.defaultUse;
}

export function effectivePresenceKnowledgeUse(state: OpenPresenceState, presenceId: string, collectionId: string, item: KnowledgeItem) {
  const collection = state.knowledgeCollections.find((candidate) => candidate.id === collectionId && candidate.agentId === state.agent?.id);
  if (!collection || collection.status !== "active" || item.status !== "active") return "none" as const;
  const binding = state.presenceKnowledgeBindings.find((candidate) => candidate.presenceId === presenceId && candidate.collectionId === collectionId && candidate.enabled);
  if (!binding) return "none" as const;
  const sourceUse = effectiveKnowledgeUse(collection, item);
  return (rank[sourceUse] <= rank[binding.maximumUse] ? sourceUse : binding.maximumUse) as KnowledgeUse;
}

function normalizeTokens(value: string) {
  const aliases: Record<string, string> = {
    identities: "identity", identity: "identity", presences: "presence", presence: "presence",
    publicly: "public", public: "public", disclose: "public", disclosure: "public",
    authorized: "access", authorization: "access", permission: "access", permissions: "access",
    private: "internal", confidential: "internal", procedures: "procedure", procedural: "procedure",
    documents: "document", versions: "version", versioned: "version", sources: "source",
  };
  return value.toLowerCase().match(/[a-z0-9]+/g)?.map((token) => aliases[token] ?? token).filter((token) => token.length > 2) ?? [];
}

function tokenCount(value: string) {
  return normalizeTokens(value).length;
}

/** Preserve headings, lists, tables, and paragraph boundaries in a bounded index unit. */
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
    const end = start + text.length;
    segments.push({
      id: id("knowledge-segment"),
      knowledgeVersionId: "__pending__",
      ordinal: segments.length,
      headingPath: headingPath.filter((heading): heading is string => Boolean(heading)),
      text,
      textRange: { start, end },
      contentHash: hash(text),
      tokenCount: tokenCount(text),
      indexStatus: "ready",
    });
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

function currentReadyVersions(state: OpenPresenceState, presenceId: string) {
  const allowedCollections = new Set(state.presenceKnowledgeBindings
    .filter((binding) => binding.presenceId === presenceId && binding.enabled && binding.maximumUse !== "none")
    .map((binding) => binding.collectionId));
  const collections = state.knowledgeCollections.filter((collection) => collection.agentId === state.agent?.id && collection.status === "active" && allowedCollections.has(collection.id));
  const collectionById = new Map(collections.map((collection) => [collection.id, collection]));
  const items = state.knowledgeItems.filter((item) => collectionById.has(item.collectionId) && item.status === "active");
  const itemById = new Map(items.map((item) => [item.id, item]));
  const versions = state.knowledgeVersions.filter((version) => {
    const item = itemById.get(version.itemId);
    return item?.currentVersionId === version.id && version.parseStatus === "ready";
  });
  return { collections, collectionById, itemById, versions, allowedCollections };
}

function evidenceFor(state: OpenPresenceState, presenceId: string, segment: KnowledgeSegment, version: KnowledgeVersion, sourceUse?: KnowledgeUse): KnowledgeEvidence | undefined {
  const item = state.knowledgeItems.find((candidate) => candidate.id === version.itemId);
  const collection = item && state.knowledgeCollections.find((candidate) => candidate.id === item.collectionId);
  if (!item || !collection) return undefined;
  const effectiveUse = sourceUse ?? effectivePresenceKnowledgeUse(state, presenceId, collection.id, item);
  if (effectiveUse === "none") return undefined;
  return { collectionId: collection.id, collectionName: collection.name, itemId: item.id, itemTitle: item.title, versionId: version.id, versionNumber: version.versionNumber, segmentId: segment.id, headingPath: segment.headingPath, pageNumber: segment.pageNumber, textRange: segment.textRange, excerpt: segment.text, effectiveUse, sourceType: item.sourceType, reviewAfter: item.reviewAfter };
}

function conflictMessages(results: KnowledgeEvidence[]) {
  const byItem = new Map<string, KnowledgeEvidence[]>();
  for (const result of results) byItem.set(result.itemId, [...(byItem.get(result.itemId) ?? []), result]);
  if (byItem.size < 2) return [];
  const numericSets = [...byItem.values()].map((items) => new Set(items.flatMap((item) => item.excerpt.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [])));
  const distinctNumbers = new Set(numericSets.flatMap((values) => [...values]));
  return distinctNumbers.size > 1 && numericSets.some((values) => values.size > 0)
    ? ["Accessible sources contain conflicting numeric claims. The Agent should not silently merge them."]
    : [];
}

export interface KnowledgeSearchResult {
  retrievalRunId: string;
  results: KnowledgeEvidence[];
  accessibleCollectionIds: string[];
  missingEvidence?: string[];
  unresolvedConflicts?: string[];
  staleWarnings?: string[];
}

export interface KnowledgeSearchInput {
  presenceId: string;
  query: string;
  purpose?: string;
  invocationId?: string;
  limit?: number;
}

export function searchKnowledge(source: OpenPresenceState, input: KnowledgeSearchInput): { state: OpenPresenceState; result: KnowledgeSearchResult } {
  const state = clone(source);
  const runtime = currentReadyVersions(state, input.presenceId);
  const queryTokens = normalizeTokens(input.query);
  const segments = state.knowledgeSegments.filter((segment) => runtime.versions.some((version) => version.id === segment.knowledgeVersionId));
  const scored = segments.map((segment) => {
    const version = runtime.versions.find((candidate) => candidate.id === segment.knowledgeVersionId)!;
    const item = runtime.itemById.get(version.itemId)!;
    const collection = runtime.collectionById.get(item.collectionId)!;
    const searchable = `${collection.name} ${item.title} ${(segment.headingPath ?? []).join(" ")} ${segment.text}`;
    const tokens = new Set(normalizeTokens(searchable));
    const overlap = queryTokens.filter((token) => tokens.has(token)).length;
    const phraseBoost = input.query.trim() && searchable.toLowerCase().includes(input.query.trim().toLowerCase()) ? 4 : 0;
    const headingBoost = queryTokens.filter((token) => (segment.headingPath ?? []).some((heading) => normalizeTokens(heading).includes(token))).length * 2;
    return { segment, version, score: overlap * 3 + phraseBoost + headingBoost };
  }).filter((candidate) => candidate.score > 0).sort((left, right) => right.score - left.score || left.segment.ordinal - right.segment.ordinal).slice(0, Math.max(1, Math.min(12, input.limit ?? 6)));
  const results = scored.map(({ segment, version }) => evidenceFor(state, input.presenceId, segment, version)).filter((item): item is KnowledgeEvidence => Boolean(item));
  const retrievalRunId = id("knowledge-retrieval");
  const run = { id: retrievalRunId, agentId: state.agent?.id ?? "", presenceId: input.presenceId, invocationId: input.invocationId ?? id("invocation"), purpose: input.purpose ?? "operator_chat", query: input.query, accessibleCollectionIds: runtime.collections.map((collection) => collection.id), candidateSegmentIds: segments.map((segment) => segment.id), selectedSegmentIds: results.map((result) => result.segmentId), createdAt: now() };
  state.knowledgeRetrievalRuns.unshift(run);
  for (const result of results) state.knowledgeCitations.unshift({ id: id("knowledge-citation"), retrievalRunId, knowledgeItemId: result.itemId, knowledgeVersionId: result.versionId, knowledgeSegmentId: result.segmentId, usage: "retrieved", createdAt: now() });
  const staleWarnings = results.filter((result) => result.reviewAfter && new Date(result.reviewAfter).getTime() < Date.now()).map((result) => `${result.itemTitle} is past its review date.`);
  const missingEvidence = results.length ? undefined : ["No accessible, current Knowledge source matched this question."];
  return { state, result: { retrievalRunId, results, accessibleCollectionIds: run.accessibleCollectionIds, ...(missingEvidence ? { missingEvidence } : {}), ...(conflictMessages(results).length ? { unresolvedConflicts: conflictMessages(results) } : {}), ...(staleWarnings.length ? { staleWarnings } : {}) } };
}

export function compileKnowledgeContext(source: OpenPresenceState, input: KnowledgeSearchInput): { state: OpenPresenceState; packet: KnowledgeContextPacket } {
  const searched = searchKnowledge(source, input);
  const packet: KnowledgeContextPacket = {
    retrievalRunId: searched.result.retrievalRunId,
    publicEvidence: searched.result.results.filter((result) => result.effectiveUse === "public"),
    restrictedEvidence: searched.result.results.filter((result) => result.effectiveUse === "internal"),
    ...(searched.result.unresolvedConflicts ? { unresolvedConflicts: searched.result.unresolvedConflicts } : {}),
    ...(searched.result.missingEvidence ? { missingEvidence: searched.result.missingEvidence } : {}),
    ...(searched.result.staleWarnings ? { staleWarnings: searched.result.staleWarnings } : {}),
  };
  const reliedOn = new Set(searched.result.results.map((result) => result.segmentId));
  searched.state.knowledgeCitations = searched.state.knowledgeCitations.map((citation) => citation.retrievalRunId === packet.retrievalRunId && reliedOn.has(citation.knowledgeSegmentId) ? { ...citation, usage: "relied_on" as const } : citation);
  return { state: searched.state, packet };
}

export function readKnowledge(source: OpenPresenceState, input: { presenceId: string; segmentId: string; invocationId?: string; purpose?: string }) {
  const state = clone(source);
  const segment = state.knowledgeSegments.find((candidate) => candidate.id === input.segmentId);
  const version = segment && state.knowledgeVersions.find((candidate) => candidate.id === segment.knowledgeVersionId);
  const item = version && state.knowledgeItems.find((candidate) => candidate.id === version.itemId);
  const collection = item && state.knowledgeCollections.find((candidate) => candidate.id === item.collectionId);
  if (!segment || !version || !item || !collection || effectivePresenceKnowledgeUse(state, input.presenceId, collection.id, item) === "none" || item.currentVersionId !== version.id) throw new Error("That Knowledge passage is not available to this Presence.");
  const adjacent = state.knowledgeSegments.filter((candidate) => candidate.knowledgeVersionId === version.id && Math.abs(candidate.ordinal - segment.ordinal) <= 1).sort((left, right) => left.ordinal - right.ordinal);
  const retrievalRunId = id("knowledge-read");
  state.knowledgeRetrievalRuns.unshift({ id: retrievalRunId, agentId: state.agent?.id ?? "", presenceId: input.presenceId, invocationId: input.invocationId ?? id("invocation"), purpose: input.purpose ?? "operator_chat", query: `read:${segment.id}`, accessibleCollectionIds: [collection.id], candidateSegmentIds: adjacent.map((candidate) => candidate.id), selectedSegmentIds: adjacent.map((candidate) => candidate.id), createdAt: now() });
  for (const candidate of adjacent) state.knowledgeCitations.unshift({ id: id("knowledge-citation"), retrievalRunId, knowledgeItemId: item.id, knowledgeVersionId: version.id, knowledgeSegmentId: candidate.id, usage: "relied_on", createdAt: now() });
  return { state, retrievalRunId, evidence: adjacent.map((candidate) => evidenceFor(state, input.presenceId, candidate, version)!).filter(Boolean) };
}

export function createKnowledgeCollection(source: OpenPresenceState, input: { name: string; description?: string; defaultRole: KnowledgeRole; defaultUse: KnowledgeUse }) {
  const state = clone(source);
  if (!state.agent?.id) throw new Error("Create an Agent before adding Knowledge.");
  const timestamp = now();
  state.knowledgeCollections.unshift({ id: id("knowledge-collection"), agentId: state.agent.id, name: input.name.trim(), description: input.description?.trim() || undefined, defaultRole: input.defaultRole, defaultUse: input.defaultUse, status: "active", createdAt: timestamp, updatedAt: timestamp });
  return state;
}

export function updateKnowledgeCollection(source: OpenPresenceState, input: { collectionId: string; name: string; description?: string; defaultRole: KnowledgeRole; defaultUse: KnowledgeUse }) {
  const state = clone(source);
  const collection = state.knowledgeCollections.find((candidate) => candidate.id === input.collectionId && candidate.agentId === state.agent?.id && candidate.status === "active");
  if (!collection) throw new Error("That Knowledge collection is not available in this Agent.");
  collection.name = input.name.trim();
  collection.description = input.description?.trim() || undefined;
  collection.defaultRole = input.defaultRole;
  collection.defaultUse = input.defaultUse;
  collection.updatedAt = now();
  return state;
}

export function addKnowledgeItem(source: OpenPresenceState, input: { collectionId: string; title: string; sourceType: KnowledgeSourceType; role?: KnowledgeRole; useOverride?: KnowledgeUse; content: string; mimeType?: string; originalAssetId?: string }) {
  const state = clone(source);
  const collection = state.knowledgeCollections.find((candidate) => candidate.id === input.collectionId && candidate.agentId === state.agent?.id && candidate.status === "active");
  if (!collection) throw new Error("That Knowledge collection is not available in this Agent.");
  const content = input.content.replace(/\r\n/g, "\n").trim();
  if (!content) throw new Error("Knowledge needs readable text before it can be indexed.");
  const timestamp = now();
  const item: KnowledgeItem = { id: id("knowledge-item"), collectionId: collection.id, title: input.title.trim(), sourceType: input.sourceType, role: input.role ?? collection.defaultRole, useOverride: input.useOverride, status: "active", createdAt: timestamp, updatedAt: timestamp };
  const version: KnowledgeVersion = { id: id("knowledge-version"), itemId: item.id, versionNumber: 1, originalAssetId: input.originalAssetId, contentHash: hash(content), mimeType: input.mimeType ?? (input.sourceType === "markdown" ? "text/markdown" : "text/plain"), normalizedContent: content, parseStatus: "ready", createdAt: timestamp };
  const segments = segmentKnowledgeContent(content).map((segment) => ({ ...segment, knowledgeVersionId: version.id }));
  item.currentVersionId = version.id;
  state.knowledgeItems.unshift(item);
  state.knowledgeVersions.unshift(version);
  state.knowledgeSegments.unshift(...segments);
  collection.updatedAt = timestamp;
  return state;
}

export function uploadKnowledgeVersion(source: OpenPresenceState, input: { itemId: string; content: string; mimeType?: string; originalAssetId?: string }) {
  const state = clone(source);
  const item = state.knowledgeItems.find((candidate) => candidate.id === input.itemId && candidate.status === "active");
  const collection = item && state.knowledgeCollections.find((candidate) => candidate.id === item.collectionId && candidate.agentId === state.agent?.id && candidate.status === "active");
  if (!item || !collection) throw new Error("That Knowledge item is not available in this Agent.");
  const content = input.content.replace(/\r\n/g, "\n").trim();
  if (!content) throw new Error("Knowledge needs readable text before it can be indexed.");
  const previous = item.currentVersionId ? state.knowledgeVersions.find((version) => version.id === item.currentVersionId) : undefined;
  const timestamp = now();
  const version: KnowledgeVersion = { id: id("knowledge-version"), itemId: item.id, versionNumber: (previous?.versionNumber ?? 0) + 1, supersedesVersionId: previous?.id, originalAssetId: input.originalAssetId, contentHash: hash(content), mimeType: input.mimeType ?? "text/plain", normalizedContent: content, parseStatus: "ready", createdAt: timestamp };
  const segments = segmentKnowledgeContent(content).map((segment) => ({ ...segment, knowledgeVersionId: version.id }));
  item.currentVersionId = version.id;
  item.updatedAt = timestamp;
  collection.updatedAt = timestamp;
  state.knowledgeVersions.unshift(version);
  state.knowledgeSegments.unshift(...segments);
  return state;
}

export function setKnowledgeBinding(source: OpenPresenceState, input: { presenceId: string; collectionId: string; maximumUse: KnowledgeUse; enabled?: boolean }) {
  const state = clone(source);
  if (!state.presences.some((presence) => presence.id === input.presenceId) || !state.knowledgeCollections.some((collection) => collection.id === input.collectionId && collection.agentId === state.agent?.id)) throw new Error("That Knowledge binding is outside the current Agent and Presence scope.");
  const timestamp = now();
  const existing = state.presenceKnowledgeBindings.find((binding) => binding.presenceId === input.presenceId && binding.collectionId === input.collectionId);
  const binding: PresenceKnowledgeBinding = existing ?? { id: id("knowledge-binding"), agentId: state.agent?.id ?? "", presenceId: input.presenceId, collectionId: input.collectionId, maximumUse: input.maximumUse, enabled: input.enabled !== false, createdAt: timestamp, updatedAt: timestamp };
  binding.maximumUse = input.maximumUse;
  binding.enabled = input.enabled !== false;
  binding.updatedAt = timestamp;
  state.presenceKnowledgeBindings = existing ? state.presenceKnowledgeBindings.map((candidate) => candidate.id === existing.id ? binding : candidate) : [binding, ...state.presenceKnowledgeBindings];
  return state;
}

export function archiveKnowledgeItem(source: OpenPresenceState, itemId: string) {
  const state = clone(source);
  const item = state.knowledgeItems.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error("That Knowledge item no longer exists.");
  item.status = "archived";
  item.updatedAt = now();
  return state;
}

export function archiveKnowledgeCollection(source: OpenPresenceState, collectionId: string) {
  const state = clone(source);
  const collection = state.knowledgeCollections.find((candidate) => candidate.id === collectionId);
  if (!collection) throw new Error("That Knowledge collection no longer exists.");
  collection.status = "archived";
  collection.updatedAt = now();
  return state;
}
