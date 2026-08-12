import { readProviderSecret } from "./db";
import type { Conversation, ModelProvider, OpenPresenceState } from "./types";

const REQUEST_TIMEOUT_MS = 60_000;

export class AiRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiRuntimeError";
  }
}

export interface OllamaCatalogModel {
  name: string;
  capabilities: string[];
  size?: number;
  parameterSize?: string;
}

function providerLabel(provider: ModelProvider) {
  return provider === "ollama" ? "Ollama" : provider === "openrouter" ? "OpenRouter" : provider[0].toUpperCase() + provider.slice(1);
}

function selectedConversation(state: OpenPresenceState, conversationId?: string): Conversation | undefined {
  return state.conversations.find((item) => item.id === (conversationId ?? state.activeConversationId)) ?? state.conversations[0];
}

function promptFor(state: OpenPresenceState, conversationId: string | undefined, content: string) {
  const conversation = selectedConversation(state, conversationId);
  const files = Object.fromEntries(state.files.map((file) => [file.kind, file.content]));
  const transcript = (conversation?.messages ?? []).slice(-16).map((message) => ({ role: message.role, content: message.content }));
  const skills = state.skills
    .filter((skill) => state.agentSkills.some((binding) => binding.skillId === skill.id && binding.enabled))
    .map((skill) => `${skill.name ?? skill.id}: ${skill.description}`);
  const presence = state.presence ? {
    channel: state.presence.channel,
    handle: state.presence.handle,
    mode: state.presence.mode,
      context: state.presence.context,
  } : null;
  const liveState = state.presence ? {
    id: state.presence.id,
    channel: state.presence.channel,
    handle: state.presence.handle,
    mode: state.presence.mode,
    modeLabel: state.presence.mode === "ghost" ? "Ghost" : "Agent-owned",
    status: state.presence.status,
    pacing: state.presence.pacing,
    execution: state.presence.execution,
  } : null;

  return {
    system: [
      `You are ${state.agent?.name ?? "the Agent"}, a persistent Agent in OpenPresence.`,
      "Speak directly with the operator who is shaping your judgment, meaning, and Presence.",
      "Use the meaning files below as your character and decision context. Do not expose hidden reasoning, credentials, provider details, or infrastructure.",
      "Be concrete, warm, and concise. Do not claim to have published or changed an external channel unless the state explicitly shows that it happened.",
      "When the operator asks for a durable identity change, explain that it becomes a reviewable proposal; do not silently rewrite protected meaning files.",
      "Silence and uncertainty are valid: say what you know, what you do not know, and the smallest useful next step.",
      "When the operator directly asks you to introduce this Presence on X or write an X post, return only one original post under 280 characters. Do not add a heading, quotation marks, explanation, or claim that it was published.",
      `Meaning files:\n${JSON.stringify(files, null, 2)}`,
      `Current Presence:\n${JSON.stringify(presence, null, 2)}`,
      `Enabled skills:\n${skills.length ? skills.join("\n") : "None"}`,
      "When this Presence is Ghost, its Ghost profile is the authoritative description of the operator or organization it extends. Do not infer missing preferences from Jenny's own identity, the older transcript, or private context. If a Ghost profile field is empty, say it is not defined.",
      "AUTHORITATIVE LIVE STATE: The snapshot below was read from OpenPresence for this request. It overrides any contradictory claim in the older transcript or a prior Agent response. When the operator asks what changed or what is true now, answer from this snapshot and do not repeat stale history.",
      `Live Presence snapshot:\n${JSON.stringify({ ...liveState, ghostProfile: state.presence?.mode === "ghost" ? state.presence.ghostProfile : undefined }, null, 2)}`,
    ].join("\n\n"),
    messages: [
      ...transcript.slice(0, -1).map((message) => ({ role: message.role === "agent" ? "assistant" as const : "user" as const, content: message.content })),
      { role: "user" as const, content },
    ],
  };
}

