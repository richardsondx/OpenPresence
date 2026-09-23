import { afterEach, describe, expect, it, vi } from "vitest";
import { applyOperation, createAgent } from "../lib/runtime";
import { createBridgeWithKey } from "../lib/bridge";
import { listOperationalRuns, readState, writeState } from "../lib/db";
import { executeChatRuntimeTool } from "../lib/operator-chat-tools";
import { POST } from "../app/api/bridge/v1/reads/route";

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
    expect((await request({}).then((response) => response.json())).read).toBeNull();
    expect((await request({ id: claimed.read.id, username: "reader", posts: [{ id: "12345", text: "A public memory observation", authorUsername: "builder" }] })).ok).toBe(true);
    const result = await pending;
    expect(result.result).toMatchObject({ route: "browser", posts: [{ id: "12345" }] });
    expect(result.state.mirrorObjects.find((item) => item.externalRef.id === "12345")).toMatchObject({ bridgeId: state.bridges[0].id, trust: "untrusted_world_content", visibility: "public" });
    expect(result.state.executions).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
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
    await request({ id: claimed.read.id, username: "someone_else", posts: [{ id: "98765", text: "Must not be imported" }] });
    await assertion;
    expect(readState().mirrorObjects.some((item) => item.externalRef.id === "98765")).toBe(false);
  });
});
