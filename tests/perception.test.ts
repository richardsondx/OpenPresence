import { describe, expect, it, vi } from "vitest";
import { inspectSandboxObject } from "../lib/perception-runtime";
import { addSandboxEvent, createAgent, startPlaygroundSession } from "../lib/runtime";

describe("sandbox link perception", () => {
  it("retrieves shallow public provenance instead of treating a URL as evidence", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("<html><head><title>Keystone proof</title><meta name=\"description\" content=\"Deterministic replay and tamper rejection.\"></head><body>Proof details</body></html>", { status: 200, headers: { "content-type": "text/html" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      let state = startPlaygroundSession(createAgent({ name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent", handle: "@jenny_ai", accent: "#D68754" }));
      const session = state.playgroundSessions[0]!;
      state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Digitalfrontierlab", content: "A proof link.", assets: [{ name: "proof", kind: "link", sourceUrl: "https://example.com/keystone" }] });
      const object = state.mirrorObjects[0]!;
      const inspected = await inspectSandboxObject(state, object, "inspect");
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(inspected.perceptions[0]?.providerId).toBe("sandbox-link");
      expect(inspected.perceptions[0]?.result.observation).toContain("Keystone proof");
      expect(inspected.perceptions[0]?.result.interpretation).toContain("tamper rejection");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not fetch private or local link destinations", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      let state = startPlaygroundSession(createAgent({ name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent", handle: "@jenny_ai", accent: "#D68754" }));
      const session = state.playgroundSessions[0]!;
      state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Maya", content: "A local link.", assets: [{ name: "local", kind: "link", sourceUrl: "http://127.0.0.1:3000/private" }] });
      const inspected = await inspectSandboxObject(state, state.mirrorObjects[0]!, "inspect");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(inspected.perceptions[0]?.result.uncertainty).toBe("insufficient");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
