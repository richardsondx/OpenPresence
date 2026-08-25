import { describe, expect, it } from "vitest";
import { applyOperation, createAgent } from "../lib/runtime";

describe("Presence account binding", () => {
  it("invalidates native and X Bridge identity when the Presence handle changes", () => {
    const initial = createAgent({ name: "Genny", description: "Test", mode: "agent", handle: "@jenny_ai", accent: "#D68754" });
    const presenceId = initial.presence!.id;
    const state = {
      ...initial,
      presence: { ...initial.presence!, environment: "live" as const, connectionMode: "native" as const },
      presences: [{ ...initial.presence!, environment: "live" as const, connectionMode: "native" as const }],
      nativeConnections: [{ id: "native-x", presenceId, channelId: "x" as const, kind: "x" as const, status: "connected" as const, access: "read-write" as const, account: { username: "jenny_ai" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
      bridges: [{ id: "bridge-x", presenceId, channelId: "x" as const, name: "X Bridge", kind: "bridge" as const, state: "online" as const, adapterStatus: "connected" as const, capabilities: { inbound: true, reconcile: true, affordances: ["post"], formats: ["x.post"], metrics: [] }, accountIdentity: { username: "jenny_ai", status: "verified" as const, observedAt: new Date().toISOString() }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    };

    const changed = applyOperation(state, { type: "setPresence", patch: { handle: "@example_agent" } });
    expect(changed.presence?.handle).toBe("@example_agent");
    expect(changed.nativeConnections[0]).toMatchObject({ status: "needs-attention", healthMessage: expect.stringContaining("@example_agent") });
    expect(changed.bridges[0]?.accountIdentity?.status).toBe("mismatch");
  });
});
