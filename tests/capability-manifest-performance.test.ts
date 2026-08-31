import { describe, expect, it } from "vitest";
import { applyOperation, createAgent, derivePresenceCapabilityManifest } from "../lib/runtime";

function freezeDeep<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  return Object.freeze(value);
}

describe("capability manifest performance boundary", () => {
  it("can inspect a normalized Live state without mutating the workspace", () => {
    const state = applyOperation(createAgent({
      name: "Jenny",
      description: "A test Presence.",
      mode: "agent",
      handle: "@jenny_test",
      accent: "#D68754",
    }), { type: "setPresence", patch: {} });
    const frozen = freezeDeep(state);

    const manifest = derivePresenceCapabilityManifest(frozen, frozen.presence!.id);

    expect(manifest.presenceId).toBe(frozen.presence!.id);
    expect(manifest.items.some((item) => item.capability === "public_discovery")).toBe(true);
  });
});
