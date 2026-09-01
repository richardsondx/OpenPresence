import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { readStateForAgent, readStateSnapshotForContext, reconcileActiveWorkspaceCopy, resolvedDbPath, WorkspaceConflictError, writeState } from "../lib/db";
import { applyOperation, assertRuntimeScope, createAgent, createRuntimeScope, initialState, resetPlaygroundSession, startPlaygroundSession } from "../lib/runtime";
import { POST as statePost } from "../app/api/state/route";

const input = { name: "Jenny", description: "Explain useful AI agent ideas.", mode: "agent" as const, handle: "@jenny_ai", accent: "#D68754" };

describe("independent Agent browser contexts", () => {
  it("keeps concurrent Agent workspace writes isolated", () => {
    let state = createAgent(input);
    const jennyId = state.agent!.id;
    state = applyOperation(state, {
      type: "createAdditionalAgent",
      input: { name: "Atlas", description: "Research carefully.", audience: "researchers", mode: "agent", handle: "@atlas", accent: "#7A8FD8" },
    });
    const atlasId = state.agent!.id;
    writeState(state);

    const jennyTab = readStateForAgent(jennyId);
    const atlasTab = readStateForAgent(atlasId);
    writeState(applyOperation(jennyTab, { type: "sendMessage", content: "Jenny-only tab work" }));
    writeState(applyOperation(atlasTab, { type: "sendMessage", content: "Atlas-only tab work" }));

    expect(readStateForAgent(jennyId).agent?.name).toBe("Jenny");
    expect(readStateForAgent(jennyId).messages.some((message) => message.content === "Jenny-only tab work")).toBe(true);
    expect(readStateForAgent(jennyId).messages.some((message) => message.content === "Atlas-only tab work")).toBe(false);
    expect(readStateForAgent(atlasId).agent?.name).toBe("Atlas");
    expect(readStateForAgent(atlasId).messages.some((message) => message.content === "Atlas-only tab work")).toBe(true);
    expect(readStateForAgent(atlasId).messages.some((message) => message.content === "Jenny-only tab work")).toBe(false);

    writeState(initialState());
  });

  it("rejects a stale same-Agent tab before it can overwrite newer work", () => {
    const created = createAgent(input);
    const agentId = created.agent!.id;
    writeState(created);

    const firstTab = readStateForAgent(agentId);
    const staleTab = readStateForAgent(agentId);
    writeState(applyOperation(firstTab, { type: "sendMessage", content: "The first tab owns this write." }));

    expect(() => writeState(applyOperation(staleTab, { type: "sendMessage", content: "The stale tab must not erase the first write." }))).toThrow(WorkspaceConflictError);
    expect(readStateForAgent(agentId).messages.some((message) => message.content === "The first tab owns this write.")).toBe(true);
    expect(readStateForAgent(agentId).messages.some((message) => message.content === "The stale tab must not erase the first write.")).toBe(false);

    writeState(initialState());
  });

  it("reads the active Agent from app_state after a worker write", () => {
    const created = createAgent(input);
    const agentId = created.agent!.id;
    writeState(created, { persistActiveWorkspace: true });

    const updated = applyOperation(readStateForAgent(agentId), { type: "setPresence", patch: { pacing: "gentle" } });
    writeState(updated);

    expect(readStateSnapshotForContext({ agentId }).presence?.pacing).toBe("gentle");
    writeState(initialState());
  });

  it("recovers durable records hidden in a richer active workspace copy", () => {
    const created = createAgent(input);
    const agentId = created.agent!.id;
    writeState(created, { persistActiveWorkspace: true });

    const database = new Database(resolvedDbPath);
    const appRow = database.prepare("SELECT payload FROM app_state WHERE id = 1").get() as { payload: string };
    const workspaceRow = database.prepare("SELECT payload FROM agent_workspaces WHERE agent_id = ?").get(agentId) as { payload: string };
    const appState = JSON.parse(appRow.payload) as ReturnType<typeof initialState>;
    const workspaceState = JSON.parse(workspaceRow.payload) as ReturnType<typeof initialState>;
    const preservedEvent = { id: "event-preserved-during-recovery", type: "system", title: "Preserved event", detail: "Recovered", time: new Date().toISOString(), tone: "info" } as ReturnType<typeof initialState>["events"][number];
    appState.events = [];
    workspaceState.events = [preservedEvent];
    database.transaction(() => {
      database.prepare("UPDATE app_state SET payload = ? WHERE id = 1").run(JSON.stringify(appState));
      database.prepare("UPDATE agent_workspaces SET payload = ? WHERE agent_id = ?").run(JSON.stringify(workspaceState), agentId);
    })();
    database.close();

    expect(reconcileActiveWorkspaceCopy()).toMatchObject({ changed: true, added: 1 });
    expect(readStateForAgent(agentId).events.some((event) => event.id === preservedEvent.id)).toBe(true);

    writeState(initialState());
  });

  it("marks Playground reset as a new world and rejects an old invocation scope", () => {
    const state = startPlaygroundSession(createAgent(input));
    const session = state.playgroundSessions[0]!;
    const oldScope = createRuntimeScope(state, { sessionId: session.id });
    const reset = resetPlaygroundSession(state, session.id);
    const resetSession = reset.playgroundSessions.find((item) => item.id === session.id)!;

    expect(resetSession.worldRevision).toBe((session.worldRevision ?? 1) + 1);
    expect(() => assertRuntimeScope(reset, oldScope)).toThrow(/stale or different Playground world/);
  });

  it("returns a scoped conflict when an API caller submits an old workspace revision", async () => {
    const created = createAgent(input);
    const agentId = created.agent!.id;
    writeState(created);
    const firstTab = readStateForAgent(agentId);
    const revision = String(firstTab.workspaceRevision);
    const headers = { "content-type": "application/json", "x-openpresence-agent-id": agentId, "x-openpresence-workspace-revision": revision };

    const first = await statePost(new Request("http://localhost/api/state", { method: "POST", headers, body: JSON.stringify({ type: "setPresence", patch: { pacing: "gentle" } }) }));
    expect(first.status).toBe(200);
    const stale = await statePost(new Request("http://localhost/api/state", { method: "POST", headers, body: JSON.stringify({ type: "setPresence", patch: { pacing: "custom" } }) }));
    const payload = await stale.json();
    expect(stale.status).toBe(409);
    expect(payload.conflict).toBe(true);
    expect(payload.state.presence.pacing).toBe("gentle");

    // A client that adopts the conflict snapshot must be able to replay its
    // pending local change against the returned revision without losing the
    // newer write. This is the protocol used by the browser mutation paths.
    const refreshedHeaders = { ...headers, "x-openpresence-workspace-revision": String(payload.state.workspaceRevision) };
    const replayed = await statePost(new Request("http://localhost/api/state", { method: "POST", headers: refreshedHeaders, body: JSON.stringify({ type: "setPresence", patch: { pacing: "custom" } }) }));
    expect(replayed.status).toBe(200);
    expect((await replayed.json()).presence.pacing).toBe("custom");

    writeState(initialState());
  });
});
