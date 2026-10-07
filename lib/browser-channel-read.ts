import { randomUUID } from "node:crypto";
import { getOperationalRun, upsertOperationalRun } from "./db";
import { bridgeReadyForExpectedAccount } from "./bridge-contract";
import type { OpenPresenceState } from "./types";
import type { XRecentPost } from "./x";

export function browserReadUnavailableReason(state: OpenPresenceState, presenceId: string) {
  const presence = state.presences.find((item) => item.id === presenceId);
  if (presence?.channel !== "x") return "This Presence does not have an X browser tool.";
  if (presence.browserAccess?.enabled !== true) return "Browser access is not enabled for this Presence.";
  if (presence.environment === "sandbox") return "The signed-in browser cannot be used from the Sandbox.";
  const bridge = state.bridges.find((item) => item.presenceId === presenceId && item.name.startsWith("OpenPresence Chrome"));
  if (!bridge) return "The signed-in browser is not connected for this Presence.";
  const expected = presence.handle.replace(/^@/, "").trim().toLowerCase();
  const actual = bridge.accountIdentity?.username?.replace(/^@/, "").trim().toLowerCase();
  if (actual && actual !== expected) {
    return `The controlled browser is signed in as @${actual}, but this Presence expects @${expected}. Switch the controlled X tab and verify the account before retrying.`;
  }
  if (!bridgeReadyForExpectedAccount(bridge, presence.handle)) return "The controlled browser is connected, but its X account has not been verified for this Presence.";
  return undefined;
}

export function readyBrowserForRead(state: OpenPresenceState, presenceId: string) {
  if (browserReadUnavailableReason(state, presenceId)) return undefined;
  const presence = state.presences.find((item) => item.id === presenceId);
  return presence && state.bridges.find((item) => item.presenceId === presenceId && item.name.startsWith("OpenPresence Chrome") && bridgeReadyForExpectedAccount(item, presence.handle));
}

/** A read uses the existing authenticated browser body, without an API key or public write. */
export async function readChannelThroughBrowser(state: OpenPresenceState, presenceId: string, query?: string): Promise<XRecentPost[]> {
  const unavailableReason = browserReadUnavailableReason(state, presenceId);
  const bridge = readyBrowserForRead(state, presenceId);
  if (!bridge) throw new Error(unavailableReason ?? "The browser is not connected with a verified account for this Presence.");
  const id = `browser-read:${randomUUID()}`;
  const now = new Date().toISOString();
  upsertOperationalRun({ id, presenceId, kind: "observation", state: "waiting", stage: "browser.read", createdAt: now, lastProgressAt: now,
    deadlineAt: new Date(Date.now() + 65_000).toISOString(), attemptCount: 0, recoveryCount: 0,
    metadata: { browserRead: true, bridgeId: bridge.id, url: query ? `https://x.com/search?q=${encodeURIComponent(query)}&f=live` : "https://x.com/home" },
  });
  try {
    for (let i = 0; i < 260; i++) {
      const run = getOperationalRun(id);
      if (run?.state === "succeeded") return (run.metadata?.posts ?? []) as unknown as XRecentPost[];
      if (run?.state === "failed") throw new Error(run.lastErrorCode ?? "The browser could not read X.");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("The browser did not finish this read within 65 seconds.");
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
