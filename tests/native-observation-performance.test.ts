import { describe, expect, it } from "vitest";
import { createAgent, recordNativeObservation, recordNativeObservationInPlace } from "../lib/runtime";

describe("native observation transitions", () => {
  it("updates an already-normalized worker state without cloning the workspace", () => {
    const state = createAgent({ name: "Genny", description: "Useful ideas", audience: "builders", mode: "agent", handle: "@genny", accent: "#D68754" });
    const presenceId = state.presence!.id;
    state.nativeConnections = [{ id: "native-observation", presenceId, channelId: "x", kind: "x", status: "connected", access: "read", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    const next = recordNativeObservationInPlace(state, presenceId, { status: "syncing" });

    expect(next).toBe(state);
    expect(next.nativeConnections.find((connection) => connection.presenceId === presenceId)?.observation.status).toBe("syncing");
  });

  it("keeps the public transition wrapper defensive", () => {
    const state = createAgent({ name: "Genny", description: "Useful ideas", audience: "builders", mode: "agent", handle: "@genny", accent: "#D68754" });
    const presenceId = state.presence!.id;
    state.nativeConnections = [{ id: "native-observation", presenceId, channelId: "x", kind: "x", status: "connected", access: "read", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    const next = recordNativeObservation(state, presenceId, { status: "up-to-date" });

    expect(next).not.toBe(state);
    expect(state.nativeConnections.find((connection) => connection.presenceId === presenceId)?.observation?.status).not.toBe("up-to-date");
    expect(next.nativeConnections.find((connection) => connection.presenceId === presenceId)?.observation.status).toBe("up-to-date");
  });
});
