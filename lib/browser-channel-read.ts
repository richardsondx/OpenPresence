import { randomUUID } from "node:crypto";
import { getOperationalRun, upsertOperationalRun } from "./db";
import { bridgeExecutionStatus } from "./bridge-contract";
import type { OpenPresenceState } from "./types";
import type { XRecentPost } from "./x";

export function readyBrowserForRead(state: OpenPresenceState, presenceId: string) {
  const presence = state.presences.find((item) => item.id === presenceId);
  if (presence?.channel !== "x" || presence.browserAccess?.enabled === false || presence.environment === "sandbox") return undefined;
  return state.bridges.find((item) => item.presenceId === presenceId && item.name.startsWith("OpenPresence Chrome") && bridgeExecutionStatus(item) === "connected");
}

/** A read uses the existing authenticated browser body, without an API key or public write. */
export async function readChannelThroughBrowser(state: OpenPresenceState, presenceId: string, query?: string): Promise<XRecentPost[]> {
  const bridge = readyBrowserForRead(state, presenceId);
  if (!bridge) throw new Error("The browser is not connected with a verified account for this Presence.");
  const id = `browser-read:${randomUUID()}`;
  const now = new Date().toISOString();
  upsertOperationalRun({ id, presenceId, kind: "observation", state: "waiting", stage: "browser.read", createdAt: now, lastProgressAt: now,
    deadlineAt: new Date(Date.now() + 25_000).toISOString(), attemptCount: 0, recoveryCount: 0,
    metadata: { browserRead: true, bridgeId: bridge.id, url: query ? `https://x.com/search?q=${encodeURIComponent(query)}&f=live` : "https://x.com/home" },
  });
  try {
    for (let i = 0; i < 100; i++) {
      const run = getOperationalRun(id);
      if (run?.state === "succeeded") return (run.metadata?.posts ?? []) as unknown as XRecentPost[];
      if (run?.state === "failed") throw new Error(run.lastErrorCode ?? "The browser could not read X.");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("The browser did not finish this read within 25 seconds.");
  } finally {
    const run = getOperationalRun(id);
    if (run?.state === "waiting") upsertOperationalRun({ ...run, state: "failed", lastErrorCode: "Browser read deadline elapsed; no public action was attempted.", lastProgressAt: new Date().toISOString() });
  }
}

/** Preserve browser provenance when the caller persists its worker snapshot. */
export function recordBrowserReadMirrors(state: OpenPresenceState, presenceId: string, posts: XRecentPost[]) {
  const bridge = readyBrowserForRead(state, presenceId);
  if (!bridge) return state;
  const next = structuredClone(state);
  const now = new Date().toISOString();
  for (const post of posts) {
    const existing = next.mirrorObjects.find((item) => item.presenceId === presenceId && item.externalRef.type === "x.post" && item.externalRef.id === post.id);
    // Existing canonical objects retain richer thread/media lineage. A browser
    // search snippet must not overwrite that evidence or claim an own-post receipt.
    if (existing) continue;
    next.mirrorObjects.unshift({ id: `mirror:${randomUUID()}`, bridgeId: bridge.id, presenceId, channelId: "x", externalRef: { type: "x.post", id: post.id }, objectType: "post", content: { text: post.text }, author: { handle: post.authorUsername, displayName: post.authorName ?? post.authorUsername ?? "X user" }, language: post.language, observedAt: now, visibility: "public", shareability: "presence-only", environment: "live", trust: "untrusted_world_content" });
  }
  return next;
}
