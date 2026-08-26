import { describe, expect, it } from "vitest";
import { buildPresenceChromeLaunchArgs, presenceBrowserSetupUrl } from "../lib/presence-browser-launcher";

describe("Presence-scoped Chrome launcher", () => {
  it("builds a dedicated persistent browser command without changing the extension path", () => {
    expect(buildPresenceChromeLaunchArgs("/tmp/openpresence/genny", "http://localhost:3015/settings?presenceId=p1")).toEqual([
      "--user-data-dir=/tmp/openpresence/genny",
      "--new-window",
      "http://localhost:3015/settings?presenceId=p1",
    ]);
  });

  it("scopes setup to one Agent and Presence", () => {
    expect(presenceBrowserSetupUrl("http://localhost:3015", "agent_1", "presence_1")).toBe("http://localhost:3015/settings?agentId=agent_1&presenceId=presence_1");
  });

  it("does not expose a setup URL without the optional Agent scope", () => {
    expect(presenceBrowserSetupUrl("http://localhost:3015", undefined, "presence_1")).toBe("http://localhost:3015/settings?presenceId=presence_1");
  });
});
