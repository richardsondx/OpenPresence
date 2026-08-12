"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  ArrowUpRight,
  Bot,
  Brain,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleAlert,
  FileText,
  Ghost,
  LifeBuoy,
  MessageCircle,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Pencil,
  Play,
  Plus,
  PlugZap,
  Radio,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { CHANNEL_CAPABILITIES } from "@/lib/types";
import type {
  CalendarSlot,
  ChannelDefinition,
  ChannelId,
  ConnectorKind,
  CreateAgentInput,
  CreatePresenceInput,
  ExecutionMode,
  FileKind,
  OpenPresenceState,
  PresenceMode,
  View,
} from "@/lib/types";

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
  { id: "live", label: "Live", icon: Radio },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
];
const presenceNavItems = navItems.filter(({ id }) => id !== "chat");
const agentNavItems = navItems.filter(({ id }) => id === "chat");
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

async function readJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `The local service returned an unexpected response (${response.status}).`,
    );
  }
  return (await response.json()) as T;
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
  useEffect(() => {
    fetch(`/api/state?read=${Date.now()}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load local state");
        return readJsonResponse<OpenPresenceState>(response);
      })
      .then(setState)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load local state",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (state?.onboarded) window.scrollTo({ top: 0, left: 0 });
  }, [state?.onboarded]);
  async function mutate(operation: unknown) {
    setError(null);
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
      setError(
        reason instanceof Error
          ? reason.message
          : "That change could not be saved.",
      );
      return null;
    }
  }
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
      setError(
        reason instanceof Error
          ? reason.message
          : "That Bridge change could not be saved.",
      );
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
      setView={setView}
      selectedFile={selectedFile}
      setSelectedFile={setSelectedFile}
      mutate={mutate}
      manageBridge={manageBridge}
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
        <span className="channel-badge">
          {channelLabel(presence.channel, state.channelDefinitions)}
        </span>
        <span>
          <strong>{presence.handle}</strong>
          <small>{presence.mode === "ghost" ? "Ghost" : "Agent-owned"}</small>
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
              className={`presence-menu-item ${item.id === presence.id ? "active" : ""}`}
              onClick={async () => {
                await mutate({ type: "selectPresence", id: item.id });
                setOpen(false);
              }}
            >
              <span className="channel-badge">{channelLabel(item.channel, state.channelDefinitions)}</span>
              <span>
                <strong>{item.handle}</strong>
                <small>{channelLabel(item.channel, state.channelDefinitions)} · {item.mode === "ghost" ? "Ghost" : "Agent-owned"}</small>
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
  manageBridge,
  error,
}: {
  state: OpenPresenceState;
  view: View;
  setView: (view: View) => void;
  selectedFile: FileKind;
  setSelectedFile: (file: FileKind) => void;
  mutate: Mutate;
  manageBridge: BridgeManage;
  error: string | null;
}) {
  const agent = state.agent!;
  const presence = state.presence ?? state.presences[0]!;
  const [showPresenceModal, setShowPresenceModal] = useState(false);
  const activeScope =
    view === "chat"
      ? "Agent-wide"
      : view === "brain"
        ? "Agent settings"
        : `${channelLabel(presence.channel, state.channelDefinitions)} · ${presence.handle}`;
  const pageLabel =
    view === "brain"
      ? "Manage Agent"
      : view === "presence"
        ? "Presence settings"
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
            <button aria-label="Help">
              <LifeBuoy size={16} />
            </button>
          </div>
        </div>
      </aside>
      <section className="workspace">
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
          <div className="topbar-actions">
            <span
              className={`connection-label ${presence.status === "paused" ? "paused" : ""}`}
            >
              <span className="status-dot" />{" "}
              {view === "presence"
                ? presence.status === "paused"
                  ? "Paused"
                  : state.bridges.some(
                        (item) =>
                          item.presenceId === presence.id &&
                          item.state === "online",
                      )
                    ? "Connected"
                    : "Not connected"
                : activeScope}
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
            <ContextChatView state={state} mutate={mutate} setView={setView} />
          )}
          {view === "live" && (
            <LiveView state={state} mutate={mutate} setView={setView} />
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
              state={state}
              mutate={mutate}
              manageBridge={manageBridge}
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
  error,
}: {
  state: OpenPresenceState;
  view: View;
  setView: (view: View) => void;
  selectedFile: FileKind;
  setSelectedFile: (file: FileKind) => void;
  mutate: Mutate;
  manageBridge: BridgeManage;
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
        <div className="sidebar-footer">
          <button aria-label="Help">
            <LifeBuoy size={16} />
          </button>
        </div>
      </aside>
      <section className="workspace">
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
            <LiveView state={state} mutate={mutate} setView={setView} />
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
              state={state}
              mutate={mutate}
              manageBridge={manageBridge}
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
  const [handle, setHandle] = useState("@jenny_ai");
  const [mode, setMode] = useState<PresenceMode>("agent");
  const [submitting, setSubmitting] = useState(false);
  const [customName, setCustomName] = useState("Custom channel");
  const [customId, setCustomId] = useState("custom-channel");
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
      handle,
      mode,
      accent,
      channelDefinition: definition,
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
              value="x"
              checked={channel === "x"}
              onChange={() => setChannel("x")}
            />
            <strong>X</strong>
            <small>Public conversations and posts</small>
          </label>
          <label>
            <input
              type="radio"
              name="channel"
              value="__custom__"
              checked={channel === "__custom__"}
              onChange={() => setChannel("__custom__")}
            />
            <strong>Custom Channel</strong>
            <small>Describe a community or social environment</small>
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
            {outputs.map((output) => (
              <div
                className="context-item"
                key={`${output.label}-${output.detail}`}
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
            <span>Tools available</span>
            <strong>{state.toolBindings.length}</strong>
          </div>
        </div>
      </section>
    </aside>
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
  const agent = state.agent!;
  const conversation =
    state.conversations.find(
      (item) => item.id === state.activeConversationId,
    ) ?? state.conversations[0];
  const messages = conversation?.messages ?? [];
  const model = state.modelProfiles.find((item) => item.agentId === agent.id);
  const modelName = modelDisplayName(model);
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
        <div className="heading-actions">
          <button
            type="button"
            className="context-toggle"
            aria-label={
              contextOpen ? "Hide context sidebar" : "Show context sidebar"
            }
            aria-expanded={contextOpen}
            title={
              contextOpen ? "Hide context sidebar" : "Show context sidebar"
            }
            aria-controls="chat-context-sidebar"
            onClick={() => setContextOpen((open) => !open)}
          >
            {contextOpen ? (
              <PanelRightClose size={17} />
            ) : (
              <PanelRightOpen size={17} />
            )}
          </button>
        </div>
      </div>
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
  setView,
}: {
  state: OpenPresenceState;
  mutate: Mutate;
  setView: (view: View) => void;
}) {
  const agent = state.agent!;
  const selected = state.presence;
  const paused = selected?.status === "paused";
  const visibleEvents = state.events.filter(
    (item) => item.presenceId === selected?.id,
  );
  const latestDecision = visibleEvents.find(
    (item) => item.type === "decision" || item.type === "execution",
  );
  const presenceScope = selected
    ? `${channelLabel(selected.channel, state.channelDefinitions)} · ${selected.handle}`
    : "No Presence selected";
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <SectionEyebrow>Presence activity</SectionEyebrow>
          <h1>
            {selected?.handle ?? agent.name} is {paused ? "paused" : "live"}.
          </h1>
          <p className="muted">
            What this Presence is seeing, deciding, and sending through its
            selected channel.
          </p>
        </div>
        <div className="heading-actions">
          <span className="scope-summary">{presenceScope}</span>
          <Button
            onClick={() =>
              mutate({ type: "runPulse", presenceId: selected?.id })
            }
            variant="primary"
            disabled={paused}
          >
            <Play size={15} /> Run pulse
          </Button>
        </div>
      </div>
      <div className="metric-row">
        <Metric
          label="Conversations"
          value={state.metrics.conversations.toString()}
          hint="worth returning to"
        />
        <Metric
          label="Left alone"
          value={state.metrics.opportunitiesIgnored.toString()}
          hint="silence is useful"
        />
      </div>
      <MirrorPanel state={state} filter={selected?.id ?? "all"} />
      <div className="live-layout">
        <section className="event-stream">
          <div className="section-heading">
            <div>
              <SectionEyebrow>Activity</SectionEyebrow>
              <h2>The day in motion</h2>
            </div>
            <span className="live-pill">
              <span className="status-dot" /> {paused ? "Paused" : "Live"}
            </span>
          </div>
          {visibleEvents.length === 0 ? (
              <EmptyState
                title="Nothing has happened yet"
                body="Run a pulse to let this Presence look for something worth saying."
                action={
                  <Button
                    onClick={() =>
                    mutate({ type: "runPulse", presenceId: selected?.id })
                  }
                  variant="secondary"
                  disabled={paused}
                >
                  <Play size={14} /> Run first pulse
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
                      {item.title}
                      <span>{formatTime(item.time)}</span>
                    </div>
                    <p>{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <aside className="live-aside">
          <ExecutionLedger state={state} mutate={mutate} presenceId={selected?.id} />
          <div className="decision-card">
            <div className="section-heading compact">
              <div>
                <SectionEyebrow>Decision stream</SectionEyebrow>
                <h3>{latestDecision ? "Latest decision" : "No decisions yet"}</h3>
              </div>
              <Activity size={17} />
            </div>
            <div className="decision-line">
              <span className="decision-score">{latestDecision?.type ?? "—"}</span>
              <div>
                <strong>{latestDecision?.title ?? "Nothing has happened yet"}</strong>
                <small>{latestDecision?.detail ?? "Run a pulse when you want this Presence to pay attention."}</small>
              </div>
            </div>
            <Button
              variant="ghost"
              className="full-button"
              onClick={() => setView("brain")}
            >
              Manage {agent.name} <ArrowUpRight size={14} />
            </Button>
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
  const objects = state.mirrorObjects
    .filter((item) => filter === "all" || item.presenceId === filter)
    .slice(0, 3);
  const bridge = state.bridges.find(
    (item) =>
      (filter === "all" || item.presenceId === filter) &&
      item.state !== "offline",
  );
  const channel = selectedPresence
    ? state.channelDefinitions.find(
        (item) => item.id === selectedPresence.channel,
      )
    : undefined;
  const builtIn = channel?.builtIn ?? false;
  return (
    <section className="decision-card mirror-panel">
      <div className="section-heading compact">
        <div>
          <SectionEyebrow>Social Mirror</SectionEyebrow>
          <h3>
            {objects.length
              ? "What Jenny can see"
              : bridge
                ? "Waiting for the first event"
                : "No connected Presence"}
          </h3>
        </div>
        <span className="quiet-label">
          {bridge
            ? `${bridge.state} · ${objects.length} recent`
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
            Read-only context from the connected channel. The Mirror helps
            Jenny judge what is happening; it does not publish or give the
            Agent unrestricted account access.
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
      ) : (
        <p className="mirror-explainer">
          {bridge
            ? "Your Bridge sends inbound posts, comments, and messages here as context. They remain channel content, not instructions."
            : filter === "all"
              ? "A Social Mirror is created per connected Presence. Select a Presence or connect a custom channel to start receiving read-only context."
              : builtIn
                ? `This ${channelLabel(selectedPresence?.channel ?? "channel", state.channelDefinitions)} Presence is running in the local simulator. A live connector can add a Social Mirror later; nothing is being imported now.`
                : "Connect this custom Presence to a Bridge. The Bridge observes its channel and sends events here as read-only context for Jenny."}
        </p>
      )}
    </section>
  );
}
function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
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
            Tell {state.presence?.handle ?? "this Presence"} when to pay
            attention. Words come later, from the moment.
          </p>
        </div>
        <div className="heading-actions calendar-heading-actions">
          <span className="scope-summary">Planning for {state.presence?.handle ?? "this Presence"}</span>
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
              aria-label="What should Jenny do?"
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
        <WeekCalendar slots={visibleSlots} state={state} onEdit={beginEdit} onAdd={() => setShowForm(true)} />
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
              body="A quiet calendar is fine. Add one when you know where and when your Presence should pay attention."
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
            At run time, Jenny can publish, draft, or choose{" "}
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
  onEdit,
  onAdd,
}: {
  slots: CalendarSlot[];
  state: OpenPresenceState;
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
          <h2>When Jenny is meant to pay attention</h2>
          <p>Standing intents are shown by day and time. Nothing here is a promised post.</p>
        </div>
        <div className="week-calendar-legend" aria-label="Intent objectives">
          {["audience_growth", "education", "relationship", "reflection"].map((objective) => <span key={objective}><i className={`legend-dot objective-${objectiveTone(objective)}`} />{objectiveLabel(objective)}</span>)}
        </div>
      </div>
      {scheduledSlots.length === 0 ? <EmptyState title="Nothing scheduled for this Presence" body="Add a standing intent to see when Jenny will pay attention during the week." action={<Button onClick={onAdd} variant="secondary"><Plus size={14} /> Add first intent</Button>} /> : <div className="week-grid-scroll"><div className="week-grid" style={{ "--week-grid-height": `${gridHeight}px` } as React.CSSProperties}><div className="week-grid-header"><span className="week-time-header">Local time</span>{calendarWeekDays.map((day) => <span key={day}>{day.slice(0, 3)}<small>{day}</small></span>)}</div><div className="week-grid-body"><div className="week-time-rail">{calendarHours.map((hour) => <span key={hour}>{String(hour).padStart(2, "0")}:00</span>)}</div>{calendarWeekDays.map((day) => <div className="week-day-column" key={day}>{calendarHours.map((hour) => <div className="week-hour-cell" key={hour} />)}{(daySlots.get(day) ?? []).map((slot) => { const start = timeToMinutes(slot.time); const firstHour = calendarHours[0] * 60; const top = Math.max(0, ((start - firstHour) / 60) * 64); const windowParts = slot.executionWindow.split(/[–-]/).map((part) => part.trim()); const end = windowParts[1] ? timeToMinutes(windowParts[1]) : start + 60; const height = Math.max(54, Math.min(gridHeight - top - 8, ((Math.max(start + 60, end) - start) / 60) * 64 - 8)); const target = state.presences.find((item) => item.id === slot.presence); return <button type="button" key={slot.id} className={`week-intent objective-${objectiveTone(slot.objective)}`} style={{ top, height }} onClick={() => onEdit(slot)} aria-label={`Edit ${slot.label}, ${slot.day} at ${slot.time}`} title={`${slot.label} · ${slot.day} ${slot.time} · ${slot.executionWindow}`}><span className="week-intent-time">{slot.time}</span><strong>{slot.label}</strong><small>{target?.handle ?? "Presence"} · {objectiveLabel(slot.objective)}</small><em>{slot.mode === "auto" ? "Auto" : "Review"}</em></button>; })}</div>)}</div></div></div>}
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
            ? `${channelLabel(target.channel, state.channelDefinitions)} · ${target.handle}`
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
  const enabledSkills = state.skills.filter((skill) => state.agentSkills.some((binding) => binding.skillId === skill.id && binding.enabled));
  const resetSkillForm = () => { setSkillName(""); setSkillDescription(""); setEditingSkillId(null); setShowSkillForm(false); };
  const beginSkillEdit = (skill: OpenPresenceState["skills"][number]) => { setEditingSkillId(skill.id); setSkillName(skill.name ?? skill.id); setSkillDescription(skill.description); setShowSkillForm(true); };
  const saveSkill = async (event: React.FormEvent) => { event.preventDefault(); const next = await mutate(editingSkillId ? { type: "editSkill", id: editingSkillId, name: skillName, description: skillDescription } : { type: "createSkill", name: skillName, description: skillDescription }); if (next) resetSkillForm(); };
  const saveConnection = async (event: React.FormEvent) => { event.preventDefault(); const next = await mutate({ type: "configureProvider", provider: connectionProvider!, label: connectionLabel || (connectionProvider === "ollama" ? "Ollama local" : "OpenAI"), endpoint: connectionProvider === "ollama" ? connectionEndpoint : undefined, hasSecret: Boolean(connectionSecret) }); if (next) { setConnectionProvider(null); setConnectionLabel(""); setConnectionSecret(""); } };
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
      <section className="brain-overview">
        <div><SectionEyebrow>Model runtime</SectionEyebrow><strong>{runtimeModels.find((item) => item.model === model?.model && item.quality === model?.quality)?.name ?? model?.model ?? "Not selected"}</strong><small>{model?.provider ?? "Choose a provider"} · {model?.quality ?? "runtime"}</small></div>
        <div><SectionEyebrow>Skills</SectionEyebrow><strong>{state.skills.length} installed</strong><small>{enabledSkills.length} enabled for {agent.name}</small></div>
        <div><SectionEyebrow>Connections</SectionEyebrow><strong>{state.providerConnections.filter((item) => item.status !== "needs-configuration").length ? "Ready" : "Needs setup"}</strong><small>Set up provider access below.</small></div>
      </section>
      <section className="runtime-panel settings-card">
        <div className="section-heading compact"><div><SectionEyebrow>Model Runtime</SectionEyebrow><h2>Choose by provider</h2></div><span className="quiet-label">Agent-wide</span></div>
        <p className="muted runtime-intro">Model choice lives here so Chat stays a single, uninterrupted conversation.</p>
        {(() => {
          const selectedProvider =
            runtimeProviders.find((item) => item.id === model?.provider) ??
            runtimeProviders[0];
          const providerModels = runtimeModels.filter(
            (item) => item.provider === selectedProvider.id,
          );
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
              <div className="runtime-model-grid">
                {providerModels.map((item) => {
                  const selected =
                    model?.provider === item.provider &&
                    model.model === item.model &&
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
  manageBridge,
}: {
  state: OpenPresenceState;
  mutate: Mutate;
  manageBridge: BridgeManage;
}) {
  const presence = state.presence!;
  const capabilities =
    presence.capabilities ??
    CHANNEL_CAPABILITIES[
      presence.channel as keyof typeof CHANNEL_CAPABILITIES
    ] ??
    [];
  const [customizing, setCustomizing] = useState(true);
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
    <div className="page">
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
          onClick={() =>
            mutate({
              type: "setPresence",
              patch: {
                status: presence.status === "paused" ? "live" : "paused",
              },
            })
          }
        >
          {presence.status === "paused" ? (
            <>
              <Play size={14} /> Resume Presence
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
          <PresenceGlyph
            accent={presence.accent}
            size="large"
            pulse={presence.status === "live"}
          />
          <div>
            <span className="eyebrow">
              {channelLabel(presence.channel, state.channelDefinitions)} ·
              Presence
            </span>
            <h2>{presence.handle}</h2>
            <p>
              {presence.mode === "ghost"
                ? "Ghost · extends the operator’s attention"
                : "Agent-owned · speaks as Jenny"}
            </p>
          </div>
        </div>
      </div>
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
      <section className="settings-card">
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
      <BridgeManager
        state={state}
        presence={presence}
        manageBridge={manageBridge}
      />
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
  const externalEventsEndpoint = "/api/bridge/v1/events";
  const externalExecutionsEndpoint = "/api/bridge/v1/executions/claim";
  const bridgeRows = bridges.map((bridge) => (
    <div className="bridge-row" key={bridge.id}>
      <div>
        <strong>{bridge.name}</strong>
        <small>
          {bridge.state === "offline"
            ? "Disconnected · its credential has been revoked."
            : `Can observe · ${bridge.capabilities.inbound ? "social objects" : "nothing yet"}`}
        </small>
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
      </div>
    </div>
  ));
  return (
    <section className="settings-card bridge-manager">
      <div className="section-heading compact">
        <div>
          <SectionEyebrow>
            {channel?.builtIn ? "Optional live connection" : "Custom channel connection"}
          </SectionEyebrow>
          <h2>{channel?.builtIn ? "Add a live connector" : "Connect this Presence"}</h2>
        </div>
        <ShieldCheck size={17} />
      </div>
      {activeBridges.length === 0 && (
        <div className="empty-bridge">
          <p>
            {channel?.builtIn
              ? `This ${channelLabel(presence.channel, state.channelDefinitions)} Presence already works in the local simulator. Add a Bridge only when an external adapter should send live channel events and receive approved actions.`
              : "A Bridge is a small external adapter for this channel. It sends inbound social objects to OpenPresence and receives only approved actions from this Presence's execution envelope."}
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
    </section>
  );
}
