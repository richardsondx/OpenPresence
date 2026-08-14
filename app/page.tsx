"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Bot,
  Brain,
  BriefcaseBusiness,
  Check,
  Code2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleAlert,
  Clock3,
  FileText,
  FlaskConical,
  Globe2,
  Ghost,
  Heart,
  LoaderCircle,
  MessageCircle,
  MessageSquare,
  Newspaper,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Pencil,
  Play,
  Plus,
  PlugZap,
  Radio,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { AGENT_TOOL_DEFINITIONS, CHANNEL_CAPABILITIES, simulationForChannel } from "@/lib/types";
import { latestPerception } from "@/lib/perception";
import { deriveActivitySummary, derivePublicHistory, isActivityDecisionEvent, pendingReviewExecutionsForCapabilities } from "@/lib/runtime";
import type {
  CalendarSlot,
  ChannelDefinition,
  ChannelId,
  ChannelSimulationDefinition,
  ConnectorKind,
  CreateAgentInput,
  CreatePresenceInput,
  ExecutionMode,
  FileKind,
  GhostProfile,
  OpenPresenceState,
  PublicHistoryItem,
  PublicDisclosurePosture,
  PublicSelf,
  PublicTechnicalFact,
  PresenceConnectionMode,
  PresenceBrief,
  PresenceEnvironment,
  PresenceMode,
  MirrorObject,
  ModelProvider,
  PreferenceReason,
  SandboxActor,
  SandboxAssetInput,
  SocialAssetKind,
  View,
} from "@/lib/types";

const PUBLIC_TECHNICAL_FACTS: { id: PublicTechnicalFact; label: string; detail: string }[] = [
  { id: "ai-presence", label: "This is an AI presence", detail: "Say so when the question makes it relevant." },
  { id: "built-with-openpresence", label: "Built with OpenPresence", detail: "Name the platform when explicitly useful." },
  { id: "model-provider", label: "Current model provider", detail: "Share the provider, not credentials." },
  { id: "exact-model", label: "Exact model", detail: "Share the selected model when approved." },
];

const fileOrder: FileKind[] = [
  "BRAIN",
  "SOUL",
  "MISSION",
  "TASTE",
  "MEMORY",
  "GROWTH",
  "PULSE",
];
const navItems: { id: View; label: string; icon: typeof MessageCircle }[] = [
  { id: "live", label: "Activity", icon: Radio },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "feed", label: "Feed", icon: Newspaper },
  { id: "schedule", label: "Schedule", icon: Clock3 },
  { id: "presence", label: "Settings", icon: Settings2 },
  { id: "teach", label: "Teach", icon: MessageCircle },
  { id: "playground", label: "Playground", icon: FlaskConical },
];
const presenceNavItems = navItems.filter(({ id }) => id === "live" || id === "chat" || id === "feed" || id === "schedule" || id === "presence");
const agentNavItems = navItems.filter(({ id }) => id === "teach" || id === "playground");
const channelLabel = (channel: ChannelId, definitions?: ChannelDefinition[]) =>
  definitions?.find((item) => item.id === channel)?.name ??
  (channel === "x"
    ? "X"
    : channel === "linkedin"
      ? "LinkedIn"
      : channel === "substack"
        ? "Substack"
        : channel);
const formatTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "now"
    : new Intl.DateTimeFormat("en", {
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
};
const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const channelIconOptions = [
  { id: "community", label: "Community", icon: Users },
  { id: "forum", label: "Forum", icon: MessageSquare },
  { id: "book", label: "Publication", icon: BookOpen },
  { id: "work", label: "Work", icon: BriefcaseBusiness },
  { id: "code", label: "Code", icon: Code2 },
  { id: "globe", label: "Web", icon: Globe2 },
  { id: "spark", label: "Spark", icon: Sparkles },
] as const;

function XBrand() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817-5.965 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
    </svg>
  );
}

function faviconUrl(domain: string) {
  try {
    const normalized = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
    const hostname = new URL(normalized).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
  } catch {
    return null;
  }
}

function PresenceLogo({
  channel,
  definitions,
  size = "normal",
}: {
  channel: ChannelId;
  definitions?: ChannelDefinition[];
  size?: "normal" | "large";
}) {
  const definition = definitions?.find((item) => item.id === channel);
  const icon = definition?.icon ?? (channel === "x" ? "x" : "community");
  const option = channelIconOptions.find((item) => item.id === icon);
  const fallback = icon === "x" ? <XBrand /> : option ? <option.icon size={size === "large" ? 18 : 14} strokeWidth={1.8} /> : <Globe2 size={size === "large" ? 18 : 14} strokeWidth={1.8} />;
  const favicon = definition?.domain ? faviconUrl(definition.domain) : null;
  return (
    <span className={`presence-logo presence-logo-${size}`} aria-hidden="true">
      <span className="presence-logo-fallback">{fallback}</span>
      {favicon && (
        // External favicon URLs are user-provided and cannot use Next Image's fixed domain allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={favicon} alt="" onError={(event) => event.currentTarget.remove()} />
      )}
    </span>
  );
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `The local service returned an unexpected response (${response.status}).`,
    );
  }
  return (await response.json()) as T;
}

function clientErrorMessage(reason: unknown, fallback: string) {
  if (reason instanceof TypeError && /fetch/i.test(reason.message)) {
    return "The OpenPresence runtime could not be reached. Try again; if it persists, restart the local app server.";
  }
  return reason instanceof Error ? reason.message : fallback;
}

const runtimeModels = [
  { provider: "openai" as const, label: "OpenAI", model: "gpt-5.6-sol", name: "GPT 5.6 Sol", quality: "low" as const, detail: "Fast drafting" },
  { provider: "openai" as const, label: "OpenAI", model: "gpt-5.6-sol", name: "GPT 5.6 Sol", quality: "medium" as const, detail: "Balanced" },
  { provider: "openai" as const, label: "OpenAI", model: "gpt-5.6-sol", name: "GPT 5.6 Sol", quality: "high" as const, detail: "Deep reasoning" },
  { provider: "openai" as const, label: "OpenAI", model: "gpt-5.6-luna", name: "GPT 5.6 Luna", quality: "low" as const, detail: "Fast drafting" },
  { provider: "openai" as const, label: "OpenAI", model: "gpt-5.6-luna", name: "GPT 5.6 Luna", quality: "medium" as const, detail: "Balanced" },
  { provider: "openai" as const, label: "OpenAI", model: "gpt-5.6-luna", name: "GPT 5.6 Luna", quality: "high" as const, detail: "Deep reasoning" },
  { provider: "openai" as const, label: "OpenAI", model: "gpt-5.6-terra", name: "GPT 5.6 Terra", quality: "low" as const, detail: "Fast drafting" },
  { provider: "openai" as const, label: "OpenAI", model: "gpt-5.6-terra", name: "GPT 5.6 Terra", quality: "medium" as const, detail: "Balanced" },
  { provider: "openai" as const, label: "OpenAI", model: "gpt-5.6-terra", name: "GPT 5.6 Terra", quality: "high" as const, detail: "Deep reasoning" },
  { provider: "ollama" as const, label: "Ollama", model: "llama3.2", name: "Llama 3.2", quality: "local" as const, detail: "Local" },
  { provider: "ollama" as const, label: "Ollama", model: "qwen2.5", name: "Qwen 2.5", quality: "local" as const, detail: "Local" },
  { provider: "ollama" as const, label: "Ollama", model: "mistral-small", name: "Mistral Small", quality: "local" as const, detail: "Local" },
  { provider: "openrouter" as const, label: "OpenRouter", model: "openrouter/auto", name: "Auto", quality: "medium" as const, detail: "OpenRouter routing" },
  { provider: "anthropic" as const, label: "Anthropic", model: "claude", name: "Claude Sonnet", quality: "high" as const, detail: "Connected model" },
];
const runtimeProviders = [
  { id: "openai" as const, label: "OpenAI", detail: "Hosted models" },
  { id: "openrouter" as const, label: "OpenRouter", detail: "Hosted model routing" },
  { id: "ollama" as const, label: "Ollama", detail: "Local models" },
  { id: "anthropic" as const, label: "Anthropic", detail: "Hosted models" },
];

const providerAccessProviders: ModelProvider[] = ["openai", "openrouter", "ollama"];
const providerLabel = (provider: ModelProvider) => provider === "ollama" ? "Ollama" : provider === "openrouter" ? "OpenRouter" : provider === "openai" ? "OpenAI" : provider[0].toUpperCase() + provider.slice(1);

type OllamaModelOption = { name: string; capabilities: string[]; size?: number; parameterSize?: string };

function ollamaModelLabel(name: string) {
  const base = name.split(":")[0].toLowerCase();
  const known: Record<string, string> = {
    "qwen2.5": "Qwen 2.5",
    "qwen2.5-coder": "Qwen 2.5 Coder",
    "qwen3-vl": "Qwen3 VL",
    "kimi-k3": "Kimi K3",
    "kimi-k2.6": "Kimi K2.6",
    "glm-5.2": "GLM 5.2",
  };
  return known[base] ?? base.replaceAll("-", " ").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ollamaModelDetail(model: OllamaModelOption) {
  const cloud = model.name.endsWith(":cloud");
  const size = typeof model.size === "number" && model.size > 1_000_000 ? `${(model.size / 1_000_000_000).toFixed(1)} GB` : model.parameterSize;
  return [cloud ? "Ollama Cloud" : "Local", size].filter(Boolean).join(" · ");
}

function modelDisplayName(model: OpenPresenceState["modelProfiles"][number] | undefined) {
  if (!model) return "No model selected";
  return runtimeModels.find(
    (item) => item.provider === model.provider && item.model === model.model && item.quality === model.quality,
  )?.name ?? model.model;
}

function PresenceGlyph({
  accent,
  size = "normal",
  pulse = false,
}: {
  accent: string;
  size?: "normal" | "large";
  pulse?: boolean;
}) {
  return (
    <div
      className={`presence-glyph ${size === "large" ? "presence-glyph-large" : ""} ${pulse ? "is-pulsing" : ""}`}
      style={{ "--agent-accent": accent } as React.CSSProperties}
      aria-hidden="true"
    >
      <span>◉</span>
    </div>
  );
}
function Button({
  children,
  variant = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button className={`button button-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="eyebrow">
      {children}
      {children === "Scope" && (
        <span className="context-scope-hint"> · Agent-wide context</span>
      )}
    </div>
  );
}
type Mutate = (operation: unknown) => Promise<OpenPresenceState | null>;
type BridgeManage = (
  operation: unknown,
) => Promise<{ state: OpenPresenceState; key?: string } | null>;
type XManage = (
  operation: unknown,
) => Promise<{ state?: OpenPresenceState; result?: { account: { id: string; username: string; name: string }; access: "read" | "read-write" } } | null>;

function SandboxEventForm({
  sessionId,
  presenceName,
  simulation,
  assetKinds,
  actors,
  targetObjects,
  mutate,
}: {
  sessionId: string;
  presenceName: string;
  simulation: ChannelSimulationDefinition;
  assetKinds: SocialAssetKind[];
  actors: SandboxActor[];
  targetObjects: MirrorObject[];
  mutate: Mutate;
}) {
  const [actionId, setActionId] = useState(simulation.actions[0]?.id ?? "post");
  const [actorId, setActorId] = useState("new");
  const [actorName, setActorName] = useState("Maya Chen");
  const [actorHandle, setActorHandle] = useState("@mayachen");
  const [content, setContent] = useState("");
  const [targetId, setTargetId] = useState("");
  const [assets, setAssets] = useState<SandboxAssetInput[]>([]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedAction = simulation.actions.find((item) => item.id === actionId) ?? simulation.actions[0];
  const selectedActor = actors.find((item) => item.id === actorId);
  const targetObject = targetId ? targetObjects.find((item) => item.id === targetId) : undefined;
  const actorNameForSubmit = selectedActor?.displayName ?? actorName.trim();
  const requiresContent = selectedAction?.contentRequired !== false;
  const canSubmit = Boolean(selectedAction && actorNameForSubmit && (!requiresContent || content.trim()) && (!selectedAction.target || targetObject));
  const addFile = (file: File) => {
    if (assets.length >= 4 || file.size > 1_500_000) return;
    const kind: SocialAssetKind = file.type === "image/gif" ? "gif" : file.type.startsWith("video/") ? "video" : "image";
    if (!assetKinds.includes(kind)) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setAssets((items) => [...items, { name: file.name, kind, mimeType: file.type, dataUrl: reader.result as string }].slice(0, 4));
    };
    reader.readAsDataURL(file);
  };
  const addLink = () => {
    const value = sourceUrl.trim();
    if (!value || assets.length >= 4 || !assetKinds.includes("link")) return;
    try { new URL(value); } catch { return; }
    setAssets((items) => [...items, { name: value, kind: "link" as const, sourceUrl: value }].slice(0, 4));
    setSourceUrl("");
  };
  const submitEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedAction || !canSubmit) return;
    setBusy(true);
    try {
      await mutate({ type: "addSandboxEvent", sessionId, actionId: selectedAction.id, actorId: selectedActor?.id, actorName: actorNameForSubmit, actorHandle: selectedActor?.handle ?? actorHandle, content, assets, targetExternalRef: targetObject?.externalRef });
      setContent("");
      setAssets([]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="sandbox-event-form" onSubmit={submitEvent}>
      <label>What should happen<select aria-label="What should happen" value={actionId} onChange={(event) => { setActionId(event.target.value); setTargetId(""); setContent(""); }}>{simulation.actions.map((action) => <option key={action.id} value={action.id}>{action.label.replaceAll("Jenny", presenceName)}</option>)}</select></label>
      <label>{selectedAction?.actorLabel ?? "Who?"}<select aria-label="Who" value={actorId} onChange={(event) => setActorId(event.target.value)}><option value="new">New person</option>{actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.displayName}{actor.handle ? ` · ${actor.handle}` : ""}</option>)}</select></label>
      {actorId === "new" && <div className="sandbox-new-actor"><label>Name<input aria-label="New person name" value={actorName} onChange={(event) => setActorName(event.target.value)} /></label><label>Handle<input aria-label="New person handle" value={actorHandle} onChange={(event) => setActorHandle(event.target.value)} /></label></div>}
      {selectedAction?.target && <label>{selectedAction.target.label}<select aria-label={selectedAction.target.label} value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">Choose a simulated post</option>{targetObjects.map((item) => <option key={item.id} value={item.id}>{item.author?.displayName ?? "Someone"}: {(item.content?.text ?? "").slice(0, 42)}</option>)}</select></label>}
      {selectedAction?.contentLabel && <label>{selectedAction.contentLabel}<textarea aria-label={selectedAction.contentLabel} value={content} onChange={(event) => setContent(event.target.value)} placeholder={selectedAction.contentPlaceholder?.replaceAll("Jenny", presenceName)} rows={4} /></label>}
      {assetKinds.length > 0 && <div className="sandbox-media-input"><span className="form-label">Media or link</span><div className="sandbox-media-actions">{assetKinds.some((kind) => ["image", "video", "gif"].includes(kind)) && <label className="button button-secondary sandbox-file-button"><Plus size={14} /> Add media<input className="sandbox-file-input" aria-label="Add media" type="file" accept="image/*,video/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) addFile(file); event.target.value = ""; }} /></label>}{assetKinds.includes("link") && <div className="sandbox-link-input"><input aria-label="Media URL" placeholder="Paste a link" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /><button type="button" onClick={addLink} disabled={!sourceUrl.trim()}>Add link</button></div>}</div>{assets.length > 0 && <div className="sandbox-asset-list">{assets.map((asset, index) => <span className="sandbox-asset-chip" key={`${asset.name}-${index}`}>{asset.kind === "link" ? asset.sourceUrl : asset.name}<button type="button" aria-label={`Remove ${asset.name}`} onClick={() => setAssets((items) => items.filter((_, itemIndex) => itemIndex !== index))}>×</button></span>)}</div>}<small className="form-hint">{presenceName} will not infer media contents until a capable perception provider has inspected them.</small></div>}
      <Button type="submit" variant="secondary" disabled={busy || !canSubmit}><Plus size={14} /> {selectedAction?.submitLabel ?? "Add event"}</Button>
    </form>
  );
}

const presenceModes: {
  id: PresenceMode;
  label: string;
  kicker: string;
  description: string;
  icon: typeof Bot;
}[] = [
  {
    id: "agent",
    label: "Agent-owned",
    kicker: "Direct voice",
    description: "Speaks as this Presence.",
    icon: Bot,
  },
  {
    id: "ghost",
    label: "Ghost",
    kicker: "Operator voice",
    description: "Extends your attention and judgment.",
    icon: Ghost,
  },
];

function ModeOption({
  mode,
  selected,
  name,
  accent,
  onChange,
}: {
  mode: PresenceMode;
  selected: boolean;
  name: string;
  accent: string;
  onChange: (mode: PresenceMode) => void;
}) {
  const option = presenceModes.find((item) => item.id === mode)!;
  const Icon = option.icon;
  return (
    <label
      className={`mode-option ${selected ? "selected" : ""}`}
      style={{ "--agent-accent": accent } as React.CSSProperties}
    >
      <input
        type="radio"
        checked={selected}
        onChange={() => onChange(mode)}
        name={name}
        value={mode}
        aria-label={option.label}
      />
      <span className="mode-option-icon">
        <Icon size={17} strokeWidth={1.8} />
      </span>
      <span className="mode-option-copy">
        <small className="mode-option-kicker">{option.kicker}</small>
        <strong>{option.label}</strong>
        <small>{option.description}</small>
      </span>
      <span className="mode-option-state" aria-hidden="true">
        <Check size={14} />
      </span>
    </label>
  );
}

export default function Home() {
  const [state, setState] = useState<OpenPresenceState | null>(null);
  const [view, setView] = useState<View>("live");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileKind>("BRAIN");
  const [pendingOperation, setPendingOperation] = useState<string | null>(null);
  const nativeSyncInFlight = useRef<string | null>(null);
  const calendarRunInFlight = useRef<string | null>(null);
  const playgroundStartInFlight = useRef<string | null>(null);
  useEffect(() => {
    fetch(`/api/state?read=${Date.now()}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load local state");
        return readJsonResponse<OpenPresenceState>(response);
      })
      .then(setState)
      .catch((reason: unknown) => setError(clientErrorMessage(reason, "Unable to load local state")))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (state?.onboarded) window.scrollTo({ top: 0, left: 0 });
  }, [state?.onboarded]);
  async function mutate(operation: unknown) {
    setError(null);
    const operationType = typeof operation === "object" && operation !== null && "type" in operation && typeof operation.type === "string" ? operation.type : null;
    const tracksAttention = operationType === "wakePresence" || operationType === "runPulse";
    if (tracksAttention) setPendingOperation(operationType);
    try {
      const response = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(operation),
      });
      const payload = await readJsonResponse<OpenPresenceState & { error?: string }>(response);
      if (!response.ok)
        throw new Error(payload.error ?? "That change could not be saved.");
      setState(payload);
      return payload as OpenPresenceState;
    } catch (reason) {
      setError(clientErrorMessage(reason, "That change could not be saved."));
      return null;
    } finally {
      if (tracksAttention) setPendingOperation(null);
    }
  }
  function openView(nextView: View) {
    setView(nextView);
    const presence = state?.presence;
    if (nextView !== "playground" || !state?.onboarded || !presence || playgroundStartInFlight.current === presence.id) return;
    const hasActiveSession = state.playgroundSessions.some((item) => item.presenceId === presence.id && item.status === "active");
    if (hasActiveSession) return;
    playgroundStartInFlight.current = presence.id;
    void mutate({ type: "startPlayground", presenceId: presence.id, source: "fresh" }).finally(() => {
      playgroundStartInFlight.current = null;
    });
  }
  useEffect(() => {
    if (pendingOperation === "wakePresence" || pendingOperation === "runPulse") return;
    const presence = state?.presence;
    const connection = presence && presence.connectionMode !== "bridge"
      ? state.nativeConnections.find((item) => item.presenceId === presence.id && item.kind === "x" && item.status === "connected")
      : undefined;
    if (!presence || !connection) return;
    const observation = connection.observation;
    const due = !observation?.nextObservationAt || new Date(observation.nextObservationAt).getTime() <= Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (nextObservationAt?: string) => {
      const delay = nextObservationAt ? Math.max(1_000, new Date(nextObservationAt).getTime() - Date.now()) : 1_000;
      timer = setTimeout(() => { void observe(); }, delay);
    };
    const observe = async () => {
      if (nativeSyncInFlight.current === presence.id) return;
      nativeSyncInFlight.current = presence.id;
      try {
        const response = await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "syncNativeX", presenceId: presence.id }) });
        const payload = await readJsonResponse<OpenPresenceState & { error?: string }>(response);
        if (!response.ok) throw new Error(payload.error ?? "The X observer could not run.");
        setState(payload);
        schedule(payload.nativeConnections.find((item) => item.presenceId === presence.id)?.observation?.nextObservationAt);
      } catch (reason) {
        setError(clientErrorMessage(reason, "The X observer could not run."));
      } finally {
        nativeSyncInFlight.current = null;
      }
    };
    if (due) void observe();
    else schedule(observation.nextObservationAt);
    return () => { if (timer) clearTimeout(timer); };
  }, [state?.presence, state?.nativeConnections, pendingOperation]);
  useEffect(() => {
    const presence = state?.presence;
    if (!presence || presence.status !== "live") return;
    const slots = state.calendar.filter((slot) => slot.presence === presence.id && slot.enabled && slot.day && slot.time);
    if (!slots.length) return;
    const now = new Date();
    const dayIndex: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const due = slots.find((slot) => {
      const [hours, minutes] = slot.time.split(":").map(Number);
      return dayIndex[slot.day] === now.getDay() && hours * 60 + minutes <= currentMinutes && (!slot.lastEvaluatedAt || new Date(slot.lastEvaluatedAt).toDateString() !== now.toDateString());
    });
    if (due && calendarRunInFlight.current !== due.id) {
      calendarRunInFlight.current = due.id;
      void mutate({ type: "runSlot", id: due.id, scheduled: true }).finally(() => { calendarRunInFlight.current = null; });
      return;
    }
    const nextSlots = slots.map((slot) => {
      const [hours, minutes] = slot.time.split(":").map(Number);
      const target = new Date(now);
      const targetDay = dayIndex[slot.day];
      target.setDate(now.getDate() + ((targetDay - now.getDay() + 7) % 7));
      target.setHours(hours, minutes, 0, 0);
      if (target.getTime() <= now.getTime() || (slot.lastEvaluatedAt && new Date(slot.lastEvaluatedAt).toDateString() === target.toDateString())) target.setDate(target.getDate() + 7);
      return { slot, time: target.getTime() };
    });
    const nextSlot = nextSlots.sort((left, right) => left.time - right.time)[0];
    if (!nextSlot) return;
    const delay = Math.max(1_000, nextSlot.time - now.getTime());
    const timer = setTimeout(() => {
      if (calendarRunInFlight.current === nextSlot.slot.id) return;
      calendarRunInFlight.current = nextSlot.slot.id;
      void mutate({ type: "runSlot", id: nextSlot.slot.id, scheduled: true }).finally(() => { calendarRunInFlight.current = null; });
    }, delay);
    return () => clearTimeout(timer);
  }, [state?.calendar, state?.presence, state?.activePresenceId]);
  async function manageBridge(operation: unknown) {
    setError(null);
    try {
      const response = await fetch("/api/bridge/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(operation),
      });
      const payload = await readJsonResponse<{ state?: OpenPresenceState; key?: string; error?: string }>(response);
      if (!response.ok)
        throw new Error(
          payload.error ?? "That Bridge change could not be saved.",
        );
      if (!payload.state) throw new Error("The Bridge service returned no state.");
      setState(payload.state);
      return payload as { state: OpenPresenceState; key?: string };
    } catch (reason) {
      setError(clientErrorMessage(reason, "That Bridge change could not be saved."));
      return null;
    }
  }
  async function manageX(operation: unknown) {
    setError(null);
    try {
      const response = await fetch("/api/x/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(operation),
      });
      const payload = await readJsonResponse<{ state?: OpenPresenceState; result?: { account: { id: string; username: string; name: string }; access: "read" | "read-write" }; error?: string }>(response);
      if (!response.ok) throw new Error(payload.error ?? "The X connection could not be completed.");
      if (payload.state) setState(payload.state);
      return payload;
    } catch (reason) {
      setError(clientErrorMessage(reason, "The X connection could not be completed."));
      return null;
    }
  }
  if (loading)
    return (
      <main className="loading-screen">
        <PresenceGlyph accent="#D68754" pulse size="large" />
        <p>Waking your Presence…</p>
      </main>
    );
  if (error && !state)
    return (
      <main className="loading-screen">
        <CircleAlert size={28} />
        <p>{error}</p>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </main>
    );
  if (!state) return null;
  if (!state.onboarded)
    return (
      <Onboarding
        onCreate={(input) => mutate({ type: "createAgent", input })}
        error={error}
      />
    );
  return (
      <AgentWorkspaceShell
      state={state}
      view={view}
      setView={openView}
      selectedFile={selectedFile}
      setSelectedFile={setSelectedFile}
      mutate={mutate}
      pendingOperation={pendingOperation}
      manageBridge={manageBridge}
      manageX={manageX}
      error={error}
    />
  );
}

function Onboarding({
  onCreate,
  error,
}: {
  onCreate: (input: {
    name: string;
    description: string;
    mode: PresenceMode;
    handle: string;
    accent: string;
  }) => void;
  error: string | null;
}) {
  const [name, setName] = useState("Jenny");
  const [description, setDescription] = useState(
    "Explain how persistent AI agents are changing software. Be technically sharp, curious, slightly funny, and allergic to hype.",
  );
  const [mode, setMode] = useState<PresenceMode>("agent");
  const [handle, setHandle] = useState("@jenny_ai");
  const [accent, setAccent] = useState("#D68754");
  const [submitting, setSubmitting] = useState(false);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !description.trim()) return;
    setSubmitting(true);
    onCreate({ name, description, mode, handle, accent });
  };
  return (
    <main className="onboarding-shell">
      <div className="onboarding-aside">
        <div className="brand-lockup">
          <div className="brand-mark">◉</div>
          <span>OpenPresence</span>
        </div>
        <div className="onboarding-aside-copy">
          <SectionEyebrow>Two things are born here</SectionEyebrow>
          <h1>Put an intelligent presence into the world.</h1>
          <p>First give the agent a mind. Then give it somewhere to show up.</p>
        </div>
        <div className="aside-footnote">
          <span className="status-dot" /> Local and private by default
        </div>
      </div>
      <div className="onboarding-form-wrap">
        <form className="onboarding-form" onSubmit={submit}>
          <div className="step-count">
            01 <span>/ 01 · Agent + first Presence</span>
          </div>
          <SectionEyebrow>Start with a point of view</SectionEyebrow>
          <h2>Give your Presence a point of view.</h2>
          <p className="muted intro-copy">
            OpenPresence shapes the first version of its mind from this
            sentence. You can refine it later through conversation.
          </p>
          <label>
            Name
            <input
              aria-label="Agent name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Jenny"
            />
          </label>
          <label>
            What should they become known for?
            <textarea
              aria-label="Agent description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              placeholder="A sharp, useful point of view…"
            />
          </label>
          <div className="form-grid">
            <label>
              First Presence handle
              <input
                aria-label="Presence handle"
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                placeholder="@yourpresence"
              />
            </label>
            <label>
              Accent color
              <div className="color-row">
                <input
                  aria-label="Accent color"
                  type="color"
                  value={accent}
                  onChange={(event) => setAccent(event.target.value)}
                />
                <span>{accent}</span>
              </div>
            </label>
          </div>
          <fieldset>
            <legend>How should they show up?</legend>
            <div className="mode-options">
              {presenceModes.map((option) => (
                <ModeOption
                  key={option.id}
                  mode={option.id}
                  selected={mode === option.id}
                  name="mode"
                  accent={accent}
                  onChange={setMode}
                />
              ))}
            </div>
          </fieldset>
          {error && (
            <div className="form-error" role="alert">
              <CircleAlert size={16} /> {error}
            </div>
          )}
          <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? (
              "Waking Presence…"
            ) : (
              <>
                Create Agent + Presence <ArrowUpRight size={16} />
              </>
            )}
          </Button>
          <p className="fine-print">
            No account, API key, or external channel is required for this local
            demo.
          </p>
        </form>
      </div>
    </main>
  );
}

function ChatHistoryNav({
  state,
  mutate,
}: {
  state: OpenPresenceState;
  mutate: Mutate;
}) {
  return (
    <div className="chat-sidebar-section">
      <div className="sidebar-section-heading">
        <span className="sidebar-label">Chat</span>
        <button
          className="sidebar-add"
          aria-label="New conversation"
          onClick={() => mutate({ type: "newConversation" })}
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="conversation-list">
        {state.conversations.map((item) => (
          <button
            key={item.id}
            className={`conversation-nav-item ${item.id === state.activeConversationId ? "active" : ""}`}
            onClick={() => mutate({ type: "selectConversation", id: item.id })}
          >
            <strong>{item.title}</strong>
            <small>
              {item.messages.length
                ? `${item.messages.length} messages`
                : "New"}
            </small>
          </button>
        ))}
      </div>
    </div>
  );
}