async function requestJson(url: string, init: RequestInit, label: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body: Record<string, unknown> = {};
    try { body = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { /* provider returned non-JSON */ }
    if (!response.ok) {
      const error = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : body;
      const detail = typeof error.message === "string" ? error.message : typeof error.title === "string" ? error.title : "the provider rejected the request";
      if (response.status === 401 || response.status === 403) throw new AiRuntimeError(`${label} rejected the stored credential. Check the provider key in Brain → Provider access.`);
      if (response.status === 404) throw new AiRuntimeError(`${label} could not find the selected model or endpoint. Check the model name and provider connection.`);
      if (response.status === 429) throw new AiRuntimeError(`${label} is rate-limiting this request. Wait a moment and try again.`);
      throw new AiRuntimeError(`${label} could not answer: ${detail.slice(0, 240)}`);
    }
    return body;
  } catch (error) {
    if (error instanceof AiRuntimeError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new AiRuntimeError(`${label} did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds.`);
    throw new AiRuntimeError(`${label} is unreachable. Check the provider connection and try again.`);
  } finally {
    clearTimeout(timeout);
  }
}

function textFrom(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function listOllamaModels(endpoint: string): Promise<OllamaCatalogModel[]> {
  const base = endpoint.replace(/\/+$/, "");
  const catalog = await requestJson(`${base}/api/tags`, { method: "GET", headers: { accept: "application/json" } }, "Ollama");
  if (!Array.isArray(catalog.models)) return [];
  return catalog.models
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => {
      const details = item.details && typeof item.details === "object" ? item.details as Record<string, unknown> : undefined;
      return {
        name: textFrom(item.name) ?? "",
        capabilities: Array.isArray(item.capabilities) ? item.capabilities.filter((value): value is string => typeof value === "string") : [],
        size: typeof item.size === "number" ? item.size : undefined,
        parameterSize: textFrom(details?.parameter_size),
      };
    })
    .filter((item) => item.name && (item.capabilities.length === 0 || item.capabilities.includes("completion")));
}

export function resolveOllamaModel(model: string, catalog: OllamaCatalogModel[]) {
  return catalog.find((item) => item.name === model)?.name ?? catalog.find((item) => item.name.startsWith(`${model}:`))?.name;
}

function openAiModel(model: string) {
  // Early OpenPresence builds used illustrative GPT names in the selector. Keep existing local state usable while allowing a real override.
  const aliases: Record<string, string> = {
    "gpt-5.6-sol": "gpt-4o-mini",
    "gpt-5.6-luna": "gpt-4o",
    "gpt-5.6-terra": "gpt-4o",
  };
  return process.env.OPENPRESENCE_OPENAI_MODEL || aliases[model] || model;
}

function anthropicModel(model: string) {
  return process.env.OPENPRESENCE_ANTHROPIC_MODEL || (model === "claude" ? "claude-3-5-sonnet-latest" : model);
}

async function runOpenAiCompatible(provider: ModelProvider, endpoint: string, secret: string, model: string, prompt: ReturnType<typeof promptFor>) {
  const body = await requestJson(`${endpoint.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
    body: JSON.stringify({ model: provider === "openai" ? openAiModel(model) : model, messages: [{ role: "system", content: prompt.system }, ...prompt.messages], stream: false }),
  }, providerLabel(provider));
  const choices = Array.isArray(body.choices) ? body.choices : [];
  const message = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>).message : undefined;
  const content = message && typeof message === "object" ? textFrom((message as Record<string, unknown>).content) : undefined;
  if (!content) throw new AiRuntimeError(`${providerLabel(provider)} returned an empty response.`);
  return content;
}

async function runAnthropic(secret: string, model: string, prompt: ReturnType<typeof promptFor>) {
  const body = await requestJson("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": secret, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: anthropicModel(model), max_tokens: 1000, system: prompt.system, messages: prompt.messages }),
  }, "Anthropic");
  const blocks = Array.isArray(body.content) ? body.content : [];
  const content = blocks.map((block) => block && typeof block === "object" ? textFrom((block as Record<string, unknown>).text) : undefined).filter(Boolean).join("\n");
  if (!content) throw new AiRuntimeError("Anthropic returned an empty response.");
  return content;
}

async function runOllama(endpoint: string, model: string, prompt: ReturnType<typeof promptFor>) {
  const base = endpoint.replace(/\/+$/, "");
  const catalog = await listOllamaModels(base);
  const resolvedModel = resolveOllamaModel(model, catalog);
  if (!resolvedModel) {
    const available = catalog.length ? ` Available models: ${catalog.slice(0, 8).map((item) => item.name).join(", ")}.` : " No completion models are installed.";
    throw new AiRuntimeError(`Ollama does not have “${model}” installed.${available} Install it with ollama pull ${model} or choose an installed model in Brain.`);
  }
  const body = await requestJson(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: resolvedModel, messages: [{ role: "system", content: prompt.system }, ...prompt.messages], stream: false }),
  }, "Ollama");
  const message = body.message && typeof body.message === "object" ? textFrom((body.message as Record<string, unknown>).content) : undefined;
  if (!message) throw new AiRuntimeError("Ollama returned an empty response. Confirm the selected model is installed.");
  return message;
}

async function runGemini(secret: string, model: string, prompt: ReturnType<typeof promptFor>) {
  const contents = prompt.messages.map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] }));
  const body = await requestJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(secret)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: prompt.system }] }, contents }),
  }, "Gemini");
  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  const parts = candidates[0] && typeof candidates[0] === "object" ? (candidates[0] as Record<string, unknown>).content : undefined;
  const contentParts = parts && typeof parts === "object" && Array.isArray((parts as Record<string, unknown>).parts) ? (parts as Record<string, unknown>).parts as unknown[] : [];
  const content = contentParts.map((part) => part && typeof part === "object" ? textFrom((part as Record<string, unknown>).text) : undefined).filter(Boolean).join("\n");
  if (!content) throw new AiRuntimeError("Gemini returned an empty response.");
  return content;
}

export async function generateAgentReply(state: OpenPresenceState, content: string, conversationId?: string) {
  if (process.env.OPENPRESENCE_AI_MOCK === "1") return `I understood “${content.slice(0, 160)}”. This response came through the Agent runtime.`;
  if (!state.agent) throw new AiRuntimeError("Create an Agent before starting a conversation.");
  const profile = state.modelProfiles.find((item) => item.agentId === state.agent?.id);
  if (!profile) throw new AiRuntimeError("No model is selected. Open Brain and choose a model runtime.");
  const connection = (profile.connectionId && state.providerConnections.find((item) => item.id === profile.connectionId)) ?? state.providerConnections.find((item) => item.provider === profile.provider);
  if (!connection || connection.status === "needs-configuration") throw new AiRuntimeError(`${providerLabel(profile.provider)} is selected but not connected. Open Brain → Provider access and connect it before chatting.`);
  const secret = profile.provider === "ollama" || profile.provider === "custom" && !connection.secretConfigured ? undefined : connection.id ? readProviderSecret(connection.id) : undefined;
  if (["openai", "anthropic", "gemini", "openrouter"].includes(profile.provider) && !secret) throw new AiRuntimeError(`${providerLabel(profile.provider)} is selected but no API key is stored. Open Brain → Provider access and save the key.`);
  const prompt = promptFor(state, conversationId, content);
  if (profile.provider === "ollama") return runOllama(connection.endpoint || "http://localhost:11434", profile.model, prompt);
  if (profile.provider === "anthropic") return runAnthropic(secret!, profile.model, prompt);
  if (profile.provider === "gemini") return runGemini(secret!, profile.model, prompt);
  if (profile.provider === "openrouter") return runOpenAiCompatible(profile.provider, connection.endpoint || "https://openrouter.ai/api/v1", secret!, profile.model, prompt);
  if (profile.provider === "custom") return runOpenAiCompatible(profile.provider, connection.endpoint || "http://localhost:11434/v1", secret || "", profile.model, prompt);
  return runOpenAiCompatible(profile.provider, connection.endpoint || "https://api.openai.com/v1", secret!, profile.model, prompt);
}
