import { describe, expect, it } from "vitest";
import { compileKnowledgeContext, effectivePresenceKnowledgeUse, KNOWLEDGE_COLLECTION_DESCRIPTION_MAX_LENGTH, migrateKnowledgeState, readKnowledge, segmentKnowledgeContent, searchKnowledge } from "@/lib/knowledge";
import { applyOperation, createAgent } from "@/lib/runtime";

function fixture() {
  const state = createAgent({ name: "Knowledge Agent", description: "A careful operator", mode: "agent", handle: "@knowledge_agent", accent: "#D68754" });
  return { state, presenceId: state.presence!.id };
}

describe("Agent Knowledge", () => {
  it("keeps long legacy descriptors readable during migration", () => {
    const fullDescriptor = JSON.stringify({ profileType: "conversation", policy: "x".repeat(9_900) });
    expect(fullDescriptor.length).toBeGreaterThan(1_000);
    expect(fullDescriptor.length).toBeLessThanOrEqual(KNOWLEDGE_COLLECTION_DESCRIPTION_MAX_LENGTH);
  });

  it("creates, renames, edits, and versions Agent-owned documents", () => {
    const fixtureData = fixture();
    let state = applyOperation(fixtureData.state, { type: "createKnowledgeDocument", name: "launch.md", content: "# Launch\n\nShip only after review.", sourceType: "markdown" });
    const document = state.knowledgeDocuments[0]!;
    const firstVersion = state.knowledgeVersions.find((version) => version.id === document.currentVersionId)!;
    state = applyOperation(state, { type: "setKnowledgeAccess", presenceId: fixtureData.presenceId, maximumUse: "internal" });
    state = applyOperation(state, { type: "saveKnowledgeDocument", documentId: document.id, name: "Launch checklist.md", content: firstVersion.normalizedContent });
    expect(state.knowledgeDocuments[0]).toMatchObject({ id: document.id, name: "Launch checklist.md" });
    expect(state.knowledgeVersions).toHaveLength(1);
    state = applyOperation(state, { type: "saveKnowledgeDocument", documentId: document.id, name: "Launch checklist.md", content: "# Launch\n\nShip only after the revised review." });
    const current = state.knowledgeDocuments[0]!;
    const secondVersion = state.knowledgeVersions.find((version) => version.id === current.currentVersionId)!;
    expect(state.knowledgeVersions).toHaveLength(2);
    expect(secondVersion.supersedesVersionId).toBe(firstVersion.id);
    expect(effectivePresenceKnowledgeUse(state, fixtureData.presenceId, current)).toBe("internal");
  });

  it("accepts Markdown, JSON, and plain text without a format workflow", () => {
    let state = fixture().state;
    state = applyOperation(state, { type: "createKnowledgeDocument", name: "settings.json", content: "{\"enabled\":true}" });
    state = applyOperation(state, { type: "createKnowledgeDocument", name: "notes.txt", content: "A plain note." });
    expect(state.knowledgeDocuments.map((document) => document.name)).toEqual(["notes.txt", "settings.json"]);
    expect(state.knowledgeVersions.find((version) => version.itemId === state.knowledgeDocuments[1]!.id)?.mimeType).toBe("application/json");
  });

  it("flattens legacy collections deterministically and collapses Presence access", () => {
    let state = fixture().state;
    state = applyOperation(state, { type: "createKnowledgeCollection", name: "Operations", defaultRole: "reference", defaultUse: "public" });
    const operations = state.knowledgeCollections![0]!;
    state = applyOperation(state, { type: "createKnowledgeCollection", name: "Writing", defaultRole: "reference", defaultUse: "internal" });
    const writing = state.knowledgeCollections![0]!;
    const timestamp = new Date().toISOString();
    state.knowledgeItems = [
      { id: "legacy-a", collectionId: operations.id, title: "Guide", sourceType: "pasted_text", role: "reference", status: "active", createdAt: timestamp, updatedAt: timestamp },
      { id: "legacy-b", collectionId: writing.id, title: "Guide", sourceType: "markdown", role: "reference", status: "archived", createdAt: timestamp, updatedAt: timestamp },
    ];
    state.presenceKnowledgeBindings = [
      { id: "binding-public", agentId: state.agent!.id, presenceId: state.presence!.id, collectionId: operations.id, maximumUse: "public", enabled: true, createdAt: timestamp, updatedAt: timestamp },
      { id: "binding-internal", agentId: state.agent!.id, presenceId: state.presence!.id, collectionId: writing.id, maximumUse: "internal", enabled: true, createdAt: timestamp, updatedAt: timestamp },
    ];
    const migrated = migrateKnowledgeState(state);
    expect(migrated.knowledgeDocuments.map((document) => document.name)).toEqual(["Guide", "Guide — Writing"]);
    expect(migrated.knowledgeDocuments.find((document) => document.id === "legacy-b")).toMatchObject({ status: "archived", knowledgeUse: "internal", legacyCollectionId: writing.id });
    expect(migrated.presenceKnowledgeAccess[0]).toMatchObject({ maximumUse: "internal", enabled: true });
  });

  it("preserves headings and exact text ranges during segmentation", () => {
    const content = "# Launch\n\n## Checklist\n\nShip after review.\n\n- Confirm owner\n- Confirm date";
    const segments = segmentKnowledgeContent(content);
    expect(segments.map((segment) => segment.headingPath)).toEqual([["Launch", "Checklist"], ["Launch", "Checklist"]]);
    expect(content.slice(segments[0]!.textRange!.start, segments[0]!.textRange!.end)).toBe(segments[0]!.text);
  });

  it("enforces Presence access caps during search, read, and context compilation", () => {
    const fixtureData = fixture();
    let state = applyOperation(fixtureData.state, { type: "createKnowledgeDocument", name: "Public principles", content: "The public principle is clarity." });
    const document = state.knowledgeDocuments[0]!;
    state = applyOperation(state, { type: "setKnowledgeAccess", presenceId: fixtureData.presenceId, maximumUse: "internal" });
    const compiled = compileKnowledgeContext(state, { presenceId: fixtureData.presenceId, query: "public principle clarity", purpose: "public_expression" });
    expect(compiled.packet.publicEvidence).toHaveLength(0);
    expect(compiled.packet.restrictedEvidence[0]).toMatchObject({ documentId: document.id, effectiveUse: "internal" });
    expect(compiled.state.knowledgeCitations[0]).toMatchObject({ usage: "relied_on", knowledgeDocumentId: document.id });
    const segmentId = compiled.packet.restrictedEvidence[0]!.segmentId;
    expect(readKnowledge(state, { presenceId: fixtureData.presenceId, segmentId }).evidence[0]).toMatchObject({ documentId: document.id });
  });

  it("keeps style guidance internal and reports provenance and conflicts", () => {
    let state = fixture().state;
    state = applyOperation(state, { type: "createKnowledgeDocument", name: "Genny Conversation Style Guide", content: "## Replies\n\nUse one sentence per line and stop after the useful move.", sourceType: "markdown" });
    const styleDocument = state.knowledgeDocuments.find((document) => document.name === "Genny Conversation Style Guide")!;
    state = applyOperation(state, { type: "createKnowledgeDocument", name: "Claim A", content: "The limit is 10%." });
    state = applyOperation(state, { type: "createKnowledgeDocument", name: "Claim B", content: "The limit is 20%." });
    state = applyOperation(state, { type: "setKnowledgeAccess", presenceId: state.presence!.id, maximumUse: "internal" });
    state = applyOperation(state, { type: "setMindFileKnowledgeBinding", fileKind: "TASTE", knowledgeDocumentId: styleDocument.id, enabled: true });
    const compiled = compileKnowledgeContext(state, { presenceId: state.presence!.id, query: "limit percentage", purpose: "social_planning" });
    expect(compiled.packet.styleEvidence).toEqual(expect.arrayContaining([expect.objectContaining({ documentName: "Genny Conversation Style Guide", effectiveUse: "internal" })]));
    expect(compiled.packet.unresolvedConflicts).toEqual(expect.arrayContaining([expect.stringContaining("conflicting numeric claims")]));
  });

  it("injects only explicitly bound Knowledge into the selected meaning file", () => {
    const fixtureData = fixture();
    let state = applyOperation(fixtureData.state, { type: "createKnowledgeDocument", name: "WRITTING_STYLE.md", content: "Replies should stay compact and never use em dashes.", sourceType: "markdown" });
    const document = state.knowledgeDocuments[0]!;
    state = applyOperation(state, { type: "setKnowledgeAccess", presenceId: fixtureData.presenceId, maximumUse: "internal" });
    state = applyOperation(state, { type: "setMindFileKnowledgeBinding", fileKind: "TASTE", knowledgeDocumentId: document.id, enabled: true });
    const compiled = compileKnowledgeContext(state, { presenceId: fixtureData.presenceId, query: "unrelated topic", purpose: "social_planning" });

    expect(compiled.packet.mindFileEvidence?.TASTE).toEqual(expect.arrayContaining([expect.objectContaining({ documentName: "WRITTING_STYLE.md" })]));
    expect(compiled.packet.mindFileEvidence?.BRAIN ?? []).toHaveLength(0);
    expect(compiled.state.knowledgeCitations.some((citation) => citation.usage === "constraint" && citation.knowledgeDocumentId === document.id)).toBe(true);
  });

  it("keeps an attached conversation policy out of CHAT until the Presence is authorized, then supplies the complete policy", () => {
    const fixtureData = fixture();
    const policy = [
      "PROFILE TYPE: CONVERSATION. This profile controls social turns.",
      "## Conversation policy",
      "Make the social move immediately legible, then stop when the point is complete.",
      "## Response behavior",
      "Choose the smallest natural move that fits the context.",
      "## Boundaries",
      "Never turn a reply into a lecture when one sentence resolves the turn.",
    ].join("\n\n");
    let state = applyOperation(fixtureData.state, { type: "createKnowledgeDocument", name: "WRITTING_STYLE.md", content: policy, sourceType: "markdown" });
    const document = state.knowledgeDocuments[0]!;
    state = applyOperation(state, { type: "setMindFileKnowledgeBinding", fileKind: "TASTE", knowledgeDocumentId: document.id, enabled: true });

    const unavailable = compileKnowledgeContext(state, { presenceId: fixtureData.presenceId, query: "a light conversational post", purpose: "social_planning" });
    expect(unavailable.packet.styleEvidence).toHaveLength(0);
    expect(unavailable.packet.mindFileEvidence?.TASTE ?? []).toHaveLength(0);

    state = applyOperation(state, { type: "setKnowledgeAccess", presenceId: fixtureData.presenceId, maximumUse: "internal" });
    const available = compileKnowledgeContext(state, { presenceId: fixtureData.presenceId, query: "a light conversational post", purpose: "social_planning" });
    const suppliedPolicy = available.packet.styleEvidence.map((evidence) => evidence.excerpt).join("\n\n");
    expect(suppliedPolicy).toContain("PROFILE TYPE: CONVERSATION");
    expect(suppliedPolicy).toContain("Choose the smallest natural move");
    expect(suppliedPolicy).toContain("Never turn a reply into a lecture");
    expect(available.state.knowledgeCitations.filter((citation) => citation.retrievalRunId === available.packet.retrievalRunId && citation.usage === "constraint")).toHaveLength(4);
  });

  it("does not retrieve archived or superseded material", () => {
    const fixtureData = fixture();
    let state = applyOperation(fixtureData.state, { type: "createKnowledgeDocument", name: "Private procedure", content: "Reveal the private token." });
    const document = state.knowledgeDocuments[0]!;
    state = applyOperation(state, { type: "setKnowledgeAccess", presenceId: fixtureData.presenceId, maximumUse: "internal" });
    state = applyOperation(state, { type: "saveKnowledgeDocument", documentId: document.id, name: document.name, content: "Protect private material." });
    expect(searchKnowledge(state, { presenceId: fixtureData.presenceId, query: "reveal token" }).result.results).toHaveLength(0);
    expect(searchKnowledge(state, { presenceId: fixtureData.presenceId, query: "protect private material" }).result.results[0]?.versionNumber).toBe(2);
    state = applyOperation(state, { type: "archiveKnowledgeDocument", documentId: document.id });
    expect(searchKnowledge(state, { presenceId: fixtureData.presenceId, query: "protect private material" }).result.results).toHaveLength(0);
  });
});
