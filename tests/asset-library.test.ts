import { describe, expect, it } from "vitest";
import { assetIsAvailableForPublication, appendAssetOccurrence, assetHistory, assetIsEligibleForPresence, assetPostingUnavailableUntil, assetReviewReason, assetSourceErrorMessage, assetUsageSummary, authorizeAssetSelection, deriveAssetReadiness, ingestLibraryImages, isLibraryAsset, liveAssetReuseReason, normalizeAssetLibraryState, readEligibleAsset, searchEligibleAssets } from "../lib/asset-library";
import { applyOperation, createAgent, normalizeState } from "../lib/runtime";
import { createOperatorNudge, projectOperatorChatAssetAvailability } from "../lib/operator-chat";
import type { Asset } from "../lib/types";

const input = { name: "Jenny", description: "A careful visual Agent.", mode: "agent" as const, handle: "@jenny", accent: "#D68754" };

function image(agentId: string, id: string, presenceIds?: string[]): Asset {
  return {
    id, agentId, type: "image", mediaKind: "image", sourceId: "source-1", sourceOccurrences: [{ id: `${id}-occurrence`, sourceId: "source-1", fileName: `${id}.png`, path: `/images/${id}.png`, observedAt: "2026-08-28T00:00:00.000Z" }],
    accessScope: presenceIds ? { mode: "selected_presences", presenceIds } : { mode: "all_agent_presences" }, storage: { storeKey: `sha256/${id}`, mimeType: "image/png", byteSize: 12, exactHash: id }, checksum: id, status: "ready", metadataReview: { status: "resolved" }, perception: { observation: "A blue square with a clear white mark.", uncertainty: ["low"] }, provenance: { origin: "operator_upload", importedAt: "2026-08-28T00:00:00.000Z" }, createdAt: "2026-08-28T00:00:00.000Z", updatedAt: "2026-08-28T00:00:00.000Z",
  };
}

function stateWithAssets() {
  const state = createAgent(input);
  state.assets = [image(state.agent!.id, "jenny-asset")];
  state.assets[0]!.description = "Launch chart";
  state.assets[0]!.sourceOccurrences = [{ id: "occurrence-a", sourceId: "source-1", fileName: "chart.png", path: "/launch/chart.png", observedAt: "2026-08-28T00:00:00.000Z" }];
  return state;
}

