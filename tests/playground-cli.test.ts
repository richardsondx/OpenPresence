import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

const cliPath = join(process.cwd(), "bin/openpresence.mjs");

const fixtureState = {
  presence: { id: "presence-1", name: "Jenny", handle: "@jenny", channel: "x", mode: "agent", status: "live", execution: { post: "auto", reply: "auto" } },
  presences: [],
  playgroundSessions: [{ id: "session-1", environmentId: "env-1", presenceId: "presence-1", channelId: "x", status: "active", virtualNow: "2026-08-13T12:00:00.000Z", createdAt: "2026-08-13T12:00:00.000Z", updatedAt: "2026-08-13T12:00:00.000Z" }],
  mirrorObjects: [],
  socialIntents: [],
  executions: [],
  outcomes: [],
  publications: [],
  events: [],
};

function runCli(url: string, args: string[]) {
  return runCliAt(url, "playground", args);
}

function runCliAt(url: string, scope: string, args: string[]) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliPath, scope, ...args, "--url", url], { cwd: process.cwd() });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function startApi(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server did not bind.");
      resolve({ url: `http://127.0.0.1:${address.port}`, close: () => new Promise((done) => server.close(() => done())) });
    });
  });
}

function json(response: ServerResponse, body: unknown, statusCode = 200) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

