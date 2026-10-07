import { writeBrowserAdapterObservation, writeBridgeIdentity } from "../lib/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyOperation, createAgent } from "../lib/runtime";
import { createBridgeWithKey } from "../lib/bridge";
import { getOperationalRun, listOperationalRuns, readState, upsertOperationalRun, writeState } from "../lib/db";
import { browserReadUnavailableReason } from "../lib/browser-channel-read";
import { executeChatRuntimeTool } from "../lib/operator-chat-tools";
import { POST } from "../app/api/bridge/v1/reads/route";

// A verified account alone does not prove the current Chrome adapter can act.
function verifiedBrowserAdapters(accountIdentity: import("../lib/types").Bridge["accountIdentity"], bridgeId?: string) {
  const adapters = [{ executorId: "openpresence-chrome-test", version: "1.0.0", protocolVersion: 2, probed: true,
    observedAt: accountIdentity!.observedAt,
    accountIdentity,
    capabilities: { channelRead: true, mediaUpload: true, verification: true,
      affordances: ["post", "reply", "quote", "repost", "like", "follow", "delete"] },
  }];
  if (bridgeId) {
    writeBrowserAdapterObservation(bridgeId, adapters[0]!);
    writeBridgeIdentity({ bridgeId, executorId: adapters[0]!.executorId, ...accountIdentity! });
  }
  return adapters;
}

