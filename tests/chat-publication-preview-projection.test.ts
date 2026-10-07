import { describe, expect, it } from "vitest";
import { GET } from "../app/api/state/route";
import { writeState } from "../lib/db";
import { createAgent } from "../lib/runtime";
import type { Asset, Execution, OpenPresenceState } from "../lib/types";

describe("independent saved publication Chat projection", () => {
  it.each(["approved", "failed", "succeeded"] as const)("retains the selected image and expression after %s without exposing foreign media", async status => {
    const state = createAgent({ name: "Preview QA", description: "Useful visual ideas", mode: "agent", handle: "@preview", accent: "#777777" });
    const presenceId = state.presence!.id;
    state.presence!.environment = "live";
    state.presences = [state.presence!, { ...state.presence!, id: "other-preview-presence", handle: "@other_preview" }];
    const timestamp = new Date().toISOString();
    const asset = (id: string, patch: Partial<Asset> = {}): Asset => ({ id, agentId: state.agent!.id, presenceId, type: "image", status: "ready", retention: "preserved", accessScope: { mode: "selected_presences", presenceIds: [presenceId] }, storage: { storeKey: `sha256/${id}`, mimeType: "image/png", byteSize: 10, exactHash: id }, provenance: { origin: "discovered", importedAt: timestamp }, createdAt: timestamp, updatedAt: timestamp, ...patch });
    state.assets = [
      asset("selected-image"),
      asset("unrelated-discovery"),
      asset("foreign-agent-image", { agentId: "another-agent" }),
      asset("foreign-presence-image", { accessScope: { mode: "selected_presences", presenceIds: ["other-preview-presence"] } }),
      asset("legacy-foreign-presence-image", { presenceId: "other-preview-presence", accessScope: undefined }),
    ];
    const execution: Execution = { id: "saved-preview-execution", socialIntentId: "saved-preview-intent", presenceId, affordance: "x.post", mode: "review", status, attempts: status === "approved" ? 0 : 1, environment: "live", connector: "bridge", idempotencyKey: "preview-only", publication: { id: "saved-preview-publication", format: "x.post", payload: { text: "The exact saved expression." }, assetIds: ["selected-image", "foreign-agent-image", "foreign-presence-image", "legacy-foreign-presence-image"], links: [], createdAt: timestamp, environment: "live" }, createdAt: timestamp, updatedAt: timestamp };
    state.executions = [execution];
    state.operatorConversations = [{ id: "preview-chat", agentId: state.agent!.id, presenceId, title: "Preview", createdAt: timestamp, updatedAt: timestamp, messages: [{ id: "operator-preview", role: "operator", content: "Post this idea with an image", timestamp }, { id: "preview-receipt", role: "system", replyToMessageId: "operator-preview", content: JSON.stringify({ tool: "social_action", executionIds: [execution.id], result: [{ executionId: execution.id, status: "awaiting-review" }] }), timestamp }] }];
    writeState(state, { force: true });
    const response = await GET(new Request("http://localhost/api/state?projection=chat"));
    expect(response.status).toBe(200);
    const projected = await response.json() as OpenPresenceState;
    expect(projected.executions.find(item => item.id === execution.id)?.publication?.payload).toEqual({ text: "The exact saved expression." });
    expect(projected.assets.map(item => item.id)).toEqual(["selected-image"]);
    expect(projected.assets[0]!.publicationAvailability?.presenceId).toBe(presenceId);
    expect(projected.executions[0]!.permit).toBeUndefined();
    expect(projected.outcomes).toHaveLength(0);
  });
});
