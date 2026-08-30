import { describe, expect, it } from "vitest";
import { createAttentionEpisode, recordAttentionStep, recordAttentionStepInPlace } from "../lib/attention-episodes";
import { createAgent } from "../lib/runtime";

describe("attention episode progress updates", () => {
  it("keeps the public helper immutable while allowing worker progress in place", () => {
    const source = createAgent({ name: "Jenny", description: "A test Agent.", mode: "agent", handle: "@jenny_attention", accent: "#D68754" });
    const created = createAttentionEpisode(source, { presenceId: source.presence!.id, runId: "run:attention" });
    const copied = recordAttentionStep(created.state, created.episode.id, "observing", { label: "Checking what changed", detail: "A copied update." });

    expect(copied).not.toBe(created.state);
    expect(created.state.attentionEpisodes[0]?.steps.at(-1)?.detail).not.toBe("A copied update.");

    const working = structuredClone(created.state);
    const returned = recordAttentionStepInPlace(working, created.episode.id, "observing", { label: "Checking what changed", detail: "An in-place update." });
    expect(returned).toBe(working);
    expect(working.attentionEpisodes[0]?.steps.at(-1)?.detail).toBe("An in-place update.");
  });
});
