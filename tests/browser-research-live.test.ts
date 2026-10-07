import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium, type Browser, type BrowserContext } from "@playwright/test";
const session = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock("../lib/managed-browser", () => ({ getActiveBrowserSession: () => session.value }));
import { searchPublicWebThroughBrowser, readPublicWebThroughBrowser } from "../lib/browser-research";
import { createAgent } from "../lib/runtime";

// Explicit live network proof; never uses a saved operator profile or account.
describe.skipIf(process.env.OPENPRESENCE_LIVE_BROWSER_RESEARCH !== "1")("live public browser research", () => {
  let browser: Browser;
  let channelContext: BrowserContext;
  beforeAll(async () => {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    channelContext = await browser.newContext();
    const page = await channelContext.newPage();
    await page.goto("about:blank");
    session.value = { context: channelContext, page };
  });
  afterAll(async () => { await browser?.close(); });
  it("returns usable prototype-research leads with inspectable search summaries", async () => {
    const state = createAgent({ name: "Prototype source proof", description: "Public evidence", mode: "agent", handle: "@prototype_proof", accent: "#777" });
    const presenceId = state.presences[0].id;
    state.presences[0].environment = "live"; state.presences[0].browserAccess = { enabled: true };
    const results = await searchPublicWebThroughBrowser(state, presenceId, "usability testing prototypes");
    expect(results.sources.some((source) => /prototype|usability/i.test(source.title) && source.contentKind === "search_result_summary")).toBe(true);
    console.info(JSON.stringify({ query: results.query, searchUrl: results.searchUrl, sources: results.sources.map(({ title, url, contentKind }) => ({ title, url, contentKind })) }));
  }, 60_000);
  it("gets current search leads and reads a real source while preserving the channel tab", async () => {
    const state = createAgent({ name: "Live research proof", description: "Read public source evidence", mode: "agent", handle: "@research_proof", accent: "#777" });
    const presenceId = state.presences[0].id;
    state.presences[0].environment = "live";
    state.presences[0].browserAccess = { enabled: true };
    const results = await searchPublicWebThroughBrowser(state, presenceId, "OpenAI official website");
    expect(results.sources.length).toBeGreaterThan(0);
    expect(results.sources.some((source) => /openai\.com/.test(source.url))).toBe(true);
    const source = await readPublicWebThroughBrowser(state, presenceId, "https://www.iana.org/help/example-domains");
    expect(source.title).toBe("Example Domains");
    expect(source.content).toContain("documentation purposes");
    expect(source.route).toBe("browser");
    expect(channelContext.pages()).toHaveLength(1);
    expect(channelContext.pages()[0].url()).toBe("about:blank");
    console.info(JSON.stringify({ searchUrl: results.searchUrl, sources: results.sources.map(({ title, url }) => ({ title, url })), readUrl: source.url, observedAt: source.observedAt, channelTabPreserved: true }));
  }, 60_000);
});
