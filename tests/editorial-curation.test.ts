import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/runtime";
import {
  classifyFeedbackLayers,
  evaluateTasteProposalOnHeldOutSet,
  generatePublicationPackage,
  getDefaultCurationSources,
  makeEditorialDecision,
  performFactualVerification,
  performMediaPerception,
  runCanonicalEditorialDiscovery,
  seedDefaultEditorialReferences,
  synthesizeEditorialCalibration,
  normalizeCurationSources,
} from "@/lib/editorial-curation";
import type {
  EditorialFeedbackEvent,
  EditorialOpportunity,
  EditorialReference,
  OpenPresenceState,
  Presence,
  SourceAsset,
  SourceLead,
} from "@/lib/types";

describe("Editorial Curation Architecture & Lineage", () => {
  const dummyPresence: Presence = {
    id: "presence_kobeissi_test",
    name: "Kobeissi Macro",
    handle: "kobeissimacro",
    channel: "x",
    mode: "agent",
    status: "live",
    language: "en",
    environment: "sandbox",
    brief: {
      purpose: "Macroeconomic charts and decisive financial commentary",
      audience: "Market participants, macro analysts, and investors",
      primaryTerritory: ["macroeconomics", "markets", "interest rates"],
      adjacentTerritory: ["technology capex", "commodities"],
      boundaries: ["no ungrounded speculation", "ground claims in data"],
    },
    connectionMode: "sandbox",
    curationSources: [
      { id: "custom_macro", name: "My Macro Sources", kind: "macro_primary", enabled: true, urlOrEndpoint: "https://fred.stlouisfed.org" },
    ],
  };

  function createTestState(): OpenPresenceState {
    const state = initialState();
    state.presences = [dummyPresence];
    state.presence = dummyPresence;
    state.activePresenceId = dummyPresence.id;
    state.files = [
      {
        kind: "TASTE",
        content: "# Kobeissi Letter Taste\nLet the graphic dominate. One clear takeaway.",
        status: "active",
        updatedAt: new Date().toISOString(),
      },
    ];
    state.editorialReferences = seedDefaultEditorialReferences(dummyPresence.id);
    return state;
  }

  it("produces full cognitive lineage from SourceLead to EditorialOpportunity without premature publication packaging", async () => {
    const state = createTestState();
    const result = await runCanonicalEditorialDiscovery(state, {
      presenceId: dummyPresence.id,
      goal: "Find chart-led macroeconomic opportunities",
      maxCandidates: 3,
    });

    expect(result.leads.length).toBeGreaterThan(0);
    expect(result.sourceAssets.length).toBeGreaterThan(0);
    expect(result.perceptions.length).toBeGreaterThan(0);
    expect(result.verifications.length).toBeGreaterThan(0);
    expect(result.rightsAssessments.length).toBeGreaterThan(0);
    expect(result.decisions.length).toBeGreaterThan(0);
    expect(result.opportunities.length).toBeGreaterThan(0);

    const firstOpp = result.opportunities[0];
    expect(firstOpp.leadId).toBeDefined();
    expect(firstOpp.sourceAssetId).toBeDefined();
    expect(firstOpp.perceptionId).toBeDefined();
    expect(firstOpp.verificationId).toBeDefined();
    expect(firstOpp.rightsAssessmentId).toBeDefined();
    expect(firstOpp.decisionId).toBeDefined();
    // Invariant 1: Publication package is delayed and not generated during initial discovery
    expect(firstOpp.publicationPackageId).toBeUndefined();

    // Verify verification record lineage
    const ver = result.verifications.find((v) => v.id === firstOpp.verificationId);
    expect(ver?.status).toBe("supported");
    expect(ver?.verifiedClaims.length).toBeGreaterThan(0);

    // Verify rights assessment lineage
    const rights = result.rightsAssessments.find((r) => r.id === firstOpp.rightsAssessmentId);
    expect(["permitted", "permitted_with_attribution"]).toContain(rights?.status);
  });

  it("isolates EditorialReference benchmarks from autonomous discovery leads (Invariant 5)", async () => {
    const state = createTestState();
    expect(state.editorialReferences?.length).toBeGreaterThan(0);

    const result = await runCanonicalEditorialDiscovery(state, {
      presenceId: dummyPresence.id,
      maxCandidates: 4,
    });

    const refTitles = (state.editorialReferences ?? []).map((r) => r.title);
    for (const lead of result.leads) {
      // Benchmark items should not be discovered as live leads directly
      expect(lead.providerId).not.toBe("reference_benchmark");
    }
  });

  it("generates publication package on-demand for approved opportunities (Invariant 7)", () => {
    const state = createTestState();
    const lead: SourceLead = {
      id: "lead_test_1",
      providerId: "fred",
      query: "US Consumer Debt",
      sourceUrl: "https://fred.stlouisfed.org/series/TOTALSL",
      title: "US Consumer Credit Record",
      snippet: "Total consumer credit climbs to new all-time high.",
      discoveredAt: new Date().toISOString(),
    };
    const asset: SourceAsset = {
      id: "asset_test_1",
      leadId: lead.id,
      mediaKind: "image",
      mimeType: "image/png",
      sourceUrl: "https://fred.stlouisfed.org/graph.png",
      canonicalSourcePage: lead.sourceUrl,
      publisher: "Federal Reserve Bank of St. Louis",
      exactHash: "hash123",
      retrievedAt: new Date().toISOString(),
    };
    const perception = performMediaPerception(asset, lead);
    const verification = performFactualVerification(perception, lead);
    const decision = makeEditorialDecision({
      lead,
      asset,
      perception,
      verification,
      rights: { id: "r1", sourceAssetId: asset.id, status: "permitted_with_attribution", basisRefs: [], assessedAt: new Date().toISOString() },
    });
    const opp: EditorialOpportunity = {
      id: "opp_test_1",
      agentId: "agent_1",
      presenceId: dummyPresence.id,
      environment: "sandbox",
      leadId: lead.id,
      sourceAssetId: asset.id,
      perceptionId: perception.id,
      verificationId: verification.id,
      rightsAssessmentId: "r1",
      decisionId: decision.id,
      status: "approved",
      feedbackIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const pkg = generatePublicationPackage(opp, lead, decision, asset);
    expect(pkg.opportunityId).toBe(opp.id);
    expect(pkg.expression.text).toContain("BREAKING:");
    expect(pkg.expression.mediaRefs).toContain(asset.id);
    expect(pkg.expression.attribution).toContain("Federal Reserve Bank of St. Louis");
  });

  it("classifies multi-layer feedback into Taste, Perception, Source Policy, and Rights (Invariant 6)", () => {
    const tasteLayers = classifyFeedbackLayers(["too_cluttered", "not_interesting"]);
    expect(tasteLayers).toContain("taste");

    const perceptionLayers = classifyFeedbackLayers(["misread_chart"], "The Y-axis is inverted");
    expect(perceptionLayers).toContain("perception");

    const sourceLayers = classifyFeedbackLayers(["weak_source", "stale_data"]);
    expect(sourceLayers).toContain("source_policy");

    const rightsLayers = classifyFeedbackLayers(["rights_unclear"], "Copyright permissions needed");
    expect(rightsLayers).toContain("rights");
  });

  it("evaluates Taste proposals using sealed held-out testing (Invariant 8)", () => {
    const state = createTestState();

    // Populate feedback events
    state.editorialFeedbackEvents = [
      { id: "e1", opportunityId: "o1", presenceId: dummyPresence.id, reaction: "good_pick", reasons: [], affectedLayers: ["taste"], createdAt: new Date().toISOString() },
      { id: "e2", opportunityId: "o2", presenceId: dummyPresence.id, reaction: "rejected", reasons: ["too_cluttered"], affectedLayers: ["taste"], note: "Multi line chart", createdAt: new Date().toISOString() },
      { id: "e3", opportunityId: "o3", presenceId: dummyPresence.id, reaction: "starred_benchmark", reasons: [], affectedLayers: ["taste"], createdAt: new Date().toISOString() },
      { id: "e4", opportunityId: "o4", presenceId: dummyPresence.id, reaction: "rejected", reasons: ["weak_source"], affectedLayers: ["source_policy"], createdAt: new Date().toISOString() },
      { id: "e5", opportunityId: "o5", presenceId: dummyPresence.id, reaction: "good_pick", reasons: [], affectedLayers: ["taste"], createdAt: new Date().toISOString() },
      { id: "e6", opportunityId: "o6", presenceId: dummyPresence.id, reaction: "rejected", reasons: ["misread_chart"], affectedLayers: ["perception"], createdAt: new Date().toISOString() },
    ];

    const calibration = synthesizeEditorialCalibration(state, dummyPresence.id);
    expect(calibration.findings.taste.length).toBeGreaterThan(0);
    expect(calibration.tasteProposal?.proposedTaste).toContain("Visual editorial standards");

    const testResult = evaluateTasteProposalOnHeldOutSet(state, dummyPresence.id, calibration.tasteProposal!.proposedTaste);
    expect(testResult.heldOutCount).toBeGreaterThan(0);
    expect(testResult.overallAgreementRate).toBeGreaterThanOrEqual(80);
    expect(testResult.regressions.length).toBe(0);
  });

  it("does not create defaults and removes only legacy seeded source cards", () => {
    expect(getDefaultCurationSources()).toEqual([]);
    const custom = { id: "custom_fred", name: "My FRED feed", kind: "macro_primary" as const, enabled: true };
    expect(normalizeCurationSources([
      { id: "fred", name: "FRED / Macro Data", kind: "macro_primary", enabled: false },
      { id: "web_discovery", name: "Web & Primary Domain Search", kind: "web_discovery", enabled: true },
      custom,
    ])).toEqual([custom]);
  });

  it("runs discovery through enabled custom sources", async () => {
    const state = createTestState();
    const result = await runCanonicalEditorialDiscovery(state, {
      presenceId: dummyPresence.id,
      maxCandidates: 1,
    });
    expect(result.leads[0]?.providerId).toBe("custom_macro");
    expect(result.leads[0]?.sourceUrl).toBe("https://fred.stlouisfed.org");
  });

  it("discovers domain-specific leads for tech/AI presences when tech sources are configured", async () => {
    const techPresence: Presence = {
      id: "presence_tech_test",
      name: "Open Weights Tech",
      handle: "openweights",
      channel: "x",
      mode: "agent",
      status: "live",
      language: "en",
      environment: "sandbox",
      brief: {
        purpose: "AI open source architecture, latency benchmarks, and code release analysis",
        audience: "AI researchers and developers",
        primaryTerritory: ["ai models", "software", "benchmarks"],
        adjacentTerritory: ["distributed systems"],
        boundaries: [],
      },
      connectionMode: "sandbox",
      curationSources: [
        { id: "github_tech", name: "GitHub Releases & Benchmarks", kind: "tech_code", enabled: true },
        { id: "arxiv", name: "arXiv & Research Papers", kind: "research", enabled: true },
      ],
    };

    const state = initialState();
    state.presences = [techPresence];
    state.presence = techPresence;
    state.activePresenceId = techPresence.id;

    const result = await runCanonicalEditorialDiscovery(state, {
      presenceId: techPresence.id,
      sources: ["github_tech", "arxiv"],
      maxCandidates: 3,
    });

    expect(result.leads.length).toBeGreaterThan(0);
    const providerIds = result.leads.map((l) => l.providerId);
    expect(providerIds.some((p) => p === "github_tech" || p === "arxiv")).toBe(true);
    expect(result.opportunities.length).toBeGreaterThan(0);
  });
});
