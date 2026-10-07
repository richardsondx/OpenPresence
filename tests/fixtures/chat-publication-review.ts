import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { applyOperation, createAgent, formChatPostIntent, startPlaygroundSession } from "../../lib/runtime";
import type { OpenPresenceState } from "../../lib/types";

/** Synthetic pending decision; no captured accounts, conversations, or outcomes. */
export function chatPublicationReviewFixture(): OpenPresenceState {
  let state = createAgent({ name: "Review Agent", description: "Share useful visual explanations.", mode: "agent", handle: "@review_fixture", accent: "#D68754" });
  state = applyOperation(state, { type: "setPresence", patch: { execution: { post: "review" } } });
  state = startPlaygroundSession(state);
  const timestamp = new Date().toISOString();
  const bytes = readFileSync("scenarios/fixtures/agent-quality-chart.png");
  const exactHash = createHash("sha256").update(bytes).digest("hex");
  const assetId = "synthetic-review-chart";
  state.assets = [{
    id: assetId, agentId: state.agent!.id, presenceId: state.presence!.id,
    type: "image", mediaKind: "image", status: "ready", retention: "preserved",
    description: "Synthetic agent quality chart", mimeType: "image/png",
    environment: "sandbox", reusePermission: "needs_approval",
    accessScope: { mode: "selected_presences", presenceIds: [state.presence!.id] },
    storage: { storeKey: `e2e-review-${randomUUID()}.png`, mimeType: "image/png", byteSize: bytes.length, exactHash },
    checksum: exactHash, dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
    perception: { observation: "A blue line chart labeled Agent quality and baseline.", uncertainty: [] },
    provenance: { origin: "operator_upload", importedAt: timestamp },
    createdAt: timestamp, updatedAt: timestamp,
  }];
  state = formChatPostIntent(state, "A useful evaluation checks decisions over time, not just one answer.", undefined, "agent", [assetId], undefined, undefined, undefined, [], state.playgroundSessions[0].id);
  const execution = state.executions[0];
  if (!execution || execution.status !== "awaiting-review") throw new Error("Synthetic fixture did not form a pending review.");
  execution.connector = "simulated";
  execution.sessionId = state.playgroundSessions[0].id;
  execution.bridgeId = `sandbox:${execution.sessionId}`;
  const conversation = state.operatorConversations![0];
  conversation.messages = [
    { id: "synthetic-review-request", role: "operator", content: "Share this evaluation idea with the chart.", timestamp },
    { id: "synthetic-review-receipt", role: "system", replyToMessageId: "synthetic-review-request", content: JSON.stringify({ tool: "social_action", executionIds: [execution.id], result: [{ executionId: execution.id, status: execution.status }] }), timestamp },
  ];
  return state;
}
