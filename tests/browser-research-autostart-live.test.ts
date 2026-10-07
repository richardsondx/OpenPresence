import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getActiveBrowserSession, closeManagedBrowser } from "../lib/managed-browser";
import { readPublicWebThroughBrowser, chatResearchCapabilities } from "../lib/browser-research";
import { createAgent } from "../lib/runtime";

// Uses only a fresh harness-owned profile; never an operator account/profile.
describe.skipIf(process.env.OPENPRESENCE_LIVE_BROWSER_RESEARCH !== "1")("real managed research startup", () => {
  let directory: string;
  let presenceId: string;
  beforeAll(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), "openpresence-research-startup-")); vi.stubEnv("OPENPRESENCE_DATA_DIR", directory); });
  afterAll(async () => { if (presenceId) await closeManagedBrowser(presenceId); vi.unstubAllEnvs(); if (directory) fs.rmSync(directory, { recursive: true, force: true }); });
  it("starts a real managed Chrome browser automatically without a research key", async () => {
    const state = createAgent({ name: "Startup research proof", description: "Public evidence", mode: "agent", handle: "@startup_research", accent: "#777" });
    presenceId = state.presences[0].id; state.presences[0].environment = "live"; state.presences[0].browserAccess = { enabled: true };
    expect(getActiveBrowserSession(presenceId)).toBeUndefined();
    expect(chatResearchCapabilities(state, presenceId).read_web).toMatchObject({ ready: true, browserRunning: false, startupRequired: true, canStart: true });
    const source = await readPublicWebThroughBrowser(state, presenceId, "https://www.iana.org/help/example-domains");
    expect(source.title).toBe("Example Domains"); expect(source.route).toBe("browser");
    const managed = getActiveBrowserSession(presenceId)!;
    expect(managed).toBeTruthy(); expect(managed.context.pages()).toHaveLength(1);
    expect(state.executions).toHaveLength(0);
    console.info(JSON.stringify({ autoStarted: true, researchUrl: source.url, observedAt: source.observedAt, channelPages: managed.context.pages().length, publicationAttempted: false }));
  }, 60_000);
});
