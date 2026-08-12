import { NextResponse } from "next/server";
import { z } from "zod";
import { readState, saveProviderSecret, writeState } from "@/lib/db";
import { generateAgentReply } from "@/lib/ai";
import { applyOperation, completeNativeExecution } from "@/lib/runtime";
import { publishXPost, readNativeXCredentials } from "@/lib/x";
import type { Operation } from "@/lib/types";

export const dynamic = "force-dynamic";

const agentInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(1000),
  audience: z.string().trim().max(160).optional(),
  mode: z.enum(["agent", "ghost"]),
  handle: z.string().trim().min(1).max(80),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
});
const fileKind = z.enum(["BRAIN", "SOUL", "MISSION", "TASTE", "MEMORY", "GROWTH", "PULSE", "PRESENCE"]);
const executionMode = z.enum(["off", "manual", "review", "auto"]);
const channelId = z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9._-]*$/i);
const capabilities = z.object({ inbound: z.boolean(), reconcile: z.boolean(), affordances: z.array(z.string().min(1)).max(100), formats: z.array(z.string()).max(100), metrics: z.array(z.string()).max(100) });
const channelDefinition = z.object({ id: channelId, name: z.string().trim().min(1).max(120), description: z.string().max(500).optional(), icon: z.string().max(40).optional(), entities: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).max(100), affordances: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), description: z.string().min(1) })).max(100), formats: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), description: z.string().min(1), channel: channelId })).max(100), relationships: z.array(z.object({ from: z.string(), to: z.array(z.string()), relation: z.enum(["contains", "replies-to", "mentions", "direct"]) })).max(100), metrics: z.array(z.object({ id: z.string(), label: z.string() })).max(100), playbook: z.string().max(10_000).optional(), privacyDefaults: z.object({ visibility: z.enum(["public", "private-community", "private-thread", "direct-message", "unknown"]), shareability: z.enum(["presence-only", "agent-wide", "public"]) }), builtIn: z.boolean().optional(), createdAt: z.string().datetime(), updatedAt: z.string().datetime() });
const presenceInput = z.object({ channel: channelId, handle: z.string().trim().min(1).max(80), mode: z.enum(["agent", "ghost"]), accent: z.string().regex(/^#[0-9a-f]{6}$/i), channelDefinition: channelDefinition.optional() });
const operation: z.ZodType<Operation> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reset") }),
  z.object({ type: z.literal("createAgent"), input: agentInput }),
  z.object({ type: z.literal("createAdditionalAgent"), input: agentInput }),
  z.object({ type: z.literal("selectAgent"), id: z.string().min(1) }),
  z.object({ type: z.literal("createPresence"), input: presenceInput }),
  z.object({ type: z.literal("createChannel"), definition: channelDefinition }),
  z.object({ type: z.literal("createBridge"), input: z.object({ presenceId: z.string().min(1), name: z.string().trim().min(1).max(120), kind: z.enum(["simulated", "native", "bridge", "manual"]), capabilities }) }),
  z.object({ type: z.literal("rotateBridgeKey"), id: z.string().min(1) }),
  z.object({ type: z.literal("revokeBridge"), id: z.string().min(1) }),
  z.object({ type: z.literal("markManualExecution"), id: z.string().min(1), externalRef: z.object({ type: z.string().min(1), id: z.string().min(1) }) }),
  z.object({ type: z.literal("selectPresence"), id: z.string().min(1) }),
  z.object({ type: z.literal("selectConversation"), id: z.string().min(1) }),
  z.object({ type: z.literal("newConversation") }),
  z.object({ type: z.literal("sendMessage"), content: z.string().trim().min(1).max(2000), conversationId: z.string().min(1).optional() }),
  z.object({ type: z.literal("saveFile"), kind: fileKind, content: z.string().max(100_000) }),
  z.object({ type: z.literal("resolveProposal"), id: z.string().min(1), decision: z.enum(["approve", "reject"]) }),
  z.object({ type: z.literal("addSlot"), instruction: z.string().trim().min(1).max(1000), day: z.string().min(1).max(20), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), objective: z.string().min(1).max(100), executionWindow: z.string().min(1).max(40), presenceId: z.string().min(1).optional() }),
  z.object({ type: z.literal("editSlot"), id: z.string().min(1), instruction: z.string().trim().min(1).max(1000), day: z.string().min(1).max(20), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), objective: z.string().min(1).max(100), executionWindow: z.string().min(1).max(40) }),
  z.object({ type: z.literal("createSkill"), name: z.string().trim().min(1).max(100), description: z.string().trim().min(1).max(500) }),
  z.object({ type: z.literal("editSkill"), id: z.string().min(1), name: z.string().trim().min(1).max(100), description: z.string().trim().min(1).max(500) }),
  z.object({ type: z.literal("configureProvider"), provider: z.enum(["openai", "anthropic", "gemini", "openrouter", "ollama", "custom"]), label: z.string().trim().min(1).max(120), endpoint: z.string().url().optional(), hasSecret: z.boolean().optional(), secret: z.string().max(4000).optional() }),
  z.object({ type: z.literal("runPulse"), presenceId: z.string().min(1).optional() }),
  z.object({ type: z.literal("setModel"), model: z.string().trim().min(1).max(80), provider: z.enum(["openai", "anthropic", "gemini", "openrouter", "ollama", "custom"]).optional(), quality: z.enum(["low", "medium", "high", "local"]).optional() }),
  z.object({ type: z.literal("runSlot"), id: z.string().min(1) }),
  z.object({ type: z.literal("approveExecution"), id: z.string().min(1) }),
  z.object({ type: z.literal("executeIntent"), id: z.string().min(1) }),
  z.object({ type: z.literal("setPresence"), patch: z.object({ mode: z.enum(["agent", "ghost"]).optional(), status: z.enum(["live", "paused", "disconnected"]).optional(), pacing: z.enum(["recommended", "gentle", "custom"]).optional(), execution: z.record(executionMode).optional(), ghostProfile: z.object({ subject: z.string().trim().min(1).max(160), priorities: z.string().trim().max(2000), preferences: z.string().trim().max(2000), voice: z.string().trim().max(2000), boundaries: z.string().trim().max(2000) }).optional() }) }),
]);

