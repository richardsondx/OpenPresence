import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), launch: vi.fn(), dns: vi.fn(), request: vi.fn(), secret: vi.fn() }));
vi.mock("../lib/managed-browser", () => ({ getActiveBrowserSession: mocks.session, launchManagedBrowser: mocks.launch }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.dns }));
vi.mock("node:https", () => ({ default: { request: mocks.request } }));
vi.mock("../lib/db", async (original) => ({ ...await original<typeof import("../lib/db")>(), readProviderSecret: mocks.secret }));
import { isPublicResearchAddress, readPublicWebThroughBrowser, resolvePublicResearchUrl, researchRecoveryReady, chatResearchCapabilities } from "../lib/browser-research";
import { executeChatRuntimeTool } from "../lib/operator-chat-tools";
import { createAgent } from "../lib/runtime";
import { parseOperatorChatStep } from "../lib/operator-chat-harness";

function fixture() {
  const state = createAgent({ name: "Research", description: "Social research", mode: "agent", handle: "@research", accent: "#777" });
  const presenceId = state.presences[0].id;
  state.presences[0].environment = "live";
  state.presences[0].browserAccess = { enabled: true };
  return { state, presenceId };
}
function browser() {
  const close = vi.fn();
  const page = { route: vi.fn(), mainFrame: vi.fn(), goto: vi.fn(), evaluate: vi.fn(async () => ({ title: "Source", content: "Useful research", links: [{ title: "Primary evidence", url: "https://example.org/source" }] })) };
  const context = { newPage: vi.fn(async () => page), close };
  const owner = { isConnected: () => true, newContext: vi.fn(async () => context) };
  const channelPage = { goto: vi.fn(), close: vi.fn() };
  mocks.session.mockReturnValue({ context: { browser: () => owner }, page: channelPage });
  return { owner, page, close, channelPage };
}
beforeEach(() => {
  mocks.dns.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  mocks.secret.mockReturnValue(undefined);
  mocks.launch.mockReset();
  mocks.request.mockImplementation((_url, options, callback) => {
    const request = new EventEmitter() as EventEmitter & { end: () => void; setTimeout: () => void; destroy: () => void };
    request.setTimeout = vi.fn(); request.destroy = vi.fn();
    request.end = () => {
      options.lookup("example.org", {}, (_error: unknown, address: string) => expect(address).toBe("93.184.216.34"));
      const response = new EventEmitter() as EventEmitter & { statusCode: number; headers: object; destroy: () => void };
      response.statusCode = 200; response.headers = { "content-type": "text/html" }; response.destroy = vi.fn();
      callback(response); queueMicrotask(() => { response.emit("data", Buffer.from("<body>Useful research</body>")); response.emit("end"); });
    };
    return request;
  });
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
describe("public browser research", () => {
  it.each(["127.0.0.1", "10.1.2.3", "100.64.0.1", "169.254.169.254", "192.168.1.1", "198.18.0.1", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "2001:db8::1", "2002:7f00:1::"])('rejects non-public address %s', (address) => expect(isPublicResearchAddress(address)).toBe(false));
  it("rejects private DNS even when another answer is public", async () => {
    mocks.dns.mockResolvedValue([{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }]);
    await expect(resolvePublicResearchUrl("https://example.org")).rejects.toThrow("non-public");
  });
  it.each(["file:///etc/passwd", "http://localhost/", "https://user:password@example.org", "http://example.org:3000"])('rejects unsafe URL %s', async (url) => await expect(resolvePublicResearchUrl(url)).rejects.toThrow());
  it("bounds DNS by the shared research deadline rather than waiting indefinitely", async () => {
    const { state, presenceId } = fixture(); browser(); mocks.dns.mockReturnValue(new Promise(() => undefined));
    await expect(readPublicWebThroughBrowser(state, presenceId, "https://example.org", Date.now() + 10)).rejects.toThrow("shared 55-second deadline");
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("advertises stopped but launchable research as callable without an operator chore", () => {
    const { state, presenceId } = fixture(); mocks.session.mockReturnValue(undefined);
    const availability = chatResearchCapabilities(state, presenceId);
    expect(availability.read_web).toMatchObject({ ready: true, browserRunning: false, startupRequired: true, canStart: true });
    expect(availability.read_web.unavailableReason).toBeUndefined();
    expect(availability.search_web).toMatchObject({ browserReady: true, browserRunning: false, startupRequired: true });
    expect(availability.search_web.browserUnavailableReason).toBeUndefined();
    expect(availability.note).toContain("callable now");
  });
  it("automatically starts an enabled browser once for simultaneous reads", async () => {
    const { state, presenceId } = fixture(); browser();
    const created = mocks.session(); mocks.session.mockReturnValue(undefined);
    mocks.launch.mockImplementation(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); mocks.session.mockReturnValue(created); return created; });
    const reads = await Promise.all([readPublicWebThroughBrowser(state, presenceId, "https://example.org/a"), readPublicWebThroughBrowser(state, presenceId, "https://example.org/b")]);
    expect(reads).toHaveLength(2); expect(mocks.launch).toHaveBeenCalledOnce();
    expect(mocks.launch).toHaveBeenCalledWith(presenceId, { headless: true, expectedIdentity: state.presences[0].handle });
    expect(state.executions).toHaveLength(0);
  });
  it("reports a bounded runtime startup failure without asking for a key or user retry", async () => {
    const { state, presenceId } = fixture(); mocks.session.mockReturnValue(undefined); mocks.launch.mockRejectedValue(new Error("Chrome spawn failed"));
    await expect(readPublicWebThroughBrowser(state, presenceId, "https://example.org")).rejects.toThrow("temporarily failed");
    expect(mocks.launch).toHaveBeenCalledOnce(); expect(mocks.request).not.toHaveBeenCalled();
  });
  it("uses an isolated read-only tab and never touches the channel page", async () => {
    const { state, presenceId } = fixture(); const controlled = browser();
    const receipt = await readPublicWebThroughBrowser(state, presenceId, "https://example.org/source");
    expect(receipt).toMatchObject({ url: "https://example.org/source", content: "Useful research", route: "browser", trust: "untrusted_world_content", observedAt: expect.any(String) });
    expect(controlled.owner.newContext).toHaveBeenCalledWith({ javaScriptEnabled: false, serviceWorkers: "block", acceptDownloads: false });
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(controlled.channelPage.goto).not.toHaveBeenCalled(); expect(controlled.channelPage.close).not.toHaveBeenCalled(); expect(controlled.close).toHaveBeenCalledOnce();
    const handler = controlled.page.route.mock.calls[0][1]; const abort = vi.fn();
    await handler({ request: () => ({ isNavigationRequest: () => false }), abort });
    expect(abort).toHaveBeenCalledOnce();
  });
  it("preserves bounded search summaries and tries the next engine after a challenged page", async () => {
    const { state, presenceId } = fixture(); const controlled = browser();
    controlled.page.evaluate.mockResolvedValueOnce({ title: "Challenge", content: "Challenge", links: [] }).mockResolvedValueOnce({ title: "Results", content: "Results", links: [{ title: "Prototype usability testing", url: "https://example.org/source", snippet: "Public search summary about prototype testing" }] } as never);
    const result = await executeChatRuntimeTool(state, presenceId, { kind: "search_web", query: "prototype usability" }, "engine-fallback");
    expect(result.result).toMatchObject({ route: "browser", searchUrl: expect.stringContaining("bing.com"), query: "prototype usability", fallbackReason: expect.stringContaining("no readable"), sources: [{ content: "Public search summary about prototype testing", contentKind: "search_result_summary" }] });
    expect(controlled.page.goto.mock.calls.map(([url]) => url)).toEqual([expect.stringContaining("lite.duckduckgo.com"), expect.stringContaining("bing.com")]);
  });
  it("falls back to browser search without any provider key and keeps publication untouched", async () => {
    const { state, presenceId } = fixture(); browser();
    const result = await executeChatRuntimeTool(state, presenceId, { kind: "search_web", query: "public topic" }, "research-run");
    expect(result.result).toMatchObject({ route: "browser", sources: [{ url: "https://example.org/source", content: expect.stringContaining("lead") }] });
    expect(result.state.executions).toEqual(state.executions);
    expect(researchRecoveryReady(state, presenceId)).toBe(true);
  });
  it("falls back after an unavailable API and records the route used", async () => {
    const { state, presenceId } = fixture(); browser();
    state.assetProviderConnections = [{ id: "research-api", provider: "tavily", status: "available" } as typeof state.assetProviderConnections[number]];
    mocks.secret.mockReturnValue("test-secret");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 402 })));
    const result = await executeChatRuntimeTool(state, presenceId, { kind: "search_web", query: "public topic", routePreference: "auto" }, "fallback-run");
    expect(result.result).toMatchObject({ route: "browser", fallbackReason: "Web search returned HTTP 402." });
    expect(JSON.stringify(result.result)).not.toContain("test-secret");
  });
  it("rejects a public source redirect to an internal address before sending it", async () => {
    const { state, presenceId } = fixture(); const controlled = browser();
    mocks.request.mockImplementationOnce((_url, _options, callback) => {
      const request = new EventEmitter() as EventEmitter & { end: () => void; setTimeout: () => void };
      request.setTimeout = vi.fn(); request.end = () => {
        const response = new EventEmitter() as EventEmitter & { statusCode: number; headers: object };
        response.statusCode = 302; response.headers = { location: "http://169.254.169.254/latest/meta-data" };
        callback(response); queueMicrotask(() => response.emit("end"));
      }; return request;
    });
    await expect(readPublicWebThroughBrowser(state, presenceId, "https://example.org")).rejects.toThrow("non-public");
    expect(mocks.request).toHaveBeenCalledOnce(); expect(controlled.owner.newContext).not.toHaveBeenCalled();
  });
  it("closes the dedicated context after a browser read failure", async () => {
    const { state, presenceId } = fixture(); const controlled = browser();
    controlled.page.evaluate.mockRejectedValueOnce(new Error("Browser disconnected"));
    await expect(readPublicWebThroughBrowser(state, presenceId, "https://example.org")).rejects.toThrow("Browser disconnected");
    expect(controlled.close).toHaveBeenCalledOnce();
  });
  it("cannot use live browser research inside Sandbox", async () => {
    const { state, presenceId } = fixture(); state.presences[0].environment = "sandbox"; browser();
    await expect(readPublicWebThroughBrowser(state, presenceId, "https://example.org")).rejects.toThrow("Sandbox");
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("strictly accepts typed research steps", () => {
    expect(parseOperatorChatStep('{"kind":"search_web","query":"public topic","routePreference":"browser"}').kind).toBe("search_web");
    expect(parseOperatorChatStep('{"kind":"read_web","url":"https://example.org/source"}').kind).toBe("read_web");
    expect(() => parseOperatorChatStep('{"kind":"read_web","url":"https://example.org","method":"POST"}')).toThrow();
  });
});