describe("Playground CLI", () => {
  it("returns a compact agent-facing projection instead of raw state", async () => {
    const server = await startApi((_request, response) => json(response, fixtureState));
    const result = await runCli(server.url, ["inspect"]);
    await server.close();

    expect(result.code).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.ok).toBe(true);
    expect(output.environment).toBe("sandbox");
    expect(output.session.id).toBe("session-1");
    expect(output.presence.name).toBe("Jenny");
    expect(output).not.toHaveProperty("providerConnections");
    expect(output.configuration.channel.affordances).toBeDefined();
    expect(output.configuration.meaningFiles).toBeDefined();
  });

  it("resolves scenario session and object references from prior steps", async () => {
    let requestCount = 0;
    const server = await startApi((request, response) => {
      if (request.method === "GET") return json(response, fixtureState);
      requestCount += 1;
      let body = "";
      request.on("data", (chunk) => { body += chunk.toString(); });
      request.on("end", () => {
        const operation = JSON.parse(body);
        if (operation.type === "addSandboxEvent") expect(operation.sessionId).toBe("session-1");
        if (operation.type === "inspectSandboxMedia") expect(operation.objectId).toBe("mirror-1");
        json(response, { ...fixtureState, mirrorObjects: [{ id: "mirror-1", sessionId: "session-1", externalRef: { type: "x.post", id: "post-1" }, actorPresenceId: "other", objectType: "post", content: { text: "A post" } }] });
      });
    });
    const result = await runCli(server.url, ["run", "scenarios/relevant-image.json"]);
    await server.close();
    expect(result.code).toBe(0);
    expect(requestCount).toBeGreaterThan(0);
  });

  it("keeps later scenario steps on the session created by start", async () => {
    const operations: Array<Record<string, unknown>> = [];
    let currentState: Record<string, unknown> = fixtureState;
    const server = await startApi((request, response) => {
      if (request.method === "GET") return json(response, currentState);
      let body = "";
      request.on("data", (chunk) => { body += chunk.toString(); });
      request.on("end", () => {
        const operation = JSON.parse(body) as Record<string, unknown>;
        operations.push(operation);
        currentState = operation.type === "startPlayground"
          ? { ...fixtureState, playgroundSessions: [...fixtureState.playgroundSessions, { ...fixtureState.playgroundSessions[0], id: "session-new", createdAt: "2026-08-13T12:01:00.000Z" }] }
          : { ...currentState, mirrorObjects: [{ id: "mirror-new", sessionId: "session-new", externalRef: { type: "x.post", id: "post-new" }, actorPresenceId: "other", objectType: "post", content: { text: "A post" } }] };
        json(response, currentState);
      });
    });
    const result = await runCli(server.url, ["run", "scenarios/relevant-image.json"]);
    await server.close();
    expect(result.code).toBe(0);
    expect(operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "addSandboxEvent", sessionId: "session-new" }),
      expect.objectContaining({ type: "inspectSandboxMedia", sessionId: "session-new" }),
    ]));
  });

  it("translates inject into the existing sandbox operation contract", async () => {
    let received: unknown;
    const server = await startApi((request, response) => {
      if (request.method === "GET") return json(response, fixtureState);
      let body = "";
      request.on("data", (chunk) => { body += chunk.toString(); });
      request.on("end", () => {
        received = JSON.parse(body);
        json(response, fixtureState);
      });
    });
    const result = await runCli(server.url, ["inject", "--actor", "Maya", "--action", "post", "--content", "Hello"]);
    await server.close();

    expect(result.code).toBe(0);
    expect(received).toMatchObject({ type: "addSandboxEvent", sessionId: "session-1", actionId: "post", actorName: "Maya", content: "Hello" });
  });

  it("projects the newly started session when a Presence is selected explicitly", async () => {
    const server = await startApi((request, response) => {
      if (request.method === "GET") return json(response, { ...fixtureState, presence: { ...fixtureState.presence, id: "presence-1" }, presences: [{ ...fixtureState.presence, id: "presence-1" }] });
      json(response, {
        ...fixtureState,
        presence: { ...fixtureState.presence, id: "presence-1" },
        presences: [{ ...fixtureState.presence, id: "presence-1" }, { ...fixtureState.presence, id: "presence-2", name: "Mira", handle: "@mira", mode: "ghost" }],
        playgroundSessions: [...fixtureState.playgroundSessions, { ...fixtureState.playgroundSessions[0], id: "session-2", presenceId: "presence-2", createdAt: "2026-08-13T12:01:00.000Z", updatedAt: "2026-08-13T12:01:00.000Z" }],
      });
    });
    const result = await runCli(server.url, ["start", "--presence", "presence-2"]);
    await server.close();
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ session: { id: "session-2" }, presence: { id: "presence-2", name: "Mira" } });
  });

  it("projects Presence-scoped identity meaning for an explicit session", async () => {
    const server = await startApi((_request, response) => json(response, {
      ...fixtureState,
      presence: { ...fixtureState.presence, id: "presence-1" },
      presences: [
        { ...fixtureState.presence, id: "presence-1", name: "Ada", handle: "@ada_presence" },
        { ...fixtureState.presence, id: "presence-2", name: "Mira", handle: "@mira_research", mode: "ghost" },
      ],
      playgroundSessions: [{ ...fixtureState.playgroundSessions[0], presenceId: "presence-1" }],
      files: [{ kind: "PRESENCE", content: "## X · @mira_research\nI appear here as Mira.", revision: 4 }],
    }));
    const result = await runCli(server.url, ["inspect", "--session", "session-1"]);
    await server.close();
    expect(result.code).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.configuration.meaningFiles[0].content).toContain("@ada_presence");
    expect(output.configuration.meaningFiles[0].content).toContain("I appear here as Ada.");
    expect(output.configuration.meaningFiles[0].content).not.toContain("@mira_research");
  });

  it("translates schedule into a Presence-scoped Calendar operation", async () => {
    let received: unknown;
    const server = await startApi((request, response) => {
      if (request.method === "GET") return json(response, fixtureState);
      let body = "";
      request.on("data", (chunk) => { body += chunk.toString(); });
      request.on("end", () => {
        received = JSON.parse(body);
        json(response, fixtureState);
      });
    });
    const result = await runCli(server.url, ["schedule", "--instruction", "Explain one useful boundary", "--day", "Thursday", "--time", "12:30"]);
    await server.close();
    expect(result.code).toBe(0);
    expect(received).toMatchObject({ type: "addSlot", instruction: "Explain one useful boundary", day: "Thursday", time: "12:30", presenceId: "presence-1" });
  });

  it("exposes scheduled Assignments through the top-level Schedule scope", async () => {
    let received: unknown;
    const server = await startApi((request, response) => {
      if (request.method === "GET") return json(response, fixtureState);
      let body = "";
      request.on("data", (chunk) => { body += chunk.toString(); });
      request.on("end", () => {
        received = JSON.parse(body);
        json(response, { ...fixtureState, assignments: [{ id: "assignment-1", presenceId: "presence-1", instruction: "Produce two posts", status: "draft", environment: "sandbox", progress: { verified: 0, required: 2 } }] });
      });
    });
    const result = await runCliAt(server.url, "schedule", ["add", "--responsibility", "assign", "--instruction", "Produce two posts", "--day", "Friday", "--time", "09:15"]);
    await server.close();
    expect(result.code).toBe(0);
    expect(received).toMatchObject({ type: "createAssignment", presenceId: "presence-1", environment: "sandbox", schedule: { day: "Friday", time: "09:15" } });
    expect(JSON.parse(result.stdout).assignments[0].id).toBe("assignment-1");
  });

  it("translates Watching add and remove into Presence-scoped operations", async () => {
    const operations: Array<Record<string, unknown>> = [];
    let watches: unknown[] = [{ id: "watch-1", presenceId: "presence-1", title: "@Maya", query: "@Maya", kind: "creator", channel: "x", observation: { status: "watching", source: "automatic", observedCount: 0 } }];
    const server = await startApi((request, response) => {
      if (request.method === "GET") return json(response, { ...fixtureState, watches });
      let body = "";
      request.on("data", (chunk) => { body += chunk.toString(); });
      request.on("end", () => {
        const operation = JSON.parse(body) as Record<string, unknown>;
        operations.push(operation);
        watches = operation.type === "deleteWatch" ? [] : [{ id: "watch-2", presenceId: "presence-1", title: "AI founders", query: "AI founders", kind: "topic", channel: "x", observation: { status: "manual", source: "manual", observedCount: 0 } }];
        json(response, { ...fixtureState, watches });
      });
    });
    const added = await runCliAt(server.url, "watching", ["add", "--query", "AI founders", "--purpose", "Notice useful conversations"]);
    const addedOutput = JSON.parse(added.stdout);
    const removed = await runCliAt(server.url, "watching", ["remove", "--id", "watch-2"]);
    await server.close();
    expect(added.code).toBe(0);
    expect(addedOutput.watches[0].observation.status).toBe("manual");
    expect(operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "createWatch", presenceId: "presence-1", query: "AI founders" }),
      expect.objectContaining({ type: "deleteWatch", id: "watch-2" }),
    ]));
    expect(removed.code).toBe(0);
  });

  it("exposes Assignment, original rehearsal, and calibration operations through Playground", async () => {
    const operations: Array<Record<string, unknown>> = [];
    const server = await startApi((request, response) => {
      if (request.method === "GET") return json(response, { ...fixtureState, originalPostRehearsals: [{ id: "attempt-1", sessionId: "session-1", result: "published" }] });
      let body = "";
      request.on("data", (chunk) => { body += chunk.toString(); });
      request.on("end", () => {
        const operation = JSON.parse(body) as Record<string, unknown>;
        operations.push(operation);
        json(response, { ...fixtureState, originalPostRehearsals: [{ id: "attempt-1", sessionId: "session-1", result: "published" }] });
      });
    });
    const assignment = await runCli(server.url, ["assignment", "create", "--instruction", "Produce two original posts"]);
    const rehearsal = await runCli(server.url, ["rehearse", "--inspiration", "A useful boundary"]);
    const feedback = await runCli(server.url, ["feedback", "--attempt", "attempt-1", "--reaction", "fits", "--reasons", "idea,voice"]);
    await server.close();
    expect(assignment.code).toBe(0);
    expect(rehearsal.code).toBe(0);
    expect(feedback.code).toBe(0);
    expect(operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "createAssignment", sessionId: "session-1", environment: "sandbox" }),
      expect.objectContaining({ type: "considerOriginalPublication", sessionId: "session-1", inspiration: "A useful boundary" }),
      expect.objectContaining({ type: "recordPreferenceEvidence", sessionId: "session-1", attemptId: "attempt-1", reaction: "fits", reasons: ["idea", "voice"] }),
    ]));
  });

  it("returns structured errors for a missing server", async () => {
    const result = await runCli("http://127.0.0.1:1", ["inspect"]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: { code: "SERVER_UNAVAILABLE" } });
  });

  it("blocks Schedule evaluation when the Presence is not explicitly Sandbox-scoped", async () => {
    let posted = false;
    const server = await startApi((request, response) => {
      if (request.method === "POST") posted = true;
      json(response, { ...fixtureState, calendar: [{ id: "slot-1", presence: "presence-1", instruction: "Evaluate this", day: "Friday", time: "12:00", objective: "usefulness", executionWindow: "12:00–12:00", enabled: true }] });
    });
    const result = await runCliAt(server.url, "schedule", ["run", "--id", "slot-1"]);
    await server.close();
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: { code: "LIVE_SCOPE_BLOCKED" } });
    expect(posted).toBe(false);
  });
});