afterEach(() => vi.unstubAllGlobals());
function fixture() {
  let state = createAgent({ name: "Reader", description: "Read public conversations", mode: "agent", handle: "@reader", accent: "#D68754" });
  state = applyOperation(state, { type: "setPresence", patch: { environment: "live", browserAccess: { enabled: true } } });
  const created = createBridgeWithKey(state, { type: "createBridge", input: { presenceId: state.presence!.id, name: "OpenPresence Chrome · Reader", kind: "bridge", capabilities: { inbound: true, reconcile: true, affordances: ["post", "reply"], formats: ["text"], metrics: [] } } });
  state = created.state;
  const bridge = state.bridges[0];
  bridge.state = "online";
  bridge.lastHeartbeatAt = bridge.lastSeenAt = new Date().toISOString();
  bridge.accountIdentity = { username: "reader", status: "verified", observedAt: bridge.lastSeenAt };
  bridge.browserAdapters = verifiedBrowserAdapters(bridge.accountIdentity, bridge.id);
  writeState(state);
  const request = (body: unknown, key = created.key!) => POST(new Request("http://localhost/api/bridge/v1/reads", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { state: readState(), presenceId: state.presence!.id, request };
}

describe("browser reads without X API credentials", () => {
  it("dispatches a real read request, accepts authenticated browser evidence, and resumes the same tool", async () => {
    const { state, presenceId, request } = fixture();
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const pending = executeChatRuntimeTool(state, presenceId, { kind: "search_posts", query: "agent memory" }, "chat-browser-read");
    expect(listOperationalRuns(presenceId, ["waiting"]).some((run) => run.stage === "browser.read")).toBe(true);
    const claimed = await request({}).then((response) => response.json());
    expect(claimed.read.url).toBe("https://x.com/search?q=agent%20memory&f=live");
    expect(claimed.read.leaseToken).toEqual(expect.any(String));
    expect((await request({}).then((response) => response.json())).read).toBeNull();
    expect((await request({ action: "complete", id: claimed.read.id, leaseToken: claimed.read.leaseToken, username: "reader", posts: [{ id: "12345", text: "A public memory observation", authorUsername: "builder" }] })).ok).toBe(true);
    const result = await pending;
    expect(result.result).toMatchObject({ route: "browser", posts: [{ id: "12345" }] });
    expect(result.state.mirrorObjects.find((item) => item.externalRef.id === "12345")).toMatchObject({ bridgeId: state.bridges[0].id, trust: "untrusted_world_content", visibility: "public" });
    expect(result.state.executions).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("reclaims an abandoned browser-read lease after extension worker restart and rejects the stale worker", async () => {
    const { state, presenceId, request } = fixture();
    const pending = executeChatRuntimeTool(state, presenceId, { kind: "search_posts", query: "agent recovery" }, "restart-browser-read");
    const first = await request({}).then((response) => response.json());
    const leasedRun = getOperationalRun(first.read.id)!;
    expect(leasedRun.leaseExpiresAt).toBeTruthy();

    // Simulate an MV3 service-worker restart after it claimed the durable read.
    // The next restored worker may reclaim only after the old short lease expires.
    upsertOperationalRun({ ...leasedRun, leaseExpiresAt: new Date(Date.now() - 1).toISOString() });
    const recovered = await request({}).then((response) => response.json());
    expect(recovered.read).toMatchObject({ id: first.read.id, url: first.read.url });
    expect(recovered.read.leaseToken).not.toBe(first.read.leaseToken);

    expect((await request({ action: "complete", id: first.read.id, leaseToken: first.read.leaseToken, username: "reader", posts: [] })).status).toBe(409);
    expect((await request({ action: "renew", id: recovered.read.id, leaseToken: recovered.read.leaseToken })).ok).toBe(true);
    expect((await request({ action: "complete", id: recovered.read.id, leaseToken: recovered.read.leaseToken, username: "reader", posts: [{ id: "67890", text: "Read after worker recovery", authorUsername: "builder" }] })).ok).toBe(true);

    const result = await pending;
    expect(result.result).toMatchObject({ route: "browser", posts: [{ id: "67890" }] });
  });
  it("resumes an existing blocked task through the browser without requiring native API credentials", async () => {
    const { state, presenceId } = fixture();
    let next = applyOperation(state, { type: "createAssignment", presenceId, environment: "live", instruction: "Publish one useful post" });
    const assignment = next.assignments[0];
    next = applyOperation(next, { type: "activateAssignment", id: assignment.id });
    next.assignments.find((item) => item.id === assignment.id)!.status = "needs_operator";
    const result = await executeChatRuntimeTool(next, presenceId, { kind: "retry_assignment", assignmentId: assignment.id }, "retry-browser");
    expect(result.result).toMatchObject({ route: "browser", status: "queued", assignmentId: assignment.id, publicationTested: false });
    expect(result.state.executions).toHaveLength(0);
    expect(result.state.assignmentRuns?.some((run) => run.assignmentId === assignment.id && run.status === "queued")).toBe(true);
  });
  it("does not accept a read from a changed account or an unauthenticated client", async () => {
    const { state, presenceId, request } = fixture();
    expect((await request({}, "wrong-key")).status).toBe(401);
    const pending = executeChatRuntimeTool(state, presenceId, { kind: "search_posts", query: "agents" }, "wrong-account");
    const assertion = expect(pending).rejects.toThrow("account changed");
    const claimed = await request({}).then((response) => response.json());
    const rejected = await request({ action: "complete", id: claimed.read.id, leaseToken: claimed.read.leaseToken, username: "someone_else", posts: [{ id: "98765", text: "Must not be imported" }] });
    expect(rejected.status).toBe(200);
    await assertion;
    expect(listOperationalRuns(presenceId).filter((run) => run.stage === "browser.read")).toHaveLength(1);
    expect(readState().mirrorObjects.some((item) => item.externalRef.id === "98765")).toBe(false);
  });

  it("rejects a stale verified identity before starting a browser read", async () => {
    const { state, presenceId } = fixture();
    state.bridges[0]!.accountIdentity = { username: "@richardsondx", status: "verified", observedAt: new Date().toISOString() };
    state.bridges[0]!.browserAdapters = verifiedBrowserAdapters(state.bridges[0]!.accountIdentity, state.bridges[0]!.id);
    writeState(state);
    const current = readState();
    expect(browserReadUnavailableReason(current, presenceId)).toContain("signed in as @richardsondx");

    await expect(executeChatRuntimeTool(current, presenceId, { kind: "search_posts", query: "agents", routePreference: "browser" }, "wrong-current-account"))
      .rejects.toThrow("this Presence expects @reader");
    expect(listOperationalRuns(presenceId).filter((run) => run.stage === "browser.read")).toHaveLength(0);
  });

  it("does not lease a pending read to a browser verified for a different Presence account", async () => {
    const { state, presenceId, request } = fixture();
    state.bridges[0]!.accountIdentity = { username: "richardsondx", status: "verified", observedAt: new Date().toISOString() };
    state.bridges[0]!.browserAdapters = verifiedBrowserAdapters(state.bridges[0]!.accountIdentity, state.bridges[0]!.id);
    writeState(state);
    const now = new Date().toISOString();
    const id = "browser-read:wrong-account-lease";
    upsertOperationalRun({ id, presenceId, kind: "observation", state: "waiting", stage: "browser.read", createdAt: now, lastProgressAt: now,
      deadlineAt: new Date(Date.now() + 65_000).toISOString(), attemptCount: 0, recoveryCount: 0,
      metadata: { browserRead: true, bridgeId: state.bridges[0]!.id, url: "https://x.com/home" },
    });

    const response = await request({});
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("expects @reader");
    expect(getOperationalRun(id)).toMatchObject({ state: "failed", attemptCount: 0, lastErrorCode: expect.stringContaining("expects @reader") });
    expect(getOperationalRun(id)?.leaseOwner).toBeUndefined();
  });
});
