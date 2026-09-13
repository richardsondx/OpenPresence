import { describe, expect, it } from "vitest";
import { createAgent, initialState } from "@/lib/runtime";
import {
  classifyFeedbackLayers,
  evaluateTasteProposalOnHeldOutSet,
  makeEditorialDecision,
  performFactualVerification,
  performMediaPerception,
  runCanonicalEditorialDiscovery,
  seedDefaultEditorialReferences,
  synthesizeEditorialCalibration,
} from "@/lib/editorial-curation";
import type {
  EditorialOpportunity,
  OpenPresenceState,
  Presence,
  SourceAsset,
  SourceLead,
} from "@/lib/types";

describe("Curation Lab Production Parity & Invariants", () => {
  const dummyPresence: Presence = {
    ...createAgent({ name: "Macro Parity Bot", description: "Macro data charts and analysis", mode: "agent", handle: "macroparity", accent: "#D68754" }).presence!,
    id: "presence_macro_parity",
    name: "Macro Parity Bot",
    handle: "macroparity",
    channel: "x",
    mode: "agent",
    status: "live",
    language: "en",
    environment: "sandbox",
    brief: {
      purpose: "Macro data charts and analysis",
      audience: "Financial investors",
      primaryTerritory: ["macroeconomics", "markets"],
      adjacentTerritory: [],
      boundaries: [],
    },
    connectionMode: "sandbox",
  };

  function createTestState(): OpenPresenceState {
    const state = initialState();
    state.presences = [dummyPresence];
    state.presence = dummyPresence;
    state.activePresenceId = dummyPresence.id;
    state.files = [
      {
        kind: "TASTE",
        title: "Visual Taste",
        subtitle: "Visual editorial guidance",
        content: "# Visual Taste\nPrefer clear charts with primary provenance.",
        protected: false,
        revision: 1,
        updatedAt: new Date().toISOString(),
      },
    ];
    state.editorialReferences = seedDefaultEditorialReferences(dummyPresence.id);
    return state;
  }

  it("ensures derived visual re-verification loop (Invariant 3)", async () => {
    const lead: SourceLead = {
      id: "lead_low_legibility",
      providerId: "fred",
      query: "Consumer Debt",
      sourceUrl: "https://fred.stlouisfed.org/series/TOTALSL",
      title: "Consumer Credit Growth",
      snippet: "Consumer credit surges.",
      discoveredAt: new Date().toISOString(),
      underlyingDataRef: "FRED:TOTALSL",
    };

    const rawAsset: SourceAsset = {
      id: "asset_raw",
      leadId: lead.id,
      mediaKind: "image",
      mimeType: "image/png",
      sourceUrl: "https://fred.stlouisfed.org/lowres.png",
      canonicalSourcePage: lead.sourceUrl,
      publisher: "FRED",
      exactHash: "raw_hash_999",
      retrievedAt: new Date().toISOString(),
    };

    // Raw asset perception with poor legibility
    const perception = performMediaPerception(rawAsset, lead);
    perception.legibility = "poor";

    const verification = performFactualVerification(perception, lead);
    const rights = {
      id: "rights_1",
      sourceAssetId: rawAsset.id,
      status: "permitted_with_attribution" as const,
      basisRefs: [],
      assessedAt: new Date().toISOString(),
    };

    const decision = makeEditorialDecision({
      lead,
      asset: rawAsset,
      perception,
      verification,
      rights,
    });

    // Invariant 3: Poor legibility with underlying data triggers derive_from_source_data
    expect(decision.assetStrategy).toBe("derive_from_source_data");

    // Derived asset re-enters perception and verification
    const derivedAsset: SourceAsset = {
      id: "asset_derived",
      leadId: lead.id,
      mediaKind: "image",
      mimeType: "image/png",
      sourceUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      canonicalSourcePage: lead.sourceUrl,
      publisher: "OpenPresence Derived Visual",
      exactHash: "derived_hash_111",
      retrievedAt: new Date().toISOString(),
    };

    const derivedPerception = performMediaPerception(derivedAsset, lead);
    expect(derivedPerception.legibility).toBe("clear");

    const derivedVerification = performFactualVerification(derivedPerception, lead);
    expect(derivedVerification.status).toBe("supported");
  });

  it("verifies immutable evidence boundary (Raw asset hash remains intact)", () => {
    const rawAsset: SourceAsset = {
      id: "asset_immutable",
      leadId: "lead_1",
      mediaKind: "image",
      mimeType: "image/png",
      sourceUrl: "https://fred.stlouisfed.org/chart.png",
      canonicalSourcePage: "https://fred.stlouisfed.org",
      publisher: "FRED",
      exactHash: "immutable_sha256_abcdef",
      retrievedAt: new Date().toISOString(),
    };

    // Perception is interpretation, decision is judgment:
    const perception = performMediaPerception(rawAsset, {
      id: "lead_1",
      providerId: "fred",
      query: "Test",
      sourceUrl: "https://fred.stlouisfed.org",
      title: "Test Chart",
      snippet: "Snippet",
      discoveredAt: new Date().toISOString(),
    });

    // Verify raw asset is not modified by perception or decision steps
    expect(rawAsset.exactHash).toBe("immutable_sha256_abcdef");
    expect(perception.sourceAssetId).toBe(rawAsset.id);
  });

  it("evaluates multi-layer calibration findings partition (Invariant 6)", () => {
    const state = createTestState();
    state.editorialFeedbackEvents = [
      {
        id: "ev1",
        opportunityId: "o1",
        presenceId: dummyPresence.id,
        reaction: "rejected",
        reasons: ["misread_chart"],
        note: "The secondary Y-axis is inverted scale",
        affectedLayers: ["perception"],
        createdAt: new Date().toISOString(),
      },
      {
        id: "ev2",
        opportunityId: "o2",
        presenceId: dummyPresence.id,
        reaction: "rejected",
        reasons: ["weak_source"],
        note: "Third party blog without primary data source",
        affectedLayers: ["source_policy"],
        createdAt: new Date().toISOString(),
      },
    ];

    const calibration = synthesizeEditorialCalibration(state, dummyPresence.id);
    expect(calibration.findings.perception.length).toBeGreaterThan(0);
    expect(calibration.findings.perception[0]).toContain("secondary axes");
    expect(calibration.findings.sourcePolicy.length).toBeGreaterThan(0);
    expect(calibration.findings.sourcePolicy[0]).toContain("primary data aggregators");
  });
});