describe("Agent-scoped Asset Library", () => {
  it("filters another Agent before semantic retrieval and authorizes Presence eligibility", () => {
    const state = stateWithAssets();
    state.assets.push(image("macro-agent", "macro-private"));
    const results = searchEligibleAssets(state, "chart");
    expect(results.map((item) => item.assetId)).toEqual(["jenny-asset"]);
    expect(readEligibleAsset(state, "jenny-asset", state.presence!.id)?.observation).toContain("blue square");
    expect(readEligibleAsset(state, "macro-private", state.presence!.id)).toBeUndefined();
    expect(assetIsEligibleForPresence(state, state.assets[0]!, state.presence!.id)).toBe(true);
    expect(() => authorizeAssetSelection(state, ["macro-private"], { presenceId: state.presence!.id })).toThrow(/another Agent/);
  });

  it("keeps Collection membership separate from Asset authorization", () => {
    let state = stateWithAssets();
    state = applyOperation(state, { type: "createAssetCollection", name: "Launch" });
    const collection = state.assetCollections![0]!;
    state = applyOperation(state, { type: "addAssetToCollection", collectionId: collection.id, assetId: "jenny-asset" });
    expect(searchEligibleAssets(state, "", { collectionId: collection.id })).toHaveLength(1);
    state = applyOperation(state, { type: "removeAssetFromCollection", collectionId: collection.id, assetId: "jenny-asset" });
    expect(searchEligibleAssets(state, "", { collectionId: collection.id })).toHaveLength(0);
    expect(assetIsEligibleForPresence(state, state.assets[0]!, state.presence!.id)).toBe(true);
  });

  it("derives review state from durable metadata instead of a toggle", () => {
    const state = stateWithAssets();
    const asset = state.assets[0]!;
    asset.metadataReview = { status: "open" };
    asset.perception = undefined;
    expect(deriveAssetReadiness(state, asset)).toBe("needs_review");
    expect(deriveAssetReadiness(state, { ...asset, rights: { status: "unknown" }, metadataReview: { status: "resolved" }, perception: { observation: "A visible blue square.", uncertainty: ["low"] } })).toBe("ready");
    const resolved = applyOperation(state, { type: "resolveAssetReview", assetId: asset.id, observation: "A visible blue square." });
    expect(deriveAssetReadiness(resolved, resolved.assets[0]!)).toBe("ready");
  });

  it("keeps automated high-uncertainty perception in review even when its legacy review flag says resolved", () => {
    const state = stateWithAssets();
    const asset = state.assets[0]!;
    asset.metadataReview = { status: "resolved" };
    asset.perception = { observation: "A colorful illustration with a character.", uncertainty: ["high"] };

    expect(deriveAssetReadiness(state, asset)).toBe("needs_review");
    expect(searchEligibleAssets(state, "illustration", { presenceId: state.presence!.id })[0]?.readiness).toBe("needs_review");

    asset.metadataReview = { status: "open" };
    asset.perception.uncertainty = ["low"];
    expect(deriveAssetReadiness(state, asset)).toBe("needs_review");
  });

  it("does not treat an open metadata edit as approval and preserves it on approve", () => {
    const state = stateWithAssets();
    const assetId = state.assets[0]!.id;
    const edited = applyOperation(state, { type: "editAssetMetadata", assetId, observation: "A blue square with a revised mark." });
    expect(deriveAssetReadiness(edited, edited.assets[0]!)).toBe("needs_review");
    const approved = applyOperation(edited, { type: "approveAssetMetadata", assetId });
    expect(deriveAssetReadiness(approved, approved.assets[0]!)).toBe("ready");
    expect(approved.assetMetadataEdits?.[0]?.observation).toBe("A blue square with a revised mark.");
  });

  it("keeps unresolved reference media blocked for direct selection but permits an explicit publication review", () => {
    const state = stateWithAssets();
    const asset = state.assets[0]!;
    asset.reusePermission = "reference_only";
    asset.metadataReview = { status: "open" };
    asset.perception = undefined;

    expect(assetReviewReason(state, asset.id, { presenceId: state.presence!.id })).toContain("needs explicit reuse approval");
    expect(() => authorizeAssetSelection(state, [asset.id], { presenceId: state.presence!.id })).toThrow(/explicit reuse approval/);
    expect(() => authorizeAssetSelection(state, [asset.id], { presenceId: state.presence!.id, requireReady: false, allowReviewable: true })).not.toThrow();
  });

  it("keeps observed web media out of the durable library until it is intentionally preserved", () => {
    const state = stateWithAssets();
    const observed = { ...state.assets[0]!, id: "observed-web", retention: "ephemeral" as const, provenance: { ...state.assets[0]!.provenance, origin: "discovered" } };
    const preserved = { ...observed, id: "preserved-web", retention: "preserved" as const, preservationReason: "Reuse for the next evidence-backed post" };

    expect(isLibraryAsset(observed)).toBe(false);
    expect(isLibraryAsset(preserved)).toBe(true);
  });

  it("keeps an uploaded visual in the Agent library while vision processing is pending", () => {
    const state = stateWithAssets();
    const uploaded = { ...state.assets[0]!, id: "uploaded-pending", status: "processing" as const, retention: undefined, provenance: { ...state.assets[0]!.provenance, origin: "operator_upload" } };
    normalizeAssetLibraryState({ ...state, assets: [uploaded] });
    expect(isLibraryAsset(uploaded)).toBe(true);
  });

  it("preserves same-Agent source occurrences while repeated scans remain idempotent", () => {
    const state = stateWithAssets();
    const original = state.assets[0]!;
    const second = appendAssetOccurrence(original, { id: "occurrence-b", sourceId: "source-2", fileName: "chart.png", path: "/approved/chart.png", observedAt: "2026-08-28T01:00:00.000Z" });
    expect(second.sourceOccurrences).toHaveLength(2);
    const repeated = appendAssetOccurrence(second, { id: "occurrence-c", sourceId: "source-2", fileName: "chart.png", path: "/approved/chart.png", observedAt: "2026-08-28T02:00:00.000Z" });
    expect(repeated.sourceOccurrences).toHaveLength(2);
    expect(assetHistory({ ...state, assets: [second] }, original.id, state.presence!.id)?.sourceOccurrences).toHaveLength(2);
  });

  it("separates verified live reuse from Sandbox tests", () => {
    const state = stateWithAssets();
    state.assetUsages = [
      { id: "live-1", assetId: "jenny-asset", agentId: state.agent!.id, presenceId: state.presence!.id, publicationId: "pub-live", channelId: "x", environment: "live", usageType: "new", publishedAt: "2026-08-28T00:00:00.000Z" },
      { id: "sandbox-1", assetId: "jenny-asset", agentId: state.agent!.id, presenceId: state.presence!.id, publicationId: "pub-sandbox", channelId: "x", environment: "sandbox", usageType: "new", publishedAt: "2026-08-28T00:00:00.000Z" },
      { id: "live-duplicate", assetId: "jenny-asset", agentId: state.agent!.id, presenceId: state.presence!.id, publicationId: "pub-live", channelId: "x", environment: "live", usageType: "new", publishedAt: "2026-08-28T00:00:01.000Z" },
    ];
    expect(assetUsageSummary(state.assetUsages, "jenny-asset")).toEqual({ liveUseCount: 1, sandboxTestCount: 1 });
  });

  it("blocks the same live visual by exact or perceptual identity, including in-flight work", () => {
    const state = stateWithAssets();
    const prior = image(state.agent!.id, "prior-asset");
    prior.storage = { ...prior.storage!, exactHash: "prior-exact", perceptualHash: "0000000011111111" };
    const candidate = image(state.agent!.id, "candidate-asset");
    candidate.storage = { ...candidate.storage!, exactHash: "different-encoding", perceptualHash: "0000000011111110" };
    state.assets = [candidate, prior];
    state.assetUsages = [{ id: "live-usage", assetId: prior.id, agentId: state.agent!.id, presenceId: state.presence!.id, publicationId: "pub-live", channelId: "x", environment: "live", usageType: "new", publishedAt: "2026-08-28T00:00:00.000Z" }];
    expect(liveAssetReuseReason(state, state.presence!.id, [candidate.id])).toContain("already published");

    state.assetUsages = [];
    state.executions = [{ id: "in-flight", socialIntentId: "intent", presenceId: state.presence!.id, affordance: "x.post", mode: "auto", status: "queued", attempts: 0, idempotencyKey: "key", environment: "live", publication: { id: "pub-in-flight", format: "x.media-post", payload: { text: "Queued" }, assetIds: [prior.id], links: [], createdAt: "2026-08-28T00:00:00.000Z", environment: "live" }, createdAt: "2026-08-28T00:00:00.000Z", updatedAt: "2026-08-28T00:00:00.000Z" } as never];
    expect(liveAssetReuseReason(state, state.presence!.id, [candidate.id])).toContain("active live publication");
  });

  it("removes a posted library asset from Agent candidates for the Presence cooldown", () => {
    const state = stateWithAssets();
    const presenceId = state.presence!.id;
    state.assetUsages = [{ id: "live-usage", assetId: "jenny-asset", agentId: state.agent!.id, presenceId, publicationId: "pub-live", channelId: "x", environment: "live", usageType: "new", publishedAt: "2026-08-28T00:00:00.000Z" }];

    expect(state.presence!.assetReuseCooldownMonths).toBe(6);
    expect(assetPostingUnavailableUntil(state, "jenny-asset", presenceId, "2026-09-01T00:00:00.000Z")).toBe("2027-02-28T00:00:00.000Z");
    expect(searchEligibleAssets(state, "", { presenceId })).toEqual([]);
    expect(readEligibleAsset(state, "jenny-asset", presenceId)).toMatchObject({ assetId: "jenny-asset", publicationAvailability: { available: false } });
    expect(() => authorizeAssetSelection(state, ["jenny-asset"], { presenceId })).toThrow(/unavailable for posting/);

    const immediateReuse = { ...state, presence: { ...state.presence!, assetReuseCooldownMonths: 0 }, presences: state.presences.map((presence) => ({ ...presence, assetReuseCooldownMonths: 0 })) };
    expect(searchEligibleAssets(immediateReuse, "", { presenceId })).toHaveLength(1);
  });

  it.each(["exact", "source", "perceptual"])("filters %s aliases of posted images from fresh live candidates", kind => {
    const state = stateWithAssets();
    state.presence!.environment = "live";
    state.presences[0]!.environment = "live";
    const prior = image(state.agent!.id, "used-visual");
    const alias = image(state.agent!.id, "alias-visual");
    const fresh = image(state.agent!.id, "fresh-visual");
    if (kind === "exact") alias.storage!.exactHash = prior.storage!.exactHash;
    if (kind === "source") { alias.provenance.sourceUrl = "https://images.example/a.png"; prior.provenance.sourceUrl = alias.provenance.sourceUrl; }
    if (kind === "perceptual") { prior.storage!.perceptualHash = "0000000011111111"; alias.storage!.perceptualHash = "0000000011111110"; }
    state.assets = [alias, prior, fresh];
    state.assetUsages = [{ id: "verified-use", assetId: prior.id, agentId: state.agent!.id, presenceId: state.presence!.id, publicationId: "used-publication", channelId: "x", environment: "live", usageType: "new", publishedAt: new Date().toISOString() }];
    expect(searchEligibleAssets(state, "", { presenceId: state.presence!.id }).map(item => item.assetId)).toEqual([fresh.id]);
    expect(readEligibleAsset(state, alias.id, state.presence!.id)).toMatchObject({ assetId: alias.id, publicationAvailability: { available: false } });
    expect(assetIsAvailableForPublication(state, fresh, state.presence!.id)).toBe(true);
    state.presence!.environment = "sandbox";
    state.presences[0]!.environment = "sandbox";
    expect(assetIsAvailableForPublication(state, alias, state.presence!.id)).toBe(true);
  });

  it("filters the exact pending image and permits it after canceled work or expired cooldown", () => {
    const state = stateWithAssets();
    state.presence!.environment = "live"; state.presences[0]!.environment = "live";
    const asset = state.assets[0]!;
    state.executions = [{ id: "pending", socialIntentId: "intent", presenceId: state.presence!.id, affordance: "x.post", mode: "auto", status: "queued", attempts: 0, idempotencyKey: "pending", environment: "live", publication: { id: "pending-publication", format: "x.media-post", payload: { text: "Pending" }, assetIds: [asset.id], links: [], createdAt: new Date().toISOString() }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    expect(searchEligibleAssets(state, "")).toHaveLength(0);
    state.executions[0]!.status = "cancelled";
    expect(searchEligibleAssets(state, "")).toHaveLength(1);
    state.executions[0]!.status = "succeeded";
    state.presence!.assetReuseCooldownMonths = 0; state.presences[0]!.assetReuseCooldownMonths = 0;
    expect(searchEligibleAssets(state, "")).toHaveLength(1);
  });

  it("keeps used/reference images readable for private Chat and refreshes attached publication availability", () => {
    const state = stateWithAssets();
    state.presence!.environment = "live"; state.presences[0]!.environment = "live";
    const asset = state.assets[0]!;
    state.assetUsages = [{ id: "live-use", assetId: asset.id, agentId: state.agent!.id, presenceId: state.presence!.id, publicationId: "past-publication", channelId: "x", environment: "live", usageType: "new", publishedAt: new Date().toISOString() }];
    const result = createOperatorNudge(state, { presenceId: state.presence!.id, content: "What is in this picture?", privateConversation: true, attachments: [{ existingAssetId: asset.id, name: "Context image", kind: "image" }] });
    const attachment = result.state.operatorConversations!.flatMap(item => item.messages).find(item => item.role === "operator" && item.content === "What is in this picture?")!.attachments![0]!;
    expect(attachment.publicationAvailability).toMatchObject({ available: false, unavailableUntil: expect.any(String) });
    expect(readEligibleAsset(result.state, asset.id, state.presence!.id)?.observation).toContain("blue square");
    state.assetUsages = [];
    asset.reusePermission = "reference_only";
    expect(readEligibleAsset(state, asset.id, state.presence!.id)).toMatchObject({ assetId: asset.id, publicationAvailability: { available: false } });
    expect(projectOperatorChatAssetAvailability(state, state.presence!.id, asset.id)).toMatchObject({ available: false, reason: expect.stringContaining("reuse approval") });
    expect(state.presence!.assetReuseCooldownMonths).toBe(6);
  });

  it("normalizes newly added library collections and processing jobs", () => {
    const normalized = normalizeState(stateWithAssets());
    expect(normalized.assetCollections).toEqual([]);
    expect(normalized.assetProcessingJobs).toEqual([]);
    expect(normalized.assets[0]!.accessScope).toEqual({ mode: "all_agent_presences" });
  });

  it("repairs malformed asset timestamps without crashing the workspace read boundary", () => {
    const state = stateWithAssets();
    state.assets[0] = { ...state.assets[0]!, createdAt: "not-a-date", updatedAt: "also-not-a-date", expiresAt: "invalid-expiry", provenance: { ...state.assets[0]!.provenance, origin: "x-bridge" } };
    expect(() => normalizeAssetLibraryState(state)).not.toThrow();
    expect(Number.isNaN(Date.parse(state.assets[0]!.createdAt))).toBe(false);
    expect(Number.isNaN(Date.parse(state.assets[0]!.updatedAt))).toBe(false);
    expect(state.assets[0]!.expiresAt).toBeTruthy();
  });

  it("uses the server-injected byte writer when importing a selected folder asset", async () => {
    const state = createAgent(input);
    const bytes = Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"2\" height=\"2\"><rect width=\"2\" height=\"2\" fill=\"#3b82f6\"/></svg>");
    const stored = {
      storeKey: "sha256/folder-import.svg_xml",
      mimeType: "image/svg+xml",
      byteSize: bytes.byteLength,
      exactHash: "folder-import-hash",
      perceptualHash: "folder-import-perceptual-hash",
    };
    const writes: Array<{ bytes: Buffer; mimeType: string; suggestedName?: string }> = [];

    const result = await ingestLibraryImages(state, {
      agentId: state.agent!.id,
      files: [{ bytes, mimeType: "image/svg+xml", fileName: "folder-import.svg", path: "selected/folder-import.svg" }],
      storeBytes: async (nextBytes, options) => {
        writes.push({ bytes: nextBytes, ...options });
        return stored;
      },
    });

    expect(writes).toHaveLength(1);
    expect(writes[0]?.bytes).toEqual(bytes);
    expect(writes[0]?.mimeType).toBe("image/svg+xml");
    expect(writes[0]?.suggestedName).toBe("folder-import.svg");
    expect(result.assets[0]?.storage).toEqual(stored);
    expect(result.assets[0]?.sourceOccurrences?.[0]?.path).toBe("selected/folder-import.svg");
    expect(result.newAssetIds).toEqual([result.assets[0]!.id]);
  });

  it("turns protected or missing watched folders into actionable errors", () => {
    expect(assetSourceErrorMessage(new Error("EPERM: operation not permitted, scandir '/home/example/Documents/OpenPresence'"))).toContain("Use Choose folder");
    expect(assetSourceErrorMessage("Folder scan failed: EPERM: operation not permitted")).toContain("Use Choose folder");
    expect(assetSourceErrorMessage(new Error("ENOENT: no such file or directory"))).toContain("select it again");
    const friendly = assetSourceErrorMessage(new Error("EPERM: operation not permitted"));
    expect(assetSourceErrorMessage(friendly)).toBe(friendly);
  });
});