function AgentSwitcher({
  state,
  mutate,
}: {
  state: OpenPresenceState;
  mutate: Mutate;
}) {
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [menuPosition, setMenuPosition] = useState<React.CSSProperties | null>(null);
  const switcherRef = useRef<HTMLButtonElement>(null);
  const agent = state.agent!;
  const agents = state.agents?.length ? state.agents : [agent];
  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const anchor = switcherRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const menuWidth = Math.min(250, window.innerWidth - 24);
      const estimatedHeight = Math.min(360, 88 + agents.length * 52);
      const below = window.innerHeight - anchor.bottom;
      const top = below >= estimatedHeight + 8
        ? anchor.bottom + 8
        : undefined;
      setMenuPosition({
        position: "fixed",
        left: Math.min(
          Math.max(12, anchor.left),
          Math.max(12, window.innerWidth - menuWidth - 12),
        ),
        ...(top === undefined
          ? { bottom: Math.max(12, window.innerHeight - anchor.top + 8) }
          : { top }),
        width: menuWidth,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [agents.length, open]);
  return (
    <div className="agent-switcher-wrap">
      <button
        ref={switcherRef}
        className="agent-root agent-switcher"
        aria-label={`Switch agent, currently ${agent.name}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <PresenceGlyph accent={agent.accent} />
        <span>
          <strong>{agent.name}</strong>
          <small>Persistent mind</small>
        </span>
        <ChevronRight size={14} className={open ? "agent-chevron-open" : ""} />
      </button>
      {open && menuPosition && typeof document !== "undefined" && createPortal(
        <div
          className="agent-menu agent-menu-portal"
          role="menu"
          aria-label="Your Agents"
          style={menuPosition}
        >
          <div className="agent-menu-label">Your Agents</div>
          {agents.map((item) => (
            <button
              key={item.id}
              role="menuitem"
              className={`agent-menu-item ${item.id === state.activeAgentId ? "active" : ""}`}
              onClick={async () => {
                await mutate({ type: "selectAgent", id: item.id });
                setOpen(false);
              }}
            >
              <PresenceGlyph accent={item.accent} />
              <span>
                <strong>{item.name}</strong>
                <small>
                  {item.id === agent.id
                    ? "Current · Persistent mind"
                    : "Persistent mind"}
                </small>
              </span>
            </button>
          ))}
          {agents.length === 1 && (
            <p className="agent-menu-empty">No other Agents yet.</p>
          )}
          <div className="agent-menu-divider" />
          <button
            className="agent-menu-action"
            onClick={() => {
              setOpen(false);
              setShowCreate(true);
            }}
          >
            <Plus size={14} /> Create Agent
          </button>
        </div>,
        document.body,
      )}
      {showCreate &&
        typeof document !== "undefined" &&
        createPortal(
          <CreateAgentDialog
            onClose={() => setShowCreate(false)}
            onCreate={async (input) => {
              const next = await mutate({
                type: "createAdditionalAgent",
                input,
              });
              if (next) setShowCreate(false);
            }}
          />,
          document.body,
        )}
    </div>
  );
}

function PresenceSwitcher({
  state,
  mutate,
  onAddPresence,
}: {
  state: OpenPresenceState;
  mutate: Mutate;
  onAddPresence: () => void;
}) {
  const [open, setOpen] = useState(false);
  const presence = state.presence ?? state.presences[0];
  if (!presence) return null;
  return (
    <div className="presence-switcher-wrap">
      <button
        className="presence-root"
        aria-label={`Switch Presence, currently ${presence.handle}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="channel-badge" title={channelLabel(presence.channel, state.channelDefinitions)}>
          <PresenceLogo channel={presence.channel} definitions={state.channelDefinitions} />
        </span>
        <span>
          <strong>{presence.name}</strong>
          <small>{presence.mode === "ghost" ? "Ghost" : "Agent-owned"} · {presence.environment === "sandbox" ? "Sandbox" : "Live"}</small>
        </span>
        <span className={`live-dot ${presence.status === "paused" ? "paused-dot" : ""}`} />
        <ChevronDown size={14} className={open ? "presence-chevron-open" : ""} />
      </button>
      {open && (
        <div className="presence-menu" role="menu" aria-label="Your Presences">
          <div className="agent-menu-label">Your Presences</div>
          {state.presences.map((item) => (
            <button
              key={item.id}
              role="menuitem"
              aria-label={`Select Presence ${item.name} (${item.handle})`}
              className={`presence-menu-item ${item.id === presence.id ? "active" : ""}`}
              onClick={async () => {
                await mutate({ type: "selectPresence", id: item.id });
                setOpen(false);
              }}
            >
              <span className="channel-badge" title={channelLabel(item.channel, state.channelDefinitions)}><PresenceLogo channel={item.channel} definitions={state.channelDefinitions} /></span>
              <span>
                <strong>{item.name}</strong>
                <small>{channelLabel(item.channel, state.channelDefinitions)} · {item.mode === "ghost" ? "Ghost" : "Agent-owned"} · {item.environment === "sandbox" ? "Sandbox" : "Live"}</small>
              </span>
              <span className={`live-dot ${item.status === "paused" ? "paused-dot" : ""}`} />
            </button>
          ))}
          <div className="presence-menu-divider" />
          <button
            type="button"
            role="menuitem"
            className="presence-settings-action"
            onClick={() => {
              setOpen(false);
              onAddPresence();
            }}
          >
            <Plus size={15} />
            <span>Add a Presence</span>
          </button>
        </div>
      )}
    </div>
  );
}

function CreateAgentDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: CreateAgentInput) => Promise<void>;
}) {
  const [name, setName] = useState("Atlas");
  const [description, setDescription] = useState(
    "A focused research personality with a distinct point of view.",
  );
  const [audience, setAudience] = useState("people doing careful research");
  const [handle, setHandle] = useState("@atlas");
  const [accent, setAccent] = useState("#7A8FD8");
  const [mode, setMode] = useState<PresenceMode>("agent");
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !description.trim() || !handle.trim()) return;
    setSubmitting(true);
    await onCreate({ name, description, audience, handle, accent, mode });
    setSubmitting(false);
  };
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="presence-dialog create-agent-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-agent-title"
        onSubmit={submit}
      >
        <div className="dialog-header">
          <div>
            <SectionEyebrow>Another persistent mind</SectionEyebrow>
            <h2 id="create-agent-title">Create Agent</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <p className="muted">
          Each Agent is a separate workspace with its own Brain, conversations,
          Presences, and runtime.
        </p>
        <label>
          Agent name
          <input
            aria-label="Agent name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          What are they here to do?
          <textarea
            aria-label="Agent description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
          />
        </label>
        <div className="form-grid">
          <label>
            Audience
            <input
              aria-label="Agent audience"
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
            />
          </label>
          <label>
            Accent color
            <div className="color-row">
              <input
                aria-label="Agent accent color"
                type="color"
                value={accent}
                onChange={(event) => setAccent(event.target.value)}
              />
              <span>{accent}</span>
            </div>
          </label>
        </div>
        <label>
          First Presence handle
          <input
            aria-label="Agent handle"
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
          />
        </label>
        <fieldset>
          <legend>How should they show up?</legend>
          <div className="mode-options">
            {presenceModes.map((option) => (
              <ModeOption
                key={option.id}
                mode={option.id}
                selected={mode === option.id}
                name="agent-mode"
                accent={accent}
                onChange={setMode}
              />
            ))}
          </div>
        </fieldset>
        <div className="dialog-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "Creating…" : "Create Agent"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function AgentWorkspaceShell({
  state,
  view,
  setView,
  selectedFile,
  setSelectedFile,
  mutate,
  pendingOperation,
  manageBridge,
  manageX,
  error,
}: {
  state: OpenPresenceState;
  view: View;
  setView: (view: View) => void;
  selectedFile: FileKind;
  setSelectedFile: (file: FileKind) => void;
  mutate: Mutate;
  pendingOperation: string | null;
  manageBridge: BridgeManage;
  manageX: XManage;
  error: string | null;
}) {
  const agent = state.agent!;
  const presence = state.presence ?? state.presences[0]!;
  const [showPresenceModal, setShowPresenceModal] = useState(false);
  const pageLabel =
    view === "brain"
      ? "Manage Agent"
      : view === "presence"
        ? "Presence settings"
      : view === "live"
          ? "Activity"
          : view === "feed"
            ? "Feed"
          : view[0].toUpperCase() + view.slice(1);
  const pendingExecutionCount = state.executions.filter(
    (item) =>
      item.presenceId === presence.id && item.status === "awaiting-review",
  ).length;
  const pendingAgentChangeCount = state.proposals.filter(
    (item) => item.status === "pending",
  ).length;
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup sidebar-brand">
          <div className="brand-mark">◉</div>
          <span>OpenPresence</span>
        </div>
        <div className="sidebar-label presence-label">Presences</div>
        <PresenceSwitcher
          state={state}
          mutate={mutate}
          onAddPresence={() => setShowPresenceModal(true)}
        />
        <nav className="main-nav" aria-label="Primary navigation">
          {presenceNavItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={view === id ? "active" : ""}
            >
              <Icon size={17} />
              <span>{label}</span>
              {id === "live" && pendingExecutionCount > 0 && (
                <span className="nav-count">{pendingExecutionCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <div className="sidebar-label">Agent</div>
        {agentNavItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`secondary-nav ${view === id ? "active" : ""}`}
          >
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
        <button
          className={`secondary-nav ${view === "brain" ? "active" : ""}`}
          onClick={() => setView("brain")}
        >
          <Brain size={17} />
          <span>Manage Agent</span>
          {pendingAgentChangeCount > 0 && (
            <span className="nav-count">{pendingAgentChangeCount}</span>
          )}
        </button>
        <div className="sidebar-footer">
          <div className="sidebar-runtime" aria-label="Local runtime SQLite">
            <span className="status-dot" />
            <span>Local runtime</span>
            <small>SQLite</small>
          </div>
          <div className="sidebar-footer-actions">
            <AgentSwitcher state={state} mutate={mutate} />
          </div>
        </div>
      </aside>
      <section className={view === "chat" || view === "teach" ? "workspace workspace-chat" : "workspace"}>
        <header className="topbar">
          <div className="mobile-brand">
            <div className="brand-mark">◉</div>
            <span>OpenPresence</span>
          </div>
          <div className="mobile-agent-switcher">
            <AgentSwitcher state={state} mutate={mutate} />
          </div>
          <div className="mobile-presence-switcher">
            <PresenceSwitcher
              state={state}
              mutate={mutate}
              onAddPresence={() => setShowPresenceModal(true)}
            />
          </div>
          <div className="topbar-context">
            <PresenceGlyph accent={agent.accent} />
            <span>{agent.name}</span>
            <ChevronRight size={14} />
            <strong>{pageLabel}</strong>
          </div>
          {view === "presence" && <div className="topbar-actions">
            <span className={`connection-label ${presence.status === "paused" ? "paused" : ""}`}>
              <span className="status-dot" />{" "}
              {presence.status === "paused"
                ? "Asleep"
                : state.nativeConnections.some((item) => item.presenceId === presence.id && item.status === "needs-attention") || state.bridges.some((item) => item.presenceId === presence.id && item.state === "degraded")
                  ? "Needs attention"
                  : presence.connectionMode === "sandbox"
                    ? "Sandbox"
                    : (state.nativeConnections.some((item) => item.presenceId === presence.id && item.status === "connected") || state.bridges.some((item) => item.presenceId === presence.id && item.state === "online"))
                      ? "Connected"
                      : "Not connected"}
            </span>
          </div>}
        </header>
        {error && (
          <div className="toast-error" role="alert">
            <CircleAlert size={16} /> {error}
          </div>
        )}
        <div className="workspace-content">
          {view === "teach" && <TeachView state={state} mutate={mutate} setView={setView} />}
          {view === "chat" && <PresenceChatView state={state} mutate={mutate} />}
          {view === "playground" && (
            <PlaygroundView state={state} mutate={mutate} />
          )}
          {view === "live" && (
            <LiveView state={state} mutate={mutate} setView={setView} pendingOperation={pendingOperation} />
          )}
          {view === "feed" && (
            <PublicHistoryView state={state} setView={setView} />
          )}
          {view === "schedule" && (
            <ScheduleView state={state} mutate={mutate} />
          )}
          {view === "brain" && (
            <BrainView
              key={`${state.activeAgentId}-${selectedFile}-${state.files.find((file) => file.kind === selectedFile)?.revision ?? 0}`}
              state={state}
              mutate={mutate}
              selectedFile={selectedFile}
              setSelectedFile={setSelectedFile}
            />
          )}
          {view === "presence" && (
            <PresenceView
              key={presence.id}
              state={state}
              mutate={mutate}
              setView={setView}
              pendingOperation={pendingOperation}
              manageBridge={manageBridge}
              manageX={manageX}
            />
          )}
        </div>
      </section>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {presenceNavItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={view === id ? "active" : ""}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
        {agentNavItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={view === id ? "active" : ""}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
        <button
          onClick={() => setView("brain")}
          className={view === "brain" ? "active" : ""}
        >
          <Brain size={18} />
          <span>Manage Agent</span>
          {pendingAgentChangeCount > 0 && (
            <span className="nav-count">{pendingAgentChangeCount}</span>
          )}
        </button>
      </nav>
      {showPresenceModal && (
        <AddPresenceDialog
          accent={agent.accent}
          onClose={() => setShowPresenceModal(false)}
          onCreate={async (input) => {
            const next = await mutate({ type: "createPresence", input });
            if (next) setShowPresenceModal(false);
          }}
        />
      )}
    </main>
  );
}

function LegacyAppShell({
  state,
  view,
  setView,
  selectedFile,
  setSelectedFile,
  mutate,
  manageBridge,
  manageX,
  error,
}: {
  state: OpenPresenceState;
  view: View;
  setView: (view: View) => void;
  selectedFile: FileKind;
  setSelectedFile: (file: FileKind) => void;
  mutate: Mutate;
  manageBridge: BridgeManage;
  manageX: XManage;
  error: string | null;
}) {
  const agent = state.agent!;
  const presence = state.presence!;
  const [showPresenceModal, setShowPresenceModal] = useState(false);
  const pageLabel =
    view === "brain"
      ? "Brain"
      : view === "presence"
        ? `${channelLabel(presence.channel, state.channelDefinitions)} · Settings`
        : view === "live"
          ? "Activity"
          : view === "feed"
            ? "Feed"
          : view[0].toUpperCase() + view.slice(1);
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup sidebar-brand">
          <div className="brand-mark">◉</div>
          <span>OpenPresence</span>
        </div>
        <div className="sidebar-label">Agent</div>
        <button
          className="agent-root agent-switcher"
          aria-label={`Open agent workspace, ${agent.name}`}
          onClick={() => setView("brain")}
        >
          <PresenceGlyph accent={agent.accent} />
          <span>
            <strong>{agent.name}</strong>
            <small>Persistent mind</small>
          </span>
          <ChevronRight size={14} />
        </button>
        {view === "chat" && <ChatHistoryNav state={state} mutate={mutate} />}
        <div className="sidebar-label presence-label">Presences</div>
        <div className="presence-tree">
          {state.presences.map((item) => (
            <button
              key={item.id}
              className={`presence-switcher ${item.id === presence.id ? "active" : ""}`}
              onClick={() => mutate({ type: "selectPresence", id: item.id })}
            >
              <span className="channel-badge">
                {channelLabel(item.channel, state.channelDefinitions)}
              </span>
              <span>
                <strong>{item.handle}</strong>
                <small>
                  {channelLabel(item.channel, state.channelDefinitions)} ·{" "}
                  {item.mode === "ghost" ? "Ghost" : "Agent-owned"}
                </small>
              </span>
              <span
                className={`live-dot ${item.status === "paused" ? "paused-dot" : ""}`}
              />
            </button>
          ))}
        </div>
        <button
          className="add-presence"
          onClick={() => setShowPresenceModal(true)}
        >
          <Plus size={15} /> Add a Presence
        </button>
        <nav className="main-nav" aria-label="Primary navigation">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={view === id ? "active" : ""}
            >
              <Icon size={17} />
              <span>{label}</span>
              {id === "live" &&
                state.proposals.some((item) => item.status === "pending") && (
                  <span className="nav-count">
                    {
                      state.proposals.filter(
                        (item) => item.status === "pending",
                      ).length
                    }
                  </span>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <div className="sidebar-label">Mind</div>
        <button
          className={`secondary-nav ${view === "brain" ? "active" : ""}`}
          onClick={() => setView("brain")}
        >
          <Brain size={17} />
          <span>Brain</span>
        </button>
      </aside>
      <section className={view === "chat" ? "workspace workspace-chat" : "workspace"}>
        <header className="topbar">
          <div className="mobile-brand">
            <div className="brand-mark">◉</div>
            <span>OpenPresence</span>
          </div>
          <div className="topbar-context">
            <PresenceGlyph accent={agent.accent} />
            <span>{agent.name}</span>
            <ChevronRight size={14} />
            <strong>{pageLabel}</strong>
          </div>
          <div className="topbar-actions">
            <span
              className={`connection-label ${presence.status === "paused" ? "paused" : ""}`}
            >
              <span className="status-dot" />{" "}
              {view === "presence"
                ? presence.status === "paused"
                  ? "Paused"
                  : state.nativeConnections.some((item) => item.presenceId === presence.id && item.status === "needs-attention")
                    ? "Needs attention"
                  : state.bridges.some(
                        (item) =>
                          item.presenceId === presence.id &&
                          item.state === "online",
                      )
                    ? "Connected"
                    : "Not connected"
                : view === "brain"
                  ? "Agent workspace"
                  : "All Presences"}
            </span>
          </div>
        </header>
        {error && (
          <div className="toast-error" role="alert">
            <CircleAlert size={16} /> {error}
          </div>
        )}
        <div className="workspace-content">
          {view === "teach" && (
            <TeachView state={state} mutate={mutate} setView={setView} />
          )}
          {view === "live" && (
            <LiveView state={state} mutate={mutate} />
          )}
          {view === "feed" && (
            <PublicHistoryView state={state} setView={setView} />
          )}
          {view === "schedule" && (
            <ScheduleView state={state} mutate={mutate} />
          )}
          {view === "brain" && (
            <BrainView
              key={`${selectedFile}-${state.files.find((file) => file.kind === selectedFile)?.revision ?? 0}`}
              state={state}
              mutate={mutate}
              selectedFile={selectedFile}
              setSelectedFile={setSelectedFile}
            />
          )}
          {view === "presence" && (
            <PresenceView
              key={presence.id}
              state={state}
              mutate={mutate}
              manageBridge={manageBridge}
              manageX={manageX}
            />
          )}
        </div>
      </section>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={view === id ? "active" : ""}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
        <button
          onClick={() => setView("brain")}
          className={view === "brain" ? "active" : ""}
        >
          <Brain size={18} />
          <span>Brain</span>
        </button>
        <button
          onClick={() => setView("presence")}
          className={view === "presence" ? "active" : ""}
        >
          <Settings2 size={18} />
          <span>Settings</span>
        </button>
      </nav>
      {showPresenceModal && (
        <AddPresenceDialog
          accent={agent.accent}
          onClose={() => setShowPresenceModal(false)}
          onCreate={async (input) => {
            const next = await mutate({ type: "createPresence", input });
            if (next) setShowPresenceModal(false);
          }}
        />
      )}
    </main>
  );
}

function AddPresenceDialog({
  accent,
  onClose,
  onCreate,
}: {
  accent: string;
  onClose: () => void;
  onCreate: (input: CreatePresenceInput) => Promise<void>;
}) {
  const [channel, setChannel] = useState<ChannelId>("x");
  const [connectionMode, setConnectionMode] = useState<PresenceConnectionMode>("sandbox");
  const [presenceName, setPresenceName] = useState("");
  const [handle, setHandle] = useState("@jenny_ai");
  const [mode, setMode] = useState<PresenceMode>("agent");
  const [submitting, setSubmitting] = useState(false);
  const [customName, setCustomName] = useState("Custom channel");
  const [customId, setCustomId] = useState("custom-channel");
  const [customDomain, setCustomDomain] = useState("");
  const [customIcon, setCustomIcon] = useState("community");
  const [affordances, setAffordances] = useState("post, reply, react, message");
  const customDefinition = (): ChannelDefinition => {
    const timestamp = new Date().toISOString();
    const ids = affordances
      .split(",")
      .map((item) => item.trim().toLowerCase().replace(/\s+/g, "-"))
      .filter(Boolean);
    const capabilities = [...new Set(ids)].map((id) => ({
      id,
      label: id
        .replace(/-/g, " ")
        .replace(/^./, (letter) => letter.toUpperCase()),
      description: `Use the ${id.replace(/-/g, " ")} affordance in this community.`,
    }));
    return {
      id: customId.trim().toLowerCase(),
      name: customName.trim(),
      description: `A custom social environment for ${customName.trim()}.`,
      icon: customIcon,
      domain: customDomain.trim() || undefined,
      entities: [
        { id: "member", label: "Member" },
        { id: "post", label: "Post" },
        { id: "comment", label: "Comment" },
        { id: "message", label: "Message" },
      ],
      affordances: capabilities,
      formats: [
        {
          id: `${customId.trim().toLowerCase()}.text-post`,
          label: "Text post",
          description: "A text publication.",
          channel: customId.trim().toLowerCase(),
        },
      ],
      relationships: [
        { from: "post", to: ["comment"], relation: "contains" },
        { from: "comment", to: ["post", "comment"], relation: "replies-to" },
      ],
      metrics: [
        { id: "replies", label: "Replies" },
        { id: "reactions", label: "Reactions" },
      ],
      privacyDefaults: {
        visibility: "private-community",
        shareability: "presence-only",
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !handle.trim() ||
      (channel === "__custom__" && (!customName.trim() || !customId.trim()))
    )
      return;
    setSubmitting(true);
    const definition =
      channel === "__custom__" ? customDefinition() : undefined;
    await onCreate({
      channel: definition?.id ?? channel,
      name: presenceName.trim() || handle,
      handle,
      mode,
      accent,
      channelDefinition: definition,
      connectionMode,
    });
    setSubmitting(false);
  };
  const preview = channel === "__custom__" ? customDefinition() : null;
  const handleLabel = channel === "x" ? "X handle" : "Platform handle";
  const handleHint = connectionMode === "sandbox"
    ? "Used by the Social Mirror when this Presence speaks in rehearsal."
    : connectionMode === "bridge"
      ? "The public handle this Presence uses in the connected community."
      : "The public @handle this Presence uses on X. The connected account is verified separately.";
  return (
    <div
      className="modal-backdrop add-presence-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="presence-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-presence-title"
        onSubmit={submit}
      >
        <div className="dialog-header">
          <div>
            <SectionEyebrow>Another place to show up</SectionEyebrow>
            <h2 id="add-presence-title">Add a Presence</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <p className="muted">
          The Agent stays the same; this Presence defines how it appears in
          this social environment. You can connect it after the Presence
          exists.
        </p>
        <fieldset className="channel-picker">
          <legend>Where should Jenny show up?</legend>
          <label>
            <input
              type="radio"
              name="channel"
              value="sandbox"
              checked={connectionMode === "sandbox"}
              onChange={() => { setConnectionMode("sandbox"); setChannel("x"); }}
            />
            <strong>Sandbox</strong>
            <small>Rehearse safely in a simulated social world</small>
          </label>
          <label>
            <input
              type="radio"
              name="channel"
              value="x"
              checked={connectionMode === "native"}
              onChange={() => { setConnectionMode("native"); setChannel("x"); }}
            />
            <strong>X</strong>
            <small>Live public conversations through the X API</small>
          </label>
          <label>
            <input
              type="radio"
              name="channel"
              value="__custom__"
              checked={connectionMode === "bridge"}
              onChange={() => { setConnectionMode("bridge"); setChannel("__custom__"); }}
            />
            <strong>Bridge</strong>
            <small>Connect a community or social environment through an adapter</small>
          </label>
        </fieldset>
        {channel === "__custom__" && (
          <>
            <label>
              Channel name
              <input
                aria-label="Custom channel name"
                value={customName}
                onChange={(event) => setCustomName(event.target.value)}
              />
            </label>
            <label>
              Channel ID
              <input
                aria-label="Custom channel ID"
                value={customId}
                onChange={(event) => setCustomId(event.target.value)}
              />
            </label>
            <label>
              Social Mirror domain (optional)
              <input
                aria-label="Social Mirror domain"
                value={customDomain}
                onChange={(event) => setCustomDomain(event.target.value)}
                placeholder="https://www.skool.com/"
              />
              <small className="muted">A favicon will be used for this channel when the domain is available.</small>
            </label>
            <fieldset className="icon-picker">
              <legend>Fallback channel icon</legend>
              <div className="icon-picker-options">
                {channelIconOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      type="button"
                      key={option.id}
                      className={customIcon === option.id ? "selected" : ""}
                      aria-label={`Use ${option.label} icon`}
                      aria-pressed={customIcon === option.id}
                      onClick={() => setCustomIcon(option.id)}
                    >
                      <Icon size={15} strokeWidth={1.8} />
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <label>
              Affordances
              <input
                aria-label="Custom affordances"
                value={affordances}
                onChange={(event) => setAffordances(event.target.value)}
              />
              <small className="muted">
                Comma-separated actions people can take.
              </small>
            </label>
            <details>
              <summary>Advanced channel blueprint</summary>
              <pre className="blueprint-preview">
                {JSON.stringify(preview, null, 2)}
              </pre>
            </details>
          </>
        )}
        <label>
          Display name in this place
          <input
            aria-label="Presence name"
            value={presenceName}
            onChange={(event) => setPresenceName(event.target.value)}
            placeholder="Jenny in this place"
          />
        </label>
        <label>
          {handleLabel}
          <input
            aria-label="New Presence handle"
            aria-describedby="new-presence-handle-help"
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            placeholder="@yourpresence"
          />
          <small id="new-presence-handle-help" className="muted">{handleHint}</small>
        </label>
        <fieldset>
          <legend>Who is speaking here?</legend>
          <div className="mode-options">
            {presenceModes.map((option) => (
              <ModeOption
                key={option.id}
                mode={option.id}
                selected={mode === option.id}
                name="presence-mode"
                accent={accent}
                onChange={setMode}
              />
            ))}
          </div>
        </fieldset>
        <div className="dialog-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "Adding…" : "Add Presence"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ContextStatus({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "pending" | "created";
}) {
  return (
    <span className={`context-status context-status-${tone}`}>{children}</span>
  );
}

function ContextSidebar({
  id,
  state,
  modelName,
  attachments,
  onAddAttachment,
}: {
  id: string;
  state: OpenPresenceState;
  modelName: string;
  attachments: string[];
  onAddAttachment: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const changes = state.changeSets
    .filter(
      (item) =>
        !item.conversationId ||
        item.conversationId === state.activeConversationId,
    )
    .slice(0, 5);
  const contextSources = [
    ...attachments.map((name) => ({
      label: name,
      detail: "Attached to this conversation",
    })),
    ...state.librarySources
      .slice(0, 3)
      .map((source) => ({
        label: source.location.split("/").pop() || source.location,
        detail:
          source.status === "available" ? "Available source" : source.status,
      })),
  ];
  const changeLabel = (summary: string) =>
    summary.includes("TASTE")
      ? "Taste"
      : summary.includes("standing intent")
        ? "Standing intent"
        : summary.includes("Presence mode")
          ? "Presence"
          : summary;
  const changeTone = (changeId: string) =>
    state.proposals.some(
      (proposal) =>
        proposal.changeSetId === changeId && proposal.status === "pending",
    )
      ? ("pending" as const)
      : ("created" as const);
  const changeStatus = (changeId: string) =>
    state.proposals.some(
      (proposal) =>
        proposal.changeSetId === changeId && proposal.status === "pending",
    )
      ? "Pending review"
      : "Created";
  const outputs = [
    ...state.publications.map((publication) => ({
      label: publication.format,
      detail: "Publication draft",
    })),
    ...state.contentDrops
      .slice(0, 3)
      .map((drop) => ({ label: drop.origin, detail: "Content drop" })),
  ].slice(0, 4);
  return (
    <aside
      id={id}
      className="chat-context-sidebar"
      aria-label="Context & Changes sidebar"
    >
      <div className="context-sidebar-header">
        <div>
          <SectionEyebrow>Conversation workspace</SectionEyebrow>
          <h2>Context & changes</h2>
        </div>
        <span className="context-live-dot" aria-hidden="true" />
      </div>
      <section className="context-section">
        <SectionEyebrow>Scope</SectionEyebrow>
        <div className="context-scope">
          <strong>All Presences</strong>
          <small>Agent-wide conversation</small>
        </div>
      </section>
      <section className="context-section">
        <div className="context-section-heading">
          <SectionEyebrow>Context</SectionEyebrow>
          <span className="quiet-label">{contextSources.length}</span>
        </div>
        {contextSources.length ? (
          <div className="context-item-list">
            {contextSources.map((source) => (
              <div className="context-item" key={source.label}>
                <FileText size={14} />
                <span>
                  <strong>{source.label}</strong>
                  <small>{source.detail}</small>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="context-empty">No files or sources added yet.</p>
        )}
        <label className="context-add">
          <Plus size={14} /> Add context
          <input type="file" hidden onChange={onAddAttachment} />
        </label>
      </section>
      <section className="context-section">
        <div className="context-section-heading">
          <SectionEyebrow>Changes</SectionEyebrow>
          <span className="quiet-label">{changes.length}</span>
        </div>
        {changes.length ? (
          <div className="context-change-list">
            {changes.map((change) => (
              <div className="context-change" key={change.id}>
                <div>
                  <strong>{changeLabel(change.summary)}</strong>
                  <small>{change.summary}</small>
                </div>
                <ContextStatus tone={changeTone(change.id)}>
                  {changeStatus(change.id)}
                </ContextStatus>
              </div>
            ))}
          </div>
        ) : (
          <p className="context-empty">No changes in this conversation yet.</p>
        )}
      </section>
      <section className="context-section">
        <SectionEyebrow>Outputs</SectionEyebrow>
        {outputs.length ? (
          <div className="context-item-list">
            {outputs.map((output, index) => (
              <div
                className="context-item"
                key={`${output.label}-${output.detail}-${index}`}
              >
                <Sparkles size={14} />
                <span>
                  <strong>{output.label}</strong>
                  <small>{output.detail}</small>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="context-empty">No outputs yet.</p>
        )}
      </section>
      <section className="context-section context-advanced">
        <SectionEyebrow>Advanced</SectionEyebrow>
        <div className="context-runtime">
          <div>
            <span>Brain</span>
            <strong>{modelName}</strong>
          </div>
          <div>
            <span>Skills available</span>
            <strong>{state.skills.length}</strong>
          </div>
          <div>
          <span>Tools bound</span>
          <strong>{state.toolBindings.length}</strong>
          </div>
        </div>
      </section>
    </aside>
  );
}

function SocialObjectCard({
  item,
  objects,
  assets,
  presenceId,
  presenceName,
  onSelect,
  threadDepth = 0,
}: {
  item: MirrorObject;
  objects: MirrorObject[];
  assets: OpenPresenceState["assets"];
  presenceId: string;
  presenceName: string;
  onSelect: (id: string) => void;
  threadDepth?: number;
}) {
  const itemAssets = (item.assetRefs ?? [])
    .map((ref) => assets.find((asset) => asset.id === ref.assetId))
    .filter(Boolean);
  const isLike = item.objectType === "like";
  const target = item.parentExternalRef
    ? objects.find(
        (object) =>
          object.externalRef.type === item.parentExternalRef?.type &&
          object.externalRef.id === item.parentExternalRef?.id,
      )
    : undefined;
  const authorName = item.author?.displayName ?? "Someone";
  const authorHandle = item.author?.handle ?? "Audience";

  return (
    <article
      className={`social-card ${item.actorPresenceId === presenceId ? "agent-authored" : ""} ${isLike ? "social-event-card social-event-like" : ""} ${threadDepth > 0 ? "thread-reply-card" : ""}`}
    >
      {isLike ? (
        <div className="social-event-meta">
          <span className="social-event-icon" aria-hidden="true">
            <Heart size={15} fill="currentColor" />
          </span>
          <span className="social-event-actor">
            <small className="social-event-kicker">Activity · Like</small>
            <strong>{authorName} liked a post</strong>
            <small>{authorHandle}</small>
          </span>
          <time>{formatTime(item.occurredAt ?? item.observedAt)}</time>
        </div>
      ) : (
        <div className="social-card-meta">
          <span className="actor-avatar">{initials(authorName)}</span>
          <span>
            <strong>{authorName}</strong>
            <small>
              {authorHandle} · {threadDepth > 0 ? "reply" : item.objectType}
            </small>
          </span>
          <time>{formatTime(item.occurredAt ?? item.observedAt)}</time>
        </div>
      )}
      {isLike ? (
        <div className="social-event-body">
          <strong>Liked a post</strong>
          {target?.content?.text ? (
            <blockquote>
              “{target.content.text}”
              <cite>
                {target.author?.handle ?? target.author?.displayName ?? "Simulated post"}
              </cite>
            </blockquote>
          ) : (
            <small>Signal of attention on the simulated world.</small>
          )}
        </div>
      ) : (
        <p>{item.content?.text ?? ""}</p>
      )}
      {itemAssets.length > 0 && (
        <div className="social-card-assets">
          {itemAssets.map((asset) =>
            asset?.type === "image" || asset?.type === "gif" ? (
              <Image
                unoptimized
                width={90}
                height={64}
                key={asset.id}
                src={asset.dataUrl ?? ""}
                alt="Attached simulated media"
              />
            ) : (
              <span className="social-link-asset" key={asset?.id}>
                {asset?.type === "link" ? asset.provenance.sourceUrl : `${asset?.type} attached`}
              </span>
            ),
          )}
        </div>
      )}
      {item.assetRefs?.length ? (
        <button className="what-sees-button" type="button" onClick={() => onSelect(item.id)}>
          What {presenceName} sees
        </button>
      ) : null}
      {item.parentExternalRef && !isLike && (
        <small className="thread-context">↳ in this conversation</small>
      )}
    </article>
  );
}

function PlaygroundThreadFeed({
  objects,
  assets,
  presenceId,
  presenceName,
  onSelect,
}: {
  objects: MirrorObject[];
  assets: OpenPresenceState["assets"];
  presenceId: string;
  presenceName: string;
  onSelect: (id: string) => void;
}) {
  const refKey = (object: MirrorObject) => `${object.externalRef.type}:${object.externalRef.id}`;
  const objectsByRef = new Map(objects.map((object) => [refKey(object), object]));
  const childrenByParent = new Map<string, MirrorObject[]>();
  for (const object of objects) {
    if (!object.parentExternalRef) continue;
    const key = `${object.parentExternalRef.type}:${object.parentExternalRef.id}`;
    const children = childrenByParent.get(key) ?? [];
    children.push(object);
    childrenByParent.set(key, children);
  }
  const timestamp = (object: MirrorObject) => new Date(object.occurredAt ?? object.observedAt).getTime();
  const descendants = (object: MirrorObject): MirrorObject[] => {
    const children = (childrenByParent.get(refKey(object)) ?? []).sort((left, right) => timestamp(left) - timestamp(right));
    return children.flatMap((child) => [child, ...descendants(child)]);
  };
  const roots = objects
    .filter((object) => !object.parentExternalRef || !objectsByRef.has(`${object.parentExternalRef.type}:${object.parentExternalRef.id}`))
    .sort((left, right) => {
      const leftThread = [left, ...descendants(left)];
      const rightThread = [right, ...descendants(right)];
      return Math.max(...rightThread.map(timestamp)) - Math.max(...leftThread.map(timestamp));
    });
  const renderThread = (object: MirrorObject, depth = 0): React.ReactNode => (
    <Fragment key={object.id}>
      <SocialObjectCard item={object} objects={objects} assets={assets} presenceId={presenceId} presenceName={presenceName} onSelect={onSelect} threadDepth={depth} />
      {(childrenByParent.get(refKey(object)) ?? []).sort((left, right) => timestamp(left) - timestamp(right)).map((child) => renderThread(child, depth + 1))}
    </Fragment>
  );
  return <div className="social-feed">{roots.map((root) => <div className="social-thread" key={`thread:${root.id}`}>{renderThread(root)}</div>)}</div>;
}

function structuredEventDetail(detail: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(detail);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function eventDetailText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function formatEventAction(action: string | undefined): string {
  if (!action) return "No action";
  if (action === "no_op") return "Silence";
  return action.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function PlaygroundEventDetail({ event }: { event: OpenPresenceState["events"][number] }) {
  const detail = structuredEventDetail(event.detail);
  if (!detail) return <small>{event.detail}</small>;

  const rationale = eventDetailText(detail.rationale);
  const responseNeed = eventDetailText(detail.responseNeed);
  const recommendedAction = eventDetailText(detail.recommendedAction ?? detail.action);
  const confidence = eventDetailText(detail.confidence);

  if (event.title === "Social plan formed") {
    return (
      <div className="playground-event-detail">
        <span className="event-decision-label">{formatEventAction(recommendedAction)}</span>
        {rationale && <small>{rationale}</small>}
      </div>
    );
  }

  if (event.title === "Social perception recorded") {
    return (
      <div className="playground-event-detail">
        <small>{responseNeed ?? "The Agent recorded what the exchange appears to need."}</small>
        {(recommendedAction || confidence) && (
          <div className="event-facts">
            {recommendedAction && <span>{formatEventAction(recommendedAction)} recommended</span>}
            {confidence && <span>{confidence} confidence</span>}
          </div>
        )}
      </div>
    );
  }

  return <small>{event.detail}</small>;
}

function PlaygroundView({ state, mutate }: { state: OpenPresenceState; mutate: Mutate }) {
  const presence = state.presence ?? state.presences[0];
  const session = state.playgroundSessions.find((item) => item.presenceId === presence?.id && item.status === "active") ?? state.playgroundSessions[0];
  const channelDefinition = state.channelDefinitions.find((item) => item.id === presence?.channel);
  const simulation = simulationForChannel(presence?.channel ?? "x", channelDefinition);
  const objects = session ? state.mirrorObjects.filter((item) => item.sessionId === session.id && item.channelId === session.channelId).sort((left, right) => (right.occurredAt ?? right.observedAt).localeCompare(left.occurredAt ?? left.observedAt)) : [];
  const sessionEvents = session ? state.events.filter((item) => item.sessionId === session.id).slice(0, 8) : [];
  const reviewCount = session ? state.executions.filter((item) => item.sessionId === session.id && item.status === "awaiting-review").length : 0;
  const actors = session ? state.sandboxActors.filter((item) => item.sessionId === session.id) : [];
  const [busy, setBusy] = useState(false);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [rehearsalOpen, setRehearsalOpen] = useState(false);
  const [rehearsalMode, setRehearsalMode] = useState<"consider" | "topic" | "assign" | null>(null);
  const [inspiration, setInspiration] = useState("");
  const [assignmentInstruction, setAssignmentInstruction] = useState("");
  const [assignmentDraftId, setAssignmentDraftId] = useState<string | null>(null);
  const [expandedRehearsalId, setExpandedRehearsalId] = useState<string | null>(null);
  const [feedbackAttemptId, setFeedbackAttemptId] = useState<string | null>(null);
  const [feedbackReasons, setFeedbackReasons] = useState<PreferenceReason[]>([]);
  const [feedbackNote, setFeedbackNote] = useState("");
  const targetObjects = objects.filter((item) => item.actorPresenceId === presence?.id && item.objectType !== "like");
  const assetKinds = channelDefinition?.supportedAssetKinds ?? ["image", "video", "gif", "link"] as SocialAssetKind[];
  const selectedObject = selectedObjectId ? objects.find((item) => item.id === selectedObjectId) : undefined;
  const rehearsalAttempts = state.originalPostRehearsals.filter((item) => item.sessionId === session.id).slice(0, 5);
  const sessionAssignments = state.assignments.filter((item) => item.sessionId === session.id || (item.status === "draft" && item.presenceId === presence?.id));
  const assignmentDraft = assignmentDraftId ? sessionAssignments.find((item) => item.id === assignmentDraftId) : undefined;
  const activeAssignment = sessionAssignments.find((item) => ["active", "working", "blocked"].includes(item.status));
  const originalLabel = presence.channel === "x"
    ? "Consider an original post"
    : presence.channel === "substack"
      ? "Consider an original Note"
      : presence.channel === "linkedin"
        ? "Consider an original post"
        : "Consider an original publication";
  const preferenceReasonOptions: { id: PreferenceReason; label: string }[] = [
    { id: "idea", label: "Idea" }, { id: "voice", label: "Voice" }, { id: "topic", label: "Topic" }, { id: "humor", label: "Humor" }, { id: "format", label: "Format" }, { id: "technical_depth", label: "Technical depth" }, { id: "too_generic", label: "Too generic" }, { id: "too_promotional", label: "Too promotional" }, { id: "too_long", label: "Too long" }, { id: "too_risky", label: "Too risky" }, { id: "factually_wrong", label: "Factually wrong" }, { id: "not_something_i_would_say", label: "Not something I'd say" },
  ];
  const run = async (operation: unknown) => { setBusy(true); try { await mutate(operation); } finally { setBusy(false); } };
  const wakeOrCheck = async () => {
    if (!session) return;
    if (presence?.status === "paused") {
      const next = await mutate({ type: "setPresence", patch: { status: "live" } });
      if (!next) return;
    }
    await run({ type: "runSandboxPulse", sessionId: session.id });
  };
  const considerOriginal = async (value?: string) => {
    await run({ type: "considerOriginalPublication", sessionId: session.id, inspiration: value?.trim() || undefined });
    setInspiration("");
    setRehearsalOpen(false);
  };
  const reviewAssignment = async () => {
    const next = await mutate({ type: "createAssignment", sessionId: session.id, presenceId: presence.id, environment: "sandbox", instruction: assignmentInstruction });
    const created = next?.assignments.find((item) => item.sessionId === session.id) ?? next?.assignments[0];
    if (created) setAssignmentDraftId(created.id);
  };
  const saveFeedback = async (attemptId: string, reaction: "fits" | "does_not_fit" | "good_silence" | "expected_action") => {
    await run({ type: "recordPreferenceEvidence", sessionId: session.id, attemptId, reaction, reasons: feedbackReasons, note: feedbackNote.trim() || undefined });
    setFeedbackAttemptId(null);
    setFeedbackReasons([]);
    setFeedbackNote("");
  };
  if (!presence) return null;
  if (!session) return <div className="playground-page"><div className="playground-loading" role="status">Opening a fresh simulated account…</div></div>;
  return (
    <div className="playground-page">
      <div className="playground-toolbar">
        <div>
          <div className="eyebrow">Agent rehearsal</div>
          <div className="playground-title-row"><h1>Playground</h1><span className="playground-world-label">{simulation.worldLabel}</span><span className="environment-chip"><span className="status-dot" /> Sandbox</span></div>
          <p>{simulation.worldDescription} This world is simulated. {presence.name} is real.</p>
          <p className="playground-handle-hint">Agent handle: <strong>{presence.handle}</strong>. Use @mentions in Chat when addressing {presence.name}.</p>
        </div>
        <div className="playground-toolbar-actions">
          <span className="playground-presence"><PresenceLogo channel={presence.channel} definitions={state.channelDefinitions} /> <strong>{presence.name}</strong></span>
          <Button variant="secondary" disabled={busy} onClick={() => setRehearsalOpen((open) => !open)}><Sparkles size={14} /> Rehearse posting <ChevronDown size={14} /></Button>
          <Button variant="ghost" disabled={busy} onClick={() => void run({ type: "resetPlayground", sessionId: session.id })}><RotateCcw size={14} /> Reset</Button>
        </div>
      </div>
      {rehearsalOpen && <section className="original-rehearsal-panel" aria-label="Posting rehearsal controls">
        <div className="rehearsal-mode-menu" role="group" aria-label="Posting rehearsal mode">
          <button type="button" className={rehearsalMode === "consider" ? "selected" : ""} onClick={() => { setRehearsalMode("consider"); setAssignmentDraftId(null); }}><strong>On its own</strong><small>Let {presence.name} decide whether anything is worth originating.</small></button>
          <button type="button" className={rehearsalMode === "topic" ? "selected" : ""} onClick={() => { setRehearsalMode("topic"); setAssignmentDraftId(null); }}><strong>Give a topic</strong><small>Explore a direction while preserving Agent judgment.</small></button>
          <button type="button" className={rehearsalMode === "assign" ? "selected" : ""} onClick={() => setRehearsalMode("assign")}><strong>Give an Assignment</strong><small>Delegate an outcome. The Agent decides how to accomplish it.</small></button>
        </div>
        {(rehearsalMode === "consider" || rehearsalMode === "topic") && <>
          <div><div className="eyebrow">{rehearsalMode === "topic" ? "Topic rehearsal" : "Original post rehearsal"}</div><h2>{rehearsalMode === "topic" ? "What should Alex explore?" : originalLabel}</h2><p>{rehearsalMode === "topic" ? `${presence.name} chooses the angle, evidence, format, and wording. Silence remains possible.` : `Let ${presence.name} decide whether there is something worth publishing in this simulated world.`}</p></div>
          <label>{rehearsalMode === "topic" ? "Topic" : "Optional inspiration"}<textarea aria-label={rehearsalMode === "topic" ? "Topic" : "Optional inspiration"} value={inspiration} onChange={(event) => setInspiration(event.target.value)} placeholder={rehearsalMode === "topic" ? "Why founder-led sales stops scaling" : "Add a topic, link, or thought to consider…"} rows={3} /></label>
          <div className="original-rehearsal-actions"><small>{rehearsalMode === "topic" ? "The topic is context, not a command to publish." : `No inspiration means ${presence.name} considers independently.`}</small><Button variant="primary" disabled={busy} onClick={() => void considerOriginal(inspiration)}><Sparkles size={14} /> {rehearsalMode === "topic" ? "Rehearse" : "Consider now"}</Button></div>
        </>}
        {rehearsalMode === "assign" && <>
          <div><div className="eyebrow">Posting Assignment</div><h2>What do you expect {presence.name} to produce?</h2><p>OpenPresence will show the structured deliverable before work begins. Verified Sandbox publications determine progress.</p></div>
          {!assignmentDraft ? <><label>Assignment instruction<textarea aria-label="Assignment instruction" value={assignmentInstruction} onChange={(event) => setAssignmentInstruction(event.target.value)} placeholder="Produce 3 original X posts about offers, pricing, sales, or execution. Choose your own angles and do not repeat yourself." rows={4} /></label><div className="original-rehearsal-actions"><small>The original instruction stays attached to the Assignment.</small><Button variant="primary" disabled={busy || !assignmentInstruction.trim()} onClick={() => void reviewAssignment()}><Check size={14} /> Review assignment</Button></div></> : <div className="assignment-review" aria-label="Assignment review"><div><span>Deliverable</span><strong>{assignmentDraft.progress.required} original {channelLabel(assignmentDraft.channelId, state.channelDefinitions)} publications</strong></div><div><span>Completion</span><strong>{assignmentDraft.progress.required} verified publications</strong></div><div><span>{presence.name} decides</span><strong>Topics · thesis · evidence · format · wording · timing strategy</strong></div><p>{assignmentDraft.instruction}</p><div className="original-rehearsal-actions"><Button variant="ghost" onClick={() => setAssignmentDraftId(null)}>Adjust</Button><Button variant="primary" disabled={busy} onClick={() => void run({ type: "startAssignment", id: assignmentDraft.id, sessionId: session.id })}><Play size={14} /> Start rehearsal</Button></div></div>}
        </>}
      </section>}
      {(activeAssignment || assignmentDraft) && <section className="assignment-progress-panel" aria-label="Assignment progress"><div><div className="eyebrow">Posting Assignment</div><h2>{(activeAssignment ?? assignmentDraft)?.instruction}</h2></div><div className="assignment-progress-bar"><span style={{ width: `${Math.min(100, (((activeAssignment ?? assignmentDraft)?.progress.verified ?? 0) / Math.max(1, (activeAssignment ?? assignmentDraft)?.progress.required ?? 1)) * 100)}%` }} /></div><div className="assignment-progress-meta"><strong>{(activeAssignment ?? assignmentDraft)?.progress.verified} / {(activeAssignment ?? assignmentDraft)?.progress.required} delivered</strong><span>{(activeAssignment ?? assignmentDraft)?.status === "completed" ? "Completed" : (activeAssignment ?? assignmentDraft)?.status === "blocked" ? "Blocked" : `${(activeAssignment ?? assignmentDraft)?.rejectedCandidates} candidate rejections`}</span></div>{(activeAssignment ?? assignmentDraft)?.status === "blocked" && <p className="assignment-warning">{(activeAssignment ?? assignmentDraft)?.lastOutcome?.message}</p>}{(activeAssignment ?? assignmentDraft)?.status === "active" && <Button variant="secondary" disabled={busy} onClick={() => void run({ type: "workAssignment", id: (activeAssignment ?? assignmentDraft)!.id, sessionId: session.id })}><Play size={14} /> Continue working</Button>}</section>}
      <div className="playground-grid">
          <aside className="playground-rail">
            <section className="playground-panel"><div className="eyebrow">Starting world</div><strong>{simulation.startingStateLabel}</strong><p>Nothing here is live. Simulated history stays in this session.</p><div className="session-status"><span className="status-dot" /> {presence.status === "paused" ? "Paused" : "Awake"}</div></section>
            <section className="playground-panel"><div className="eyebrow">People in the room</div>{state.sandboxActors.filter((actor) => actor.sessionId === session.id).length ? state.sandboxActors.filter((actor) => actor.sessionId === session.id).map((actor) => <div className="playground-actor" key={actor.id}><span className="actor-avatar">{initials(actor.displayName)}</span><span><strong>{actor.displayName}</strong><small>{actor.handle ?? "Audience"}</small></span></div>) : <p className="playground-muted">Add a person below to make the first social event.</p>}</section>
            <section className="playground-panel playground-time"><div className="eyebrow"><Clock3 size={12} /> Virtual time</div><strong>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.virtualNow))}</strong><div className="time-actions"><button onClick={() => void run({ type: "advanceSandboxTime", sessionId: session.id, minutes: 15 })}>+15m</button><button onClick={() => void run({ type: "advanceSandboxTime", sessionId: session.id, minutes: 60 })}>+1h</button><button onClick={() => void run({ type: "advanceSandboxTime", sessionId: session.id, minutes: 1440 })}>Tomorrow</button></div></section>
          </aside>
          <main className="playground-world"><div className="world-heading"><div><div className="eyebrow">{simulation.worldLabel}</div><h2>What {presence.name} can see</h2></div><Button variant="primary" disabled={busy} onClick={() => void wakeOrCheck()}><Sparkles size={14} /> {presence.status === "paused" ? `Wake ${presence.name}` : "Check now"}</Button></div>{objects.length ? <PlaygroundThreadFeed objects={objects} assets={state.assets} presenceId={presence.id} presenceName={presence.name} onSelect={setSelectedObjectId} /> : <div className="world-blank"><MessageSquare size={20} /><p>The simulated {channelLabel(session.channelId, state.channelDefinitions)} world is quiet.</p><small>Check now to let {state.agent?.name ?? "the Agent"} choose a first move, or add an event from the control room.</small></div>}{selectedObject && <section className="perception-panel" aria-label={`What ${presence.name} sees`}><div className="section-heading compact"><div><div className="eyebrow">Perception</div><h3>What {presence.name} sees</h3></div><div className="perception-actions"><button type="button" className="what-sees-button" disabled={busy} onClick={() => void run({ type: "inspectSandboxMedia", sessionId: session.id, objectId: selectedObject.id })}>Inspect media</button><button type="button" className="perception-close" onClick={() => setSelectedObjectId(null)}>Close</button></div></div>{selectedObject.assetRefs?.map((ref) => { const asset = state.assets.find((item) => item.id === ref.assetId); const perception = latestPerception(state.perceptions, ref.assetId); return <div className="perception-item" key={ref.assetId}><strong>{asset?.type === "link" ? asset.provenance.sourceUrl : asset?.type ?? ref.kind}</strong><dl><div><dt>Appears to mean</dt><dd>{perception?.result.interpretation ?? perception?.result.observation ?? "No perception recorded."}</dd></div><div><dt>Uncertainty</dt><dd>{perception?.result.uncertainty ?? "insufficient"}</dd></div><div><dt>Missing context</dt><dd>{perception?.result.missingContext?.join(" ") ?? "None recorded."}</dd></div></dl></div>; })}<p className="perception-boundary">Perception explains what media appears to mean. Taste decides whether it is worth acting on. {presence.name} will not infer an uninspected asset.</p></section>}</main>
          <aside className="playground-activity">
            <div className="activity-rail-heading"><div className="eyebrow">Control room</div><span className="environment-chip">{channelLabel(session.channelId, state.channelDefinitions)} · Sandbox</span></div>
            <section>
              <div className="eyebrow">Now</div>
              {sessionEvents.length ? sessionEvents.slice(0, 3).map((item) => <div className="playground-event" key={item.id}><span className={`event-dot event-${item.tone}`} /><span><strong>{item.title.replaceAll("Jenny", presence.name).replace("Social perception recorded", "Perception recorded").replace("Social plan formed", "Plan formed")}</strong><PlaygroundEventDetail event={item} /></span></div>) : <p className="playground-muted">No decisions yet.</p>}
            </section>
            <section>
              <div className="eyebrow">Needs you</div>
              {reviewCount ? <div className="needs-review"><strong>{reviewCount} action waiting</strong><small>Review before it appears in the simulated world.</small></div> : <p className="playground-muted">Nothing waiting for review.</p>}
            </section>
            <section className="rehearsal-history" aria-label="Original post rehearsal history">
              <div className="eyebrow">Original post rehearsal</div>
              {rehearsalAttempts.length ? rehearsalAttempts.map((attempt, index) => {
                const publication = attempt.publicationId ? state.publications.find((item) => item.id === attempt.publicationId) : undefined;
                const publicationText = publication?.payload && typeof publication.payload === "object" && "text" in publication.payload && typeof publication.payload.text === "string" ? publication.payload.text : "";
                const hasFeedback = Boolean(attempt.preferenceEvidenceIds?.length);
                const isNoOp = attempt.result === "no_op";
                const submittedContext = attempt.stimulus.type === "text" ? attempt.stimulus.value?.trim() : "";
                const contextExpanded = expandedRehearsalId === attempt.id;
                return <div className="rehearsal-attempt" key={attempt.id}>
                  <div className="rehearsal-attempt-heading"><strong>Attempt {rehearsalAttempts.length - index}</strong><span>{isNoOp ? "Silence" : attempt.result === "published" ? "Published in Sandbox" : attempt.result === "review" ? "Waiting for review" : attempt.result === "manual" ? "Waiting for manual relay" : attempt.result}</span></div>
                  <div className="rehearsal-context">
                    <button type="button" className="rehearsal-context-toggle" aria-label={submittedContext ? "View what you submitted" : "View consideration context"} aria-expanded={contextExpanded} aria-controls={`rehearsal-context-${attempt.id}`} onClick={() => setExpandedRehearsalId(contextExpanded ? null : attempt.id)}>
                      <span>{submittedContext ? "View what you submitted" : "View consideration context"}</span>
                      {submittedContext && <small className="rehearsal-context-preview">{submittedContext}</small>}
                    </button>
                    {contextExpanded && <div id={`rehearsal-context-${attempt.id}`} className="rehearsal-context-detail">
                      <div className="eyebrow">Operator context</div>
                      {submittedContext ? <p>{submittedContext}</p> : <p>No inspiration was submitted. {presence.name} considered the simulated world independently.</p>}
                      <small>Considered as context only. It was not added to the simulated world or treated as a command to publish.</small>
                    </div>}
                  </div>
                  {publicationText && <p>{publicationText}</p>}
                  {!hasFeedback && attempt.result !== "running" && <div className="rehearsal-feedback">
                    <span>{isNoOp ? "Was the silence right?" : `Does this feel right for ${presence.name}?`}</span>
                    <div className="rehearsal-feedback-actions">
                      <Button variant="ghost" disabled={busy} onClick={() => isNoOp ? void saveFeedback(attempt.id, "good_silence") : void saveFeedback(attempt.id, "fits")}>{isNoOp ? "Good call" : "Fits"}</Button>
                      <Button variant="ghost" disabled={busy} onClick={() => { setFeedbackAttemptId(attempt.id); setFeedbackReasons([]); setFeedbackNote(""); }}>{isNoOp ? "I expected something" : "Doesn't fit"}</Button>
                    </div>
                    {feedbackAttemptId === attempt.id && <div className="rehearsal-feedback-detail">
                      <small>What stood out? Optional</small>
                      <div className="rehearsal-reasons">{preferenceReasonOptions.map((reason) => <button type="button" className={feedbackReasons.includes(reason.id) ? "selected" : ""} key={reason.id} onClick={() => setFeedbackReasons((items) => items.includes(reason.id) ? items.filter((item) => item !== reason.id) : [...items, reason.id])}>{reason.label}</button>)}</div>
                      <textarea aria-label="Calibration note" value={feedbackNote} onChange={(event) => setFeedbackNote(event.target.value)} placeholder="Add a note if useful…" rows={2} />
                      <Button variant="secondary" disabled={busy} onClick={() => void saveFeedback(attempt.id, isNoOp ? "expected_action" : "does_not_fit")}>Save preference evidence</Button>
                    </div>}
                  </div>}
                  {hasFeedback && <small className="rehearsal-saved">Saved as preference evidence. This does not change {presence.name}&apos;s identity by itself.</small>}
                </div>;
              }) : <p className="playground-muted">No original-post considerations yet.</p>}
              {rehearsalAttempts.length > 0 && <Button variant="ghost" disabled={busy} onClick={() => void considerOriginal()}>Try another</Button>}
            </section>
            <section>
              <div className="eyebrow">Add to {simulation.worldLabel}</div>
              <p className="playground-form-intro">Place a channel-native situation into the world {presence.name} can see.</p>
              <SandboxEventForm key={`${presence.id}:${session.id}`} sessionId={session.id} presenceName={presence.name} simulation={simulation} assetKinds={assetKinds} actors={actors} targetObjects={targetObjects} mutate={mutate} />
            </section>
          </aside>
      </div>
    </div>
  );
}

function TeachView({
  state,
  mutate,
  setView,
}: {
  state: OpenPresenceState;
  mutate: Mutate;
  setView: (view: View) => void;
}) {
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [contextOpen, setContextOpen] = useState(true);
  const [sending, setSending] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const agent = state.agent!;
  const conversation =
    state.conversations.find(
      (item) => item.id === state.activeConversationId,
    ) ?? state.conversations[0];
  const messages = conversation?.messages ?? [];
  const model = state.modelProfiles.find((item) => item.agentId === agent.id);
  const modelName = modelDisplayName(model);
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [conversation?.id, messages.length, pendingMessage, sending]);
  const addAttachment = (event: React.ChangeEvent<HTMLInputElement>) => {
    const name = event.target.files?.[0]?.name;
    if (name)
      setAttachments((items) =>
        items.includes(name) ? items : [...items, name],
      );
    event.target.value = "";
  };
  const send = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!message.trim() || sending || sendingRef.current) return;
    sendingRef.current = true;
    const outgoing = attachments.length
      ? `${message}\n\nAttached context: ${attachments.join(", ")}`
      : message;
    setMessage("");
    setAttachments([]);
    setPendingMessage(outgoing);
    setSending(true);
    try {
      const next = await mutate({
        type: "sendMessage",
        content: outgoing,
        conversationId: conversation?.id,
      });
      if (!next) setPendingMessage(null);
    } finally {
      setSending(false);
      setPendingMessage(null);
      sendingRef.current = false;
    }
  };
  return (
    <div className="page page-chat">
      <button
        type="button"
        className="context-toggle"
        aria-label={
          contextOpen ? "Hide context sidebar" : "Show context sidebar"
        }
        aria-expanded={contextOpen}
        title={contextOpen ? "Hide context sidebar" : "Show context sidebar"}
        aria-controls="chat-context-sidebar"
        onClick={() => setContextOpen((open) => !open)}
      >
        {contextOpen ? (
          <PanelRightClose size={17} />
        ) : (
          <PanelRightOpen size={17} />
        )}
      </button>
      <div
        className={`chat-layout ${contextOpen ? "context-open" : "context-collapsed"}`}
      >
        <section className="chat-thread">
          <div className="chat-history">
            {messages.length === 0 && !pendingMessage ? (
              <div className="chat-blank">
                <div className="blank-glyph">
                  <PresenceGlyph accent={agent.accent} />
                </div>
                <h2>Teach the Agent through conversation.</h2>
                <p>
                  Tell {agent.name} what to notice, protect, pursue, or leave
                  alone. This transcript stays with {agent.name}; durable
                  meaning belongs in Brain.
                </p>
                <div className="blank-suggestions">
                  <button
                    onClick={() => setMessage("Become less promotional.")}
                  >
                    Become less promotional.
                  </button>
                  <button
                    onClick={() =>
                      setMessage(
                        "Schedule something useful every Tuesday morning.",
                      )
                    }
                  >
                    Schedule something useful every Tuesday morning.
                  </button>
                  <button onClick={() => setMessage("Focus on AI founders.")}>
                    Focus on AI founders.
                  </button>
                </div>
              </div>
            ) : (
              messages.map((item) => (
                <div key={item.id} className={`chat-message ${item.role}`}>
                  <div className="message-avatar">
                    {item.role === "agent" ? (
                      <PresenceGlyph accent={agent.accent} />
                    ) : (
                      initials("You")
                    )}
                  </div>
                  <div>
                    <div className="message-meta">
                      {item.role === "agent" ? agent.name : "You"}
                      <span>{formatTime(item.timestamp)}</span>
                    </div>
                    <p>{item.content}</p>
                    {item.change && (
                      <button
                        className="inline-change"
                        onClick={() => setView("brain")}
                      >
                        <Sparkles size={13} /> {item.change}{" "}
                        <ChevronRight size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
            {pendingMessage && (
              <>
                <div className="chat-message operator optimistic-message">
                  <div className="message-avatar">{initials("You")}</div>
                  <div>
                    <div className="message-meta">You<span>{formatTime(new Date().toISOString())}</span></div>
                    <p>{pendingMessage}</p>
                  </div>
                </div>
                {sending && <ChatThinkingMessage name={agent.name} accent={agent.accent} />}
              </>
            )}
            <div ref={historyEndRef} aria-hidden="true" className="chat-history-end" />
          </div>
          <div className="attachment-list">
            {attachments.map((name) => (
              <span key={name}>
                {name}
                <button
                  aria-label={`Remove ${name}`}
                  onClick={() =>
                    setAttachments((items) =>
                      items.filter((item) => item !== name),
                    )
                  }
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
          <form className="chat-composer" onSubmit={send}>
            <label className="attach-button" aria-label="Attach context">
              <Plus size={16} />
              <input type="file" hidden onChange={addAttachment} />
            </label>
            <textarea
              aria-label="Message your Presence"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={sending}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder={sending ? `${agent.name} is thinking…` : `Tell ${agent.name} what to change…`}
              rows={3}
            />
            <button
              className="send-button"
              aria-label="Send message"
              type="submit"
              disabled={sending}
            >
              {sending ? <LoaderCircle size={17} className="spin" /> : <Send size={17} />}
            </button>
          </form>
          <div className="composer-hint">
            Enter to send <span>·</span> Shift + Enter for a new line
          </div>
        </section>
        {contextOpen && (
          <ContextSidebar
            id="chat-context-sidebar"
            state={state}
            modelName={modelName}
            attachments={attachments}
            onAddAttachment={addAttachment}
          />
        )}
      </div>
    </div>
  );
}

function OldChatView({
  state,
  mutate,
  setView,
}: {
  state: OpenPresenceState;
  mutate: Mutate;
  setView: (view: View) => void;
}) {
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const agent = state.agent!;
  const conversation =
    state.conversations.find(
      (item) => item.id === state.activeConversationId,
    ) ?? state.conversations[0];
  const messages = conversation?.messages ?? [];
  const model = state.modelProfiles.find((item) => item.agentId === agent.id);
  const send = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!message.trim()) return;
    const outgoing = attachments.length
      ? `${message}\n\nAttached context: ${attachments.join(", ")}`
      : message;
    setMessage("");
    setAttachments([]);
    await mutate({
      type: "sendMessage",
      content: outgoing,
      conversationId: conversation?.id,
    });
  };
  return (
    <div className="page page-chat">
      <div className="page-heading chat-heading">
        <div>
          <SectionEyebrow>
            {messages.length
              ? "Working conversation"
              : "Conversation as configuration"}
          </SectionEyebrow>
          <h1>
            {messages.length
              ? (conversation?.title ?? `Conversation with ${agent.name}`)
              : `Talk to ${agent.name}.`}
          </h1>
          <p className="muted">
            {messages.length
              ? `${agent.name} · ${model?.model ?? "Default model"} · Agent-wide context`
              : "Start a conversation. Shape its personality, mission, taste, and way of showing up."}
          </p>
        </div>
        <div className="heading-actions">
          <label className="model-picker">
            Model
            <select
              aria-label="Model"
              value={model?.model ?? "claude"}
              onChange={(event) =>
                mutate({ type: "setModel", model: event.target.value })
              }
            >
              <option value="claude">Claude</option>
              <option value="gpt-5">GPT-5</option>
            </select>
          </label>
          <Button
            variant="primary"
            onClick={() => mutate({ type: "newConversation" })}
          >
            <Plus size={14} /> New conversation
          </Button>
        </div>
      </div>
      <div className="chat-layout">
        <section className="chat-thread">
          <div className="chat-history">
            {messages.length === 0 ? (
              <div className="chat-blank">
                <div className="blank-glyph">
                  <PresenceGlyph accent={agent.accent} />
                </div>
                <h2>A mind becomes useful through conversation.</h2>
                <p>
                  Tell {agent.name} what it should notice, protect, pursue, or
                  leave alone. This conversation stays with {agent.name};
                  durable meaning belongs in Brain.
                </p>
                <div className="blank-suggestions">
                  <button
                    onClick={() =>
                      setMessage("What should you become known for?")
                    }
                  >
                    What should you become known for?
                  </button>
                  <button
                    onClick={() =>
                      setMessage(
                        "Schedule something useful every Tuesday morning.",
                      )
                    }
                  >
                    Schedule something useful every Tuesday morning.
                  </button>
                </div>
              </div>
            ) : (
              messages.map((item) => (
                <div key={item.id} className={`chat-message ${item.role}`}>
                  <div className="message-avatar">
                    {item.role === "agent" ? (
                      <PresenceGlyph accent={agent.accent} />
                    ) : (
                      initials("You")
                    )}
                  </div>
                  <div>
                    <div className="message-meta">
                      {item.role === "agent" ? agent.name : "You"}
                      <span>{formatTime(item.timestamp)}</span>
                    </div>
                    <p>{item.content}</p>
                    {item.change && (
                      <button
                        className="inline-change"
                        onClick={() => setView("brain")}
                      >
                        <Sparkles size={13} /> {item.change}{" "}
                        <ChevronRight size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="attachment-list">
            {attachments.map((name) => (
              <span key={name}>
                {name}
                <button
                  aria-label={`Remove ${name}`}
                  onClick={() =>
                    setAttachments((items) =>
                      items.filter((item) => item !== name),
                    )
                  }
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
          <form className="chat-composer" onSubmit={send}>
            <label className="attach-button" aria-label="Attach context">
              <Plus size={16} />
              <input
                type="file"
                hidden
                onChange={(event) => {
                  const name = event.target.files?.[0]?.name;
                  if (name) setAttachments((items) => [...items, name]);
                }}
              />
            </label>
            <textarea
              aria-label="Message your Presence"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder={`Tell ${agent.name} what to change…`}
              rows={3}
            />
            <button
              className="send-button"
              aria-label="Send message"
              type="submit"
            >
              <Send size={17} />
            </button>
          </form>
          <div className="composer-hint">
            Enter to send <span>·</span> Shift + Enter for a new line
          </div>
        </section>
        {messages.length === 0 ? (
          <aside className="chat-aside">
            <SectionEyebrow>Try saying</SectionEyebrow>
            <div className="suggestion-list">
              <button
                onClick={() => setMessage("Don't use em dashes anymore.")}
              >
                <span>“</span>Don&apos;t use em dashes anymore.
                <ChevronRight size={14} />
              </button>
              <button
                onClick={() =>
                  setMessage("Schedule something useful every Tuesday morning.")
                }
              >
                <span>“</span>Schedule something useful every Tuesday.
                <ChevronRight size={14} />
              </button>
              <button
                onClick={() => setMessage("Put this Presence into Ghost mode.")}
              >
                <span>“</span>Put this Presence into Ghost mode.
                <ChevronRight size={14} />
              </button>
            </div>
          </aside>
        ) : state.changeSets.length > 0 ? (
          <aside className="chat-aside context-panel">
            <SectionEyebrow>Context & changes</SectionEyebrow>
            <h3>
              {state.changeSets.length} durable change
              {state.changeSets.length > 1 ? "s" : ""}
            </h3>
            {state.changeSets.slice(0, 3).map((change) => (
              <div className="context-change" key={change.id}>
                <strong>{change.summary}</strong>
                <small>{formatTime(change.createdAt)}</small>
              </div>
            ))}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function PresenceChatView({
  state,
  mutate,
}: {
  state: OpenPresenceState;
  mutate: Mutate;
}) {
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<SandboxAssetInput[]>([]);
  const [link, setLink] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const presence = state.presence ?? state.presences[0]!;
  const session = state.presenceChatSessions.find((item) => item.presenceId === presence.id);
  const messages = session?.messages ?? [];
  useEffect(() => {
    if (!session) void mutate({ type: "newPresenceChatSession", presenceId: presence.id });
  }, [mutate, presence.id, session]);
  const addFile = (file: File) => {
    if (attachments.length >= 4 || file.size > 1_500_000) return;
    const kind = file.type === "image/gif" ? "gif" : file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : "document";
    const reader = new FileReader();
    reader.onload = () => setAttachments((items) => [...items, { name: file.name, kind, mimeType: file.type, dataUrl: typeof reader.result === "string" ? reader.result : undefined }]);
    reader.readAsDataURL(file);
  };
  const addLink = () => {
    const sourceUrl = link.trim();
    if (!sourceUrl || attachments.length >= 4) return;
    try { new URL(sourceUrl); } catch { return; }
    setAttachments((items) => [...items, { name: sourceUrl, kind: "link", sourceUrl }]);
    setLink("");
  };
  const send = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!message.trim() || !session || sending || sendingRef.current) return;
    sendingRef.current = true;
    const outgoing = message.trim();
    setMessage("");
    setAttachments([]);
    setPendingMessage(outgoing);
    setSending(true);
    try {
      const next = await mutate({ type: "sendPresenceChatMessage", presenceId: presence.id, sessionId: session.id, content: outgoing, attachments });
      if (!next) setPendingMessage(null);
    } finally {
      setSending(false);
      setPendingMessage(null);
      sendingRef.current = false;
    }
  };
  return (
    <div className="page page-chat">
      <div className="page-heading chat-heading">
        <div>
          <SectionEyebrow>Chat · {channelLabel(presence.channel, state.channelDefinitions)}</SectionEyebrow>
          <h1>See {presence.name} in the feed.</h1>
          <p className="muted">
            Rehearse how {presence.name} responds to a post or reply in this
            channel.
          </p>
        </div>
        <div className="heading-actions">
          <span className="scope-summary">{channelLabel(presence.channel, state.channelDefinitions)} · {presence.name}</span>
        </div>
      </div>
      <div className="chat-layout">
        <section className="chat-thread">
          <div className="chat-history">
            {messages.length === 0 && !pendingMessage ? (
              <div className="chat-blank">
                <div className="blank-glyph">
                  <PresenceGlyph accent={presence.accent} />
                </div>
                <h2>Start the rehearsal.</h2>
                <p>
                  Write a post or reply that {presence.name} might encounter in {channelLabel(presence.channel, state.channelDefinitions)}.
                  Nothing publishes or changes the Agent during this rehearsal.
                </p>
                <div className="blank-suggestions">
                  <button onClick={() => setMessage("I just shipped a small tool and learned more from the edge cases than the happy path.")}>Share a field note</button>
                  <button onClick={() => setMessage("What do you think about building an audience before building a product?")}>Ask a real question</button>
                  <button onClick={() => setMessage("I disagree. Consistency matters more than originality.")}>Push back</button>
                </div>
              </div>
            ) : (
              messages.map((item) => (
                <article key={item.id} className={`social-card presence-chat-card ${item.role === "presence" ? "agent-authored thread-reply-card" : ""}`}>
                  <div className="social-card-meta">
                    {item.role === "presence" ? <PresenceGlyph accent={presence.accent} /> : <span className="actor-avatar">{initials("You")}</span>}
                    <span>
                      <strong>{item.role === "presence" ? presence.name : "You"}</strong>
                      <small>{item.role === "presence" ? `${presence.handle} · Reply` : "@you · Post"}</small>
                    </span>
                    <time>{formatTime(item.timestamp)}</time>
                  </div>
                  <small className="thread-context">{item.role === "presence" ? `↳ Replying in ${channelLabel(presence.channel, state.channelDefinitions)}` : `Posted to ${channelLabel(presence.channel, state.channelDefinitions)}`}</small>
                  <p>{item.content}</p>
                  {item.attachments?.map((attachment) => (
                    <div className="presence-chat-attachment" key={attachment.id}>
                      {attachment.dataUrl && attachment.kind !== "document" ? <Image unoptimized width={180} height={110} src={attachment.dataUrl} alt={`Attached ${attachment.kind}`} /> : <span className="social-link-asset">{attachment.sourceUrl ?? attachment.name}</span>}
                      <details>
                        <summary>What {presence.name} sees</summary>
                        <p>{attachment.perception?.observation ?? "Not inspected. The Presence must not infer this asset's contents."}</p>
                        <small>Uncertainty: {attachment.perception?.uncertainty ?? "insufficient"}{attachment.perception?.missingContext?.length ? ` · ${attachment.perception.missingContext.join(" ")}` : ""}</small>
                      </details>
                    </div>
                  ))}
                  {item.role === "presence" && <div className="presence-chat-proof"><Check size={13} /> Public-self response · not published</div>}
                </article>
              ))
            )}
            {pendingMessage && (
              <>
                <article className="social-card presence-chat-card optimistic-message">
                  <div className="social-card-meta">
                    <span className="actor-avatar">{initials("You")}</span>
                    <span><strong>You</strong><small>@you · Post</small></span>
                    <time>{formatTime(new Date().toISOString())}</time>
                  </div>
                  <small className="thread-context">Posted to {channelLabel(presence.channel, state.channelDefinitions)}</small>
                  <p>{pendingMessage}</p>
                </article>
                {sending && <ChatThinkingMessage name={presence.name} accent={presence.accent} feed />}
              </>
            )}
          </div>
          <div className="attachment-list">
            {attachments.map((attachment) => (
              <span key={attachment.name}>
                {attachment.name}
                <button
                  aria-label={`Remove ${attachment.name}`}
                  onClick={() => setAttachments((items) => items.filter((item) => item.name !== attachment.name))}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
          <form className="chat-composer" onSubmit={send}>
            <label className="attach-button" aria-label="Attach asset">
              <Plus size={16} />
              <input
                type="file"
                hidden
                accept="image/*,video/*,.pdf,.doc,.docx,.csv"
                onChange={(event) => { const file = event.target.files?.[0]; if (file) addFile(file); event.target.value = ""; }}
              />
            </label>
            <textarea
              aria-label={`Post for ${presence.name} to encounter`}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={sending || !session}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder={sending ? `${presence.name} is considering the post…` : `Write a post for ${presence.name} to encounter…`}
              rows={3}
            />
            <button
              className="send-button"
              aria-label="Send message"
              type="submit"
            >
              {sending ? <LoaderCircle size={17} className="spin" /> : <Send size={17} />}
            </button>
          </form>
          <div className="presence-chat-link-row"><input aria-label="Link to inspect" placeholder="Paste a link to inspect" value={link} onChange={(event) => setLink(event.target.value)} /><button type="button" onClick={addLink} disabled={!link.trim() || attachments.length >= 4}>Add link</button></div>
          <div className="composer-hint">
            Enter to post <span>·</span> Shift + Enter for a new line <span>·</span> Private rehearsal · nothing publishes or teaches the Agent
          </div>
        </section>
        <aside className="chat-aside context-panel presence-chat-aside">
          <SectionEyebrow>Feed context</SectionEyebrow>
          <h3>{presence.name} as encountered in public</h3>
          <p className="muted">{presence.brief.purpose}</p>
          <div className="presence-chat-boundary"><span className="status-dot" /> Private thread · not published</div>
          <small>{presence.name} is responding from the selected channel context, Public Self, relationships, and perception when needed. Use Teach for durable changes.</small>
          <Button variant="secondary" onClick={() => void mutate({ type: "newPresenceChatSession", presenceId: presence.id })}><Plus size={14} /> New rehearsal</Button>
        </aside>
      </div>
    </div>
  );
}

function ChatThinkingMessage({ name, accent, feed = false }: { name: string; accent: string; feed?: boolean }) {
  if (!feed) {
    return (
      <div className="chat-message agent chat-thinking-message" role="status" aria-live="polite">
        <div className="message-avatar"><PresenceGlyph accent={accent} /></div>
        <div>
          <div className="message-meta">{name}<span>Now</span></div>
          <div className="thinking-copy">
            <span>Thinking</span>
            <span className="thinking-dots" aria-hidden="true"><i /> <i /> <i /></span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <article className="social-card presence-chat-card chat-thinking-message" role="status" aria-live="polite">
      <div className="social-card-meta">
        <PresenceGlyph accent={accent} />
        <span><strong>{name}</strong><small>Public self · Replying</small></span>
        <time>Now</time>
      </div>
      <small className="thread-context">↳ Considering a reply in the feed</small>
      <div className="thinking-copy">
        <span>Considering</span>
        <span className="thinking-dots" aria-hidden="true"><i /> <i /> <i /></span>
      </div>
      <div className="presence-chat-proof"><Circle size={11} fill="currentColor" /> Nothing publishes from rehearsal</div>
    </article>
  );
}

void LegacyAppShell;
void OldChatView;
void TeachView;

function LiveView({
  state,
  mutate,
  setView,
  pendingOperation,
}: {
  state: OpenPresenceState;
  mutate: Mutate;
  setView?: (view: View) => void;
  pendingOperation?: string | null;
}) {
  const selected = state.presence;
  const presenceName = selected?.name ?? "this Presence";
  const paused = selected?.status === "paused";
  const waking = pendingOperation === "wakePresence";
  const checking = pendingOperation === "runPulse";
  const activity = deriveActivitySummary(state, selected?.id);
  const [selectedContext, setSelectedContext] = useState<MirrorObject | null>(null);
  const presenceCopy = (text: string) => text.replaceAll("Jenny", presenceName).replaceAll(state.agent?.name ?? "Jenny", presenceName);
  const activityEnvironment: PresenceEnvironment = selected?.environment ?? "live";
  const activitySessionIds = new Set(
    state.playgroundSessions
      .filter((session) => session.presenceId === selected?.id && session.channelId === selected?.channel && session.status !== "completed")
      .map((session) => session.id),
  );
  const isScopedMirror = (item: MirrorObject) => {
    if (!selected || item.presenceId !== selected.id || item.channelId !== selected.channel) return false;
    if (activityEnvironment === "sandbox") return item.environment === "sandbox" && Boolean(item.sessionId && activitySessionIds.has(item.sessionId));
    return item.environment !== "sandbox" && !item.sessionId;
  };
  const visibleEvents = state.events.filter(
    (item) => item.presenceId === selected?.id && (activityEnvironment === "sandbox" ? (!item.sessionId || activitySessionIds.has(item.sessionId)) : !item.sessionId),
  );
  const activityEvents = visibleEvents.filter(isActivityDecisionEvent).filter((item, index, events) => {
    const itemTime = new Date(item.time).getTime();
    return !events.slice(0, index).some((previous) => {
      const previousTime = new Date(previous.time).getTime();
      return previous.type === item.type &&
        previous.title === item.title &&
        previous.detail === item.detail &&
        previous.sessionId === item.sessionId &&
        previous.sourceObjectId === item.sourceObjectId &&
        Number.isFinite(itemTime) &&
        Number.isFinite(previousTime) &&
        Math.abs(previousTime - itemTime) <= 10_000;
    });
  });
  const objectForReference = (reference?: { type: string; id: string }, sessionId?: string) =>
    reference
      ? state.mirrorObjects.find(
          (item) =>
            item.presenceId === selected?.id &&
            item.channelId === selected?.channel &&
            isScopedMirror(item) &&
            (!sessionId || item.sessionId === sessionId) &&
            item.externalRef.type === reference.type &&
            item.externalRef.id === reference.id,
        )
      : undefined;
  const contextForEvent = (event: OpenPresenceState["events"][number]) => {
    const explicit = event.sourceObjectId
      ? state.mirrorObjects.find((item) => item.id === event.sourceObjectId)
      : undefined;
    const source = explicit ?? (() => {
      const intent = event.intentId
        ? state.socialIntents.find((item) => item.id === event.intentId)
        : undefined;
      const execution = event.executionId
        ? state.executions.find((item) => item.id === event.executionId)
        : event.outcomeId
          ? (() => {
              const outcome = state.outcomes.find((item) => item.id === event.outcomeId);
              return outcome?.executionId
                ? state.executions.find((item) => item.id === outcome.executionId)
                : undefined;
            })()
          : undefined;
      return objectForReference(intent?.target ?? execution?.target, event.sessionId);
    })();
    if (!source) return undefined;
    if (["like", "reaction", "repost"].includes(source.objectType) && source.parentExternalRef) {
      return objectForReference(source.parentExternalRef, source.sessionId) ?? source;
    }
    return source;
  };
  const decisionTraceForEvent = (item: OpenPresenceState["events"][number]) => {
    const intent = item.intentId ? state.socialIntents.find((entry) => entry.id === item.intentId) : undefined;
    const execution = item.executionId
      ? state.executions.find((entry) => entry.id === item.executionId)
      : item.outcomeId
        ? (() => {
            const outcome = state.outcomes.find((entry) => entry.id === item.outcomeId);
            return outcome?.executionId ? state.executions.find((entry) => entry.id === outcome.executionId) : undefined;
          })()
        : undefined;
    const outcome = execution ? state.outcomes.find((entry) => entry.executionId === execution.id) : undefined;
    const actionRecord = intent ? state.actions.find((entry) => entry.socialIntentId === intent.id) : undefined;
    const standingIntent = intent?.standingIntentId ? state.standingIntents.find((entry) => entry.id === intent.standingIntentId) : undefined;
    const context = contextForEvent(item);
    const observed = context?.content?.text
      ? `${context.author?.displayName ?? "Someone"} · “${context.content.text.slice(0, 150)}${context.content.text.length > 150 ? "…" : ""}”`
      : standingIntent
        ? `Standing intention · “${standingIntent.instruction.slice(0, 150)}${standingIntent.instruction.length > 150 ? "…" : ""}”`
        : item.title === "Pulse completed"
          ? "The Presence checked its current channel context."
          : item.title === "Social Mirror updated"
            ? "New channel context became available to the Presence."
            : "No linked world object was recorded for this event.";
    const isSilence = actionRecord?.intent === "no_op" || /held|silence|off/i.test(`${item.title} ${item.detail}`);
    const judgment = intent
      ? isSilence
        ? "Silence · no worthwhile action was selected"
        : `Selected ${formatActivityAffordance(intent.affordance)}${standingIntent ? " from the standing intention" : ""}`
      : item.type === "execution"
        ? "The selected Social Intent moved into delivery."
        : item.type === "system"
          ? "Observation recorded; no public action was selected yet."
          : item.detail;
    const delivery = execution
      ? `${execution.status.replaceAll("-", " ")} · ${execution.mode}${outcome ? ` · outcome ${outcome.status}` : ""}`
      : intent
        ? "No execution created"
        : "No delivery selected";
    return { observed, judgment, delivery };
  };
  const relevantExecution = state.executions
    .filter((item) => !selected?.id || (item.presenceId === selected.id && (activityEnvironment === "sandbox" ? item.environment === "sandbox" || (!item.environment && Boolean(item.sessionId && activitySessionIds.has(item.sessionId))) : item.environment !== "sandbox" && !item.sessionId)))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .find((item) => ["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued", "claimed", "executing"].includes(item.status));
  const relevantIntent = relevantExecution ? state.socialIntents.find((item) => item.id === relevantExecution.socialIntentId) : undefined;
  const actionContext = relevantIntent?.target
    ? state.mirrorObjects.find((item) => isScopedMirror(item) && item.externalRef.id === relevantIntent.target?.id)
    : undefined;
  const actionName = formatActivityAffordance(relevantExecution?.affordance ?? relevantIntent?.affordance);
  const actionSnippet = actionContext?.content?.text?.trim();
  const currentDetail = relevantExecution && actionContext
    ? relevantExecution.status === "awaiting-review"
      ? `A ${actionName} for ${actionContext.author?.handle ?? actionContext.author?.displayName ?? "this post"} is ready for your review.`
      : `Preparing a ${actionName} for ${actionContext.author?.handle ?? actionContext.author?.displayName ?? "this post"}.`
    : activity.current.label === "Preparing to act"
      ? `${actionName} is moving toward delivery.`
      : presenceCopy(activity.current.detail).replace("execution envelope", "delivery");
  const presenceScope = selected ? `${channelLabel(selected.channel, state.channelDefinitions)} · ${activityEnvironment === "sandbox" ? "Sandbox" : "Live"}` : "No Presence selected";
  return (
    <div className="page activity-page">
      <div className="page-heading activity-heading">
        <div>
          <SectionEyebrow>Activity</SectionEyebrow>
          <h1>{presenceName}, right now.</h1>
          <p className="muted">
            A clear view of what {presenceName} has seen, decided, and done.
          </p>
        </div>
        <div className="heading-actions">
          <span className="scope-summary">{presenceScope}</span>
          {paused ? (
            <Button
              onClick={() => mutate({ type: "wakePresence", presenceId: selected?.id })}
              variant="primary"
              disabled={waking}
            >
              <Play size={15} /> {waking ? `Waking ${presenceName}…` : `Wake up ${presenceName}`}
            </Button>
          ) : (
            <>
              <Button
                onClick={() => mutate({ type: "runPulse", presenceId: selected?.id })}
                variant="primary"
                disabled={checking}
                title="Look at the channel now and decide whether anything is worth doing."
              >
                <Play size={15} /> {checking ? "Checking now…" : "Check now"}
              </Button>
              <Button
                onClick={() => mutate({ type: "setPresence", patch: { status: "paused" } })}
                variant="secondary"
              >
                <Pause size={15} /> Pause
              </Button>
            </>
          )}
        </div>
      </div>
      {activity.needsAttention.count > 0 && (
        <section className="activity-attention" aria-label="Needs your attention">
          <div className="activity-attention-icon"><CircleAlert size={19} /></div>
          <div className="activity-attention-copy">
            <SectionEyebrow>Needs your attention</SectionEyebrow>
            <h2>{activity.needsAttention.count} action{activity.needsAttention.count === 1 ? "" : "s"} waiting for you.</h2>
            <p>Review the latest decision before it is delivered. Your approval changes execution, not {presenceName}&apos;s judgment.</p>
          </div>
          <a className="button button-secondary activity-attention-link" href="#decision-and-action">Open review</a>
        </section>
      )}
      <div className="activity-main-grid">
        <div className="activity-left-column">
          <MirrorPanel state={state} filter={selected?.id ?? "all"} channelId={selected?.channel} environment={activityEnvironment} sessionIds={activitySessionIds} />
          <section className="event-stream activity-log">
            <div className="section-heading">
              <div>
                <SectionEyebrow>Recent activity</SectionEyebrow>
                <h2>What {presenceName} decided</h2>
              </div>
              <span className="quiet-label">{paused ? "Presence asleep" : `${activityEvents.length} recorded event${activityEvents.length === 1 ? "" : "s"}`}</span>
            </div>
            {activityEvents.length === 0 ? (
              <EmptyState
                title="No Presence decisions yet"
                body={paused ? `${presenceName} is asleep. Wake this Presence to begin a first attention cycle.` : "Activity will show what this Presence observed, chose, and delivered. Settings changes stay in Settings."}
                action={
                  <Button
                    onClick={() => mutate(paused ? { type: "wakePresence", presenceId: selected?.id } : { type: "runPulse", presenceId: selected?.id })}
                    variant="secondary"
                    disabled={waking || checking}
                    title={paused ? `Wake up ${presenceName} and begin a first attention cycle.` : "Look at the channel now."}
                  >
                    <Play size={14} /> {paused ? (waking ? `Waking ${presenceName}…` : `Wake up ${presenceName}`) : (checking ? "Checking now…" : "Check now")}
                  </Button>
                }
              />
            ) : (
              <div className="event-list">
                {activityEvents.map((item) => (
                  <button className="event-row event-row-button" type="button" key={item.id} data-event-id={item.id} onClick={() => { const context = contextForEvent(item); if (context) setSelectedContext(context); }} disabled={!contextForEvent(item)} aria-label={contextForEvent(item) ? `View the post ${presenceName} considered` : undefined}>
                    <div className={`event-icon tone-${item.tone}`}>
                      {item.type === "execution" ? <ArrowUpRight size={15} /> : item.type === "learning" ? <Sparkles size={15} /> : item.type === "memory" ? <Brain size={15} /> : <Circle size={9} fill="currentColor" />}
                    </div>
                    <div className="event-copy">
                      <div className="event-title">{presenceCopy(item.title)}<span>{formatTime(item.time)}</span></div>
                      <ActivityEventDetail text={presenceCopy(item.detail)} />
                      <ActivityDecisionTrace trace={decisionTraceForEvent(item)} />
                      {contextForEvent(item) && <div className="event-context-preview"><span aria-label={`Reply context from ${contextForEvent(item)!.author?.displayName ?? "this observed post"}`}>↳</span><strong>{(contextForEvent(item)!.content?.text ?? "Open the observed post").slice(0, 112)}{(contextForEvent(item)!.content?.text?.length ?? 0) > 112 ? "…" : ""}</strong><em>View post</em></div>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
        <aside className="activity-side-column">
          <section className="activity-status-panel" aria-label="Operating status">
            <div className="activity-status-heading">
              <div>
                <SectionEyebrow>Operating status</SectionEyebrow>
                <h2>{paused ? "Asleep" : "On watch"}</h2>
              </div>
              <span className={`live-pill ${paused ? "activity-pill-paused" : ""}`}><span className="status-dot" /> {paused ? "Asleep" : "Live"}</span>
            </div>
            <div className={`activity-status-block activity-status-${activity.current.tone}`}>
              <SectionEyebrow>Now</SectionEyebrow>
              <h3>{activity.current.label}</h3>
              <p>{currentDetail}</p>
              {actionContext && (
                <button type="button" className="status-context-button" onClick={() => setSelectedContext(actionContext)}>
                  <span>{actionSnippet ? `“${actionSnippet.slice(0, 86)}${actionSnippet.length > 86 ? "…" : ""}”` : "View the observed post"}</span>
                  <strong>View post</strong>
                </button>
              )}
              <small>Last pulse: {activity.lastPulseAt ? formatTime(activity.lastPulseAt) : "Never"}</small>
            </div>
            <div className="activity-status-block">
              <SectionEyebrow>Next</SectionEyebrow>
              <h3>{activity.nextAttention.label}</h3>
              <p>{presenceCopy(activity.nextAttention.detail)}</p>
              <small>{activity.nextIntent.label} · {presenceCopy(activity.nextIntent.detail)}</small>
            </div>
            <div className="activity-rhythm-block">
              <SectionEyebrow>Rhythm</SectionEyebrow>
              <h3>When {presenceName} pays attention</h3>
              <p className="activity-rhythm-description">Rhythm controls when this Presence looks for something worth considering. It does not decide what to say or force a publication.</p>
              <div className="rhythm-summary">
                <span>Attention <strong>{activity.rhythm.attention}</strong></span>
                <span>Publishing <strong>{activity.rhythm.publishing}</strong></span>
                <span>Replies <strong>{activity.rhythm.replies}</strong></span>
                <span>Quiet hours <strong>{activity.rhythm.quietHours}</strong></span>
              </div>
              {setView && <button type="button" className="rhythm-manage-link" onClick={() => setView("presence")}><Settings2 size={13} /> Manage attention rhythm</button>}
            </div>
          </section>
          <div id="decision-and-action">
            <ExecutionLedger state={state} mutate={mutate} presenceId={selected?.id} environment={activityEnvironment} sessionIds={activitySessionIds} onContext={setSelectedContext} />
          </div>
        </aside>
      </div>
      {selectedContext && <ActivityContextInspector object={selectedContext} state={state} onClose={() => setSelectedContext(null)} />}
    </div>
  );
}
function MirrorPanel({
  state,
  filter = "all",
  channelId,
  environment,
  sessionIds,
}: {
  state: OpenPresenceState;
  filter?: string;
  channelId?: ChannelId;
  environment?: PresenceEnvironment;
  sessionIds?: Set<string>;
}) {
  const selectedPresence =
    filter === "all"
      ? undefined
      : state.presences.find((item) => item.id === filter);
  const presenceName = selectedPresence?.name ?? "this Presence";
  const objects = state.mirrorObjects
    .filter((item) => {
      if (filter !== "all" && item.presenceId !== filter) return false;
      if (channelId && item.channelId !== channelId) return false;
      if (environment === "sandbox") return item.environment === "sandbox" || (!item.environment && Boolean(item.sessionId && sessionIds?.has(item.sessionId)));
      if (environment === "live") return item.environment !== "sandbox" && !item.sessionId;
      return true;
    })
    .slice(0, 3);
  const bridge = state.bridges.find(
    (item) =>
      (filter === "all" || item.presenceId === filter) &&
      (!channelId || item.channelId === channelId) &&
      item.state !== "offline",
  );
  const nativeConnection = state.nativeConnections.find(
    (item) =>
      (filter === "all" || item.presenceId === filter) &&
      (!channelId || item.channelId === channelId) &&
      item.kind === "x",
  );
  const nativeObservation = nativeConnection?.observation;
  const bridgeSync = bridge ? state.bridgeSync.find((item) => item.bridgeId === bridge.id) : undefined;
  const channel = selectedPresence
    ? state.channelDefinitions.find(
        (item) => item.id === selectedPresence.channel,
      )
    : undefined;
  const builtIn = channel?.builtIn ?? false;
  const syncLabel = nativeObservation
    ? nativeObservation.status === "up-to-date" ? "up to date" : nativeObservation.status.replaceAll("-", " ")
    : bridgeSync?.status === "healthy" ? "up to date" : bridgeSync?.status ?? "not observed";
  const heading = objects.length
    ? `What ${presenceName} can see`
    : nativeConnection
      ? nativeConnection.status === "needs-attention"
        ? "X connection needs attention"
        : nativeObservation?.status === "up-to-date"
        ? "Up to date"
        : nativeObservation?.status === "syncing"
          ? "Syncing X"
          : nativeObservation?.status === "degraded"
            ? "Partially observed"
            : nativeObservation?.status === "error"
              ? "X observations unavailable"
              : "Not observed yet"
      : bridge
        ? bridgeSync?.status === "healthy"
          ? "Up to date"
          : bridgeSync?.status === "syncing"
            ? "Syncing community"
            : "Community observations unavailable"
        : "No connected Presence";
  return (
    <section className="decision-card mirror-panel" aria-label={`${presenceName} observed channel context`}>
      <div className="section-heading compact">
        <div>
          <SectionEyebrow>Observed context</SectionEyebrow>
          <h3>{objects.length ? `${presenceName}'s view` : heading}</h3>
        </div>
        <span className="quiet-label">
          {bridge
            ? `${syncLabel} · ${objects.length} recent`
            : nativeConnection
              ? `X · ${nativeConnection.status === "needs-attention" ? "needs attention" : syncLabel}`
            : filter === "all"
              ? "Connect a Presence"
              : builtIn
                ? "Local channel"
                : "Bridge required"}
        </span>
      </div>
      {objects.length ? (
        <>
          <p className="mirror-explainer">
            Public posts currently available to {presenceName} on {channelLabel(selectedPresence?.channel ?? objects[0]?.channelId ?? "x", state.channelDefinitions)}.
          </p>
          <p className="mirror-boundary">Observed context only · available for judgment, not an instruction.</p>
          <div className="mirror-list">
            {objects.map((item) => (
              <article className="mirror-post" key={item.id}>
                <div className="mirror-post-header">
                  <span className="mirror-avatar">
                    {initials(item.author?.displayName ?? "World")}
                  </span>
                  <div className="mirror-post-author">
                    <strong>{item.author?.displayName ?? item.objectType}</strong>
                    <span>{item.author?.handle ?? "Public account"} · {channelLabel(item.channelId, state.channelDefinitions)}</span>
                  </div>
                  <time>{formatTime(item.occurredAt ?? item.observedAt)}</time>
                </div>
                <p className="mirror-post-content">{item.content?.text ?? "External activity received."}</p>
                <div className="mirror-post-footer"><span>Observed</span><span>{item.objectType.replaceAll("-", " ")}</span></div>
              </article>
            ))}
          </div>
        </>
      ) : nativeConnection && nativeObservation?.status === "up-to-date" ? (
        <>
          <p className="mirror-explainer">
            The latest X reconciliation found no recent public activity. A
            quiet Mirror is still a real observation, not a missing connection.
          </p>
          <div className="mirror-zero-state">
            <strong>{presenceName} has no recent activity.</strong>
            <div className="mirror-stats">
              <span>{nativeObservation.ownPostCount ?? 0} posts</span>
              <span>{nativeObservation.mentionCount ?? 0} mentions</span>
              <span>{nativeObservation.conversationCount ?? 0} conversations</span>
            </div>
            <small>
              Last observed {nativeObservation.lastObservedAt ? formatTime(nativeObservation.lastObservedAt) : "just now"}. Next observation is scheduled automatically.
            </small>
          </div>
        </>
      ) : (
        <p className="mirror-explainer">
          {bridge
            ? bridgeSync?.status === "syncing"
              ? "The Bridge is reconciling the community into the Social Mirror."
              : bridgeSync?.status === "degraded"
                ? `The last community reconciliation was partial${bridgeSync.error ? `: ${bridgeSync.error}` : "."}`
                : "The Bridge feeds observed posts, comments, and messages into the Social Mirror. They remain channel content, not instructions."
            : nativeConnection
              ? nativeObservation?.status === "syncing"
                ? `The connected X account is being reconciled now. ${presenceName} will judge the Mirror after the observation completes.`
                : nativeObservation?.error ?? "The X connection is configured, but its first reconciliation has not completed yet."
            : filter === "all"
              ? "A Social Mirror is created per connected Presence and records observed social reality with its freshness."
              : builtIn
                ? `This ${channelLabel(selectedPresence?.channel ?? "channel", state.channelDefinitions)} Presence has no connected observer yet.`
                : "Connect this custom Presence to a Bridge so its observed channel reality can appear here."}
        </p>
      )}
    </section>
  );
}
function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Circle size={14} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

function ActivityEventDetail({ text }: { text: string }) {
  const parts = text.split(/(Playground)/gi);
  return (
    <p>
      {parts.map((part, index) => /playground/i.test(part) ? <span className="activity-tag" key={`${part}-${index}`}>{part}</span> : part)}
    </p>
  );
}

function ActivityDecisionTrace({ trace }: { trace: { observed: string; judgment: string; delivery: string } }) {
  return (
    <div className="activity-decision-trace" aria-label="Decision path">
      <div><strong>Observed</strong><span>{trace.observed}</span></div>
      <div><strong>Judgment</strong><span>{trace.judgment}</span></div>
      <div><strong>Delivery</strong><span>{trace.delivery}</span></div>
    </div>
  );
}

function ActivityContextInspector({ object, state, onClose }: { object: MirrorObject; state: OpenPresenceState; onClose: () => void }) {
  return (
    <div className="activity-context-scrim" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <aside className="activity-context-dialog" role="dialog" aria-modal="true" aria-label="Decision context">
        <div className="section-heading compact">
          <div><SectionEyebrow>Decision context</SectionEyebrow><h2>What was considered</h2></div>
          <button type="button" className="activity-context-close" aria-label="Close decision context" onClick={onClose}><X size={16} /></button>
        </div>
        <p className="activity-context-intro">This observed post was part of the public context available to the Agent. It is world data, not an instruction.</p>
        <article className="mirror-post activity-context-post">
          <div className="mirror-post-header">
            <span className="mirror-avatar">{initials(object.author?.displayName ?? "World")}</span>
            <div className="mirror-post-author"><strong>{object.author?.displayName ?? object.objectType}</strong><span>{object.author?.handle ?? "Public account"} · {channelLabel(object.channelId, state.channelDefinitions)}</span></div>
            <time>{formatTime(object.occurredAt ?? object.observedAt)}</time>
          </div>
          <p className="mirror-post-content">{object.content?.text ?? "External activity received."}</p>
          <div className="mirror-post-footer"><span>Observed</span><span>{object.objectType.replaceAll("-", " ")}</span></div>
        </article>
      </aside>
    </div>
  );
}

const formatActivityAffordance = (value?: string) => {
  const affordance = value?.split(".").pop() ?? "action";
  return affordance.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const executionStatusLabel = (status: OpenPresenceState["executions"][number]["status"]) => {
  if (status === "awaiting-review") return "Needs your review";
  if (["approved", "queued", "claimed", "executing", "awaiting-connector"].includes(status)) return "Preparing to send";
  if (status === "succeeded") return "Sent";
  if (status === "failed") return "Could not send";
  if (status === "awaiting-manual") return "Waiting for you to mark sent";
  return status.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};

function ExecutionLedger({
  state,
  mutate,
  presenceId,
  environment,
  sessionIds,
  onContext,
}: {
  state: OpenPresenceState;
  mutate: Mutate;
  presenceId?: string;
  environment?: PresenceEnvironment;
  sessionIds?: Set<string>;
  onContext?: (object: MirrorObject) => void;
}) {
  const [externalType, setExternalType] = useState("post");
  const [externalId, setExternalId] = useState("");
  const executions = state.executions
    .filter((item) => {
      if (presenceId && item.presenceId !== presenceId) return false;
      if (environment === "sandbox") return item.environment === "sandbox" || (!item.environment && Boolean(item.sessionId && sessionIds?.has(item.sessionId)));
      if (environment === "live") return item.environment !== "sandbox" && !item.sessionId;
      return true;
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const latest = executions.find((item) => item.status === "awaiting-review") ?? executions[0];
  const intent = latest
    ? state.socialIntents.find((item) => item.id === latest.socialIntentId)
    : undefined;
  const presence = latest
    ? state.presences.find((item) => item.id === latest.presenceId)
    : undefined;
  const actionContext = intent?.target
    ? state.mirrorObjects.find((item) => item.presenceId === latest?.presenceId && item.externalRef.id === intent.target?.id && (environment !== "sandbox" ? item.environment !== "sandbox" && !item.sessionId : item.environment === "sandbox" || (!item.environment && Boolean(item.sessionId && sessionIds?.has(item.sessionId)))))
    : undefined;
  const actionName = formatActivityAffordance(intent?.affordance ?? latest?.affordance);
  const targetLabel = actionContext?.author?.handle ?? actionContext?.author?.displayName ?? "the observed post";
  const actionSnippet = actionContext?.content?.text?.trim();
  if (!latest || !intent)
    return (
      <div className="decision-card execution-ledger">
        <div className="section-heading compact">
          <div>
            <SectionEyebrow>Decision & action</SectionEyebrow>
            <h3>No action yet</h3>
          </div>
        </div>
        <p>
          When {presence?.name ?? "this Presence"} decides a response is worth making, you&apos;ll see the source post and what happens next here.
        </p>
      </div>
    );
  const needsApproval = latest.status === "awaiting-review";
  const needsManualRelay = latest.status === "awaiting-manual";
  return (
    <div className="decision-card execution-ledger">
      <div className="section-heading compact">
        <div>
          <SectionEyebrow>Decision & action</SectionEyebrow>
          <h3>
            {needsApproval
              ? "Waiting for review"
              : latest.status === "succeeded"
                ? "Action completed"
                : "Intent ready"}
          </h3>
        </div>
        <span className="quiet-label">{executionStatusLabel(latest.status)}</span>
      </div>
      <div className="execution-line">
        <div><SectionEyebrow>{actionContext ? `${actionName} to` : "Action"}</SectionEyebrow><strong>{actionContext ? targetLabel : actionName}</strong></div>
        <span className={`execution-status execution-status-${latest.status}`}>{executionStatusLabel(latest.status)}</span>
      </div>
      {actionContext && (
        <div className="action-context-card">
          <span>{actionSnippet ? `“${actionSnippet.slice(0, 130)}${actionSnippet.length > 130 ? "…" : ""}”` : "This post is the source context for the action."}</span>
          {onContext && <button type="button" className="action-context-button" onClick={() => onContext(actionContext)}>View post</button>}
        </div>
      )}
      <div className="execution-detail-grid">
        <span><small>Action</small><strong>{actionName}</strong></span>
        <span><small>Channel</small><strong>{presence ? channelLabel(presence.channel, state.channelDefinitions) : "Selected Presence"}</strong></span>
        <span><small>Approval</small><strong>{latest.mode === "review" ? "Review" : latest.mode === "manual" ? "Manual" : "Automatic"}</strong></span>
      </div>
      <p className="execution-explanation">
        {needsApproval
          ? "Ada has chosen this action. Your review decides whether it is sent."
          : latest.externalRef
            ? `Sent on ${presence ? channelLabel(presence.channel, state.channelDefinitions) : "the channel"}.`
            : "Ada’s decision, your approval, and the channel result are kept separate."}
      </p>
      {needsApproval && (
        <Button
          variant="secondary"
          className="full-button review-cta"
          onClick={() => mutate({ type: "approveExecution", id: latest.id })}
        >
          <Check size={14} /> Approve execution
        </Button>
      )}
      {latest.status === "approved" && (
        <Button
          variant="primary"
          className="full-button"
          onClick={() => void mutate({ type: "executeIntent", id: intent.id })}
        >
          <Play size={14} /> Execute approved action
        </Button>
      )}
      {needsManualRelay && (
        <form
          className="manual-relay-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!externalId.trim()) return;
            void mutate({
              type: "markManualExecution",
              id: latest.id,
              externalRef: { type: externalType, id: externalId.trim() },
            }).then((next) => {
              if (next) setExternalId("");
            });
          }}
        >
          <label>
            External reference type
            <input value={externalType} onChange={(event) => setExternalType(event.target.value)} />
          </label>
          <label>
            External reference
            <input value={externalId} onChange={(event) => setExternalId(event.target.value)} placeholder="post-123" required />
          </label>
          <Button variant="secondary" type="submit">
            <Check size={14} /> Mark posted
          </Button>
        </form>
      )}
    </div>
  );
}
void ExecutionLedger;

const calendarWeekDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const calendarHours = Array.from({ length: 17 }, (_, index) => index + 6);
const objectiveLabel = (objective: string) => objective.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const objectiveTone = (objective: string) => objective.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "other";
const timeToMinutes = (value: string) => { const [hours, minutes] = value.split(":").map(Number); return (Number.isFinite(hours) ? hours : 8) * 60 + (Number.isFinite(minutes) ? minutes : 0); };
type TimingMode = "flexible" | "exact" | "custom";
const defaultConsiderationEnd = (time: string) => {
  const total = Math.min(timeToMinutes(time) + 3 * 60, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
const splitConsiderationWindow = (value: string, fallback: string) => {
  const [start, end] = value.split(/[–-]/).map((part) => part.trim());
  return { start: start || fallback, end: end || defaultConsiderationEnd(fallback) };
};
const timingModeFor = (time: string, value: string): TimingMode => {
  const { start, end } = splitConsiderationWindow(value, time);
  if (start === time && end === time) return "exact";
  if (start === time && end === defaultConsiderationEnd(time)) return "flexible";
  return "custom";
};
const considerationSummary = (time: string, value: string) => {
  const { start, end } = splitConsiderationWindow(value, time);
  if (start === time && end === time) return `exact-time consideration at ${time}`;
  if (start === time && end === defaultConsiderationEnd(time)) return "flexible consideration";
  return `consider ${start}–${end}`;
};

type PublicHistoryFilter = "all" | "originals" | "replies" | "quote" | "repost";

type MirrorHealth = { label: string; detail: string; tone: "healthy" | "warning" | "offline" | "sandbox" };

function mirrorHealthFor(state: OpenPresenceState, presence: OpenPresenceState["presence"]): MirrorHealth {
  if (!presence) return { label: "DISCONNECTED", detail: "No Presence is selected for this public history.", tone: "offline" };
  if (presence.connectionMode === "sandbox") return { label: "SIMULATED", detail: "Sandbox Mirror · local simulated world", tone: "sandbox" };
  if (presence.connectionMode === "bridge") {
    const bridge = state.bridges.find((item) => item.presenceId === presence.id);
    const sync = bridge ? state.bridgeSync.find((item) => item.bridgeId === bridge.id) : undefined;
    if (bridge?.state === "online" && sync?.status === "healthy") return { label: "UP TO DATE", detail: `Last observed ${formatMirrorDate(sync.lastSyncAt)}`, tone: "healthy" };
    if (bridge?.state === "online") return { label: "SYNCING", detail: "The connected Bridge is observing the channel.", tone: "warning" };
    return { label: "DISCONNECTED", detail: "Showing last verified public history until the Bridge reconnects.", tone: "offline" };
  }
  const connection = state.nativeConnections.find((item) => item.presenceId === presence.id && item.kind === "x");
  const observation = connection?.observation;
  if (observation?.status === "up-to-date") return { label: "UP TO DATE", detail: `Last observed ${formatMirrorDate(observation.lastObservedAt)}`, tone: "healthy" };
  if (observation?.status === "syncing") return { label: "SYNCING", detail: "The X Connector is reconciling the Social Mirror.", tone: "warning" };
  if (observation?.status === "stale" || observation?.status === "degraded") return { label: "STALE", detail: `Last observed ${formatMirrorDate(observation.lastObservedAt)} · Showing last known public history`, tone: "warning" };
  return { label: "DISCONNECTED", detail: "Showing last verified public history until the X Connector reconnects.", tone: "offline" };
}

function formatMirrorDate(value?: string) {
  if (!value) return "unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function matchesPublicHistoryFilter(item: PublicHistoryItem, filter: PublicHistoryFilter) {
  if (filter === "all") return true;
  if (filter === "originals") return item.kind === "post" || item.kind === "thread";
  if (filter === "replies") return item.kind === "reply" || item.kind === "comment";
  return item.kind === filter;
}

function PublicHistoryView({
  state,
  setView,
}: {
  state: OpenPresenceState;
  setView: (view: View) => void;
}) {
  const presenceId = state.activePresenceId ?? state.presence?.id ?? "";
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  const mirrorHealth = mirrorHealthFor(state, presence);
  const [surface, setSurface] = useState<"timeline" | "calendar">("timeline");
  const [range, setRange] = useState<"week" | "month" | "day">("week");
  const [filter, setFilter] = useState<PublicHistoryFilter>("all");
  const [selected, setSelected] = useState<PublicHistoryItem | null>(null);
  const [anchor, setAnchor] = useState(() => new Date());
  const history = derivePublicHistory(state, presence?.id).filter((item) => matchesPublicHistoryFilter(item, filter));
  const filteredHistory = history.filter((item) => item.channel === presence?.channel);
  const selectedIndex = selected ? filteredHistory.findIndex((item) => item.id === selected.id) : -1;
  const allHistory = derivePublicHistory(state, presence?.id).filter((item) => item.channel === presence?.channel);
  const counts = {
    publications: allHistory.filter((item) => ["post", "thread"].includes(item.kind)).length,
    replies: allHistory.filter((item) => ["reply", "comment"].includes(item.kind)).length,
    attributedFollows: allHistory.reduce((total, item) => total + (item.metrics.qualifiedFollows ?? item.metrics.follows ?? 0), 0),
    observedOutcomes: allHistory.filter((item) => Object.keys(item.metrics).length > 0).length,
  };
  const dateLabel = (date: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en", options).format(date);
  const startOfWeek = (date: Date) => {
    const next = new Date(date);
    const day = next.getDay();
    next.setDate(next.getDate() - (day === 0 ? 6 : day - 1));
    next.setHours(0, 0, 0, 0);
    return next;
  };
  const sameDay = (left: Date, right: Date) => left.toDateString() === right.toDateString();
  const moveAnchor = (amount: number) => setAnchor((current) => {
    const next = new Date(current);
    if (range === "month") next.setMonth(next.getMonth() + amount);
    else if (range === "week") next.setDate(next.getDate() + amount * 7);
    else next.setDate(next.getDate() + amount);
    return next;
  });
  const historyForDay = (date: Date) => filteredHistory.filter((item) => sameDay(new Date(item.occurredAt), date));
  const rangeLabel = range === "month"
    ? dateLabel(anchor, { month: "long", year: "numeric" })
    : range === "day"
      ? dateLabel(anchor, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      : `${dateLabel(startOfWeek(anchor), { month: "short", day: "numeric" })} – ${dateLabel(new Date(startOfWeek(anchor).getTime() + 6 * 86400000), { month: "short", day: "numeric", year: "numeric" })}`;
  return (
    <div className={`page public-history-page ${surface === "timeline" ? "timeline-surface" : "calendar-surface"}`}>
      <div className="page-heading">
        <div>
          <SectionEyebrow>Verified public history</SectionEyebrow>
          <h1>Feed</h1>
          <p className="muted">What {presence?.name ?? "this Presence"} has put into the world.</p>
        </div>
        <div className="heading-actions calendar-heading-actions">
          <span className="scope-summary">{presence ? `${channelLabel(presence.channel, state.channelDefinitions)} · ${presence.name}` : "No Presence selected"}</span>
          <Button variant="secondary" onClick={() => setView("schedule")}><Clock3 size={15} /> Schedule</Button>
        </div>
      </div>
      <div className="public-history-view-toggle" role="group" aria-label="Public history view">
        <button type="button" className={surface === "timeline" ? "active" : ""} aria-pressed={surface === "timeline"} onClick={() => { setSurface("timeline"); setSelected(null); }}>Timeline</button>
        <button type="button" className={surface === "calendar" ? "active" : ""} aria-pressed={surface === "calendar"} onClick={() => { setSurface("calendar"); setSelected(null); }}>Calendar</button>
      </div>
      <div className={`mirror-health mirror-health-${mirrorHealth.tone}`} aria-label={`Social Mirror status: ${mirrorHealth.label}`}>
        <span className="mirror-health-dot" aria-hidden="true" />
        <span><strong>{mirrorHealth.label}</strong><small>{mirrorHealth.detail}</small></span>
      </div>
      <div className="metric-row public-history-metrics" aria-label="Public history summary">
        <div className="metric"><span>Publications</span><strong>{counts.publications}</strong><small>Verified posts and threads</small></div>
        <div className="metric"><span>Replies</span><strong>{counts.replies}</strong><small>Public conversation turns</small></div>
        <div className="metric"><span>Attributed follows</span><strong>{counts.attributedFollows}</strong><small>Only when the channel reports it</small></div>
        <div className="metric"><span>Observed outcomes</span><strong>{counts.observedOutcomes}</strong><small>Items with outcome evidence</small></div>
      </div>
      <div className="history-toolbar">
        {surface === "timeline" ? (
          <div className="feed-filter" role="group" aria-label="Feed filter">
            {(["all", "originals", "replies", "quote", "repost"] as const).map((item) => <button type="button" key={item} className={filter === item ? "active" : ""} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item === "all" ? "All" : item === "quote" ? "Quotes" : item === "repost" ? "Reposts" : item[0].toUpperCase() + item.slice(1)}</button>)}
          </div>
        ) : (
          <>
            <div className="calendar-view-toggle" role="group" aria-label="Calendar history view">
              {(["week", "month", "day"] as const).map((item) => <button type="button" key={item} className={range === item ? "active" : ""} aria-pressed={range === item} onClick={() => setRange(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}
            </div>
            <div className="feed-filter" role="group" aria-label="Calendar filter">
              {(["all", "originals", "replies", "quote", "repost"] as const).map((item) => <button type="button" key={item} className={filter === item ? "active" : ""} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item === "all" ? "All" : item === "quote" ? "Quotes" : item === "repost" ? "Reposts" : item[0].toUpperCase() + item.slice(1)}</button>)}
            </div>
            <div className="history-date-controls">
              <button type="button" aria-label="Previous period" onClick={() => moveAnchor(-1)}><ChevronDown size={15} style={{ transform: "rotate(90deg)" }} /></button>
              <strong>{rangeLabel}</strong>
              <button type="button" aria-label="Next period" onClick={() => moveAnchor(1)}><ChevronDown size={15} style={{ transform: "rotate(-90deg)" }} /></button>
            </div>
          </>
        )}
      </div>
      <div className={`public-history-layout ${selected ? "has-inspector" : ""}`}>
        <section className="public-history-surface" aria-label={surface === "timeline" ? "Feed timeline" : `${range} public history`}>
          {surface === "timeline" ? (
            <FeedHistory history={filteredHistory} state={state} presenceName={presence?.name ?? "this Presence"} onSelect={setSelected} />
          ) : range === "month" ? (
            <MonthHistory anchor={anchor} history={filteredHistory} onSelect={setSelected} />
          ) : range === "day" ? (
            <DayHistory date={anchor} history={historyForDay(anchor)} onSelect={setSelected} />
          ) : (
            <WeekHistory anchor={anchor} history={filteredHistory} presenceName={presence?.name ?? "this Presence"} onSelect={setSelected} />
          )}
          {!filteredHistory.length && <EmptyState title="No public expression yet" body={mirrorHealth.tone === "healthy" || mirrorHealth.tone === "sandbox" ? `${mirrorHealth.detail}. ${presence?.name ?? "This Presence"} has not put anything into the public world yet.` : `${mirrorHealth.detail}.` } action={<Button variant="secondary" onClick={() => setView("schedule")}><Clock3 size={14} /> Open Schedule</Button>} />}
        </section>
        {selected && <PublicHistoryInspector item={selected} state={state} index={selectedIndex} total={filteredHistory.length} onNavigate={(offset) => { const next = filteredHistory[selectedIndex + offset]; if (next) setSelected(next); }} onClose={() => setSelected(null)} onActivity={() => setView("live")} />}
      </div>
    </div>
  );
}

function FeedHistory({ history, state, presenceName, onSelect }: { history: PublicHistoryItem[]; state: OpenPresenceState; presenceName: string; onSelect: (item: PublicHistoryItem) => void }) {
  const groups: { key: string; label: string; items: PublicHistoryItem[] }[] = [];
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const dateKey = (value: string) => {
    const date = new Date(value);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  };
  const dateLabel = (value: string) => {
    const date = new Date(value);
    if (date.toDateString() === today.toDateString()) return "TODAY";
    if (date.toDateString() === yesterday.toDateString()) return "YESTERDAY";
    return date.toLocaleDateString("en", { month: "short", day: "numeric" }).toUpperCase();
  };
  history.forEach((item) => {
    const key = dateKey(item.occurredAt);
    const group = groups.find((candidate) => candidate.key === key);
    if (group) group.items.push(item);
    else groups.push({ key, label: dateLabel(item.occurredAt), items: [item] });
  });
  return <div className="feed-history">{groups.map((group) => <section className="feed-date-group" key={group.key} aria-label={group.label}><div className="feed-date-heading">{group.label}</div><div className="feed-items">{group.items.map((item) => <FeedItem key={item.id} item={item} state={state} presenceName={presenceName} onSelect={onSelect} />)}</div></section>)}</div>;
}

function FeedItem({ item, state, presenceName, onSelect }: { item: PublicHistoryItem; state: OpenPresenceState; presenceName: string; onSelect: (item: PublicHistoryItem) => void }) {
  const presence = state.presences.find((candidate) => candidate.id === item.presenceId);
  const kindLabel = item.kind === "post" ? "Original" : item.kind[0].toUpperCase() + item.kind.slice(1);
  const assets = (item.assetIds ?? []).map((id) => state.assets.find((asset) => asset.id === id)).filter(Boolean);
  return <button type="button" className={`feed-item feed-item-${item.kind}`} onClick={() => onSelect(item)}>
    <span className="feed-item-header"><PresenceGlyph accent={presence?.accent ?? "#D68754"} /><span className="feed-item-identity"><strong>{presence?.name ?? presenceName}</strong><small>{presence?.handle ?? ""} · {kindLabel}</small></span><time>{formatTime(item.occurredAt)}</time></span>
    {item.kind === "reply" || item.kind === "comment" ? <span className="feed-item-context">Replying in a public conversation</span> : null}
    <span className="feed-item-text">{item.text || (item.kind === "repost" ? "Passed along publicly." : "Public expression without returned text.")}</span>
    {assets.length > 0 && <span className="feed-item-assets">{assets.map((asset) => asset?.dataUrl && (asset.type === "image" || asset.type === "gif" || asset.type === "chart") ? <Image unoptimized width={180} height={120} key={asset.id} src={asset.dataUrl} alt={`Published ${asset.type}`} /> : asset?.dataUrl && asset.type === "video" ? <video key={asset.id} controls src={asset.dataUrl} aria-label="Published video" /> : <span className="social-link-asset" key={asset?.id}>{asset?.type === "link" ? asset.provenance.sourceUrl : `${asset?.type ?? "Asset"} published`}</span>)}</span>}
    <span className="feed-item-footer"><span>View details <ChevronRight size={13} /></span></span>
  </button>;
}

function HistoryCard({ item, onSelect, compact = false }: { item: PublicHistoryItem; onSelect: (item: PublicHistoryItem) => void; compact?: boolean }) {
  const label = item.kind === "post" ? "POST" : item.kind.toUpperCase();
  return <button type="button" className={`history-card history-card-${item.kind} ${compact ? "compact" : ""}`} onClick={() => onSelect(item)}>
    <span className="history-card-kicker"><strong>{label}</strong><time>{formatTime(item.occurredAt)}</time></span>
    {item.text ? <span className="history-card-text">{item.text}</span> : <span className="history-card-text quiet">{item.kind === "repost" ? "Passed along publicly" : "Public expression"}</span>}
  </button>;
}

function WeekHistory({ anchor, history, presenceName, onSelect }: { anchor: Date; history: PublicHistoryItem[]; presenceName: string; onSelect: (item: PublicHistoryItem) => void }) {
  const start = new Date(anchor);
  const day = start.getDay();
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  start.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, index) => new Date(start.getTime() + index * 86400000));
  const hours = Array.from({ length: 24 }, (_, index) => index);
  return <div className="history-week" aria-label={`Weekly public history for ${presenceName}`}>
    <div className="history-week-grid">
      <div className="history-week-header"><span>Local time</span>{days.map((date) => <span key={date.toISOString()}>{date.toLocaleDateString("en", { weekday: "short" })}<small>{date.getDate()}</small></span>)}</div>
      <div className="history-week-body"><div className="history-time-rail">{hours.map((hour) => <span key={hour}>{String(hour).padStart(2, "0")}:00</span>)}</div>{days.map((date) => {
        const dayItems = history.filter((item) => new Date(item.occurredAt).toDateString() === date.toDateString());
        return <div className="history-day-column" key={date.toISOString()}>{hours.map((hour) => <div className="history-hour-cell" key={hour} />)}{dayItems.map((item) => { const timestamp = new Date(item.occurredAt); const top = Math.max(2, ((timestamp.getHours() + timestamp.getMinutes() / 60) * 56)); return <div key={item.id} className="history-positioned-card" style={{ top }}><HistoryCard item={item} onSelect={onSelect} compact={item.kind === "reply" || item.kind === "comment"} /></div>; })}</div>;
      })}</div>
    </div>
  </div>;
}

function MonthHistory({ anchor, history, onSelect }: { anchor: Date; history: PublicHistoryItem[]; onSelect: (item: PublicHistoryItem) => void }) {
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(monthStart); const day = start.getDay(); start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  const days = Array.from({ length: 42 }, (_, index) => new Date(start.getTime() + index * 86400000));
  return <div className="history-month"><div className="history-month-header">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div><div className="history-month-grid">{days.map((date) => { const items = history.filter((item) => new Date(item.occurredAt).toDateString() === date.toDateString()); return <div className={`history-month-day ${date.getMonth() !== anchor.getMonth() ? "outside" : ""}`} key={date.toISOString()}><strong>{date.getDate()}</strong>{items.slice(0, 4).map((item) => <HistoryCard key={item.id} item={item} onSelect={onSelect} compact />)}{items.length > 4 && <small className="history-more">+ {items.length - 4} more</small>}</div>; })}</div></div>;
}

function DayHistory({ date, history, onSelect }: { date: Date; history: PublicHistoryItem[]; onSelect: (item: PublicHistoryItem) => void }) {
  const hours = Array.from({ length: 24 }, (_, index) => index);
  return <div className="history-day"><div className="history-day-header"><SectionEyebrow>{date.toLocaleDateString("en", { weekday: "long" })}</SectionEyebrow><h2>{date.toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" })}</h2><p>Public history appears here.</p></div><div className="history-day-timeline">{hours.map((hour) => <div className="history-timeline-row" key={hour}><span>{String(hour).padStart(2, "0")}:00</span><div>{history.filter((item) => new Date(item.occurredAt).getHours() === hour).map((item) => <HistoryCard key={item.id} item={item} onSelect={onSelect} />)}</div></div>)}</div></div>;
}

function PublicHistoryInspector({ item, state, index, total, onNavigate, onClose, onActivity }: { item: PublicHistoryItem; state: OpenPresenceState; index: number; total: number; onNavigate: (offset: number) => void; onClose: () => void; onActivity: () => void }) {
  const presence = state.presences.find((candidate) => candidate.id === item.presenceId);
  const mirrorObject = state.mirrorObjects.find((object) => object.id === item.id || (object.externalRef.type === item.externalRef.type && object.externalRef.id === item.externalRef.id));
  const assignment = mirrorObject?.assignmentId ? state.assignments.find((candidate) => candidate.id === mirrorObject.assignmentId) : undefined;
  const parent = item.parentExternalRef ? state.mirrorObjects.find((object) => object.externalRef.type === item.parentExternalRef?.type && object.externalRef.id === item.parentExternalRef?.id) : undefined;
  const metrics = Object.entries(item.metrics);
  const kindLabel = item.kind === "post" ? "Post" : item.kind[0].toUpperCase() + item.kind.slice(1);
  const position = Math.max(0, index) + 1;
  return <aside className="history-inspector" aria-label={`${kindLabel} details`}><div className="history-inspector-header"><div><SectionEyebrow>{kindLabel} details</SectionEyebrow><h2>{kindLabel}</h2><small>{new Date(item.occurredAt).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}</small></div><button type="button" aria-label="Close inspector" onClick={onClose}><X size={16} /></button></div><div className="history-inspector-navigation" aria-label="Browse public posts"><span aria-live="polite"><strong>Post {position}</strong> of {total}</span><div><button type="button" aria-label="Previous post" disabled={index <= 0} onClick={() => onNavigate(-1)}><ChevronRight size={14} style={{ transform: "rotate(180deg)" }} /></button><button type="button" aria-label="Next post" disabled={index < 0 || index >= total - 1} onClick={() => onNavigate(1)}><ChevronRight size={14} /></button></div></div><div className="history-inspector-identity"><PresenceGlyph accent={presence?.accent ?? "#D68754"} /><span><strong>{presence?.name ?? "Presence"}</strong><small>{presence?.handle ?? ""}</small></span></div>{parent?.content?.text && <div className="history-parent-context"><SectionEyebrow>Replying to</SectionEyebrow><p>{parent.content.text}</p><small>{parent.author?.displayName ?? "Public conversation"}</small></div>}<p className="history-inspector-text">{item.text || (item.kind === "repost" ? "Passed along publicly." : "No text was returned by the channel.")}</p><div className="history-proof"><Check size={14} /><span>Observed in Social Mirror · {item.externalRef.type} · {item.externalRef.id}</span></div><section className="history-provenance"><SectionEyebrow>Provenance</SectionEyebrow><p>{item.executionId ? "Published by OpenPresence and verified in the Social Mirror." : "Observed on the connected channel and attributed to this Presence."}</p>{assignment && <p>Assignment output · {assignment.progress.verified} / {assignment.progress.required} verified publications</p>}{mirrorObject?.environment === "sandbox" && <small>Simulated social reality · this expression has no live destination.</small>}</section><section className="history-outcome"><SectionEyebrow>Outcome</SectionEyebrow>{metrics.length ? <div className="history-outcome-grid">{metrics.map(([key, value]) => <div key={key}><strong>{value}</strong><small>{key.replaceAll("_", " ")}</small></div>)}</div> : <p>No channel outcome evidence is attached to this expression yet.</p>}</section><div className="history-inspector-actions">{item.externalUrl ? <a className="history-external-link" href={item.externalUrl} target="_blank" rel="noreferrer"><ArrowUpRight size={14} /> Open on X</a> : item.environment === "sandbox" && item.channel === "x" ? <p className="history-sandbox-note">Sandbox rehearsal only. This expression has no live X URL.</p> : null}<Button variant="secondary" onClick={onActivity}><Activity size={14} /> View in Activity</Button></div></aside>;
}

function ScheduleView({
  state,
  mutate,
}: {
  state: OpenPresenceState;
  mutate: Mutate;
}) {
  const [showForm, setShowForm] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [day, setDay] = useState("Tuesday");
  const [time, setTime] = useState("08:00");
  const [objective, setObjective] = useState("audience_growth");
  const [responsibility, setResponsibility] = useState<"consider" | "assign">("consider");
  const [executionWindow, setExecutionWindow] = useState("08:00–11:00");
  const [timingMode, setTimingMode] = useState<TimingMode>("flexible");
  const [timingOptionsOpen, setTimingOptionsOpen] = useState(false);
  const [considerationStart, setConsiderationStart] = useState("08:00");
  const [considerationEnd, setConsiderationEnd] = useState("11:00");
  const [editingSlot, setEditingSlot] = useState<CalendarSlot | null>(null);
  const [runNowMode, setRunNowMode] = useState(false);
  const [runNowBusy, setRunNowBusy] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "week">("week");
  const presenceId = state.activePresenceId ?? state.presence?.id ?? "";
  const selectedPresence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  const presenceName = selectedPresence?.name ?? "this Presence";
  const resetForm = () => {
    setInstruction("");
    setEditingSlot(null);
    setRunNowMode(false);
    setDay("Tuesday");
    setTime("08:00");
    setObjective("audience_growth");
    setResponsibility("consider");
    setExecutionWindow("08:00–11:00");
    setTimingMode("flexible");
    setTimingOptionsOpen(false);
    setConsiderationStart("08:00");
    setConsiderationEnd("11:00");
  };
  const chooseTimingMode = (nextMode: TimingMode) => {
    const current = splitConsiderationWindow(executionWindow, time);
    const nextStart = nextMode === "custom" ? current.start : time;
    const nextEnd = nextMode === "flexible" ? defaultConsiderationEnd(time) : nextMode === "exact" ? time : current.end;
    setTimingMode(nextMode);
    setConsiderationStart(nextStart);
    setConsiderationEnd(nextEnd);
    setExecutionWindow(`${nextStart}–${nextEnd}`);
  };
  const changeScheduleTime = (nextTime: string) => {
    setTime(nextTime);
    if (timingMode === "flexible") {
      const nextEnd = defaultConsiderationEnd(nextTime);
      setConsiderationStart(nextTime);
      setConsiderationEnd(nextEnd);
      setExecutionWindow(`${nextTime}–${nextEnd}`);
    } else if (timingMode === "exact") {
      setConsiderationStart(nextTime);
      setConsiderationEnd(nextTime);
      setExecutionWindow(`${nextTime}–${nextTime}`);
    }
  };
  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (runNowMode) {
      setRunNowBusy(true);
      try {
        const next = await mutate({ type: "runNow", instruction, presenceId });
        if (next) {
          resetForm();
          setShowForm(false);
        }
      } finally {
        setRunNowBusy(false);
      }
      return;
    }
    if (responsibility === "assign") {
      const next = await mutate({ type: "createAssignment", instruction, presenceId, environment: selectedPresence?.connectionMode === "sandbox" ? "sandbox" : "live" });
      if (next) { resetForm(); setShowForm(false); }
      return;
    }
    const next = await mutate({
      type: editingSlot ? "editSlot" : "addSlot",
      ...(editingSlot ? { id: editingSlot.id } : { presenceId }),
      instruction,
      day,
      time,
      objective,
      executionWindow,
    });
    if (next) {
      resetForm();
      setShowForm(false);
    }
  };
  const visibleSlots = state.calendar.filter((slot) => slot.presence === presenceId);
  const beginEdit = (slot: CalendarSlot) => {
    const { start, end } = splitConsiderationWindow(slot.executionWindow, slot.time);
    setEditingSlot(slot);
    setInstruction(slot.instruction);
    setDay(slot.day);
    setTime(slot.time);
    setObjective(slot.objective);
    setExecutionWindow(slot.executionWindow);
    setTimingMode(timingModeFor(slot.time, slot.executionWindow));
    setTimingOptionsOpen(timingModeFor(slot.time, slot.executionWindow) === "custom");
    setConsiderationStart(start);
    setConsiderationEnd(end);
    setShowForm(true);
  };
  const openRunNow = () => {
    resetForm();
    setRunNowMode(true);
    setShowForm(true);
  };
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <SectionEyebrow>Future attention</SectionEyebrow>
          <h1>Schedule</h1>
          <p className="muted">
            Tell {presenceName} when to pay
            attention. Words come later, from the moment.
          </p>
        </div>
        <div className="heading-actions calendar-heading-actions">
          <span className="scope-summary">Planning for {presenceName}</span>
          <div className="calendar-view-toggle" role="group" aria-label="Calendar view mode">
            <button type="button" aria-pressed={viewMode === "list"} className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}>List</button>
            <button type="button" aria-pressed={viewMode === "week"} className={viewMode === "week" ? "active" : ""} onClick={() => setViewMode("week")}>Week</button>
          </div>
          <Button variant="secondary" onClick={openRunNow} disabled={runNowBusy}>
            <Play size={14} /> Run now
          </Button>
          <Button variant="primary" onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}>
            {showForm ? <X size={15} /> : <Plus size={15} />}{" "}
            {showForm ? "Close" : "Add intent"}
          </Button>
        </div>
      </div>
      {showForm && (
        <form className={`add-slot-form ${runNowMode ? "now-run-form" : ""}`} onSubmit={add}>
          <label className="instruction-field">
            {runNowMode ? "Immediate instruction" : responsibility === "assign" ? "Assignment" : "Standing instruction"}
            <textarea
              aria-label={runNowMode ? `What should ${presenceName} consider now?` : `What should ${presenceName} do?`}
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder={runNowMode ? "Explore one useful idea about persistent agents right now." : "Teach the audience one useful thing about persistent agents."}
              rows={3}
              required
            />
          </label>
          {runNowMode && <p className="now-run-note">Jenny will evaluate this in the current moment. She may publish, wait for review, or choose NO_OP. Nothing is added to the calendar.</p>}
          {!runNowMode && <fieldset className="schedule-responsibility">
            <legend>Responsibility</legend>
            <label className={responsibility === "consider" ? "selected" : ""}><input type="radio" name="schedule-responsibility" checked={responsibility === "consider"} onChange={() => setResponsibility("consider")} /><span><strong>Consider</strong><small>{presenceName} may reasonably choose not to act.</small></span></label>
            <label className={responsibility === "assign" ? "selected" : ""}><input type="radio" name="schedule-responsibility" checked={responsibility === "assign"} onChange={() => setResponsibility("assign")} /><span><strong>Assign</strong><small>{presenceName} is responsible for completing the outcome.</small></span></label>
          </fieldset>}
          {!runNowMode && <div className="when-field">
            <span className="schedule-field-label">When</span>
            <div className="when-field-controls">
              <label>
                Day
                <select
                  aria-label="Day"
                  value={day}
                  onChange={(event) => setDay(event.target.value)}
                >
                  {calendarWeekDays.map(
                    (item) => (
                      <option key={item}>{item}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Time
                <input
                  aria-label="Time"
                  type="time"
                  value={time}
                  onChange={(event) => changeScheduleTime(event.target.value)}
                  onInput={(event) => changeScheduleTime(event.currentTarget.value)}
                />
              </label>
            </div>
          </div>}
          {!runNowMode && <label>
            Objective
            <select
              aria-label="Objective"
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
            >
              <option value="audience_growth">Audience growth</option>
              <option value="relationship">Relationships</option>
              <option value="education">Education</option>
              <option value="reflection">Reflection</option>
            </select>
          </label>}
          {!runNowMode && <div className="timing-options">
            <button
              type="button"
              className="timing-toggle"
              aria-expanded={timingOptionsOpen}
              onClick={() => setTimingOptionsOpen((open) => !open)}
            >
              <span>
                <strong>Timing options</strong>
                <small>{timingMode === "flexible" ? "Flexible · a few hours" : timingMode === "exact" ? `Exact · ${time}` : `Custom · ${considerationStart}–${considerationEnd}`}</small>
              </span>
              <ChevronDown size={15} className={timingOptionsOpen ? "rotated" : ""} />
            </button>
            {timingOptionsOpen && (
              <fieldset className="timing-panel">
                <legend>How long is this relevant?</legend>
                <label className={`timing-choice ${timingMode === "flexible" ? "selected" : ""}`}>
                  <input type="radio" name="timing-mode" checked={timingMode === "flexible"} onChange={() => chooseTimingMode("flexible")} />
                  <span><strong>Flexible</strong><small>Recommended · {presenceName} can consider this for a few hours.</small></span>
                </label>
                <label className={`timing-choice ${timingMode === "exact" ? "selected" : ""}`}>
                  <input type="radio" name="timing-mode" checked={timingMode === "exact"} onChange={() => chooseTimingMode("exact")} />
                  <span><strong>Exact time</strong><small>Consider it at the scheduled time.</small></span>
                </label>
                <label className={`timing-choice ${timingMode === "custom" ? "selected" : ""}`}>
                  <input type="radio" name="timing-mode" checked={timingMode === "custom"} onChange={() => chooseTimingMode("custom")} />
                  <span><strong>Custom</strong><small>Consider it between these times.</small></span>
                </label>
                {timingMode === "custom" && (
                  <div className="timing-custom-range">
                    <label>From<input aria-label="Consideration starts" type="time" value={considerationStart} onChange={(event) => { setConsiderationStart(event.target.value); setExecutionWindow(`${event.target.value}–${considerationEnd}`); }} /></label>
                    <label>Until<input aria-label="Consideration ends" type="time" value={considerationEnd} onChange={(event) => { setConsiderationEnd(event.target.value); setExecutionWindow(`${considerationStart}–${event.target.value}`); }} /></label>
                  </div>
                )}
              </fieldset>
            )}
          </div>}
          <Button type="submit" variant="secondary" disabled={runNowBusy}>
            {runNowMode ? <><Play size={14} /> Run now</> : <><Check size={14} /> {responsibility === "assign" ? "Review assignment" : editingSlot ? "Save changes" : "Save standing intent"}</>}
          </Button>
        </form>
      )}
      {state.assignments.filter((item) => item.presenceId === presenceId).length > 0 && <section className="schedule-assignment-list" aria-label="Assignments"><div className="section-heading"><div><SectionEyebrow>Delegated responsibility</SectionEyebrow><h2>Assignments</h2></div></div>{state.assignments.filter((item) => item.presenceId === presenceId).map((assignment) => <article className="schedule-assignment-row" key={assignment.id}><div><strong>{assignment.instruction}</strong><small>{assignment.recurrence?.label ?? "Once"} · {assignment.progress.verified} / {assignment.progress.required} verified · {assignment.status.replaceAll("_", " ")}</small></div><span className="assignment-authority">ASSIGN</span></article>)}</section>}
      {viewMode === "week" ? (
        <WeekCalendar slots={visibleSlots} state={state} presenceName={presenceName} onEdit={beginEdit} onAdd={() => setShowForm(true)} />
      ) : (
      <div className="calendar-layout">
        <section>
          <div className="section-heading">
            <div>
            <SectionEyebrow>Future attention</SectionEyebrow>
          <h2>Standing intentions</h2>
            </div>
            <span className="quiet-label">
              {visibleSlots.filter((slot) => slot.enabled).length} active
            </span>
          </div>
          {visibleSlots.length === 0 ? (
            <EmptyState
              title="No standing intentions"
              body={`A quiet calendar is fine. ${presenceName} can still observe and respond through its normal operating rhythm; standing intentions are explicit scheduled considerations.`}
              action={
                <Button onClick={() => setShowForm(true)} variant="secondary">
                  <Plus size={14} /> Add first intent
                </Button>
              }
            />
          ) : (
            <div className="slot-list">
              {visibleSlots.map((slot) => (
                <SlotRow
                  key={slot.id}
                  slot={slot}
                  state={state}
                  onRun={() => mutate({ type: "runSlot", id: slot.id })}
                  onEdit={() => beginEdit(slot)}
                />
              ))}
            </div>
          )}
        </section>
        <aside className="calendar-note compact-note">
          <SectionEyebrow>Standing intent</SectionEyebrow>
          <h3>Nothing is written months in advance.</h3>
          <p>
            At run time, {presenceName} can publish, draft, or choose{" "}
            <strong>NO_OP</strong>.
          </p>
        </aside>
      </div>
      )}
    </div>
  );
}

function WeekCalendar({
  slots,
  state,
  presenceName,
  onEdit,
  onAdd,
}: {
  slots: CalendarSlot[];
  state: OpenPresenceState;
  presenceName: string;
  onEdit: (slot: CalendarSlot) => void;
  onAdd: () => void;
}) {
  const scheduledSlots = slots.filter((slot) => slot.enabled);
  const daySlots = new Map(calendarWeekDays.map((day) => [day, scheduledSlots.filter((slot) => slot.day === day)]));
  const gridHeight = calendarHours.length * 64;
  return (
    <section className="week-calendar" aria-label="Weekly intent schedule">
      <div className="week-calendar-toolbar">
        <div>
          <SectionEyebrow>Visual schedule</SectionEyebrow>
          <h2>When {presenceName} is meant to pay attention</h2>
          <p>Standing intents are shown by day and time. Nothing here is a promised post.</p>
        </div>
        <div className="week-calendar-legend" aria-label="Intent objectives">
          {["audience_growth", "education", "relationship", "reflection"].map((objective) => <span key={objective}><i className={`legend-dot objective-${objectiveTone(objective)}`} />{objectiveLabel(objective)}</span>)}
        </div>
      </div>
      {scheduledSlots.length === 0 ? <EmptyState title="Nothing scheduled for this Presence" body={`Add a standing intent to see when ${presenceName} will pay attention during the week.`} action={<Button onClick={onAdd} variant="secondary"><Plus size={14} /> Add first intent</Button>} /> : <div className="week-grid-scroll"><div className="week-grid" style={{ "--week-grid-height": `${gridHeight}px` } as React.CSSProperties}><div className="week-grid-header"><span className="week-time-header">Local time</span>{calendarWeekDays.map((day) => <span key={day}>{day.slice(0, 3)}<small>{day}</small></span>)}</div><div className="week-grid-body"><div className="week-time-rail">{calendarHours.map((hour) => <span key={hour}>{String(hour).padStart(2, "0")}:00</span>)}</div>{calendarWeekDays.map((day) => <div className="week-day-column" key={day}>{calendarHours.map((hour) => <div className="week-hour-cell" key={hour} />)}{(daySlots.get(day) ?? []).map((slot) => { const start = timeToMinutes(slot.time); const firstHour = calendarHours[0] * 60; const top = Math.max(0, ((start - firstHour) / 60) * 64); const windowParts = slot.executionWindow.split(/[–-]/).map((part) => part.trim()); const end = windowParts[1] ? timeToMinutes(windowParts[1]) : start + 60; const height = Math.max(54, Math.min(gridHeight - top - 8, ((Math.max(start + 60, end) - start) / 60) * 64 - 8)); const target = state.presences.find((item) => item.id === slot.presence); return <button type="button" key={slot.id} className={`week-intent objective-${objectiveTone(slot.objective)}`} style={{ top, height }} onClick={() => onEdit(slot)} aria-label={`Edit ${slot.label}, ${slot.day} at ${slot.time}`} title={`${slot.label} · ${slot.day} ${slot.time} · ${considerationSummary(slot.time, slot.executionWindow)}`}><span className="week-intent-time">{slot.time}</span><strong>{slot.label}</strong><small>{target?.name ?? presenceName} · {objectiveLabel(slot.objective)}</small><em>{slot.mode === "auto" ? "Auto" : "Review"}</em></button>; })}</div>)}</div></div></div>}
    </section>
  );
}

function SlotRow({
  slot,
  state,
  onRun,
  onEdit,
}: {
  slot: CalendarSlot;
  state: OpenPresenceState;
  onRun: () => void;
  onEdit: () => void;
}) {
  const target = state.presences.find((item) => item.id === slot.presence);
  return (
    <div className="slot-row">
      <div className="slot-time">
        <strong>{slot.time}</strong>
        <span>{slot.day}</span>
      </div>
      <div className="slot-main">
        <strong>{slot.label}</strong>
        <p>{slot.instruction}</p>
        <span>
          {target
            ? `${channelLabel(target.channel, state.channelDefinitions)} · ${target.name}`
            : "No Presence"}{" "}
          · {slot.objective.replace("_", " ")} ·{" "}
          {slot.mode} · {considerationSummary(slot.time, slot.executionWindow)}
        </span>
      </div>
      <div className="slot-actions"><button className="slot-edit" onClick={onEdit} aria-label={`Edit ${slot.label}`}><Pencil size={14} /> Edit</button><button className="slot-run" onClick={onRun}><Play size={14} /> Run now</button></div>
      <ChevronRight size={16} className="slot-chevron" />
    </div>
  );
}

function BrainView({
  state,
  mutate,
  selectedFile,
  setSelectedFile,
}: {
  state: OpenPresenceState;
  mutate: Mutate;
  selectedFile: FileKind;
  setSelectedFile: (file: FileKind) => void;
}) {
  const file =
    state.files.find((item) => item.kind === selectedFile) ?? state.files[0];
  const [content, setContent] = useState(file?.content ?? "");
  const agent = state.agent!;
  const [agentNameDraft, setAgentNameDraft] = useState(agent.name);
  const pending = state.proposals.filter((item) => item.status === "pending");
  const model = state.modelProfiles.find((item) => item.agentId === agent.id);
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [skillName, setSkillName] = useState("");
  const [skillDescription, setSkillDescription] = useState("");
  const [connectionProvider, setConnectionProvider] = useState<"openai" | "openrouter" | "ollama" | null>(null);
  const [connectionEndpoint, setConnectionEndpoint] = useState("http://localhost:11434");
  const [connectionSecret, setConnectionSecret] = useState("");
  const [ollamaModels, setOllamaModels] = useState<OllamaModelOption[]>([]);
  const [ollamaModelsError, setOllamaModelsError] = useState<string | null>(null);
  const ollamaConnection = state.providerConnections.find((item) => item.provider === "ollama" && item.status !== "needs-configuration");
  const ollamaConnectionId = ollamaConnection?.id;
  const ollamaEndpoint = ollamaConnection?.endpoint;
  const modelProvider = model?.provider;
  const enabledSkills = state.skills.filter((skill) => state.agentSkills.some((binding) => binding.skillId === skill.id && binding.enabled));
  const boundTools = state.toolBindings.map((binding) => ({
    binding,
    definition: AGENT_TOOL_DEFINITIONS.find((tool) => tool.id === binding.toolId),
  }));
  useEffect(() => {
    if (modelProvider !== "ollama" || !ollamaConnectionId) return;
    let cancelled = false;
    fetch(`/api/ollama/models?connectionId=${encodeURIComponent(ollamaConnectionId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await readJsonResponse<{ models?: OllamaModelOption[]; error?: string }>(response);
        if (!response.ok) throw new Error(payload.error ?? "Ollama model discovery failed.");
        return payload;
      })
      .then((payload) => {
        if (!cancelled) {
          setOllamaModelsError(null);
          setOllamaModels(payload.models ?? []);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setOllamaModelsError(reason instanceof Error ? reason.message : "Ollama model discovery failed.");
      });
    return () => { cancelled = true; };
  }, [modelProvider, ollamaConnectionId, ollamaEndpoint]);
  const resetSkillForm = () => { setSkillName(""); setSkillDescription(""); setEditingSkillId(null); setShowSkillForm(false); };
  const beginSkillEdit = (skill: OpenPresenceState["skills"][number]) => { setEditingSkillId(skill.id); setSkillName(skill.name ?? skill.id); setSkillDescription(skill.description); setShowSkillForm(true); };
  const saveSkill = async (event: React.FormEvent) => { event.preventDefault(); const next = await mutate(editingSkillId ? { type: "editSkill", id: editingSkillId, name: skillName, description: skillDescription } : { type: "createSkill", name: skillName, description: skillDescription }); if (next) resetSkillForm(); };
  const saveConnection = async (event: React.FormEvent) => { event.preventDefault(); const next = await mutate({ type: "configureProvider", provider: connectionProvider!, label: providerLabel(connectionProvider!), endpoint: connectionProvider === "ollama" ? connectionEndpoint : undefined, hasSecret: Boolean(connectionSecret), secret: connectionSecret || undefined }); if (next) { setConnectionProvider(null); setConnectionSecret(""); } };
  if (!file)
    return (
      <div className="page">
        <EmptyState
          title="Your mind is still forming"
          body="Create an Agent to see its meaning files."
        />
      </div>
    );
  return (
    <div className="page brain-page">
      <div className="page-heading">
        <div>
          <SectionEyebrow>Managed Agent</SectionEyebrow>
          <h1>Manage Agent</h1>
          <p className="muted">
            Manage {agent.name}&apos;s Brain, runtime, skills, and provider
            access. These settings shape every Presence.
          </p>
        </div>
        {pending.length > 0 && (
          <span className="review-badge">
            <CircleAlert size={14} /> {pending.length} to review
          </span>
        )}
      </div>
      <section className="settings-card agent-identity-card">
        <div>
          <SectionEyebrow>Agent identity</SectionEyebrow>
          <h2>What should this Agent be called?</h2>
          <p className="muted">This name identifies the persistent mind across its Presences. Changing it does not rewrite protected meaning files.</p>
        </div>
        <form className="identity-name-form" onSubmit={(event) => { event.preventDefault(); if (agentNameDraft.trim() && agentNameDraft.trim() !== agent.name) void mutate({ type: "renameAgent", name: agentNameDraft.trim() }); }}>
          <label>
            Agent name
            <input aria-label="Agent name" value={agentNameDraft} onChange={(event) => setAgentNameDraft(event.target.value)} maxLength={80} />
          </label>
          <Button type="submit" variant="secondary" disabled={!agentNameDraft.trim() || agentNameDraft.trim() === agent.name}><Check size={14} /> Save name</Button>
        </form>
      </section>
      <section className="brain-overview">
        <div><SectionEyebrow>Model runtime</SectionEyebrow><strong>{model?.provider === "ollama" ? ollamaModelLabel(ollamaModels.find((item) => item.name === model.model || item.name.startsWith(`${model.model}:`))?.name ?? model.model) : runtimeModels.find((item) => item.model === model?.model && item.quality === model?.quality)?.name ?? model?.model ?? "Not selected"}</strong><small>{model?.provider ?? "Choose a provider"} · {model?.quality ?? "runtime"}</small></div>
        <div><SectionEyebrow>Skills</SectionEyebrow><strong>{state.skills.length} installed</strong><small>{enabledSkills.length} enabled for {agent.name}</small></div>
        <div><SectionEyebrow>Tools</SectionEyebrow><strong>{boundTools.length} bound</strong><small>Agent-wide mechanical capabilities</small></div>
        <div><SectionEyebrow>Connections</SectionEyebrow><strong>{state.providerConnections.filter((item) => item.status !== "needs-configuration").length ? "Ready" : "Needs setup"}</strong><small>Set up provider access below.</small></div>
      </section>
      <section className="runtime-panel settings-card">
        <div className="section-heading compact"><div><SectionEyebrow>Model Runtime</SectionEyebrow><h2>Choose by provider</h2></div><span className="quiet-label">Agent-wide</span></div>
        <p className="muted runtime-intro">Model choice lives here so Chat stays a single, uninterrupted conversation.</p>
        {(() => {
          const selectedProvider =
            runtimeProviders.find((item) => item.id === model?.provider) ??
            runtimeProviders[0];
          const providerModels = selectedProvider.id === "ollama"
            ? ollamaModels.map((item) => ({ provider: "ollama" as const, label: "Ollama", model: item.name, name: ollamaModelLabel(item.name), quality: "local" as const, detail: ollamaModelDetail(item) }))
            : runtimeModels.filter((item) => item.provider === selectedProvider.id);
          return (
            <div className="runtime-provider">
              <div className="runtime-provider-heading">
                <select
                  className="runtime-provider-select"
                  aria-label="Runtime provider"
                  value={selectedProvider.id}
                  onChange={(event) => {
                    const provider = event.target.value as (typeof runtimeProviders)[number]["id"];
                    const nextModel = provider === "ollama"
                      ? ollamaModels[0]
                        ? { model: ollamaModels[0].name, provider: "ollama" as const, quality: "local" as const, vision: ollamaModels[0].capabilities.includes("vision") }
                        : undefined
                      : runtimeModels.find(
                          (item) =>
                            item.provider === provider &&
                            item.quality === model?.quality,
                        ) ?? runtimeModels.find((item) => item.provider === provider);
                    if (nextModel) {
                      void mutate({
                        type: "setModel",
                        model: nextModel.model,
                        provider: nextModel.provider,
                        quality: nextModel.quality,
                        vision: nextModel.provider !== "ollama",
                      });
                    }
                  }}
                >
                  {runtimeProviders.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                </select>
                <span>{selectedProvider.detail}</span>
              </div>
              {selectedProvider.id === "ollama" && (ollamaModelsError || !ollamaConnectionId) && <p className="runtime-model-status" role="status">{ollamaModelsError ?? "Connect Ollama to discover installed models."}</p>}
              {selectedProvider.id === "ollama" && !ollamaModelsError && ollamaModels.length === 0 && <p className="runtime-model-status" role="status">Discovering installed Ollama models…</p>}
              <div className="runtime-model-grid">
                {providerModels.map((item) => {
                  const selected =
                    model?.provider === item.provider &&
                    (model.model === item.model || item.provider === "ollama" && item.model.startsWith(`${model.model}:`)) &&
                    model.quality === item.quality;
                  return (
                    <button
                      type="button"
                      key={`${item.model}-${item.quality}`}
                      className={`runtime-model ${selected ? "selected" : ""}`}
                      aria-label={`Use ${item.name} ${item.quality === "local" ? "local" : item.quality}`}
                      onClick={() =>
                        void mutate({
                          type: "setModel",
                          model: item.model,
                          provider: item.provider,
                          quality: item.quality,
                          vision: item.provider !== "ollama",
                        })
                      }
                    >
                      <span>
                        <strong>
                          {item.name}{" "}
                          {item.quality === "local"
                            ? ""
                            : item.quality[0].toUpperCase() +
                              item.quality.slice(1)}
                        </strong>
                        <small>{item.detail}</small>
                      </span>
                      {selected && <Check size={14} />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </section>
      <section className="brain-config-grid">
        <div className="settings-card brain-action-card">
          <div className="section-heading compact">
            <div><SectionEyebrow>Skills</SectionEyebrow><h2>Installed skills</h2></div>
            <Button variant="secondary" onClick={() => showSkillForm ? resetSkillForm() : setShowSkillForm(true)}>
              <Plus size={14} /> {showSkillForm ? "Close" : "Create skill"}
            </Button>
          </div>
          <p className="muted">Skills are reusable instruction prompts you can enable for {agent.name}.</p>
          {showSkillForm && (
            <form className="inline-config-form" onSubmit={saveSkill}>
              <h3>{editingSkillId ? "Edit skill" : "Create skill"}</h3>
              <p className="form-hint">The prompt below becomes part of Jenny&apos;s reusable behavior when this skill is enabled.</p>
              <label>Skill name<input aria-label="Skill name" value={skillName} onChange={(event) => setSkillName(event.target.value)} placeholder="Research brief" maxLength={100} required /></label>
              <label>Instruction prompt<textarea aria-label="Skill prompt" value={skillDescription} onChange={(event) => setSkillDescription(event.target.value)} placeholder="Turn source material into a clear, useful founder brief." maxLength={500} rows={4} required /></label>
              <div className="inline-form-actions">
                <Button type="button" variant="ghost" onClick={resetSkillForm}>Cancel</Button>
                <Button type="submit" variant="primary"><Check size={14} /> {editingSkillId ? "Save skill changes" : "Create skill"}</Button>
              </div>
            </form>
          )}
          <div className="config-list">
            {state.skills.map((skill) => (
              <div className="config-list-row" key={skill.id}>
                <div><strong>{skill.name ?? skill.id}</strong><small>{skill.description}</small></div>
                <div className="config-row-actions">
                  <span className="status-tag">{state.agentSkills.some((binding) => binding.skillId === skill.id && binding.enabled) ? "Enabled" : "Installed"}</span>
                  <Button variant="ghost" onClick={() => beginSkillEdit(skill)}>Edit</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="settings-card brain-action-card"><div className="section-heading compact"><div><SectionEyebrow>Connections</SectionEyebrow><h2>Provider access</h2></div><PlugZap size={17} /></div><p className="muted">Connect a provider here; Chat will use the Agent runtime you choose above.</p><div className="config-list">{providerAccessProviders.map((provider) => { const connection = state.providerConnections.find((item) => item.provider === provider); const name = providerLabel(provider); return <div className="config-list-row" key={provider}><div><strong>{name}</strong><small>{connection?.status === "local" ? connection.endpoint ?? "Local endpoint" : connection?.secretConfigured ? "Credential ready" : connection?.status === "available" ? "Connected" : "Needs setup"}</small></div><Button variant={connection && connection.status !== "needs-configuration" ? "ghost" : "secondary"} onClick={() => { setConnectionProvider(provider as "openai" | "openrouter" | "ollama"); setConnectionSecret(""); if (provider === "ollama") setConnectionEndpoint(connection?.endpoint ?? "http://localhost:11434"); }}>{connection && connection.status !== "needs-configuration" ? "Edit" : "Set up"}</Button></div>; })}</div>{connectionProvider && <form className="inline-config-form" onSubmit={saveConnection}><h3>Set up {providerLabel(connectionProvider)}</h3>{connectionProvider === "ollama" ? <label>Ollama endpoint<input aria-label="Ollama endpoint" value={connectionEndpoint} onChange={(event) => setConnectionEndpoint(event.target.value)} required /></label> : <label>API key<input aria-label="Provider API key" type="password" value={connectionSecret} onChange={(event) => setConnectionSecret(event.target.value)} placeholder={connectionProvider === "openrouter" ? "sk-or-…" : "sk-…"} autoComplete="off" /></label>}<div className="inline-form-actions"><Button type="button" variant="ghost" onClick={() => setConnectionProvider(null)}>Cancel</Button><Button type="submit" variant="primary"><Check size={14} /> Save connection</Button></div></form>}</div>
      </section>
      <section className="settings-card tools-card" aria-label="Agent tools">
        <div className="section-heading compact">
          <div>
            <SectionEyebrow>Agent capabilities</SectionEyebrow>
            <h2>Tools bound to {agent.name}</h2>
          </div>
          <span className="quiet-label">{boundTools.length} bound</span>
        </div>
        <p className="muted tools-intro">
          These are Agent-level tool bindings, not channel permissions. A binding makes a capability eligible for a supported invocation; it does not run a tool or define Jenny&apos;s identity by itself.
        </p>
        <div className="tool-list">
          {boundTools.length ? boundTools.map(({ binding, definition }) => (
            <div className="tool-row" key={binding.id}>
              <div>
                <strong>{definition?.name ?? binding.toolId}</strong>
                <small>{definition?.description ?? "A runtime capability bound to this Agent."}</small>
              </div>
              <span className="status-tag">{definition?.scope === "presence" ? "Presence connector" : "Agent-wide"} · Bound</span>
            </div>
          )) : <p className="context-empty">No tools are bound to this Agent yet.</p>}
        </div>
        <p className="tool-boundary">
          Presence settings still control whether channel actions are off, manual, review, or auto. A tool being bound does not authorize a publication by itself.
        </p>
      </section>
      <div className="brain-layout">
        <aside className="file-list">
          <div className="file-list-label">Mind files</div>
          {fileOrder.map((kind) => {
            const item = state.files.find((entry) => entry.kind === kind)!;
            return (
              <button
                key={kind}
                onClick={() => {
                  setSelectedFile(kind);
                  setContent(item.content);
                }}
                className={kind === file.kind ? "active" : ""}
              >
                <FileText size={16} />
                <span>
                  <strong>{kind}.md</strong>
                  <small>{item.subtitle}</small>
                </span>
                {item.protected && <ShieldCheck size={13} />}
              </button>
            );
          })}
        </aside>
        <section className="file-editor">
          <div className="editor-header">
            <div>
              <SectionEyebrow>
                {file.protected ? "Protected meaning" : "Curated context"}
              </SectionEyebrow>
              <h2>{file.title}</h2>
            </div>
            <span>Revision {file.revision}</span>
          </div>
          <textarea
            aria-label={`${file.kind} content`}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            spellCheck={false}
          />
          <div className="editor-footer">
            <span>
              {file.protected
                ? "Your edit becomes a proposal for review."
                : "This file may be curated by the runtime."}
            </span>
            <Button
              variant="secondary"
              onClick={() =>
                mutate({ type: "saveFile", kind: file.kind, content })
              }
            >
              <Check size={14} />{" "}
              {file.protected ? "Propose change" : "Save changes"}
            </Button>
          </div>
        </section>
      </div>
      {pending.length > 0 && (
        <section className="proposal-section">
          <div className="section-heading">
            <div>
              <SectionEyebrow>Operator review</SectionEyebrow>
              <h2>Protected changes</h2>
            </div>
            <span className="quiet-label">Nothing changes silently</span>
          </div>
          {pending.map((item) => (
            <ProposalRow key={item.id} item={item} mutate={mutate} />
          ))}
        </section>
      )}
    </div>
  );
}
function ProposalRow({
  item,
  mutate,
}: {
  item: OpenPresenceState["proposals"][number];
  mutate: Mutate;
}) {
  return (
    <div className="proposal-row">
      <div className="proposal-copy">
        <strong>{item.title}</strong>
        <p>{item.reason}</p>
        <details>
          <summary>Preview proposed change</summary>
          <pre>{item.proposed}</pre>
        </details>
      </div>
      <div className="proposal-actions">
        <Button
          variant="secondary"
          onClick={() =>
            mutate({ type: "resolveProposal", id: item.id, decision: "reject" })
          }
        >
          <X size={14} /> Reject
        </Button>
        <Button
          variant="primary"
          onClick={() =>
            mutate({
              type: "resolveProposal",
              id: item.id,
              decision: "approve",
            })
          }
        >
          <Check size={14} /> Apply
        </Button>
      </div>
    </div>
  );
}

function PresenceView({
  state,
  mutate,
  setView,
  pendingOperation,
  manageBridge,
  manageX,
}: {
  state: OpenPresenceState;
  mutate: Mutate;
  setView?: (view: View) => void;
  pendingOperation?: string | null;
  manageBridge: BridgeManage;
  manageX: XManage;
}) {
  const presence = state.presence!;
  const waking = pendingOperation === "wakePresence";
  const capabilities =
    presence.capabilities ??
    CHANNEL_CAPABILITIES[
      presence.channel as keyof typeof CHANNEL_CAPABILITIES
    ] ??
    [];
  const connectionMode = presence.connectionMode ?? (presence.environment === "sandbox" ? "sandbox" : presence.channel === "x" ? "native" : "bridge");
  const simulation = simulationForChannel(presence.channel, state.channelDefinitions.find((item) => item.id === presence.channel));
  const nativeConnection = state.nativeConnections.find((item) => item.presenceId === presence.id && item.kind === "x");
  const activeBridge = state.bridges.find((item) => item.presenceId === presence.id && item.state !== "offline");
  const [customizing, setCustomizing] = useState(true);
  const [presenceNameDraft, setPresenceNameDraft] = useState(presence.name);
  const [briefDraft, setBriefDraft] = useState<PresenceBrief>(presence.brief);
  const [briefTerritoryText, setBriefTerritoryText] = useState(() => ({
    primaryTerritory: presence.brief.primaryTerritory.join(", "),
    adjacentTerritory: presence.brief.adjacentTerritory.join(", "),
    boundaries: presence.brief.boundaries.join(", "),
  }));
  const [editingBrief, setEditingBrief] = useState(false);
  const [ghostDraft, setGhostDraft] = useState<GhostProfile>(presence.ghostProfile ?? { subject: "Me / my organization", priorities: "", preferences: "", voice: "", boundaries: "" });
  const [publicSelfDraft, setPublicSelfDraft] = useState<PublicSelf>(presence.publicSelf ?? { displayName: presence.name, posture: presence.mode === "ghost" ? "representational" : "contextual", approvedTechnicalFacts: [] });
  const [mediaPolicyDraft, setMediaPolicyDraft] = useState(presence.mediaPerceptionPolicy);
  const [autoApprovalPrompt, setAutoApprovalPrompt] = useState<{ capabilities: string[]; labels: string[]; executionIds: string[] } | null>(null);
  const [confirmingAutoApproval, setConfirmingAutoApproval] = useState(false);
  const publicPostures: { id: PublicDisclosurePosture; label: string; detail: string }[] = presence.mode === "ghost"
    ? [{ id: "representational", label: "Representational", detail: "Speak as the person or organization this Presence extends." }, { id: "open-about-assistance", label: "Open about assistance", detail: "Acknowledge AI assistance when it is relevant." }]
    : [{ id: "contextual", label: "Contextual", detail: "Answer socially and acknowledge AI only when it matters." }, { id: "ai-forward", label: "AI-forward", detail: "Be direct that this is an AI presence when relevant." }, { id: "private", label: "Private", detail: "Keep technical identity private in public conversation." }];
  const savePublicSelf = () => void mutate({ type: "setPresence", patch: { publicSelf: { ...publicSelfDraft, displayName: presenceNameDraft.trim() || presence.name }, mediaPerceptionPolicy: mediaPolicyDraft } });
  const territoryValues = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
  const openBriefEditor = () => {
    setBriefDraft(presence.brief);
    setBriefTerritoryText({
      primaryTerritory: presence.brief.primaryTerritory.join(", "),
      adjacentTerritory: presence.brief.adjacentTerritory.join(", "),
      boundaries: presence.brief.boundaries.join(", "),
    });
    setEditingBrief(true);
  };
  const updateBriefTerritory = (field: "primaryTerritory" | "adjacentTerritory" | "boundaries", value: string) => {
    setBriefTerritoryText((current) => ({ ...current, [field]: value }));
    setBriefDraft((current) => ({ ...current, [field]: territoryValues(value) }));
  };
  const requestExecutionChange = (patch: Record<string, ExecutionMode>) => {
    const autoCapabilities = Object.entries(patch).filter(([, mode]) => mode === "auto").map(([key]) => key);
    const changingReviewToAuto = autoCapabilities.some((key) => (presence.execution[key] ?? "off") === "review");
    const pending = changingReviewToAuto ? pendingReviewExecutionsForCapabilities(state, presence.id, autoCapabilities) : [];
    if (pending.length > 0) {
      setAutoApprovalPrompt({
        capabilities: autoCapabilities,
        labels: capabilities.filter((item) => autoCapabilities.includes(item.id)).map((item) => item.label),
        executionIds: pending.map((execution) => execution.id),
      });
      return;
    }
    void mutate({ type: "setPresence", patch: { execution: patch } });
  };
  const setMode = (key: string, mode: ExecutionMode) => requestExecutionChange({ [key]: mode });
  const applyPreset = (mode: ExecutionMode) => requestExecutionChange(Object.fromEntries(capabilities.map((item) => [item.id, mode])));
  const confirmAutoApproval = async () => {
    if (!autoApprovalPrompt) return;
    setConfirmingAutoApproval(true);
    const updated = await mutate({ type: "confirmAutoMode", presenceId: presence.id, capabilities: autoApprovalPrompt.capabilities, executionIds: autoApprovalPrompt.executionIds });
    if (updated) setAutoApprovalPrompt(null);
    setConfirmingAutoApproval(false);
  };
  const autoApprovalLabel = autoApprovalPrompt?.labels.length === 1 ? autoApprovalPrompt.labels[0] : "these capabilities";
  return (
    <div className="page presence-settings-page">
      <div className="page-heading">
        <div>
          <SectionEyebrow>One place, one envelope</SectionEyebrow>
          <h1>Presence settings</h1>
          <p className="muted">
            Choose who speaks here and how independently this Presence acts.
          </p>
        </div>
        <Button
          variant={presence.status === "paused" ? "primary" : "secondary"}
          disabled={waking}
          onClick={() => mutate(presence.status === "paused"
            ? { type: "wakePresence", presenceId: presence.id }
            : { type: "setPresence", patch: { status: "paused" } })}
        >
          {presence.status === "paused" ? (
            <>
              <Play size={14} /> {waking ? "Waking Jenny…" : "Wake up Jenny"}
            </>
          ) : (
            <>
              <Pause size={14} /> Pause Presence
            </>
          )}
        </Button>
      </div>
      <div className="presence-overview" style={{ "--agent-accent": presence.accent } as React.CSSProperties}>
        <div className="presence-identity">
          <div className="presence-overview-logo">
            <PresenceLogo channel={presence.channel} definitions={state.channelDefinitions} size="large" />
          </div>
          <div className="presence-overview-copy">
            <span className="eyebrow">
              {channelLabel(presence.channel, state.channelDefinitions)} ·
              Presence
            </span>
            <h2>{presence.name}</h2>
            <p className="presence-handle">{presence.handle}</p>
          </div>
        </div>
        <div className="presence-overview-intro">
          <span className="eyebrow">Public identity</span>
          <strong>{presence.mode === "ghost" ? "Ghost presence" : "Agent-owned presence"}</strong>
          <p>
            {presence.mode === "ghost"
              ? "Extends the operator’s attention and judgment here."
              : `Speaks as ${presence.name} with an independent point of view.`}
          </p>
        </div>
        <div className="presence-overview-meta" aria-label="Presence summary">
          <div>
            <span>Channel</span>
            <strong>{channelLabel(presence.channel, state.channelDefinitions)}</strong>
          </div>
          <div>
            <span>Route</span>
            <strong>{connectionMode === "sandbox" ? "Sandbox" : connectionMode === "native" ? "Live API" : "Bridge"}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong className={presence.status === "paused" ? "presence-status paused" : "presence-status"}>
              <span aria-hidden="true" /> {presence.status === "paused" ? "Paused" : "Awake"}
            </strong>
          </div>
        </div>
      </div>
      <section className="settings-card channel-settings-card">
        <div className="section-heading compact">
          <div>
            <SectionEyebrow>Channel & environment</SectionEyebrow>
            <h2>Where should Jenny show up?</h2>
          </div>
          <Globe2 size={17} />
        </div>
        <p className="muted channel-settings-intro">Choose one destination for {simulation.worldLabel}. Sandbox is safe to rehearse; X and Bridge are live routes.</p>
        <div className="channel-mode-options">
          <button className={connectionMode === "sandbox" ? "selected" : ""} onClick={() => void mutate({ type: "setPresence", patch: { connectionMode: "sandbox" } })}>
            <FlaskConical size={17} />
            <span><strong>Sandbox · {simulation.worldLabel}</strong><small>Channel-specific simulated world · nothing leaves OpenPresence</small></span>
          </button>
          {presence.channel === "x" && <button className={connectionMode === "native" ? "selected" : ""} onClick={() => void mutate({ type: "setPresence", patch: { connectionMode: "native" } })}>
            <span className="channel-option-mark"><XBrand /></span>
            <span><strong>X</strong><small>Live public channel through the official API</small></span>
          </button>}
          <button className={connectionMode === "bridge" ? "selected" : ""} onClick={() => void mutate({ type: "setPresence", patch: { connectionMode: "bridge" } })}>
            <PlugZap size={17} />
            <span><strong>Bridge</strong><small>Live channel through an external adapter</small></span>
          </button>
        </div>
        <div className="channel-selection-status">
          {connectionMode === "sandbox" && <div className="channel-sandbox-summary"><div><strong>This world is simulated.</strong><p>{simulation.worldLabel} history stays in this rehearsal session; Jenny’s mind is shared.</p></div><Button variant="secondary" onClick={() => setView?.("playground")}><FlaskConical size={14} /> Open Playground</Button></div>}
          {connectionMode === "native" && presence.channel === "x" && <XConnection state={state} presence={presence} manageX={manageX} />}
          {connectionMode === "bridge" && <BridgeManager state={state} presence={presence} manageBridge={manageBridge} />}
        </div>
        {connectionMode !== "sandbox" && !(connectionMode === "native" ? nativeConnection?.status === "connected" : activeBridge?.state === "online") && <p className="channel-not-connected">No live connection is active yet. Configure the selected route below when you’re ready.</p>}
      </section>
      <section className="identity-card settings-card">
        <div>
          <SectionEyebrow>Identity</SectionEyebrow>
          <h2>Who speaks here?</h2>
          <p>
            {presence.mode === "ghost"
              ? "Jenny extends the operator’s attention and judgment."
              : "Jenny speaks as an agent with her own point of view."}
          </p>
        </div>
        <div className="identity-name-form">
          <label>
            Presence name
            <input
              aria-label="Presence name"
              value={presenceNameDraft}
              onChange={(event) => setPresenceNameDraft(event.target.value)}
              maxLength={120}
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            disabled={!presenceNameDraft.trim() || presenceNameDraft.trim() === presence.name}
            onClick={() => void mutate({ type: "setPresence", patch: { name: presenceNameDraft.trim() } })}
          >
            <Check size={14} /> Save name
          </Button>
        </div>
        <div className="identity-options">
          <button
            className={presence.mode === "agent" ? "selected" : ""}
            onClick={() =>
              mutate({ type: "setPresence", patch: { mode: "agent" } })
            }
          >
            <strong>Jenny</strong>
            <small>Agent-owned</small>
          </button>
          <button
            className={presence.mode === "ghost" ? "selected" : ""}
            onClick={() =>
              mutate({ type: "setPresence", patch: { mode: "ghost" } })
            }
          >
            <strong>Me / my organization</strong>
            <small>Ghost · extends my identity</small>
          </button>
        </div>
      </section>
      <section className="settings-card presence-brief-card">
        <div className="section-heading compact">
          <div>
            <SectionEyebrow>PRESENCE BRIEF · Presence-scoped</SectionEyebrow>
            <h2>What is this Presence here for?</h2>
          </div>
          <Button type="button" variant="ghost" onClick={() => { if (editingBrief) { setBriefDraft(presence.brief); setBriefTerritoryText({ primaryTerritory: presence.brief.primaryTerritory.join(", "), adjacentTerritory: presence.brief.adjacentTerritory.join(", "), boundaries: presence.brief.boundaries.join(", ") }); setEditingBrief(false); } else openBriefEditor(); }} aria-label={editingBrief ? "Close brief editor" : "Edit brief"}>
            <Pencil size={14} /> {editingBrief ? "Close" : "Edit brief"}
          </Button>
        </div>
        <p className="muted presence-brief-intro">{presence.name} brings the same mind here, but this Presence can have its own audience, emphasis, and boundaries.</p>
        {!editingBrief ? (
          <div className="presence-brief-summary">
            <div><span>Purpose</span><p>{presence.brief.purpose}</p></div>
            <div><span>Audience</span><p>{presence.brief.audience}</p></div>
            <div><span>Known for</span><div className="presence-brief-chips">{presence.brief.primaryTerritory.length ? presence.brief.primaryTerritory.map((item) => <span key={item}>{item}</span>) : <em>Not narrowed yet</em>}</div></div>
            <div><span>Also comfortable with</span><div className="presence-brief-chips">{presence.brief.adjacentTerritory.length ? presence.brief.adjacentTerritory.map((item) => <span key={item}>{item}</span>) : <em>Not specified yet</em>}</div></div>
            <div><span>Keep out</span><div className="presence-brief-chips">{presence.brief.boundaries.length ? presence.brief.boundaries.map((item) => <span key={item}>{item}</span>) : <em>No public boundaries set</em>}</div></div>
          </div>
        ) : (
          <div className="presence-brief-editor">
            <label>Purpose<textarea aria-label="Presence Brief purpose" value={briefDraft.purpose} onChange={(event) => setBriefDraft({ ...briefDraft, purpose: event.target.value })} rows={2} /></label>
            <label>Audience<input aria-label="Presence Brief audience" value={briefDraft.audience} onChange={(event) => setBriefDraft({ ...briefDraft, audience: event.target.value })} /></label>
            <label>Primary territory <small>Topics, ideas, communities, or problems this Presence wants to be known for.</small><textarea aria-label="Primary territory" value={briefTerritoryText.primaryTerritory} onChange={(event) => updateBriefTerritory("primaryTerritory", event.target.value)} rows={2} /></label>
            <label>Adjacent territory <small>Things this Presence can join without making them its main identity.</small><textarea aria-label="Adjacent territory" value={briefTerritoryText.adjacentTerritory} onChange={(event) => updateBriefTerritory("adjacentTerritory", event.target.value)} rows={2} /></label>
            <label>Keep out <small>Public areas this Presence generally does not express or amplify. They remain visible for judgment.</small><textarea aria-label="Presence Brief boundaries" value={briefTerritoryText.boundaries} onChange={(event) => updateBriefTerritory("boundaries", event.target.value)} rows={2} /></label>
            <div className="inline-form-actions"><Button type="button" variant="ghost" onClick={() => { setBriefDraft(presence.brief); setBriefTerritoryText({ primaryTerritory: presence.brief.primaryTerritory.join(", "), adjacentTerritory: presence.brief.adjacentTerritory.join(", "), boundaries: presence.brief.boundaries.join(", ") }); setEditingBrief(false); }}>Cancel</Button><Button type="button" variant="primary" disabled={!briefDraft.purpose.trim() || !briefDraft.audience.trim()} onClick={() => { void mutate({ type: "setPresence", patch: { brief: { purpose: briefDraft.purpose.trim(), audience: briefDraft.audience.trim(), primaryTerritory: territoryValues(briefTerritoryText.primaryTerritory), adjacentTerritory: territoryValues(briefTerritoryText.adjacentTerritory), boundaries: territoryValues(briefTerritoryText.boundaries) } } }); setEditingBrief(false); }}><Check size={14} /> Save brief</Button></div>
          </div>
        )}
      </section>
      <section className="settings-card public-self-card">
        <div className="section-heading compact">
          <div>
            <SectionEyebrow>Public self · Presence-scoped</SectionEyebrow>
            <h2>How this Presence describes itself</h2>
          </div>
          <ShieldCheck size={17} />
        </div>
        <p className="muted">The Agent is the private mind. This Public Self is who people meet here. Implementation details stay out of social judgment unless you approve a specific fact.</p>
        <div className="public-self-postures">
          <span className="public-self-label">Identity posture</span>
          {publicPostures.map((option) => (
            <button key={option.id} className={publicSelfDraft.posture === option.id ? "selected" : ""} onClick={() => setPublicSelfDraft({ ...publicSelfDraft, posture: option.id })}>
              <strong>{option.label}</strong><small>{option.detail}</small>
            </button>
          ))}
        </div>
        <div className="public-facts">
          <div><strong>Approved disclosure details</strong><p className="form-hint">Choose which details this Presence may share when relevant. These permissions never include credentials, private instructions, or hidden prompts.</p></div>
          <div className="public-fact-grid">
            {PUBLIC_TECHNICAL_FACTS.map((fact) => {
              const checked = publicSelfDraft.approvedTechnicalFacts.includes(fact.id);
              return <label key={fact.id}><input type="checkbox" checked={checked} onChange={() => setPublicSelfDraft({ ...publicSelfDraft, approvedTechnicalFacts: checked ? publicSelfDraft.approvedTechnicalFacts.filter((item) => item !== fact.id) : [...publicSelfDraft.approvedTechnicalFacts, fact.id] })} /><span><strong>{fact.label}</strong><small>{fact.detail}</small></span></label>;
            })}
          </div>
        </div>
        {publicSelfDraft.approvedTechnicalFacts.length === 0 && <div className="public-facts-default" role="note">
          <strong>Default when none are selected</strong>
          <p><b>Typical response:</b> answer naturally as this Presence without volunteering AI, platform, provider, model, or tool details. Direct questions still follow the Identity posture above.</p>
        </div>}
        <div className="inline-form-actions"><Button variant="primary" onClick={savePublicSelf}><Check size={14} /> Save Public Self</Button></div>
      </section>
      <section className="settings-card presence-rhythm-card" id="rhythm-settings">
        <div className="section-heading compact">
          <div>
            <SectionEyebrow>Attention rhythm</SectionEyebrow>
            <h2>When should {presence.name} look around?</h2>
          </div>
          <Clock3 size={17} />
        </div>
        <p className="muted rhythm-intro">Rhythm controls when this Presence checks its connected channel for something worth considering. It never tells Jenny what to say, and it never turns a check into a forced publication.</p>
        <div className="rhythm-options" role="group" aria-label="Attention rhythm">
          {([
            ["recommended", "Recommended", "Check about every 5 minutes when a live observer is connected."],
            ["gentle", "Gentle", "Check about every 15 minutes to reduce interruptions."],
            ["custom", "Custom", "Choose the check interval and a quiet-hours window."],
          ] as const).map(([id, label, detail]) => (
            <button type="button" key={id} className={presence.pacing === id ? "selected" : ""} onClick={() => void mutate({ type: "setPresence", patch: { pacing: id } })} aria-pressed={presence.pacing === id}>
              <strong>{label}</strong>
              <small>{detail}</small>
            </button>
          ))}
        </div>
        {presence.pacing === "custom" && (
          <div className="rhythm-custom-control">
            <label htmlFor="attention-interval">Check interval</label>
            <div className="rhythm-control-line">
              <select id="attention-interval" aria-label="Custom attention interval" value={presence.attentionIntervalMinutes} onChange={(event) => void mutate({ type: "setPresence", patch: { attentionIntervalMinutes: Number(event.target.value) } })}>
                {[5, 10, 15, 30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
              </select>
              <small>Automatic observation only. “Check now” remains available at any time.</small>
            </div>
          </div>
        )}
        <div className="quiet-hours-control">
          <div className="quiet-hours-heading">
            <div><strong>Quiet hours</strong><small>Pause automatic channel checks during this local time window. Calendar intentions remain available to run explicitly.</small></div>
            <label className="toggle-control"><input type="checkbox" aria-label="Enable quiet hours" checked={presence.quietHours.enabled} onChange={(event) => void mutate({ type: "setPresence", patch: { quietHours: { ...presence.quietHours, enabled: event.target.checked } } })} /><span aria-hidden="true" /></label>
          </div>
          {presence.quietHours.enabled ? (
            <div className="quiet-hours-fields">
              <label>Starts<input aria-label="Quiet hours start" type="time" value={presence.quietHours.start} onChange={(event) => void mutate({ type: "setPresence", patch: { quietHours: { ...presence.quietHours, start: event.target.value } } })} /></label>
              <span>to</span>
              <label>Ends<input aria-label="Quiet hours end" type="time" value={presence.quietHours.end} onChange={(event) => void mutate({ type: "setPresence", patch: { quietHours: { ...presence.quietHours, end: event.target.value } } })} /></label>
            </div>
          ) : <p className="form-hint quiet-hours-off">Off · automatic observation follows the selected rhythm.</p>}
        </div>
      </section>
      <section className="settings-card media-policy-card">
        <div className="section-heading compact">
          <div>
            <SectionEyebrow>Media understanding</SectionEyebrow>
            <h2>When media is hard to interpret</h2>
          </div>
          <ShieldCheck size={17} />
        </div>
        <p className="muted">Perception explains what media appears to mean. Taste decides whether it is worth acting on. An uninspected asset is never treated as truth.</p>
        <div className="media-policy-options">
          {([
            ["use-judgment", "Use judgment", "Continue only when the available perception is enough for this action."],
            ["review-uncertain", "Review uncertain actions", "Send media-dependent actions for review when perception is uncertain."],
            ["always-review", "Always review media actions", "Keep every reply, repost, or quote involving media under review."],
          ] as const).map(([id, label, detail]) => <button type="button" key={id} className={mediaPolicyDraft === id ? "selected" : ""} onClick={() => { setMediaPolicyDraft(id); void mutate({ type: "setPresence", patch: { mediaPerceptionPolicy: id } }); }}><strong>{label}</strong><small>{detail}</small></button>)}
        </div>
      </section>
      {presence.mode === "ghost" && (
        <section className="settings-card ghost-profile-card" key={`${presence.id}-${JSON.stringify(presence.ghostProfile ?? {})}`}>
          <div className="section-heading compact">
            <div>
              <SectionEyebrow>Ghost profile · Presence-scoped</SectionEyebrow>
              <h2>What should this Ghost represent?</h2>
            </div>
            <Ghost size={17} />
          </div>
          <p className="muted">This is the context Jenny uses to extend you here. It does not change Jenny&apos;s Brain, Soul, Mission, Taste, Memory, or Growth.</p>
          <div className="ghost-profile-form">
            <label>Who or what is represented?<input aria-label="Ghost subject" value={ghostDraft.subject} onChange={(event) => setGhostDraft({ ...ghostDraft, subject: event.target.value })} placeholder="Me / my organization" /></label>
            <label>Priorities here<textarea aria-label="Ghost priorities" value={ghostDraft.priorities} onChange={(event) => setGhostDraft({ ...ghostDraft, priorities: event.target.value })} placeholder="What should this Presence help accomplish?" rows={3} /></label>
            <label>Preferences and points of view<textarea aria-label="Ghost preferences" value={ghostDraft.preferences} onChange={(event) => setGhostDraft({ ...ghostDraft, preferences: event.target.value })} placeholder="What do you care about, prefer, or believe?" rows={3} /></label>
            <label>Voice and tone<textarea aria-label="Ghost voice" value={ghostDraft.voice} onChange={(event) => setGhostDraft({ ...ghostDraft, voice: event.target.value })} placeholder="How should it sound when extending you?" rows={3} /></label>
            <label>Boundaries and things to avoid<textarea aria-label="Ghost boundaries" value={ghostDraft.boundaries} onChange={(event) => setGhostDraft({ ...ghostDraft, boundaries: event.target.value })} placeholder="What should it never assume, disclose, or do?" rows={3} /></label>
          </div>
          <div className="ghost-understanding" role="status">
            <div className="section-heading compact"><div><SectionEyebrow>Review before acting</SectionEyebrow><h3>What Jenny currently understands</h3></div><span className={`status-tag ${ghostDraft.priorities.trim() && ghostDraft.preferences.trim() && ghostDraft.voice.trim() && ghostDraft.boundaries.trim() ? "status-ready" : "status-incomplete"}`}>{ghostDraft.priorities.trim() && ghostDraft.preferences.trim() && ghostDraft.voice.trim() && ghostDraft.boundaries.trim() ? "Profile defined" : "Needs your input"}</span></div>
            <dl>
              <div><dt>Represents</dt><dd>{ghostDraft.subject.trim() || "Not defined yet"}</dd></div>
              <div><dt>Priorities</dt><dd>{ghostDraft.priorities.trim() || "Not defined yet"}</dd></div>
              <div><dt>Preferences</dt><dd>{ghostDraft.preferences.trim() || "Not defined yet"}</dd></div>
              <div><dt>Voice</dt><dd>{ghostDraft.voice.trim() || "Not defined yet"}</dd></div>
              <div><dt>Boundaries</dt><dd>{ghostDraft.boundaries.trim() || "Not defined yet"}</dd></div>
            </dl>
            <p className="form-hint">Empty fields are unknown. Jenny must not infer them from her own identity or private context.</p>
          </div>
          <div className="inline-form-actions"><Button variant="primary" disabled={!ghostDraft.subject.trim()} onClick={() => void mutate({ type: "setPresence", patch: { ghostProfile: { ...ghostDraft, subject: ghostDraft.subject.trim(), priorities: ghostDraft.priorities.trim(), preferences: ghostDraft.preferences.trim(), voice: ghostDraft.voice.trim(), boundaries: ghostDraft.boundaries.trim() } } })}><Check size={14} /> Save Ghost profile</Button></div>
        </section>
      )}
      <section className="settings-card presence-execution-card">
          <div className="section-heading compact">
            <div>
              <SectionEyebrow>
                Execution envelope ·{" "}
                {channelLabel(presence.channel, state.channelDefinitions)}
              </SectionEyebrow>
              <h2>How this Presence acts</h2>
            </div>
            <Settings2 size={17} />
          </div>
          <div className="independence-options">
            <span>Independence</span>
            <button onClick={() => applyPreset("review")}>
              <strong>Supervised</strong>
              <small>Review every action</small>
            </button>
            <button onClick={() => applyPreset("auto")}>
              <strong>Independent</strong>
              <small>Auto where allowed</small>
            </button>
            <button
              className={customizing ? "selected" : ""}
              onClick={() => setCustomizing(!customizing)}
            >
              <strong>Custom</strong>
              <small>Choose by capability</small>
            </button>
          </div>
          {customizing && (
            <div className="capability-matrix">
              <div className="matrix-head">
                <span>Capability</span>
                <span>Off</span>
                <span>Manual</span>
                <span>Review</span>
                <span>Auto</span>
              </div>
              {capabilities.map((item) => (
                <div className="matrix-row" key={item.id}>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </div>
                  {(["off", "manual", "review", "auto"] as ExecutionMode[]).map(
                    (mode) => (
                      <button
                        key={mode}
                        aria-label={`${item.label} ${mode}`}
                        aria-pressed={
                          (presence.execution[item.id] ?? "off") === mode
                        }
                        className={
                          (presence.execution[item.id] ?? "off") === mode
                            ? "selected"
                            : ""
                        }
                        onClick={() => setMode(item.id, mode)}
                      >
                        {(presence.execution[item.id] ?? "off") === mode
                          ? "●"
                          : ""}
                      </button>
                    ),
                  )}
                </div>
              ))}
            </div>
          )}
      </section>
      {autoApprovalPrompt && (
        <div className="modal-backdrop auto-approval-modal-backdrop">
          <section className="presence-dialog auto-approval-dialog" role="dialog" aria-modal="true" aria-labelledby="auto-approval-title">
            <div className="dialog-header">
              <div>
                <SectionEyebrow>Execution setting</SectionEyebrow>
                <h2 id="auto-approval-title">Enable Auto for {autoApprovalLabel}?</h2>
              </div>
              <button type="button" className="icon-button" aria-label="Close confirmation" disabled={confirmingAutoApproval} onClick={() => setAutoApprovalPrompt(null)}><X size={17} /></button>
            </div>
            <p>Changing {autoApprovalLabel} from Review to Auto will automatically approve {autoApprovalPrompt.executionIds.length} {autoApprovalPrompt.executionIds.length === 1 ? "message" : "messages"} waiting for approval and let them continue automatically.</p>
            <div className="auto-approval-summary" role="status">
              <strong>{autoApprovalPrompt.executionIds.length} pending {autoApprovalPrompt.executionIds.length === 1 ? "reply" : "replies"}</strong>
              <small>Keep Review if you want to decide on these messages one at a time.</small>
            </div>
            <div className="dialog-actions">
              <Button variant="secondary" disabled={confirmingAutoApproval} onClick={() => setAutoApprovalPrompt(null)}>Keep Review</Button>
              <Button variant="primary" disabled={confirmingAutoApproval} onClick={() => void confirmAutoApproval()}>{confirmingAutoApproval ? "Approving…" : "Confirm Auto"}</Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function XConnection({
  state,
  presence,
  manageX,
}: {
  state: OpenPresenceState;
  presence: NonNullable<OpenPresenceState["presence"]>;
  manageX: XManage;
}) {
  const connection = state.nativeConnections.find((item) => item.presenceId === presence.id && item.kind === "x");
  const [open, setOpen] = useState(!connection);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [accessTokenSecret, setAccessTokenSecret] = useState("");
  const [result, setResult] = useState<{ account: { id: string; username: string; name: string }; access: "read" | "read-write" } | null>(null);
  const [working, setWorking] = useState<"test" | "save" | "disconnect" | null>(null);
  const credentials = { apiKey, apiSecret, bearerToken, accessToken, accessTokenSecret };
  const clearForm = () => { setApiKey(""); setApiSecret(""); setBearerToken(""); setAccessToken(""); setAccessTokenSecret(""); setResult(null); };
  const test = async () => { setWorking("test"); const response = await manageX({ action: "test", presenceId: presence.id, credentials }); setWorking(null); if (response?.result) setResult(response.result); };
  const save = async (event: React.FormEvent) => { event.preventDefault(); setWorking("save"); const response = await manageX({ action: "save", presenceId: presence.id, credentials }); setWorking(null); if (response?.result) { setResult(response.result); setOpen(false); clearForm(); } };
  const disconnect = async () => { setWorking("disconnect"); await manageX({ action: "disconnect", presenceId: presence.id }); setWorking(null); setResult(null); clearForm(); setOpen(true); };
  return (
    <div className="channel-connector-panel native-connection-card">
      <div className="section-heading compact">
        <div>
          <SectionEyebrow>Official X API</SectionEyebrow>
          <h2>{connection ? `Connected to @${connection.account?.username ?? presence.handle.replace(/^@/, "")}` : "Connect this Presence to X"}</h2>
        </div>
        <Radio size={17} />
      </div>
      {connection && !open ? (
        <>
          <div className="connection-summary">
            <div><strong>{connection.account?.name ?? "X account"}</strong><small>@{connection.account?.username ?? "unknown"}</small></div>
            <span className={`live-pill ${connection.status === "needs-attention" ? "paused" : ""}`}><span className="status-dot" /> {connection.status === "needs-attention" ? "Needs attention" : "Connected"}</span>
          </div>
          <p className="muted">Official X API authentication is {connection.access === "read-write" ? "configured with read + write credentials" : "read only"}. {connection.status === "needs-attention" ? `The last native request was rejected: ${connection.healthMessage ?? "X returned an error"}.` : connection.deliveryError ? `The last X delivery failed: ${connection.deliveryError}` : connection.access === "read" ? "Add User Access Token and User Access Token Secret to let Jenny publish and reply." : "A successful write is verified only when X accepts a post and returns its external ID."} Credentials are encrypted on this server and never returned to the browser.</p>
          <div className="bridge-row-actions"><Button variant="ghost" onClick={() => setOpen(true)}>Update credentials</Button><Button variant="danger" disabled={working === "disconnect"} onClick={() => void disconnect()}>{working === "disconnect" ? "Disconnecting…" : "Disconnect"}</Button></div>
        </>
      ) : (
        <form className="x-connection-form" onSubmit={(event) => void save(event)}>
          <p className="muted">Use the official X API for this Presence. A Bearer Token enables read access; user access tokens enable posting and replies.</p>
          <p className="x-credentials-help">Find these values in <a href="https://console.x.com/" target="_blank" rel="noreferrer">X Developer Console</a> → your app → <strong>Keys and tokens</strong>. Generate or regenerate <strong>Access Token and Secret</strong> after setting the app permission to read and write.</p>
          <div className="x-credential-grid">
            <label className="x-credential-field"><span className="x-field-label">API Key / Consumer Key</span><input aria-label="X API Key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" required /></label>
            <label className="x-credential-field"><span className="x-field-label">API Key Secret / Consumer Secret</span><input aria-label="X API Key Secret" type="password" value={apiSecret} onChange={(event) => setApiSecret(event.target.value)} autoComplete="off" required /></label>
            <label className="x-credential-field"><span className="x-field-label">Bearer Token <small>Optional · read access</small></span><input aria-label="X Bearer Token" type="password" value={bearerToken} onChange={(event) => setBearerToken(event.target.value)} autoComplete="off" /></label>
            <label className="x-credential-field"><span className="x-field-label">User Access Token <small>Required · write access</small></span><input aria-label="X User Access Token" type="password" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} autoComplete="off" /></label>
            <label className="x-credential-field"><span className="x-field-label">User Access Token Secret <small>Required · write access</small></span><input aria-label="X User Access Token Secret" type="password" value={accessTokenSecret} onChange={(event) => setAccessTokenSecret(event.target.value)} autoComplete="off" /></label>
          </div>
          {result && <div className="connection-result" role="status"><Check size={15} /><span>Connected to <strong>@{result.account.username}</strong> · {result.access === "read-write" ? "Read + write" : "Read only"}</span></div>}
          <div className="inline-form-actions"><Button type="button" variant="ghost" onClick={() => { clearForm(); setOpen(Boolean(connection)); }}>Cancel</Button><Button type="button" variant="secondary" onClick={() => void test()} disabled={working !== null || !apiKey || !apiSecret}>{working === "test" ? "Testing…" : "Test connection"}</Button><Button type="submit" variant="primary" disabled={working !== null}>{working === "save" ? "Saving…" : "Save connection"}</Button></div>
        </form>
      )}
    </div>
  );
}

function BridgeManager({
  state,
  presence,
  manageBridge,
}: {
  state: OpenPresenceState;
  presence: OpenPresenceState["presence"];
  manageBridge: BridgeManage;
}) {
  const [name, setName] = useState("Community Bridge");
  const [kind, setKind] = useState<ConnectorKind>("bridge");
  const [key, setKey] = useState<string | undefined>();
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const bridges = state.bridges.filter(
    (item) => item.presenceId === presence?.id,
  );
  const activeBridges = bridges.filter((item) => item.state !== "offline");
  const channel = state.channelDefinitions.find(
    (item) => item.id === presence?.channel,
  );
  if (!presence) return null;
  const create = async () => {
    const result = await manageBridge({
      action: "create",
      presenceId: presence.id,
      name,
      kind,
      capabilities: {
        inbound: true,
        reconcile: true,
        affordances: presence.capabilities.map((item) => item.id),
        formats: [],
        metrics: ["replies", "reactions"],
      },
    });
    if (result?.key) setKey(result.key);
  };
  const disconnect = async (bridgeId: string) => {
    setDisconnecting(bridgeId);
    const result = await manageBridge({ action: "revoke", bridgeId });
    setDisconnecting(null);
    if (result) setKey(undefined);
  };
  const remove = async (bridgeId: string) => {
    setDisconnecting(bridgeId);
    const result = await manageBridge({ action: "remove", bridgeId });
    setDisconnecting(null);
    if (result) setKey(undefined);
  };
  const externalEventsEndpoint = "/api/bridge/v1/events";
  const externalExecutionsEndpoint = "/api/bridge/v1/executions/claim";
  const bridgeRows = bridges.map((bridge) => (
    <div className="bridge-row" key={bridge.id}>
      <div>
        <strong>{bridge.name}</strong>
        <small>
          {bridge.state === "offline"
            ? bridge.credentialRevokedAt
              ? "Disconnected · its credential has been revoked."
              : bridge.keyPrefix || bridge.credentialId
                ? "Disconnected · credential metadata is available, but its revocation time is unavailable."
                : "Disconnected · credential metadata is unavailable."
            : `Can observe · ${bridge.capabilities.inbound ? "social objects" : "nothing yet"}`}
        </small>
        {bridge.state === "offline" && (
          <small className="bridge-credential-meta">
            {bridge.keyPrefix || bridge.credentialId ? (
              <>Credential prefix: <code>{bridge.keyPrefix ?? bridge.credentialId}</code>{bridge.credentialRevokedAt ? ` · revoked ${formatTime(bridge.credentialRevokedAt)}` : " · revocation time unavailable"}</>
            ) : "No credential record remains for this Bridge."}
            {" · secret value is not recoverable"}
          </small>
        )}
        {bridge.state !== "offline" && (
          <small>
            Can perform · {bridge.capabilities.affordances.join(", ")}
          </small>
        )}
      </div>
      <div className="bridge-row-actions">
        <span
          className={`live-pill ${bridge.state === "online" ? "" : "paused"}`}
        >
          <span className="status-dot" />{" "}
          {bridge.state === "online"
            ? "Connected"
            : bridge.state === "degraded"
              ? "Needs attention"
              : "Disconnected"}
        </span>
        {bridge.state !== "offline" && (
          <Button
            variant="danger"
            disabled={disconnecting === bridge.id}
            onClick={() => void disconnect(bridge.id)}
          >
            {disconnecting === bridge.id ? "Disconnecting…" : "Disconnect"}
          </Button>
        )}
        {bridge.state === "offline" && (
          <Button
            variant="danger"
            disabled={disconnecting === bridge.id}
            onClick={() => void remove(bridge.id)}
          >
            {disconnecting === bridge.id ? "Removing…" : "Remove Bridge"}
          </Button>
        )}
      </div>
    </div>
  ));
  return (
    <div className="channel-connector-panel bridge-manager">
      <div className="section-heading compact">
        <div>
          <SectionEyebrow>External Bridge</SectionEyebrow>
          <h2>{activeBridges.length ? "Connected through Bridge" : "Connect this Presence through Bridge"}</h2>
        </div>
        <ShieldCheck size={17} />
      </div>
      {activeBridges.length === 0 && (
        <div className="empty-bridge">
          <p>
            {channel?.builtIn
              ? `Use a Bridge when ${channelLabel(presence.channel, state.channelDefinitions)} should be reached through an external adapter. Only the selected route above can deliver actions.`
              : "A Bridge is an external adapter for this channel. It sends inbound social objects to OpenPresence and receives only approved actions from this Presence's execution envelope."}
          </p>
          <div className="form-grid">
            <label>
              Connection name
              <input
                aria-label="Bridge name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Connection type
              <select
                aria-label="Bridge type"
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as ConnectorKind)
                }
              >
                <option value="bridge">Bridge · external executor</option>
                <option value="manual">
                  Manual relay · you carry out actions
                </option>
              </select>
            </label>
          </div>
          <Button variant="primary" onClick={() => void create()}>
            <Plus size={14} /> Connect
          </Button>
        </div>
      )}
      {bridges.length > 0 && (
        <div className="bridge-list">
          {bridgeRows}
          {key && (
            <div className="bridge-key" role="status">
              <strong>Connect your external adapter</strong>
              <p>
                This one-time key is for the adapter that represents this
                Presence. It is not an Agent model key. Send inbound events to
                the Events endpoint and claim approved work from the Execution
                endpoint.
              </p>
              <code>{key}</code>
              <Button
                variant="ghost"
                onClick={() => void navigator.clipboard?.writeText(key)}
              >
                Copy key
              </Button>
              <div className="bridge-endpoints">
                <div>
                  <small>Events endpoint</small>
                  <code>{externalEventsEndpoint}</code>
                </div>
                <div>
                  <small>Execution endpoint</small>
                  <code>{externalExecutionsEndpoint}</code>
                </div>
              </div>
              <small>
                Use <code>Authorization: Bearer &lt;key&gt;</code>. The key will
                not be shown again.
              </small>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