export async function GET() { return NextResponse.json(readState()); }

export async function POST(request: Request) {
  try {
    const parsed = operation.parse(await request.json());
    if (parsed.type === "reset" && process.env.OPENPRESENCE_TEST_MODE !== "1") throw new Error("Reset is available only in test mode.");
    const current = readState();
    if (parsed.type === "executeIntent") {
      const execution = current.executions.find((item) => item.socialIntentId === parsed.id && item.connector === "native");
      if (execution) {
        const intent = current.socialIntents.find((item) => item.id === execution.socialIntentId);
        const connection = current.nativeConnections.find((item) => item.id && item.presenceId === execution.presenceId && item.access === "read-write" && item.status === "connected");
        if (!intent || !connection) throw new Error("This X Presence no longer has a write-enabled connection.");
        const credentials = readNativeXCredentials(connection.id);
        const text = typeof intent.publicationId === "string" ? current.publications.find((item) => item.id === intent.publicationId)?.payload : undefined;
        const postText = text && typeof text === "object" && "text" in text && typeof text.text === "string" ? text.text : undefined;
        if (!credentials || !postText) throw new Error("The approved X action is missing its protected credential or publication text.");
        const externalRef = await publishXPost(credentials, postText, execution.target?.type === "x.post" ? execution.target.id : undefined);
        const next = completeNativeExecution(current, execution.id, externalRef);
        writeState(next);
        return NextResponse.json(next);
      }
    }
    let next = applyOperation(current, parsed);
    if (parsed.type === "sendMessage") {
      const conversation = next.conversations.find((item) => item.id === (parsed.conversationId ?? next.activeConversationId)) ?? next.conversations[0];
      const reply = await generateAgentReply(next, parsed.content, parsed.conversationId).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "The selected AI provider could not answer.";
        console.warn("Agent runtime unavailable", message);
        return `I’m not able to answer yet. ${message}`;
      });
      const lastMessage = conversation?.messages.at(-1);
      if (lastMessage?.role === "agent") lastMessage.content = reply;
      if (conversation) conversation.updatedAt = new Date().toISOString();
      next.messages = conversation?.messages ?? next.messages;
      writeState(next);
      return NextResponse.json(next);
    }
    if (parsed.type === "setPresence") {
      const before = current.presence;
      const after = next.presence;
      const modeChanged = before?.mode !== after?.mode;
      const ghostProfileChanged = JSON.stringify(before?.ghostProfile ?? null) !== JSON.stringify(after?.ghostProfile ?? null);
      const stateChanged = Boolean(before && after && (
        modeChanged ||
        ghostProfileChanged ||
        before.status !== after.status ||
        before.pacing !== after.pacing ||
        JSON.stringify(before.execution) !== JSON.stringify(after.execution)
      ));
      const conversation = next.conversations.find((item) => item.id === next.activeConversationId) ?? next.conversations[0];
      if (stateChanged && after && conversation) {
        const modeLabel = after.mode === "ghost" ? "Ghost" : "Agent-owned";
        conversation.messages.push({
          id: `state_${Date.now().toString(36)}`,
          role: "agent",
          content: modeChanged
            ? `I noticed this Presence is now ${modeLabel}. I’ll use that live state from here.`
            : ghostProfileChanged
              ? "I noticed the Ghost profile changed. I’ll use the reviewed profile for this Presence from here."
              : "I noticed the Presence settings changed. I’ll use the new live state from here.",
          timestamp: new Date().toISOString(),
          change: "Presence state updated",
        });
        conversation.updatedAt = new Date().toISOString();
        next.messages = conversation.messages;
      }
    }
    if (parsed.type === "configureProvider" && parsed.secret) {
      const connection = next.providerConnections.find((item) => item.provider === parsed.provider);
      if (connection) saveProviderSecret(connection.id, parsed.secret);
    }
    if (parsed.type === "runSlot") {
      const queued = next.executions.filter((item) => item.connector === "native" && item.status === "queued" && item.mode === "auto");
      for (const execution of queued) {
        const intent = next.socialIntents.find((item) => item.id === execution.socialIntentId);
        const connection = next.nativeConnections.find((item) => item.presenceId === execution.presenceId && item.access === "read-write" && item.status === "connected");
        const credentials = connection ? readNativeXCredentials(connection.id) : undefined;
        const payload = intent?.publicationId ? next.publications.find((item) => item.id === intent.publicationId)?.payload : undefined;
        const postText = payload && typeof payload === "object" && "text" in payload && typeof payload.text === "string" ? payload.text : undefined;
        if (credentials && postText) {
          const externalRef = await publishXPost(credentials, postText);
          next = completeNativeExecution(next, execution.id, externalRef);
        }
      }
    }
    writeState(next);
    return NextResponse.json(next);
  } catch (error) {
    console.error("OpenPresence state mutation failed", error);
    return NextResponse.json({ error: "That change could not be saved." }, { status: 400 });
  }
}
