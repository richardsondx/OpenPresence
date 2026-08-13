"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Bot,
  Brain,
  BriefcaseBusiness,
  CalendarDays,
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
  LoaderCircle,
  MessageCircle,
  MessageSquare,
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
import { deriveActivitySummary } from "@/lib/runtime";
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
  PublicDisclosurePosture,
  PublicSelf,
  PublicTechnicalFact,
  PresenceConnectionMode,
  PresenceMode,
  MirrorObject,
  SandboxActor,
  View,
} from "@/lib/types";

const PUBLIC_TECHNICAL_FACTS: { id: PublicTechnicalFact; label: string; detail: string }[] = [
  { id: "ai-presence", label: "This is an AI presence", detail: "Say so when the question makes it relevant." },
  { id: "open-source", label: "Open source", detail: "Share the project is open source." },
  { id: "built-with-openpresence", label: "Built with OpenPresence", detail: "Name the platform when explicitly useful." },
  { id: "model-provider", label: "Current model provider", detail: "Share the provider, not credentials." },
  { id: "exact-model", label: "Exact model", detail: "Share the selected model when approved." },
  { id: "tools", label: "Tools used", detail: "Describe capabilities at a public level." },
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
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "playground", label: "Playground", icon: FlaskConical },
  { id: "live", label: "Activity", icon: Radio },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
];
const presenceNavItems = navItems.filter(({ id }) => id === "live" || id === "calendar");
const agentNavItems = navItems.filter(({ id }) => id === "chat" || id === "playground");
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
  { provider: "anthropic" as const, label: "Anthropic", model: "claude", name: "Claude Sonnet", quality: "high" as const, detail: "Connected model" },
];
const runtimeProviders = [
  { id: "openai" as const, label: "OpenAI", detail: "Hosted models" },
  { id: "ollama" as const, label: "Ollama", detail: "Local models" },
  { id: "anthropic" as const, label: "Anthropic", detail: "Hosted models" },
];

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
  simulation,
  actors,
  targetObjects,
  mutate,
}: {
  sessionId: string;
  simulation: ChannelSimulationDefinition;
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
  const [busy, setBusy] = useState(false);
  const selectedAction = simulation.actions.find((item) => item.id === actionId) ?? simulation.actions[0];
  const selectedActor = actors.find((item) => item.id === actorId);
  const targetObject = targetId ? targetObjects.find((item) => item.id === targetId) : undefined;
  const actorNameForSubmit = selectedActor?.displayName ?? actorName.trim();
  const requiresContent = selectedAction?.contentRequired !== false;
  const canSubmit = Boolean(selectedAction && actorNameForSubmit && (!requiresContent || content.trim()) && (!selectedAction.target || targetObject));
  const submitEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedAction || !canSubmit) return;
    setBusy(true);
    try {
      await mutate({ type: "addSandboxEvent", sessionId, actionId: selectedAction.id, actorId: selectedActor?.id, actorName: actorNameForSubmit, actorHandle: selectedActor?.handle ?? actorHandle, content, targetExternalRef: targetObject?.externalRef });
      setContent("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="sandbox-event-form" onSubmit={submitEvent}>
      <label>What should happen<select aria-label="What should happen" value={actionId} onChange={(event) => { setActionId(event.target.value); setTargetId(""); setContent(""); }}>{simulation.actions.map((action) => <option key={action.id} value={action.id}>{action.label}</option>)}</select></label>
      <label>{selectedAction?.actorLabel ?? "Who?"}<select aria-label="Who" value={actorId} onChange={(event) => setActorId(event.target.value)}><option value="new">New person</option>{actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.displayName}{actor.handle ? ` · ${actor.handle}` : ""}</option>)}</select></label>
      {actorId === "new" && <div className="sandbox-new-actor"><label>Name<input aria-label="New person name" value={actorName} onChange={(event) => setActorName(event.target.value)} /></label><label>Handle<input aria-label="New person handle" value={actorHandle} onChange={(event) => setActorHandle(event.target.value)} /></label></div>}
      {selectedAction?.target && <label>{selectedAction.target.label}<select aria-label={selectedAction.target.label} value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">Choose a simulated post</option>{targetObjects.map((item) => <option key={item.id} value={item.id}>{item.author?.displayName ?? "Someone"}: {(item.content?.text ?? "").slice(0, 42)}</option>)}</select></label>}
      {selectedAction?.contentLabel && <label>{selectedAction.contentLabel}<textarea aria-label={selectedAction.contentLabel} value={content} onChange={(event) => setContent(event.target.value)} placeholder={selectedAction.contentPlaceholder} rows={4} /></label>}
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
}: {
  state: OpenPresenceState;
  mutate: Mutate;
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
        <PresenceSwitcher state={state} mutate={mutate} />
        <button
          className="add-presence"
          onClick={() => setShowPresenceModal(true)}
        >
          <Plus size={15} /> Add a Presence
        </button>
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
          <button
            onClick={() => setView("presence")}
            className={view === "presence" ? "active" : ""}
          >
            <Settings2 size={17} />
            <span>Settings</span>
          </button>
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
      <section className={view === "chat" ? "workspace workspace-chat" : "workspace"}>
        <header className="topbar">
          <div className="mobile-brand">
            <div className="brand-mark">◉</div>
            <span>OpenPresence</span>
          </div>
          <div className="mobile-agent-switcher">
            <AgentSwitcher state={state} mutate={mutate} />
          </div>
          <div className="mobile-presence-switcher">
            <PresenceSwitcher state={state} mutate={mutate} />
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
          {view === "chat" && (
            <ContextChatView state={state} mutate={mutate} setView={setView} />
          )}
          {view === "playground" && (
            <PlaygroundView state={state} mutate={mutate} />
          )}
          {view === "live" && (
            <LiveView state={state} mutate={mutate} pendingOperation={pendingOperation} />
          )}
          {view === "calendar" && (
            <CalendarView state={state} mutate={mutate} />
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
        <button
          onClick={() => setView("presence")}
          className={view === "presence" ? "active" : ""}
        >
          <Settings2 size={18} />
          <span>Settings</span>
        </button>
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
          {view === "chat" && (
            <ChatView state={state} mutate={mutate} setView={setView} />
          )}
          {view === "live" && (
            <LiveView state={state} mutate={mutate} />
          )}
          {view === "calendar" && (
            <CalendarView state={state} mutate={mutate} />
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
          Choose the social environment first. You can connect it after the
          Presence exists.
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
          Presence name
          <input
            aria-label="Presence name"
            value={presenceName}
            onChange={(event) => setPresenceName(event.target.value)}
            placeholder="Jenny in this place"
          />
        </label>
        <label>
          Handle or identity
          <input
            aria-label="New Presence handle"
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            placeholder="@yourpresence"
          />
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

function PlaygroundView({ state, mutate }: { state: OpenPresenceState; mutate: Mutate }) {
  const presence = state.presence ?? state.presences[0];
  const session = state.playgroundSessions.find((item) => item.presenceId === presence?.id && item.status === "active") ?? state.playgroundSessions[0];
  const channelDefinition = state.channelDefinitions.find((item) => item.id === presence?.channel);
  const simulation = simulationForChannel(presence?.channel ?? "x", channelDefinition);
  const objects = session ? state.mirrorObjects.filter((item) => item.sessionId === session.id).sort((left, right) => (right.occurredAt ?? right.observedAt).localeCompare(left.occurredAt ?? left.observedAt)) : [];
  const sessionEvents = session ? state.events.filter((item) => item.sessionId === session.id).slice(0, 8) : [];
  const reviewCount = session ? state.executions.filter((item) => item.sessionId === session.id && item.status === "awaiting-review").length : 0;
  const actors = session ? state.sandboxActors.filter((item) => item.sessionId === session.id) : [];
  const [busy, setBusy] = useState(false);
  const targetObjects = objects.filter((item) => item.actorPresenceId === presence?.id && item.objectType !== "like");
  const run = async (operation: unknown) => { setBusy(true); try { await mutate(operation); } finally { setBusy(false); } };
  const wakeOrCheck = async () => {
    if (!session) return;
    if (presence?.status === "paused") {
      const next = await mutate({ type: "setPresence", patch: { status: "live" } });
      if (!next) return;
    }
    await run({ type: "runSandboxPulse", sessionId: session.id });
  };
  if (!presence) return null;
  if (!session) return <div className="playground-page"><div className="playground-loading" role="status">Opening a fresh simulated account…</div></div>;
  return (
    <div className="playground-page">
      <div className="playground-toolbar">
        <div>
          <div className="eyebrow">Agent rehearsal</div>
          <div className="playground-title-row"><h1>Playground</h1><span className="playground-world-label">{simulation.worldLabel}</span><span className="environment-chip"><span className="status-dot" /> Sandbox</span></div>
          <p>{simulation.worldDescription} This world is simulated. {state.agent?.name ?? "Your Agent"} is real.</p>
          <p className="playground-handle-hint">Agent handle: <strong>{presence.handle}</strong>. Use @mentions in Chat when addressing {presence.name}.</p>
        </div>
        <div className="playground-toolbar-actions">
          <span className="playground-presence"><PresenceLogo channel={presence.channel} definitions={state.channelDefinitions} /> <strong>{presence.name}</strong> <span>{channelLabel(presence.channel, state.channelDefinitions)}</span></span>
          <Button variant="ghost" disabled={busy} onClick={() => void run({ type: "resetPlayground", sessionId: session.id })}><RotateCcw size={14} /> Reset</Button>
        </div>
      </div>
      <div className="playground-grid">
          <aside className="playground-rail">
            <section className="playground-panel"><div className="eyebrow">Starting world</div><strong>{simulation.startingStateLabel}</strong><p>Nothing here is live. Simulated history stays in this session.</p><div className="session-status"><span className="status-dot" /> {presence.status === "paused" ? "Paused" : "Awake"}</div></section>
            <section className="playground-panel"><div className="eyebrow">People in the room</div>{state.sandboxActors.filter((actor) => actor.sessionId === session.id).length ? state.sandboxActors.filter((actor) => actor.sessionId === session.id).map((actor) => <div className="playground-actor" key={actor.id}><span className="actor-avatar">{initials(actor.displayName)}</span><span><strong>{actor.displayName}</strong><small>{actor.handle ?? "Audience"}</small></span></div>) : <p className="playground-muted">Add a person below to make the first social event.</p>}</section>
            <section className="playground-panel playground-time"><div className="eyebrow"><Clock3 size={12} /> Virtual time</div><strong>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.virtualNow))}</strong><div className="time-actions"><button onClick={() => void run({ type: "advanceSandboxTime", sessionId: session.id, minutes: 15 })}>+15m</button><button onClick={() => void run({ type: "advanceSandboxTime", sessionId: session.id, minutes: 60 })}>+1h</button><button onClick={() => void run({ type: "advanceSandboxTime", sessionId: session.id, minutes: 1440 })}>Tomorrow</button></div></section>
          </aside>
          <main className="playground-world"><div className="world-heading"><div><div className="eyebrow">{simulation.worldLabel}</div><h2>What Jenny can see</h2></div><Button variant="primary" disabled={busy} onClick={() => void wakeOrCheck()}><Sparkles size={14} /> {presence.status === "paused" ? "Wake Jenny" : "Check now"}</Button></div>{objects.length ? <div className="social-feed">{objects.map((item) => <article className={`social-card ${item.actorPresenceId === presence.id ? "agent-authored" : ""}`} key={item.id}><div className="social-card-meta"><span className="actor-avatar">{initials(item.author?.displayName ?? "Someone")}</span><span><strong>{item.author?.displayName ?? "Someone"}</strong><small>{item.author?.handle ?? "Audience"} · {item.objectType}</small></span><time>{formatTime(item.occurredAt ?? item.observedAt)}</time></div><p>{item.content?.text ?? ""}</p>{item.parentExternalRef && <small className="thread-context">↳ attached to the selected simulated post</small>}</article>)}</div> : <div className="world-blank"><MessageSquare size={20} /><p>The simulated {channelLabel(session.channelId, state.channelDefinitions)} world is quiet.</p><small>Check now to let {state.agent?.name ?? "the Agent"} choose a first move, or add an event from the control room.</small></div> }</main>
          <aside className="playground-activity">
            <div className="activity-rail-heading"><div className="eyebrow">Control room</div><span className="environment-chip">{channelLabel(session.channelId, state.channelDefinitions)} · Sandbox</span></div>
            <section>
              <div className="eyebrow">Now</div>
              {sessionEvents.length ? sessionEvents.slice(0, 3).map((item) => <div className="playground-event" key={item.id}><span className={`event-dot event-${item.tone}`} /><span><strong>{item.title}</strong><small>{item.detail}</small></span></div>) : <p className="playground-muted">No decisions yet.</p>}
            </section>
            <section>
              <div className="eyebrow">Needs you</div>
              {reviewCount ? <div className="needs-review"><strong>{reviewCount} action waiting</strong><small>Review before it appears in the simulated world.</small></div> : <p className="playground-muted">Nothing waiting for review.</p>}
            </section>
            <section>
              <div className="eyebrow">Add to {simulation.worldLabel}</div>
              <p className="playground-form-intro">Place a channel-native situation into the world Jenny can see.</p>
              <SandboxEventForm key={`${presence.id}:${session.id}`} sessionId={session.id} simulation={simulation} actors={actors} targetObjects={targetObjects} mutate={mutate} />
            </section>
          </aside>
      </div>
    </div>
  );
}

function ContextChatView({
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
  }, [conversation?.id, messages.length]);
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
    if (!message.trim() || sending) return;
    const outgoing = attachments.length
      ? `${message}\n\nAttached context: ${attachments.join(", ")}`
      : message;
    setMessage("");
    setAttachments([]);
    setSending(true);
    try {
      await mutate({
        type: "sendMessage",
        content: outgoing,
        conversationId: conversation?.id,
      });
    } finally {
      setSending(false);
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
            {messages.length === 0 ? (
              <div className="chat-blank">
                <div className="blank-glyph">
                  <PresenceGlyph accent={agent.accent} />
                </div>
                <h2>A mind becomes useful through conversation.</h2>
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

function ChatView({
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
          <SectionEyebrow>Agent-wide conversation</SectionEyebrow>
          <h1>Talk to {agent.name}.</h1>
          <p className="muted">
            One persistent conversation for shaping personality, mission, taste,
            and every Presence.
          </p>
        </div>
        <div className="chat-scope-label">
          <span className="status-dot" /> Agent-wide context
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
                  Tell {agent.name} what to notice, protect, pursue, or leave
                  alone. This transcript stays with {agent.name}; durable
                  meaning belongs in Brain.
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

void LegacyAppShell;
void OldChatView;
void ContextChatView;

function LiveView({
  state,
  mutate,
  pendingOperation,
}: {
  state: OpenPresenceState;
  mutate: Mutate;
  pendingOperation?: string | null;
}) {
  const selected = state.presence;
  const presenceName = selected?.name ?? "this Presence";
  const paused = selected?.status === "paused";
  const waking = pendingOperation === "wakePresence";
  const checking = pendingOperation === "runPulse";
  const activity = deriveActivitySummary(state, selected?.id);
  const presenceCopy = (text: string) => text.replaceAll("Jenny", presenceName).replaceAll(state.agent?.name ?? "Jenny", presenceName);
  const visibleEvents = state.events.filter(
    (item) => item.presenceId === selected?.id,
  );
  const presenceScope = selected ? channelLabel(selected.channel, state.channelDefinitions) : "No Presence selected";
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <SectionEyebrow>Presence activity</SectionEyebrow>
          <h1>
            {presenceName} is {paused ? "asleep" : "live"}.
          </h1>
          <p className="muted">
            See what {presenceName} is doing now, what happens next, and what is waiting
            for you.
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
      <section className="activity-summary" aria-label="Operating status">
        <div className={`activity-card activity-card-${activity.current.tone}`}>
          <SectionEyebrow>Now</SectionEyebrow>
          <h2>{activity.current.label}</h2>
          <p>{presenceCopy(activity.current.detail)}</p>
          <small>Last pulse: {activity.lastPulseAt ? formatTime(activity.lastPulseAt) : "Never"}</small>
        </div>
        <div className="activity-card">
          <SectionEyebrow>Next</SectionEyebrow>
          <h2>{activity.nextAttention.label}</h2>
          <p>{presenceCopy(activity.nextAttention.detail)}</p>
          <small>{activity.nextIntent.label} · {presenceCopy(activity.nextIntent.detail)}</small>
        </div>
        <div className="activity-card">
          <SectionEyebrow>Today&apos;s rhythm</SectionEyebrow>
          <div className="rhythm-summary">
            <span>Attention <strong>{activity.rhythm.attention}</strong></span>
            <span>Publishing <strong>{activity.rhythm.publishing}</strong></span>
            <span>Replies <strong>{activity.rhythm.replies}</strong></span>
            <span>Quiet hours <strong>{activity.rhythm.quietHours}</strong></span>
          </div>
        </div>
      </section>
      <MirrorPanel state={state} filter={selected?.id ?? "all"} />
      <div className="live-layout">
        <section className="event-stream">
          <div className="section-heading">
            <div>
              <SectionEyebrow>Activity</SectionEyebrow>
              <h2>The day in motion</h2>
            </div>
            <span className="live-pill">
              <span className="status-dot" /> {paused ? "Asleep" : "Live"}
            </span>
          </div>
          {visibleEvents.length === 0 ? (
              <EmptyState
                title="Nothing has happened yet"
                body={paused ? `${presenceName} is asleep. Wake this Presence to begin a first attention cycle.` : "Check now to let this Presence look for something worth saying."}
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
              {visibleEvents.map((item) => (
                <div className="event-row" key={item.id}>
                  <div className={`event-icon tone-${item.tone}`}>
                    {item.type === "execution" ? (
                      <ArrowUpRight size={15} />
                    ) : item.type === "learning" ? (
                      <Sparkles size={15} />
                    ) : item.type === "memory" ? (
                      <Brain size={15} />
                    ) : (
                      <Circle size={9} fill="currentColor" />
                    )}
                  </div>
                  <div className="event-copy">
                    <div className="event-title">
                      {presenceCopy(item.title)}
                      <span>{formatTime(item.time)}</span>
                    </div>
                    <p>{presenceCopy(item.detail)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <aside className="live-aside">
          <ExecutionLedger state={state} mutate={mutate} presenceId={selected?.id} />
            <div className="decision-card activity-rail-card">
              <div className="section-heading compact">
                <div>
                <SectionEyebrow>Now · Up next · Needs attention</SectionEyebrow>
                <h3>{activity.current.label}</h3>
              </div>
              <Activity size={17} />
            </div>
            <div className="decision-line">
              <span className="decision-score">NOW</span>
              <div>
                <strong>{activity.current.label}</strong>
                <small>{activity.current.detail}</small>
              </div>
            </div>
            <div className="decision-line">
              <span className="decision-score">NEXT</span>
              <div>
                <strong>{activity.nextAttention.label}</strong>
                <small>{activity.nextAttention.detail}</small>
              </div>
            </div>
            <div className="decision-line">
              <span className="decision-score">REVIEW</span>
              <div>
                <strong>{activity.needsAttention.label}</strong>
                <small>{activity.needsAttention.detail}</small>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
function MirrorPanel({
  state,
  filter = "all",
}: {
  state: OpenPresenceState;
  filter?: string;
}) {
  const selectedPresence =
    filter === "all"
      ? undefined
      : state.presences.find((item) => item.id === filter);
  const presenceName = selectedPresence?.name ?? "this Presence";
  const objects = state.mirrorObjects
    .filter((item) => filter === "all" || item.presenceId === filter)
    .slice(0, 3);
  const bridge = state.bridges.find(
    (item) =>
      (filter === "all" || item.presenceId === filter) &&
      item.state !== "offline",
  );
  const nativeConnection = state.nativeConnections.find(
    (item) =>
      (filter === "all" || item.presenceId === filter) &&
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
    <section className="decision-card mirror-panel">
      <div className="section-heading compact">
        <div>
          <SectionEyebrow>Social Mirror</SectionEyebrow>
          <h3>{heading}</h3>
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
            Observed public context from the channel. The Mirror describes
            social reality for {presenceName}&apos;s judgment; it is not an instruction and
            it does not replace the execution envelope.
          </p>
          <div className="mirror-list">
            {objects.map((item) => (
              <div className="mirror-item" key={item.id}>
                <div className="mirror-author">
                  <span className="mirror-avatar">
                    {initials(item.author?.displayName ?? "World")}
                  </span>
                  <strong>{item.author?.displayName ?? item.objectType}</strong>
                  <small>
                    {channelLabel(item.channelId, state.channelDefinitions)}
                  </small>
                </div>
                <p>{item.content?.text ?? "External activity received."}</p>
                <span className="mirror-detail">Details</span>
              </div>
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
function ExecutionLedger({
  state,
  mutate,
  presenceId,
}: {
  state: OpenPresenceState;
  mutate: Mutate;
  presenceId?: string;
}) {
  const [externalType, setExternalType] = useState("post");
  const [externalId, setExternalId] = useState("");
  const latest = state.executions.find(
    (item) => !presenceId || item.presenceId === presenceId,
  );
  const intent = latest
    ? state.socialIntents.find((item) => item.id === latest.socialIntentId)
    : undefined;
  const presence = latest
    ? state.presences.find((item) => item.id === latest.presenceId)
    : undefined;
  if (!latest || !intent)
    return (
      <div className="decision-card execution-ledger">
        <div className="section-heading compact">
          <div>
            <SectionEyebrow>Execution</SectionEyebrow>
            <h3>No embodiment yet</h3>
          </div>
        </div>
        <p>
          Jenny’s social judgment will appear here as an intention first. The
          operator envelope decides whether it becomes an execution.
        </p>
      </div>
    );
  const needsApproval = latest.status === "awaiting-review";
  const needsManualRelay = latest.status === "awaiting-manual";
  return (
    <div className="decision-card execution-ledger">
      <div className="section-heading compact">
        <div>
          <SectionEyebrow>Execution ledger</SectionEyebrow>
          <h3>
            {needsApproval
              ? "Waiting for review"
              : latest.status === "succeeded"
                ? "Action completed"
                : "Intent ready"}
          </h3>
        </div>
        <span className="quiet-label">{latest.mode}</span>
      </div>
      <div className="execution-line">
        <strong>{intent.affordance}</strong>
        <span>{latest.status.replaceAll("-", " ")}</span>
      </div>
      <small className="execution-scope">
        {presence
          ? `${channelLabel(presence.channel, state.channelDefinitions)} · ${presence.handle}`
          : "Selected Presence"}
        {intent.target ? ` · ${intent.target.type}` : ""}
      </small>
      <p>
        {needsApproval
          ? "This is operator-owned embodiment. Approving it does not rewrite Jenny’s judgment."
          : "Intent, execution, and result remain separately attributable."}
      </p>
      {needsApproval && (
        <Button
          variant="secondary"
          className="full-button"
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

function CalendarView({
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
  const [executionWindow, setExecutionWindow] = useState("08:00–11:00");
  const [editingSlot, setEditingSlot] = useState<CalendarSlot | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "week">("list");
  const presenceId = state.activePresenceId ?? state.presence?.id ?? "";
  const selectedPresence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  const presenceName = selectedPresence?.name ?? "this Presence";
  const add = async (event: React.FormEvent) => {
    event.preventDefault();
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
      setInstruction("");
      setEditingSlot(null);
      setShowForm(false);
    }
  };
  const visibleSlots = state.calendar.filter((slot) => slot.presence === presenceId);
  const beginEdit = (slot: CalendarSlot) => { setEditingSlot(slot); setInstruction(slot.instruction); setDay(slot.day); setTime(slot.time); setObjective(slot.objective); setExecutionWindow(slot.executionWindow); setShowForm(true); };
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <SectionEyebrow>Presence planning</SectionEyebrow>
          <h1>Calendar</h1>
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
          <Button variant="primary" onClick={() => { setShowForm(!showForm); if (showForm) { setEditingSlot(null); setInstruction(""); } }}>
            {showForm ? <X size={15} /> : <Plus size={15} />}{" "}
            {showForm ? "Close" : "Add intent"}
          </Button>
        </div>
      </div>
      {showForm && (
        <form className="add-slot-form" onSubmit={add}>
          <label className="instruction-field">
            Standing instruction
            <textarea
              aria-label={`What should ${presenceName} do?`}
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="Teach the audience one useful thing about persistent agents."
              rows={3}
              required
            />
          </label>
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
              onChange={(event) => setTime(event.target.value)}
              onInput={(event) => setTime(event.currentTarget.value)}
            />
          </label>
          <label>
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
          </label>
          <label>
            Execution window
            <input
              aria-label="Execution window"
              value={executionWindow}
              onChange={(event) => setExecutionWindow(event.target.value)}
            />
          </label>
          <Button type="submit" variant="secondary">
            <Check size={14} /> {editingSlot ? "Save changes" : "Save standing intent"}
          </Button>
        </form>
      )}
      {viewMode === "week" ? (
        <WeekCalendar slots={visibleSlots} state={state} presenceName={presenceName} onEdit={beginEdit} onAdd={() => setShowForm(true)} />
      ) : (
      <div className="calendar-layout">
        <section>
          <div className="section-heading">
            <div>
              <SectionEyebrow>This week</SectionEyebrow>
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
      {scheduledSlots.length === 0 ? <EmptyState title="Nothing scheduled for this Presence" body={`Add a standing intent to see when ${presenceName} will pay attention during the week.`} action={<Button onClick={onAdd} variant="secondary"><Plus size={14} /> Add first intent</Button>} /> : <div className="week-grid-scroll"><div className="week-grid" style={{ "--week-grid-height": `${gridHeight}px` } as React.CSSProperties}><div className="week-grid-header"><span className="week-time-header">Local time</span>{calendarWeekDays.map((day) => <span key={day}>{day.slice(0, 3)}<small>{day}</small></span>)}</div><div className="week-grid-body"><div className="week-time-rail">{calendarHours.map((hour) => <span key={hour}>{String(hour).padStart(2, "0")}:00</span>)}</div>{calendarWeekDays.map((day) => <div className="week-day-column" key={day}>{calendarHours.map((hour) => <div className="week-hour-cell" key={hour} />)}{(daySlots.get(day) ?? []).map((slot) => { const start = timeToMinutes(slot.time); const firstHour = calendarHours[0] * 60; const top = Math.max(0, ((start - firstHour) / 60) * 64); const windowParts = slot.executionWindow.split(/[–-]/).map((part) => part.trim()); const end = windowParts[1] ? timeToMinutes(windowParts[1]) : start + 60; const height = Math.max(54, Math.min(gridHeight - top - 8, ((Math.max(start + 60, end) - start) / 60) * 64 - 8)); const target = state.presences.find((item) => item.id === slot.presence); return <button type="button" key={slot.id} className={`week-intent objective-${objectiveTone(slot.objective)}`} style={{ top, height }} onClick={() => onEdit(slot)} aria-label={`Edit ${slot.label}, ${slot.day} at ${slot.time}`} title={`${slot.label} · ${slot.day} ${slot.time} · ${slot.executionWindow}`}><span className="week-intent-time">{slot.time}</span><strong>{slot.label}</strong><small>{target?.name ?? presenceName} · {objectiveLabel(slot.objective)}</small><em>{slot.mode === "auto" ? "Auto" : "Review"}</em></button>; })}</div>)}</div></div></div>}
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
          {slot.mode} · window{" "}
          {slot.executionWindow}
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
  const [connectionProvider, setConnectionProvider] = useState<"openai" | "ollama" | null>(null);
  const [connectionLabel, setConnectionLabel] = useState("");
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
  const saveConnection = async (event: React.FormEvent) => { event.preventDefault(); const next = await mutate({ type: "configureProvider", provider: connectionProvider!, label: connectionLabel || (connectionProvider === "ollama" ? "Ollama local" : "OpenAI"), endpoint: connectionProvider === "ollama" ? connectionEndpoint : undefined, hasSecret: Boolean(connectionSecret), secret: connectionSecret || undefined }); if (next) { setConnectionProvider(null); setConnectionLabel(""); setConnectionSecret(""); } };
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
    <div className="page">
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
                    const nextModel =
                      runtimeModels.find(
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
              <label>Skill name<input aria-label="Skill name" value={skillName} onChange={(event) => setSkillName(event.target.value)} placeholder="Research brief" required /></label>
              <label>Instruction prompt<textarea aria-label="Skill prompt" value={skillDescription} onChange={(event) => setSkillDescription(event.target.value)} placeholder="Turn source material into a clear, useful founder brief." rows={4} required /></label>
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
        <div className="settings-card brain-action-card"><div className="section-heading compact"><div><SectionEyebrow>Connections</SectionEyebrow><h2>Provider access</h2></div><PlugZap size={17} /></div><p className="muted">Connect a provider here; Chat will use the Agent runtime you choose above.</p><div className="config-list">{(["openai", "ollama"] as const).map((provider) => { const connection = state.providerConnections.find((item) => item.provider === provider); return <div className="config-list-row" key={provider}><div><strong>{provider === "openai" ? "OpenAI" : "Ollama"}</strong><small>{connection?.status === "local" ? connection.endpoint ?? "Local endpoint" : connection?.secretConfigured ? "Credential ready" : connection?.status === "available" ? "Connected" : "Needs setup"}</small></div><Button variant={connection && connection.status !== "needs-configuration" ? "ghost" : "secondary"} onClick={() => { setConnectionProvider(provider); if (provider === "openai") setConnectionLabel(connection?.label ?? "OpenAI"); else { setConnectionLabel(connection?.label ?? "Ollama local"); setConnectionEndpoint(connection?.endpoint ?? "http://localhost:11434"); } }}>{connection && connection.status !== "needs-configuration" ? "Edit" : "Set up"}</Button></div>; })}</div>{connectionProvider && <form className="inline-config-form" onSubmit={saveConnection}><h3>Set up {connectionProvider === "openai" ? "OpenAI" : "Ollama"}</h3><label>Connection name<input aria-label="Connection name" value={connectionLabel} onChange={(event) => setConnectionLabel(event.target.value)} required /></label>{connectionProvider === "ollama" ? <label>Ollama endpoint<input aria-label="Ollama endpoint" value={connectionEndpoint} onChange={(event) => setConnectionEndpoint(event.target.value)} required /></label> : <label>API key<input aria-label="Provider API key" type="password" value={connectionSecret} onChange={(event) => setConnectionSecret(event.target.value)} placeholder="sk-…" /></label>}<div className="inline-form-actions"><Button type="button" variant="ghost" onClick={() => setConnectionProvider(null)}>Cancel</Button><Button type="submit" variant="primary"><Check size={14} /> Save connection</Button></div></form>}</div>
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
  const [ghostDraft, setGhostDraft] = useState<GhostProfile>(presence.ghostProfile ?? { subject: "Me / my organization", priorities: "", preferences: "", voice: "", boundaries: "" });
  const [publicSelfDraft, setPublicSelfDraft] = useState<PublicSelf>(presence.publicSelf ?? { displayName: presence.name, posture: presence.mode === "ghost" ? "representational" : "contextual", approvedTechnicalFacts: [] });
  const publicPostures: { id: PublicDisclosurePosture; label: string; detail: string }[] = presence.mode === "ghost"
    ? [{ id: "representational", label: "Representational", detail: "Speak as the person or organization this Presence extends." }, { id: "open-about-assistance", label: "Open about assistance", detail: "Acknowledge AI assistance when it is relevant." }]
    : [{ id: "contextual", label: "Contextual", detail: "Answer socially and acknowledge AI only when it matters." }, { id: "ai-forward", label: "AI-forward", detail: "Be direct that this is an AI presence when relevant." }, { id: "private", label: "Private", detail: "Keep technical identity private in public conversation." }];
  const savePublicSelf = () => void mutate({ type: "setPresence", patch: { publicSelf: { ...publicSelfDraft, displayName: presenceNameDraft.trim() || presence.name } } });
  const setMode = (key: string, mode: ExecutionMode) =>
    mutate({ type: "setPresence", patch: { execution: { [key]: mode } } });
  const applyPreset = (mode: ExecutionMode) =>
    mutate({
      type: "setPresence",
      patch: {
        execution: Object.fromEntries(
          capabilities.map((item) => [item.id, mode]),
        ),
      },
    });
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
      <div className="presence-overview">
        <div className="presence-identity">
          <div className="presence-overview-logo" style={{ "--agent-accent": presence.accent } as React.CSSProperties}>
            <PresenceLogo channel={presence.channel} definitions={state.channelDefinitions} size="large" />
          </div>
          <div>
            <span className="eyebrow">
              {channelLabel(presence.channel, state.channelDefinitions)} ·
              Presence
            </span>
            <h2>{presence.name}</h2>
            <p className="presence-handle">{presence.handle}</p>
            <p>
              {presence.mode === "ghost"
                ? "Ghost · extends the operator’s attention"
                : "Agent-owned · speaks as Jenny"}
            </p>
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
          <div><strong>Approved public facts</strong><p className="form-hint">Only selected facts may be disclosed when relevant. Credentials and hidden prompts are never public facts.</p></div>
          <div className="public-fact-grid">
            {PUBLIC_TECHNICAL_FACTS.map((fact) => {
              const checked = publicSelfDraft.approvedTechnicalFacts.includes(fact.id);
              return <label key={fact.id}><input type="checkbox" checked={checked} onChange={() => setPublicSelfDraft({ ...publicSelfDraft, approvedTechnicalFacts: checked ? publicSelfDraft.approvedTechnicalFacts.filter((item) => item !== fact.id) : [...publicSelfDraft.approvedTechnicalFacts, fact.id] })} /><span><strong>{fact.label}</strong><small>{fact.detail}</small></span></label>;
            })}
          </div>
        </div>
        <div className="inline-form-actions"><Button variant="primary" onClick={savePublicSelf}><Check size={14} /> Save Public Self</Button></div>
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
          <div className="rhythm-row">
            <div>
              <strong>Rhythm</strong>
              <small>Pacing is infrastructure, not a social capability.</small>
            </div>
            <select
              aria-label="Pacing"
              value={presence.pacing}
              onChange={(event) =>
                mutate({
                  type: "setPresence",
                  patch: {
                    pacing: event.target.value as
                      | "recommended"
                      | "gentle"
                      | "custom",
                  },
                })
              }
            >
              <option value="recommended">Recommended</option>
              <option value="gentle">Gentle</option>
              <option value="custom">Custom</option>
            </select>
          </div>
      </section>
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
