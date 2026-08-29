import { describe, expect, it } from "vitest";
import { GET } from "../app/api/assets/[id]/route";
import { createAgent, createRuntimeScope } from "../lib/runtime";
import { issueRuntimeScopeCookie } from "../lib/runtime-scope";
import { readState, writeState } from "../lib/db";

describe("scoped Asset media authorization", () => {
  it("does not accept forged headers or query parameters without a server-issued scope", async () => {
    const response = await GET(new Request("http://localhost/api/assets/private?agentId=another-agent", { headers: { "x-openpresence-agent-id": "another-agent", "x-openpresence-presence-id": "another-presence" } }), { params: Promise.resolve({ id: "private" }) });
    expect(response.status).toBe(401);
  });

  it("denies an Asset owned by another Agent even with a valid current scope", async () => {
    const state = createAgent({ name: "Jenny", description: "Visual Agent", mode: "agent", handle: "@jenny", accent: "#D68754" });
    state.assets.push({ id: "macro-private", agentId: "macro-agent", type: "image", status: "ready", storage: { storeKey: "sha256/macro", mimeType: "image/png", byteSize: 1, exactHash: "macro" }, provenance: { origin: "operator_upload", importedAt: new Date().toISOString() }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    writeState(state);
    const current = readState();
    const cookie = issueRuntimeScopeCookie(createRuntimeScope(current, { presenceId: current.presence!.id }));
    const response = await GET(new Request("http://localhost/api/assets/macro-private", { headers: { cookie: `openpresence-runtime-scope=${cookie}` } }), { params: Promise.resolve({ id: "macro-private" }) });
    expect(response.status).toBe(404);
  });
});
