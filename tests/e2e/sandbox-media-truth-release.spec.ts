import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { spawn } from "node:child_process";

type Json = Record<string, any>;
const cli = join(process.cwd(), "bin/openpresence.mjs");

function runCli(baseUrl: string, args: string[]): Promise<{ code: number | null; json?: Json; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, "playground", ...args, "--url", baseUrl], { cwd: process.cwd(), env: { ...process.env, OPENPRESENCE_AI_MOCK: "1", OPENPRESENCE_X_API_MOCK: "1" } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("close", (code) => {
      const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
      let json: Json | undefined;
      try { json = line ? JSON.parse(line) as Json : undefined; } catch { /* preserve stderr */ }
      resolve({ code, json, stderr });
    });
  });
}

test("public Sandbox CLI releases declared media truth only on inspect", async ({ request }) => {
  test.skip(test.info().project.name === "mobile");
  const baseUrl = String(test.info().project.use.baseURL ?? `http://localhost:${process.env.OPENPRESENCE_TEST_PORT ?? "3100"}`);
  await request.post("/api/state", { data: { type: "reset" } });
  const created = await request.post("/api/state", { data: { type: "createAgent", input: { name: "Media Truth Eval", description: "Learn which evidence earns attention.", audience: "AI builders", mode: "agent", handle: "@media_truth_eval", accent: "#D68754" } } });
  const createdState = await created.json() as Json;
  const presenceId = createdState.presence.id as string;
  await request.post("/api/state", { data: { type: "setPresence", patch: { execution: { post: "auto", reply: "auto", quote: "auto", repost: "auto", like: "auto", follow: "auto" }, selfDirectedAttention: { enabled: true, intensity: "curious", mediaUnderstanding: "when_needed" } } } });
  const started = await runCli(baseUrl, ["start", "--presence", presenceId, "--source", "fresh", "--seed", "media-truth-seed"]);
  expect(started.code, started.stderr).toBe(0);
  const sessionId = started.json?.session?.id as string;
  expect(sessionId).toBeTruthy();
  const injected = await runCli(baseUrl, ["inject", "--session", sessionId, "--observe-only", "--actor", "Researcher", "--handle", "@researcher", "--action", "post", "--content", "A chart grounds this claim.", "--assets-json", JSON.stringify([{ name: "relevant-chart", kind: "chart", mimeType: "image/png", dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", sandboxPerception: { observation: "A legible evidence chart is visible.", interpretation: "The visual directly supports the post's claim.", uncertainty: "low", visualForm: "chart", visualRole: "evidence", legibility: "clear", decorative: false } }])]);
  expect(injected.code, injected.stderr).toBe(0);
  const objectId = injected.json?.world?.[0]?.id as string;
  expect(injected.json?.world?.[0]?.assetRefs?.[0]?.perception?.result?.uncertainty).toBe("insufficient");

  const inspected = await runCli(baseUrl, ["inspect-media", "--session", sessionId, "--object", objectId]);
  expect(inspected.code, inspected.stderr).toBe(0);
  expect(inspected.json?.world?.[0]?.assetRefs?.[0]?.perception).toMatchObject({ providerId: "sandbox-fixture", result: { visualForm: "chart", visualRole: "evidence", decorative: false, uncertainty: "low" } });
});
