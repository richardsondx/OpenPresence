import { describe, expect, it } from "vitest";
import { createAgent, recordNativeMirrors, recordNativeMirrorsInPlace } from "../lib/runtime";

const input = (presenceId: string) => ({
  connectionId: "connection-performance",
  presenceId,
  post: {
    id: "performance-post",
    text: "A measured inbound observation.",
    authorId: "author-performance",
    authorUsername: "builder",
    authorName: "Builder",
  },
});

describe("native mirror ingress performance", () => {
  it("records a normalized batch in place without cloning the workspace", () => {
    const inPlaceState = createAgent({ name: "Genny", description: "Useful ideas", audience: "builders", mode: "agent", handle: "@genny", accent: "#D68754" });
    const defensiveState = createAgent({ name: "Genny", description: "Useful ideas", audience: "builders", mode: "agent", handle: "@genny", accent: "#D68754" });
    const inPlaceResult = recordNativeMirrorsInPlace(inPlaceState, [input(inPlaceState.presence!.id)]);
    const defensiveResult = recordNativeMirrors(defensiveState, [input(defensiveState.presence!.id)]);

    expect(inPlaceResult).toBe(inPlaceState);
    expect(inPlaceResult.mirrorObjects).toHaveLength(1);
    expect(inPlaceResult.mirrorObjects[0]).toMatchObject({ externalRef: { id: "performance-post" }, content: { text: "A measured inbound observation." } });
    expect(defensiveResult).not.toBe(defensiveState);
    expect(defensiveResult.mirrorObjects[0]).toMatchObject({ externalRef: { id: "performance-post" }, content: { text: "A measured inbound observation." } });
  });
});
