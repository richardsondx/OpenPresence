"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  Activity,
  ArrowUpRight,
  Badge,
  BookOpen,
  Bot,
  Brain,
  BriefcaseBusiness,
  Check,
  Code2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleAlert,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  FileText,
  FlaskConical,
  Globe2,
  Ghost,
  Heart,
  Info,
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
  Reply,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { AGENT_CAPABILITY_DEFINITIONS, CHANNEL_CAPABILITIES, isAgentCapabilityEnabled, simulationForChannel } from "@/lib/types";
import { bridgeAdapterPrompt, bridgeAdapterStatus, bridgeAdapterStatusLabel, bridgeApiExamples, bridgeEnvironmentExample } from "@/lib/bridge-contract";
import { latestPerception } from "@/lib/perception";
import { validateScenarioFidelity } from "@/lib/scenarios";
import { cleanMirrorText, normalizeMirrorAuthor } from "@/lib/mirror-content";
import { languagesMatch } from "@/lib/language-policy";
import { isCognitionEligibleMirrorObject } from "@/lib/social-context";
import { assignmentIsOpen, audienceDeltas, capabilityProviderLabel, cleanUserFacingAssignmentInstruction, collapseAudienceSnapshots, deriveActivitySummary, derivePresenceCapabilityManifest, derivePublicHistory, derivePublishingPlanProjection, emptyGhostRepresentation, explorationInterpretation, externalUrlForMirrorObject, formatGhostRepresentation, isActivityDecisionEvent, pendingReviewExecutionsForCapabilities, publicHistoryMatchesPresence } from "@/lib/runtime";
import type {
  CalendarSlot,
  Assignment,
  ChannelDefinition,
  ChannelId,
  ChannelSimulationDefinition,
  ConnectorKind,
  CreateAgentInput,
  CreatePresenceInput,
  ExecutionMode,
  FileKind,
  GrowthReview,
  GhostProfile,
  GhostRepresentation,
  OpenPresenceState,
  PublicHistoryItem,
  PublicDisclosurePosture,
  PublicSelf,
  PublicTechnicalFact,
  PresenceConnectionMode,
  PresenceBrief,
  PresenceEnvironment,
  PresenceMode,
  PublishingPlan,
  MirrorObject,
  ModelReviewFinding,
  ModelProvider,
  KnowledgeUse,
  PreferenceReason,
  Presence,
  PresenceAudienceSnapshot,
  PublicationMetricSnapshot,
  SandboxActor,
  SandboxAssetInput,
  SocialDecision,
  ScenarioStimulus,
  ScenarioStimulusRequirements,
  SocialAssetKind,
  Watch,
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
  { id: "watching", label: "Watching", icon: Eye },
  { id: "people", label: "People", icon: Users },
  { id: "feed", label: "Feed", icon: Newspaper },
  { id: "growth", label: "Growth", icon: TrendingUp },
  { id: "schedule", label: "Schedule", icon: Clock3 },
  { id: "presence", label: "Settings", icon: Settings2 },
  { id: "teach", label: "Teach", icon: MessageCircle },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "playground", label: "Playground", icon: FlaskConical },
];
const presenceNavItems = navItems.filter(({ id }) => id === "live" || id === "chat" || id === "watching" || id === "people" || id === "feed" || id === "growth" || id === "schedule" || id === "presence" || id === "playground");
const agentNavItems = navItems.filter(({ id }) => id === "teach" || id === "knowledge");
const ACTIVITY_PAGE_SIZE = 20;
const PUBLIC_HISTORY_PAGE_SIZE = 10;
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
const formatHistoryTimestamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "now"
    : `${new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(date)} · ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date)}`;
};
const formatCountdown = (value: string | undefined, now = Date.now()) => {
  if (!value) return undefined;
  const remaining = new Date(value).getTime() - now;
  if (!Number.isFinite(remaining)) return undefined;
  if (remaining <= 0) return "now";
  const totalSeconds = Math.ceil(remaining / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};
const historyDisplayAt = (item: Pick<PublicHistoryItem, "occurredAt" | "observedAt" | "environment">) => item.environment === "sandbox" ? item.observedAt : item.occurredAt;
const historyTimeTitle = (item: Pick<PublicHistoryItem, "occurredAt" | "observedAt" | "environment">) => item.environment === "sandbox"
  ? `Observed in Sandbox at ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.observedAt))}. Simulated world time: ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.occurredAt))}.`
  : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.occurredAt));
const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function ChannelAvatar({ avatarUrl, name, className }: { avatarUrl?: string; name: string; className: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <span className={className} aria-hidden="true">
      {avatarUrl && !imageFailed ? <img src={avatarUrl} alt="" onError={() => setImageFailed(true)} /> : initials(name)}
    </span>
  );
}

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

function syncBrowserWorkspaceContext(state: OpenPresenceState) {
  if (typeof window === "undefined" || !state.activeAgentId) return;
  const url = new URL(window.location.href);
  url.searchParams.set("agentId", state.activeAgentId);
  if (state.activePresenceId) url.searchParams.set("presenceId", state.activePresenceId);
  else url.searchParams.delete("presenceId");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
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
function PageHeader({
  eyebrow,
  title,
  titleAdornment,
  description,
  actions,
  className = "",
  actionsClassName = "",
}: {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  titleAdornment?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  actionsClassName?: string;
}) {
  return (
    <div className={`page-heading ${className}`.trim()}>
      <div className="page-heading-copy">
        <SectionEyebrow>{eyebrow}</SectionEyebrow>
        {titleAdornment ? <div className="page-heading-title-row"><h1>{title}</h1>{titleAdornment}</div> : <h1>{title}</h1>}
        {description && <p className="muted">{description}</p>}
      </div>
      {actions && (
        <div className={`page-heading-actions ${actionsClassName}`.trim()}>
          {actions}
        </div>
      )}
    </div>
  );
}
type Mutate = (operation: unknown, requestContext?: OpenPresenceState) => Promise<OpenPresenceState | null>;
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
  const attentionOperationInFlight = useRef(false);
  const growthAttentionAt = useRef<Record<string, number>>({});
  const calendarRunInFlight = useRef<string | null>(null);
  const playgroundStartInFlight = useRef<string | null>(null);
  const playgroundClockSyncInFlight = useRef<string | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    query.set("read", Date.now().toString());
    fetch(`/api/state?${query.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load local state");
        return readJsonResponse<OpenPresenceState>(response);
      })
      .then((payload) => {
        setState(payload);
        syncBrowserWorkspaceContext(payload);
      })
      .catch((reason: unknown) => setError(clientErrorMessage(reason, "Unable to load local state")))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (state?.onboarded) window.scrollTo({ top: 0, left: 0 });
  }, [state?.onboarded]);
  async function mutate(operation: unknown, requestContext?: OpenPresenceState) {
    setError(null);
    const operationType = typeof operation === "object" && operation !== null && "type" in operation && typeof operation.type === "string" ? operation.type : null;
    const tracksAttention = ["wakePresence", "runPulse", "runAttentionWorker", "startAssignment", "workAssignment"].includes(operationType ?? "");
    if (tracksAttention) {
      if (attentionOperationInFlight.current) return null;
      attentionOperationInFlight.current = true;
      setPendingOperation(operationType);
    }
    let context = requestContext ?? state;
    let retriedConflict = false;
    let lookPoll: number | undefined;
    try {
      if (operationType === "lookNow" && typeof window !== "undefined") {
        lookPoll = window.setInterval(async () => {
          try {
            const query = new URLSearchParams(window.location.search);
            query.set("read", Date.now().toString());
            const pollResponse = await fetch(`/api/state?${query.toString()}`, { cache: "no-store" });
            if (!pollResponse.ok) return;
            const pollPayload = await readJsonResponse<OpenPresenceState>(pollResponse);
            setState(pollPayload);
            syncBrowserWorkspaceContext(pollPayload);
          } catch {
            // The final operation response remains authoritative if a poll races shutdown.
          }
        }, 750);
      }
      while (true) {
        const response = await fetch("/api/state", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(context?.activeAgentId ? { "x-openpresence-agent-id": context.activeAgentId } : {}),
            ...(context?.activePresenceId ? { "x-openpresence-presence-id": context.activePresenceId } : {}),
            ...(context?.workspaceRevision !== undefined ? { "x-openpresence-workspace-revision": String(context.workspaceRevision) } : {}),
          },
          body: JSON.stringify(operation),
        });
        const payload = await readJsonResponse<OpenPresenceState & { error?: string; conflict?: boolean; state?: OpenPresenceState }>(response);
        if (!response.ok && response.status === 409 && payload.state && !retriedConflict) {
          if (tracksAttention) {
            setState(payload.state);
            syncBrowserWorkspaceContext(payload.state);
            return null;
          }
          retriedConflict = true;
          context = payload.state;
          setState(payload.state);
          syncBrowserWorkspaceContext(payload.state);
          continue;
        }
        if (!response.ok)
          throw new Error(payload.error ?? "That change could not be saved.");
        setState(payload);
        syncBrowserWorkspaceContext(payload);
        return payload as OpenPresenceState;
      }
    } catch (reason) {
      setError(clientErrorMessage(reason, "That change could not be saved."));
      return null;
    } finally {
      if (lookPoll !== undefined && typeof window !== "undefined") window.clearInterval(lookPoll);
      if (tracksAttention) {
        attentionOperationInFlight.current = false;
        setPendingOperation(null);
      }
    }
  }
  async function refreshState() {
    const query = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    query.set("read", Date.now().toString());
    const response = await fetch(`/api/state?${query.toString()}`, { cache: "no-store" });
    const payload = await readJsonResponse<OpenPresenceState>(response);
    if (!response.ok) throw new Error("Unable to refresh local state.");
    setState(payload);
    syncBrowserWorkspaceContext(payload);
    return payload;
  }
  function openView(nextView: View) {
    setView(nextView);
    const presence = state?.presence;
    if (nextView !== "playground" || !state?.onboarded || !presence || playgroundStartInFlight.current === presence.id) return;
    if (pendingOperation === "startAssignment" || pendingOperation === "workAssignment") return;
    const activeSession = state.playgroundSessions.find((item) => item.presenceId === presence.id && item.status === "active");
    if (activeSession) {
      if (activeSession.virtualTimeMode !== "manual" && Math.abs(Date.now() - new Date(activeSession.virtualNow).getTime()) >= 60_000 && playgroundClockSyncInFlight.current !== activeSession.id) {
        playgroundClockSyncInFlight.current = activeSession.id;
        void mutate({ type: "syncPlaygroundTime", sessionId: activeSession.id }).finally(() => { playgroundClockSyncInFlight.current = null; });
      }
      return;
    }
    playgroundStartInFlight.current = presence.id;
    void mutate({ type: "startPlayground", presenceId: presence.id, source: "fresh" }).finally(() => {
      playgroundStartInFlight.current = null;
    });
  }
  useEffect(() => {
    if (pendingOperation) return;
    const presence = state?.presence;
    if (view !== "playground" || !state?.onboarded || !presence || playgroundStartInFlight.current === presence.id) return;
    if (pendingOperation === "startAssignment" || pendingOperation === "workAssignment") return;
    const activeSession = state.playgroundSessions.find((item) => item.presenceId === presence.id && item.status === "active");
    if (activeSession) {
      if (activeSession.virtualTimeMode !== "manual" && Math.abs(Date.now() - new Date(activeSession.virtualNow).getTime()) >= 60_000 && playgroundClockSyncInFlight.current !== activeSession.id) {
        playgroundClockSyncInFlight.current = activeSession.id;
        void mutate({ type: "syncPlaygroundTime", sessionId: activeSession.id }).finally(() => { playgroundClockSyncInFlight.current = null; });
      }
      return;
    }
    const timer = window.setTimeout(() => {
      if (playgroundStartInFlight.current === presence.id) return;
      playgroundStartInFlight.current = presence.id;
      void mutate({ type: "startPlayground", presenceId: presence.id, source: "fresh" }).finally(() => {
        playgroundStartInFlight.current = null;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [view, state?.onboarded, state?.activePresenceId, state?.playgroundSessions, state?.presence, pendingOperation]);
  useEffect(() => {
    if (view !== "playground" || !state) return;
    const activeAssignmentWork = state.assignments.some((assignment) => assignment.status === "working" || assignment.work?.phase === "researching" || assignment.work?.phase === "visual_research" || assignment.work?.phase === "publishing");
    const activeRun = (state.assignmentRuns ?? []).some((run) => ["queued", "researching", "selecting", "writing", "delivering"].includes(run.status));
    if (!activeAssignmentWork && !activeRun) return;
    const timer = window.setInterval(() => {
      void refreshState().catch((reason: unknown) => setError(clientErrorMessage(reason, "Unable to refresh Assignment progress.")));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [view, state?.assignments, state?.assignmentRuns]);
  useEffect(() => {
    if (pendingOperation === "wakePresence" || pendingOperation === "runPulse" || pendingOperation === "runAttentionWorker") return;
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
        const response = await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json", ...(state?.activeAgentId ? { "x-openpresence-agent-id": state.activeAgentId } : {}), ...(state?.activePresenceId ? { "x-openpresence-presence-id": state.activePresenceId } : {}), ...(state?.workspaceRevision !== undefined ? { "x-openpresence-workspace-revision": String(state.workspaceRevision) } : {}) }, body: JSON.stringify({ type: "syncNativeX", presenceId: presence.id }) });
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
    const presenceId = state?.presence?.id;
    const connectionMode = state?.presence?.connectionMode;
    const browserAccessEnabled = state?.presence?.browserAccess?.enabled;
    if (!presenceId || connectionMode !== "bridge" || !browserAccessEnabled) return;
    const refreshBridgeHealth = async () => {
      try {
        const query = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
        query.set("read", Date.now().toString());
        const response = await fetch(`/api/state?${query.toString()}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await readJsonResponse<OpenPresenceState>(response);
        setState(payload);
        syncBrowserWorkspaceContext(payload);
      } catch {
        // Bridge health is advisory and must not interrupt the current action.
      }
    };
    const timer = window.setInterval(() => {
      void refreshBridgeHealth();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [state?.presence?.id, state?.presence?.connectionMode, state?.presence?.browserAccess?.enabled]);
  useEffect(() => {
    if (pendingOperation || attentionOperationInFlight.current) return;
    const presence = state?.presence;
    if (!presence || presence.status !== "live") return;
    const slots = state.calendar.filter((slot) => slot.presence === presence.id && slot.enabled && slot.day && slot.time);
    const assignments = state.assignments.filter((assignment) => assignment.presenceId === presence.id && assignment.environment === "live" && assignment.deliverable.type === "original_publication" && assignment.schedule && ["draft", "active", "working"].includes(assignment.status));
    if (!slots.length && !assignments.length) return;
    const now = new Date();
    const dayIndex: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const due = slots.find((slot) => {
      const [hours, minutes] = slot.time.split(":").map(Number);
      return dayIndex[slot.day] === now.getDay() && hours * 60 + minutes <= currentMinutes && (!slot.lastEvaluatedAt || new Date(slot.lastEvaluatedAt).toDateString() !== now.toDateString());
    });
    const dueAssignment = assignments.find((assignment) => {
      if (!assignment.schedule || dayIndex[assignment.schedule.day] !== now.getDay()) return false;
      const [hours, minutes] = assignment.schedule.time.split(":").map(Number);
      return Number.isFinite(hours) && Number.isFinite(minutes) && hours * 60 + minutes <= currentMinutes && (!assignment.lastEvaluatedAt || new Date(assignment.lastEvaluatedAt).toDateString() !== now.toDateString());
    });
    if (due && calendarRunInFlight.current !== due.id) {
      calendarRunInFlight.current = due.id;
      window.setTimeout(() => { void mutate({ type: "runSlot", id: due.id, scheduled: true }).finally(() => { calendarRunInFlight.current = null; }); }, 0);
      return;
    }
    if (dueAssignment && calendarRunInFlight.current !== `assignment:${dueAssignment.id}`) {
      const bridge = presence.connectionMode === "bridge" ? state.bridges.find((item) => item.presenceId === presence.id && item.state !== "offline") : undefined;
      const bridgeReady = presence.connectionMode !== "bridge" || Boolean(bridge && bridgeAdapterStatus(bridge) === "connected");
      if (!bridgeReady) return;
      calendarRunInFlight.current = `assignment:${dueAssignment.id}`;
      const operation = presence.connectionMode === "bridge" ? { type: "runAttentionWorker" as const } : { type: "runPulse" as const, presenceId: presence.id };
      window.setTimeout(() => { void mutate(operation).finally(() => { calendarRunInFlight.current = null; }); }, 0);
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
    const nextAssignments = assignments.map((assignment) => {
      const [hours, minutes] = assignment.schedule!.time.split(":").map(Number);
      const target = new Date(now);
      const targetDay = dayIndex[assignment.schedule!.day];
      target.setDate(now.getDate() + ((targetDay - now.getDay() + 7) % 7));
      target.setHours(hours, minutes, 0, 0);
      if (target.getTime() <= now.getTime() || (assignment.lastEvaluatedAt && new Date(assignment.lastEvaluatedAt).toDateString() === target.toDateString())) target.setDate(target.getDate() + 7);
      return { assignment, time: target.getTime() };
    });
    const next = [...nextSlots.map((item) => ({ kind: "slot" as const, item, time: item.time })), ...nextAssignments.map((item) => ({ kind: "assignment" as const, item, time: item.time }))].sort((left, right) => left.time - right.time)[0];
    if (!next) return;
    const delay = Math.max(1_000, next.time - now.getTime());
    const timer = setTimeout(() => {
      const key = next.kind === "slot" ? next.item.slot.id : `assignment:${next.item.assignment.id}`;
      if (calendarRunInFlight.current === key) return;
      calendarRunInFlight.current = key;
      const operation = next.kind === "slot"
        ? { type: "runSlot" as const, id: next.item.slot.id, scheduled: true }
        : presence.connectionMode === "bridge"
          ? { type: "runAttentionWorker" as const }
          : { type: "runPulse" as const, presenceId: presence.id };
      void mutate(operation).finally(() => { calendarRunInFlight.current = null; });
    }, delay);
    return () => clearTimeout(timer);
  }, [state?.assignments, state?.calendar, state?.presence, state?.activePresenceId, state?.bridges, pendingOperation]);
  useEffect(() => {
    if (pendingOperation || attentionOperationInFlight.current) return;
    const presence = state?.presence;
    if (!presence || presence.status !== "live") return;
    const growthAssignment = state.assignments.find((item) => item.presenceId === presence.id && item.status === "active" && item.activation?.type === "continuous" && item.successEvidence?.metric === "followers");
    if (!growthAssignment) return;
    const bridge = presence.connectionMode === "bridge" ? state.bridges.find((item) => item.presenceId === presence.id && item.state !== "offline") : undefined;
    const bodyReady = presence.connectionMode === "bridge"
      ? Boolean(bridge && bridgeAdapterStatus(bridge) === "connected")
      : presence.connectionMode === "native" && state.nativeConnections.some((item) => item.presenceId === presence.id && item.status === "connected");
    if (!bodyReady) return;
    const lastRun = growthAttentionAt.current[presence.id] ?? 0;
    const wait = Math.max(0, 5 * 60_000 - (Date.now() - lastRun));
    const timer = window.setTimeout(() => {
      if (growthAttentionAt.current[presence.id] && Date.now() - growthAttentionAt.current[presence.id] < 5 * 60_000) return;
      growthAttentionAt.current[presence.id] = Date.now();
      void mutate({ type: "runAttentionWorker" });
    }, wait);
    return () => window.clearTimeout(timer);
  }, [state?.assignments, state?.presence, state?.nativeConnections, state?.bridges, pendingOperation]);
  async function manageBridge(operation: unknown) {
    setError(null);
    try {
      const response = await fetch("/api/bridge/manage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(state?.activeAgentId ? { "x-openpresence-agent-id": state.activeAgentId } : {}),
          ...(state?.activePresenceId ? { "x-openpresence-presence-id": state.activePresenceId } : {}),
          ...(state?.workspaceRevision !== undefined ? { "x-openpresence-workspace-revision": String(state.workspaceRevision) } : {}),
        },
        body: JSON.stringify(operation),
      });
      const payload = await readJsonResponse<{ state?: OpenPresenceState; key?: string; error?: string }>(response);
      if (!response.ok)
        if (response.status === 409 && payload.state) {
          setState(payload.state);
          syncBrowserWorkspaceContext(payload.state);
          throw new Error("This tab was refreshed because the Agent workspace changed elsewhere. Please retry the Bridge action.");
        }
      if (!response.ok)
        throw new Error(
          payload.error ?? "That Bridge change could not be saved.",
        );
      if (!payload.state) throw new Error("The Bridge service returned no state.");
      setState(payload.state);
      syncBrowserWorkspaceContext(payload.state);
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
        headers: {
          "Content-Type": "application/json",
          ...(state?.activeAgentId ? { "x-openpresence-agent-id": state.activeAgentId } : {}),
          ...(state?.activePresenceId ? { "x-openpresence-presence-id": state.activePresenceId } : {}),
          ...(state?.workspaceRevision !== undefined ? { "x-openpresence-workspace-revision": String(state.workspaceRevision) } : {}),
        },
        body: JSON.stringify(operation),
      });
      const payload = await readJsonResponse<{ state?: OpenPresenceState; result?: { account: { id: string; username: string; name: string }; access: "read" | "read-write" }; error?: string }>(response);
      if (!response.ok && response.status === 409 && payload.state) {
        setState(payload.state);
        syncBrowserWorkspaceContext(payload.state);
        throw new Error("This tab was refreshed because the Agent workspace changed elsewhere. Please retry the X action.");
      }
      if (!response.ok) throw new Error(payload.error ?? "The X connection could not be completed.");
      if (payload.state) {
        setState(payload.state);
        syncBrowserWorkspaceContext(payload.state);
      }
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
      refreshState={refreshState}
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
                {item.id === agent.id && <small>Current</small>}
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
  refreshState,
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
  refreshState: () => Promise<OpenPresenceState>;
  pendingOperation: string | null;
  manageBridge: BridgeManage;
  manageX: XManage;
  error: string | null;
}) {
  const agent = state.agent!;
  const presence = state.presence ?? state.presences[0]!;
  const presenceBridge = state.bridges.find((item) => item.presenceId === presence.id && item.state !== "offline");
  const presenceBridgeStatus = presenceBridge ? bridgeAdapterStatus(presenceBridge) : undefined;
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
            : view === "growth"
              ? "Growth"
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
          <div className="sidebar-footer-actions">
            <AgentSwitcher state={state} mutate={mutate} />
          </div>
        </div>
      </aside>
      <section className={`${view === "chat" || view === "teach" ? "workspace workspace-chat" : "workspace"} ${view === "knowledge" ? "workspace-knowledge" : ""}`}>
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
                : state.nativeConnections.some((item) => item.presenceId === presence.id && item.status === "needs-attention") || presenceBridgeStatus === "stale"
                  ? "Needs attention"
                  : presence.connectionMode === "sandbox"
                    ? "Sandbox"
                    : presenceBridgeStatus === "waiting"
                      ? "Waiting for adapter"
                      : (state.nativeConnections.some((item) => item.presenceId === presence.id && item.status === "connected") || presenceBridgeStatus === "connected")
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
          {view === "knowledge" && <KnowledgeView state={state} mutate={mutate} refreshState={refreshState} />}
          {view === "chat" && <PresenceChatView state={state} mutate={mutate} />}
          {view === "watching" && <WatchingView state={state} mutate={mutate} />}
          {view === "people" && <PeopleView state={state} mutate={mutate} />}
          {view === "playground" && (
            <PlaygroundView state={state} mutate={mutate} />
          )}
          {view === "live" && (
            <LiveView key={`${state.presence?.id ?? "none"}-${state.presence?.channel ?? "none"}-${state.presence?.environment ?? "live"}`} state={state} mutate={mutate} pendingOperation={pendingOperation} setView={setView} />
          )}
          {view === "feed" && (
            <PublicHistoryView state={state} setView={setView} mutate={mutate} />
          )}
          {view === "growth" && <GrowthView state={state} mutate={mutate} setView={setView} />}
          {view === "schedule" && (
            <ScheduleView state={state} mutate={mutate} setView={setView} />
          )}
          {view === "brain" && (
            <BrainView
              key={`${state.activeAgentId}-${selectedFile}-${state.files.find((file) => file.kind === selectedFile)?.revision ?? 0}`}
              state={state}
              mutate={mutate}
              selectedFile={selectedFile}
              setSelectedFile={setSelectedFile}
              setView={setView}
            />
          )}
          {view === "presence" && (
            <PresenceView
              key={presence.id}
              state={state}
              mutate={mutate}
              refreshState={refreshState}
              setView={setView}
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
          agentName={agent.name}
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
  refreshState,
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
  refreshState: () => Promise<OpenPresenceState>;
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
  const presenceBridge = state.bridges.find((item) => item.presenceId === presence.id && item.state !== "offline");
  const presenceBridgeStatus = presenceBridge ? bridgeAdapterStatus(presenceBridge) : "disconnected";
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
          {presenceNavItems.map(({ id, label, icon: Icon }) => (
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
        <button
          className={`secondary-nav ${view === "knowledge" ? "active" : ""}`}
          onClick={() => setView("knowledge")}
        >
          <BookOpen size={17} />
          <span>Knowledge</span>
        </button>
      </aside>
      <section className={`${view === "chat" ? "workspace workspace-chat" : "workspace"} ${view === "knowledge" ? "workspace-knowledge" : ""}`}>
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
                  : presenceBridgeStatus === "stale"
                    ? "Needs attention"
                    : presenceBridgeStatus === "waiting"
                      ? "Waiting for adapter"
                      : presenceBridgeStatus === "connected"
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
          {view === "knowledge" && <KnowledgeView state={state} mutate={mutate} refreshState={refreshState} />}
          {view === "live" && (
            <LiveView key={`${state.presence?.id ?? "none"}-${state.presence?.channel ?? "none"}-${state.presence?.environment ?? "live"}`} state={state} mutate={mutate} setView={setView} />
          )}
          {view === "watching" && <WatchingView state={state} mutate={mutate} />}
          {view === "people" && <PeopleView state={state} mutate={mutate} />}
          {view === "feed" && (
            <PublicHistoryView state={state} setView={setView} mutate={mutate} />
          )}
          {view === "growth" && <GrowthView state={state} mutate={mutate} setView={setView} />}
          {view === "schedule" && (
            <ScheduleView state={state} mutate={mutate} setView={setView} />
          )}
          {view === "brain" && (
            <BrainView
              key={`${selectedFile}-${state.files.find((file) => file.kind === selectedFile)?.revision ?? 0}`}
              state={state}
              mutate={mutate}
              selectedFile={selectedFile}
              setSelectedFile={setSelectedFile}
              setView={setView}
            />
          )}
          {view === "presence" && (
            <PresenceView
              key={presence.id}
              state={state}
              mutate={mutate}
              refreshState={refreshState}
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
          onClick={() => setView("brain")}
          className={view === "brain" ? "active" : ""}
        >
          <Brain size={18} />
          <span>Brain</span>
        </button>
        <button
          onClick={() => setView("knowledge")}
          className={view === "knowledge" ? "active" : ""}
        >
          <BookOpen size={18} />
          <span>Knowledge</span>
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
          agentName={agent.name}
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
  agentName,
  accent,
  onClose,
  onCreate,
}: {
  agentName: string;
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
  const [affordances, setAffordances] = useState<string[]>(["post", "comment", "like"]);
  const customDefinition = (): ChannelDefinition => {
    const timestamp = new Date().toISOString();
    const capabilities = affordances.map((id) => ({
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
      supportedAssetKinds: [],
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
  const toggleAffordance = (id: string) => setAffordances((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
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
          <legend>Where should {agentName} show up?</legend>
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
              Technical channel ID <small className="muted">Advanced</small>
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
            <fieldset className="capability-picker">
              <legend>What can people do here?</legend>
              <small className="muted">Choose the social actions this adapter is allowed to carry out.</small>
              <div className="capability-picker-options">
                {[
                  ["post", "Post", "Publish a new community post."],
                  ["comment", "Comment / reply", "Respond inside an existing conversation."],
                  ["like", "Like", "React to a community object."],
                ].map(([id, label, description]) => (
                  <label key={id}>
                    <input type="checkbox" checked={affordances.includes(id)} onChange={() => toggleAffordance(id)} />
                    <span><strong>{label}</strong><small>{description}</small></span>
                  </label>
                ))}
              </div>
              <p className="media-capability-note"><strong>Media delivery not enabled yet.</strong> Image and GIF uploads will be negotiated separately when the Bridge supports asset transfer.</p>
            </fieldset>
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
          <span>Capabilities enabled</span>
          <strong>{AGENT_CAPABILITY_DEFINITIONS.filter((definition) => definition.scope === "agent" && isAgentCapabilityEnabled(state.toolBindings, state.agent?.id, definition.id)).length}</strong>
          </div>
        </div>
      </section>
    </aside>
  );
}

function MediaPerceptionDisclosure({
  object,
  state,
  mutate,
  presenceName,
}: {
  object: MirrorObject;
  state: OpenPresenceState;
  mutate: Mutate;
  presenceName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assets = (object.assetRefs ?? [])
    .map((ref) => state.assets.find((asset) => asset.id === ref.assetId))
    .filter((asset): asset is OpenPresenceState["assets"][number] => Boolean(asset));
  const perceptions = assets.map((asset) => ({ asset, perception: latestPerception(state.perceptions, asset.id, "inspect") }));
  if (!assets.length) return null;
  const inspect = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await mutate({ type: "inspectMirrorMedia", presenceId: object.presenceId, objectId: object.id });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The visual asset could not be inspected.");
    } finally {
      setBusy(false);
    }
  };
  const sourceFor = (asset: typeof assets[number]) => asset.storage ? `/api/assets/${asset.id}` : asset.dataUrl ?? asset.provenance.sourceUrl;
  const isImagePreview = (source: string) => /\.(?:png|jpe?g|webp|gif)(?:$|\?)/i.test(source) || source.includes("/img/") || source.includes("media/");
  return (
    <details className="media-perception-disclosure">
      <summary className="media-perception-summary">What {presenceName} sees <span>{assets.length} {assets.length === 1 ? "asset" : "assets"}</span></summary>
      <div className="media-perception-body">
        <div className="media-perception-grid">
          {perceptions.map(({ asset, perception }) => {
            const source = sourceFor(asset);
            return (
              <div className="media-perception-item" key={asset.id}>
                <div className="media-perception-visual">
                  {source && (asset.type === "image" || asset.type === "gif" || asset.type === "chart" || (asset.type === "video" && isImagePreview(source))) ? <img src={source} alt={asset.description ?? `Attached ${asset.type}`} /> : source && asset.type === "video" ? <video controls playsInline preload="metadata" src={source} aria-label="Attached video" /> : <span className="social-link-asset">{asset.type} attached</span>}
                </div>
                <div className="media-perception-copy">
                  <strong>{asset.description ?? `Attached ${asset.type}`}</strong>
                  {perception && perception.result.uncertainty !== "insufficient" ? <>
                    <div><span>Observation</span><p>{perception.result.observation}</p></div>
                    {perception.result.interpretation && <div><span>Possible meaning</span><p>{perception.result.interpretation}</p></div>}
                    <small>Uncertainty: {perception.result.uncertainty}</small>
                    {perception.result.missingContext?.length ? <small>Missing context: {perception.result.missingContext.join(" ")}</small> : null}
                  </> : <p className="media-perception-unavailable">Not interpreted yet. {presenceName} must not infer what this asset contains.</p>}
                </div>
              </div>
            );
          })}
        </div>
        {perceptions.some(({ perception }) => !perception || perception.result.uncertainty === "insufficient") && <button type="button" className="media-perception-action" onClick={() => void inspect()} disabled={busy}>{busy ? "Inspecting visual asset…" : "Interpret asset"}</button>}
        {error && <p className="media-perception-error" role="alert">{error}</p>}
        <small className="media-perception-boundary">This is a stored visual observation, separate from the Agent&apos;s decision about whether to act.</small>
      </div>
    </details>
  );
}

function SocialObjectCard({
  item,
  objects,
  assets,
  presenceId,
  presenceName,
  onSelect,
  onRemove,
  threadDepth = 0,
  readOnly = false,
  reviewFindings = [],
}: {
  item: MirrorObject;
  objects: MirrorObject[];
  assets: OpenPresenceState["assets"];
  presenceId: string;
  presenceName: string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  threadDepth?: number;
  readOnly?: boolean;
  reviewFindings?: ModelReviewFinding[];
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
  const attachedFindings = reviewFindings.filter((finding) => {
    const references = new Set([
      `object:${item.id}`,
      `mirror:${item.id}`,
      `external:${item.externalRef.id}`,
      `source:${item.sourceEventId ?? ""}`,
    ]);
    return finding.evidenceRefs.some((reference) => references.has(reference));
  });

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
          {!readOnly && <button type="button" className="social-card-remove" aria-label={`Remove ${item.objectType} from Playground`} title="Remove from rehearsal" onClick={() => onRemove(item.id)}><X size={13} /></button>}
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
          {!readOnly && <button type="button" className="social-card-remove" aria-label={`Remove ${item.objectType} from Playground`} title="Remove from rehearsal" onClick={() => onRemove(item.id)}><X size={13} /></button>}
        </div>
      )}
      {attachedFindings.map((finding) => (
        <div className={`scenario-replay-finding scenario-replay-finding-${finding.status}`} key={finding.id}>
          <strong>{finding.status === "violated" ? "Needs attention" : finding.status === "uncertain" ? "Review this moment" : "Reviewer noted"}</strong>
          <span>{finding.explanation}</span>
        </div>
      ))}
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
              <span className="social-card-asset" key={asset.id}>
                <img src={asset.storage ? `/api/assets/${asset.id}` : asset.dataUrl ?? asset.provenance.sourceUrl ?? ""} alt={asset.description ?? "Attached simulated media"} />
                {asset.provenance.sourcePageUrl && <a href={asset.provenance.sourcePageUrl} target="_blank" rel="noreferrer">Source: {asset.provenance.publisher ?? asset.description ?? "Open source"}</a>}
              </span>
            ) : asset?.type === "chart" ? (
              <span className="social-card-asset" key={asset.id}>
                <img src={asset.storage ? `/api/assets/${asset.id}` : asset.dataUrl ?? asset.provenance.sourceUrl ?? ""} alt={asset.description ?? "Attached chart"} />
                {asset.provenance.sourcePageUrl && <a href={asset.provenance.sourcePageUrl} target="_blank" rel="noreferrer">Source: {asset.provenance.publisher ?? asset.description ?? "Open source"}</a>}
              </span>
            ) : (
              <span className="social-link-asset" key={asset?.id}>
                {asset?.type === "link" ? asset.provenance.sourceUrl : `${asset?.type} attached`}
              </span>
            ),
          )}
        </div>
      )}
      {!readOnly && item.assetRefs?.length ? (
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
  onRemove,
  readOnly = false,
  reviewFindings = [],
}: {
  objects: MirrorObject[];
  assets: OpenPresenceState["assets"];
  presenceId: string;
  presenceName: string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  readOnly?: boolean;
  reviewFindings?: ModelReviewFinding[];
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
      <SocialObjectCard item={object} objects={objects} assets={assets} presenceId={presenceId} presenceName={presenceName} onSelect={onSelect} onRemove={onRemove} threadDepth={depth} readOnly={readOnly} reviewFindings={reviewFindings} />
      {(childrenByParent.get(refKey(object)) ?? []).sort((left, right) => timestamp(left) - timestamp(right)).map((child) => renderThread(child, depth + 1))}
    </Fragment>
  );
  return <div className="social-feed">{roots.map((root) => <div className="social-thread" key={`thread:${root.id}`}>{renderThread(root)}</div>)}</div>;
}

type ScenarioRunView = "replay" | "review" | "details";

function ScenarioRunDetail({
  state,
  presence,
  selectedRun,
  selectedRunScenario,
  selectedRunVersion,
  runObjects,
  runEvents,
  evaluation,
  runView,
  setRunView,
  operatorNote,
  setOperatorNote,
  busy,
  onBack,
  onRerun,
  onReview,
  onRecordReview,
}: {
  state: OpenPresenceState;
  presence: NonNullable<OpenPresenceState["presence"]>;
  selectedRun: OpenPresenceState["scenarioRuns"][number];
  selectedRunScenario?: OpenPresenceState["scenarios"][number];
  selectedRunVersion?: OpenPresenceState["scenarioVersions"][number];
  runObjects: MirrorObject[];
  runEvents: OpenPresenceState["events"];
  evaluation?: OpenPresenceState["scenarioEvaluations"][number];
  runView: ScenarioRunView;
  setRunView: (view: ScenarioRunView) => void;
  operatorNote: string;
  setOperatorNote: (note: string) => void;
  busy: boolean;
  onBack: () => void;
  onRerun: () => void;
  onReview: () => void;
  onRecordReview: (disposition: "okay" | "concern") => void;
}) {
  const modelFindings = evaluation?.modelFindings ?? [];
  const structuralFindings = evaluation?.structuralFindings ?? [];
  const inboundObjects = runObjects.filter((item) => item.actorPresenceId !== presence.id && item.objectType !== "like");
  const agentObjects = runObjects.filter((item) => item.actorPresenceId === presence.id && item.objectType !== "like");
  const successfulChecks = structuralFindings.filter((finding) => finding.status === "pass").length;
  const provenance = state.scenarioRunProvenance.find((item) => item.id === selectedRun.provenanceId);
  const behaviorSummary = [
    inboundObjects.length ? `${presence.name} saw ${inboundObjects.length} social moment${inboundObjects.length === 1 ? "" : "s"} in the simulated world.` : "The simulated world did not contain an incoming social post.",
    agentObjects.length
      ? `${presence.name} left ${agentObjects.length} public contribution${agentObjects.length === 1 ? "" : "s"} in the exchange.`
      : `${presence.name} did not publish a reply in this rehearsal.`,
    structuralFindings.length && successfulChecks === structuralFindings.length
      ? "The rehearsal stayed inside the isolated Sandbox."
      : "One or more system checks deserves attention in Details.",
  ];

  return (
    <section className="scenario-run-detail" aria-label="Scenario Run">
      <div className="scenario-detail-heading">
        <div>
          <div className="eyebrow">Scenario rehearsal</div>
          <h2>{selectedRunScenario?.title ?? "Scenario Run"}</h2>
          <p>{presence.name} · {channelLabel(presence.channel, state.channelDefinitions)} · {presence.mode === "ghost" ? "Ghost" : "Agent-owned"}</p>
          <div className="scenario-run-state"><span className="status-dot" /> {selectedRun.status === "completed" ? "Completed" : selectedRun.status} · Sandbox</div>
        </div>
        <div className="scenario-detail-actions">
          <Button variant="ghost" onClick={onBack}>Back to scenario</Button>
          <Button variant="secondary" disabled={busy || selectedRun.status === "active"} onClick={onRerun}><RotateCcw size={14} /> Run again</Button>
          {selectedRun.status !== "active" && <Button variant="primary" disabled={busy} onClick={onReview}><ShieldCheck size={14} /> {evaluation?.reviewer ? "Review again" : "Review Run"}</Button>}
        </div>
      </div>

      <div className="scenario-run-tabs" role="tablist" aria-label="Run views">
        {(["replay", "review", "details"] as ScenarioRunView[]).map((view) => (
          <button type="button" role="tab" aria-selected={runView === view} className={runView === view ? "active" : ""} key={view} onClick={() => setRunView(view)}>
            {view === "replay" ? "Replay" : view === "review" ? "Review" : "Details"}
          </button>
        ))}
      </div>

      {selectedRunVersion?.fidelity && (
        <section className="scenario-fidelity-panel" aria-label="Scenario fidelity">
          <div>
            <div className="eyebrow">Scenario fidelity</div>
            <p>{selectedRunVersion.fidelity.status === "verified" ? "The Run used a frozen world that matched the requested situation." : "This Run used a world that needs revision before it can be trusted."}</p>
          </div>
          <div className="scenario-fidelity-checks">
            {selectedRunVersion.fidelity.checks.map((fidelityCheck) => (
              <div className={`scenario-fidelity-check scenario-fidelity-${fidelityCheck.status}`} key={fidelityCheck.id}>
                <span aria-hidden="true">{fidelityCheck.status === "met" ? "✓" : fidelityCheck.status === "missing" ? "!" : "?"}</span>
                <div><strong>{fidelityCheck.label}</strong><small>{fidelityCheck.explanation}</small></div>
              </div>
            ))}
          </div>
        </section>
      )}

      {runView === "replay" && (
        <div className="scenario-replay-view" role="tabpanel" aria-label="Replay">
          <div className="scenario-section-intro">
            <div className="eyebrow">Replay</div>
            <h3>What {presence.name} experienced</h3>
            <p>Watch the simulated {channelLabel(presence.channel, state.channelDefinitions)} exchange as it happened. This is the behavior to judge first.</p>
          </div>
          {runObjects.length ? (
            <PlaygroundThreadFeed objects={runObjects} assets={state.assets} presenceId={presence.id} presenceName={presence.name} onSelect={() => undefined} onRemove={() => undefined} readOnly reviewFindings={modelFindings} />
          ) : (
            <div className="world-blank"><MessageSquare size={20} /><p>The simulated world stayed quiet.</p><small>No social objects were recorded in this Run.</small></div>
          )}
          {!agentObjects.length && runObjects.length > 0 && (
            <div className="scenario-silence-note"><strong>{presence.name} did not respond.</strong><span>Silence is shown as a real outcome, not hidden inside a system event.</span></div>
          )}
          <section className="scenario-operator-review scenario-operator-review-friendly">
            <div><div className="eyebrow">Your review</div><h3>How did this feel?</h3><p>Save your observation without changing {presence.name} automatically.</p></div>
            <textarea aria-label="Operator review note" value={operatorNote} onChange={(event) => setOperatorNote(event.target.value)} placeholder="Optional note about the voice, judgment, privacy, or identity you noticed." rows={3} />
            <div><Button variant="ghost" disabled={busy || !evaluation} onClick={() => onRecordReview("okay")}>Looks right</Button><Button variant="secondary" disabled={busy || !evaluation} onClick={() => onRecordReview("concern")}>Something felt wrong</Button></div>
            {evaluation?.operatorReview && <small className="scenario-review-saved">Saved as an operator observation. It does not change the Agent automatically.</small>}
          </section>
        </div>
      )}

      {runView === "review" && (
        <div className="scenario-review-view" role="tabpanel" aria-label="Review">
          <section className="scenario-review-summary">
            <div className="eyebrow">Review</div>
            <h3>How {presence.name} handled it</h3>
            <ul>{behaviorSummary.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
          <section className="scenario-review-summary scenario-review-attention">
            <div className="eyebrow">What stood out</div>
            {modelFindings.length ? modelFindings.map((finding) => <div className="scenario-review-finding" key={finding.id}><ScenarioRunStatus status={finding.status === "violated" ? "failed" : finding.status === "uncertain" ? "needs_review" : "passed"} /><strong>{scenarioCriterionLabel(finding.criterionId, selectedRunVersion)}</strong><p>{finding.explanation}</p>{finding.evidenceRefs.length > 0 && <small>Evidence linked to the replay where available.</small>}</div>) : <p>{evaluation?.reviewer ? "The independent reviewer did not flag a qualitative concern." : "Review this Run to get an independent read on the qualitative behavior."}</p>}
          </section>
        </div>
      )}

      {runView === "details" && (
        <div className="scenario-details-view" role="tabpanel" aria-label="Technical details">
          <section className="scenario-system-checks">
            <div><div className="eyebrow">System checks</div><h3>{successfulChecks}/{structuralFindings.length || 0} passed</h3><p>These checks confirm the rehearsal stayed within its configured boundaries.</p></div>
            {evaluation ? structuralFindings.map((finding) => <div className={`scenario-system-check scenario-system-check-${finding.status}`} key={finding.id}><span>{finding.status === "pass" ? "✓" : "!"}</span><strong>{scenarioCriterionLabel(finding.criterionId, selectedRunVersion)}</strong><small>{finding.status === "pass" ? "Passed" : "Needs attention"}</small></div>) : <p>System checks are not available yet.</p>}
          </section>
          <section className="scenario-run-meta scenario-run-meta-details"><span><strong>Scenario version</strong>{selectedRunVersion ? `v${selectedRunVersion.version}` : "Unavailable"}</span><span><strong>Run provenance</strong>Frozen at start</span><span><strong>Model</strong>{provenance?.model?.model ?? "Configured Agent model"}</span><span><strong>Observed records</strong>{runEvents.length + runObjects.length}</span></section>
          <details className="scenario-technical-details">
            <summary>Technical details <span>View run trace</span></summary>
            <div className="scenario-trace">{runEvents.length ? runEvents.map((event) => <div className="scenario-trace-row" key={event.id}><span className={`event-dot event-${event.tone}`} /><strong>{event.title}</strong><small>{event.detail}</small></div>) : <p>No trace events recorded.</p>}</div>
          </details>
        </div>
      )}
    </section>
  );
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

function scenarioEventActionLabel(type: string) {
  return type === "reply" ? "Reply" : type === "quote" ? "Quote-post" : type === "mention" ? "Mention" : type === "comment" ? "Comment" : "Post";
}

function ScenarioEventsEditor({ stimuli, actors, presenceName, onChange, onSave, onClose, busy }: { stimuli: ScenarioStimulus[]; actors: NonNullable<OpenPresenceState["scenarioVersions"][number]["worldSpec"]["startingWorld"]>["actors"]; presenceName: string; onChange: (stimuli: ScenarioStimulus[]) => void; onSave: () => void; onClose: () => void; busy: boolean }) {
  const update = (index: number, patch: Partial<ScenarioStimulus>) => onChange(stimuli.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const remove = (index: number) => onChange(stimuli.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, sequence: itemIndex + 1 })));
  const add = () => onChange([...stimuli, { id: `scenario-event-${Date.now()}`, sequence: stimuli.length + 1, type: "post", actorRef: actors?.[0]?.id ?? "actor-1", content: "", origin: "operator", trust: "untrusted_world_content", fidelity: "unverified" }]);
  return <section className="scenario-events-editor" aria-label="Edit what the Presence will see"><div className="scenario-events-editor-heading"><div><div className="eyebrow">Edit what {presenceName} will see</div><p>These are the exact world events that will enter the Social Mirror. The scenario brief and review criteria stay outside the Presence&apos;s cognition.</p></div><Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Close</Button></div><div className="scenario-event-editor-list">{stimuli.map((stimulus, index) => <article className="scenario-event-editor" key={stimulus.id}><div className="scenario-event-editor-topline"><strong>{index + 1} · {scenarioEventActionLabel(stimulus.type)}</strong><Button type="button" variant="ghost" disabled={busy || stimuli.length <= 1} onClick={() => remove(index)}>Delete</Button></div><div className="scenario-event-editor-grid"><label>Actor<select value={stimulus.actorRef} onChange={(event) => update(index, { actorRef: event.target.value })}>{(actors ?? []).map((actor) => <option key={actor.id} value={actor.id}>{actor.displayName} {actor.handle ? `· ${actor.handle}` : ""}</option>)}</select></label><label>Action<select value={stimulus.type} onChange={(event) => update(index, { type: event.target.value })}><option value="post">Post</option><option value="reply">Reply</option><option value="quote">Quote-post</option><option value="mention">Mention</option><option value="comment">Comment</option></select></label><label>Target / parent<select value={stimulus.targetRef ?? ""} onChange={(event) => update(index, { targetRef: event.target.value || undefined })}><option value="">New thread</option><option value="presence">{presenceName}</option>{stimuli.filter((candidate) => candidate.id !== stimulus.id).map((candidate, candidateIndex) => <option key={candidate.id} value={candidate.id}>Event {candidateIndex + 1}</option>)}</select></label><label>Timing (minutes after start)<input type="number" min="0" value={stimulus.offsetMinutes ?? 0} onChange={(event) => update(index, { offsetMinutes: Number(event.target.value) || 0 })} /></label></div><label className="scenario-event-content-label">Exact content<textarea value={stimulus.content} onChange={(event) => update(index, { content: event.target.value })} rows={3} placeholder="Write the exact post or reply the Presence will encounter…" /></label><div className="scenario-event-assets"><strong>Assets</strong>{stimulus.assets?.length ? <span>{stimulus.assets.map((asset) => asset.name).join(", ")}</span> : <span>No assets attached</span>}</div></article>)}</div><div className="scenario-events-editor-actions"><Button type="button" variant="ghost" disabled={busy} onClick={add}><Plus size={14} /> Add event</Button><Button type="button" variant="primary" disabled={busy || stimuli.some((stimulus) => !stimulus.content.trim())} onClick={onSave}>Save world events</Button></div></section>;
}

function ScenarioEventSequence({ stimuli, actors, presenceName }: { stimuli: ScenarioStimulus[]; actors: NonNullable<OpenPresenceState["scenarioVersions"][number]["worldSpec"]["startingWorld"]>["actors"]; presenceName: string }) {
  return <section className="scenario-events-preview"><div className="eyebrow">What {presenceName} will encounter</div>{stimuli.length ? stimuli.map((stimulus, index) => { const actor = actors?.find((item) => item.id === stimulus.actorRef); const target = stimulus.targetRef === "presence" ? presenceName : stimulus.targetRef ? `Event ${stimuli.findIndex((item) => item.id === stimulus.targetRef) + 1}` : undefined; return <article className="scenario-event-preview" key={stimulus.id}><div className="scenario-event-preview-heading"><strong>{index + 1} · {scenarioEventActionLabel(stimulus.type)}</strong><span>{actor?.displayName ?? "Participant"} {actor?.handle ? `· ${actor.handle}` : ""}</span></div><p>{stimulus.content}</p><small>{target ? `Target / parent: ${target}` : "Starts a new thread"}{stimulus.offsetMinutes ? ` · ${stimulus.offsetMinutes}m after start` : ""}{stimulus.assets?.length ? ` · ${stimulus.assets.length} asset${stimulus.assets.length === 1 ? "" : "s"}` : ""}</small></article>; }) : <p className="scenario-empty">No concrete world events have been generated yet.</p>}</section>;
}

function ScenarioFidelityPanel({ fidelity, generationFailed, presenceName, onGenerate, onEdit, onRequirements, busy }: { fidelity?: OpenPresenceState["scenarioVersions"][number]["fidelity"]; generationFailed: boolean; presenceName: string; onGenerate: () => void; onEdit: () => void; onRequirements: () => void; busy: boolean }) {
  const ready = fidelity?.status === "verified" && !generationFailed;
  return <section className={`scenario-fidelity-panel ${ready ? "scenario-fidelity-ready" : "scenario-fidelity-repair"}`} aria-label="Scenario fidelity"><div><div className="eyebrow">{ready ? "Scenario fidelity" : "Scenario not ready"}</div><p>{ready ? "The frozen world matches the situation you described." : generationFailed ? "The scenario could not produce reliable world events yet." : `Your brief describes a situation, but ${presenceName} would not encounter all of the required concrete events yet.`}</p></div><div className="scenario-fidelity-checks">{(fidelity?.checks ?? []).map((check) => <div className={`scenario-fidelity-check scenario-fidelity-${check.status}`} key={check.id}><span aria-hidden="true">{check.status === "met" ? "✓" : check.status === "missing" ? "!" : "?"}</span><div><strong>{check.label}</strong><small>{check.explanation}</small></div></div>)}</div>{!ready && <div className="scenario-repair-actions"><Button type="button" variant="primary" disabled={busy} onClick={onGenerate}><Sparkles size={14} /> Generate missing events</Button><Button type="button" variant="ghost" disabled={busy} onClick={onEdit}>Edit what {presenceName} will see</Button><Button type="button" variant="ghost" disabled={busy} onClick={onRequirements}>Change scenario requirements</Button></div>}{ready && <small className="scenario-ready-label">Ready to rehearse.</small>}</section>;
}

function ScenarioRequirementsEditor({ requirements, onChange, onSave, onClose, busy }: { requirements: ScenarioStimulusRequirements; onChange: (requirements: ScenarioStimulusRequirements) => void; onSave: () => void; onClose: () => void; busy: boolean }) {
  const explicitLanguage = requirements.explicitLanguage ?? (requirements.profanity && requirements.profanity !== "none" ? "required" : "forbidden");
  return (
    <section className="scenario-requirements-editor" aria-label="Change scenario requirements">
      <div className="scenario-events-editor-heading">
        <div>
          <div className="eyebrow">Change scenario requirements</div>
          <p>Adjust what the world must contain. These requirements are used for validation only; they are never sent to the Presence.</p>
        </div>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Close</Button>
      </div>
      <div className="scenario-requirement-fields">
        <fieldset>
          <legend>Profanity in this world</legend>
          <label className="scenario-requirement-choice">
            <input type="radio" name="explicit-language" checked={explicitLanguage === "forbidden"} onChange={() => onChange({ ...requirements, explicitLanguage: "forbidden", profanity: "none", explicitLanguageMinimum: undefined })} />
            <span><strong>Keep it clean</strong><small>Participants will not use profanity.</small></span>
          </label>
          <label className="scenario-requirement-choice">
            <input type="radio" name="explicit-language" checked={explicitLanguage === "allowed"} onChange={() => onChange({ ...requirements, explicitLanguage: "allowed", profanity: "none", explicitLanguageMinimum: undefined })} />
            <span><strong>Allow it naturally</strong><small>Participants may swear, but profanity is not guaranteed.</small></span>
          </label>
          <label className="scenario-requirement-choice">
            <input type="radio" name="explicit-language" checked={explicitLanguage === "required"} onChange={() => onChange({ ...requirements, explicitLanguage: "required", profanity: requirements.profanity === "none" ? "realistic" : requirements.profanity, explicitLanguageMinimum: Math.max(1, requirements.explicitLanguageMinimum ?? 1) })} />
            <span><strong>Include profanity</strong><small>The scenario must contain explicit profanity.</small></span>
          </label>
          {explicitLanguage === "required" && <label className="scenario-requirement-number"><span>Minimum events containing profanity</span><input type="number" min="1" max="50" value={requirements.explicitLanguageMinimum ?? 1} onChange={(event) => onChange({ ...requirements, explicitLanguageMinimum: Math.max(1, Number(event.target.value) || 1) })} /></label>}
        </fieldset>
        <fieldset>
          <legend>World behavior</legend>
          <label className="scenario-requirement-choice">
            <input type="checkbox" checked={Boolean(requirements.directChallengeMinimum)} onChange={(event) => onChange({ ...requirements, directChallengeMinimum: event.target.checked ? Math.max(1, requirements.directChallengeMinimum ?? 2) : undefined })} />
            <span>Direct challenges to the Presence</span>
          </label>
          {requirements.directChallengeMinimum ? <label className="scenario-requirement-number"><span>Minimum direct challenges</span><input type="number" min="1" max="50" value={requirements.directChallengeMinimum} onChange={(event) => onChange({ ...requirements, directChallengeMinimum: Math.max(1, Number(event.target.value) || 1) })} /></label> : null}
          <label className="scenario-requirement-choice">
            <input type="checkbox" checked={Boolean(requirements.disagreement)} onChange={(event) => onChange({ ...requirements, disagreement: event.target.checked })} />
            <span>Disagreement</span>
          </label>
          <label className="scenario-requirement-choice">
            <input type="checkbox" checked={Boolean(requirements.sarcasm)} onChange={(event) => onChange({ ...requirements, sarcasm: event.target.checked })} />
            <span>Sarcasm</span>
          </label>
        </fieldset>
      </div>
      <div className="scenario-events-editor-actions">
        <Button type="button" variant="primary" disabled={busy} onClick={onSave}>Save requirements</Button>
      </div>
    </section>
  );
}

function ScenarioRunStatus({ status }: { status: string }) {
  const label = status === "passed" ? "Passed" : status === "failed" ? "Needs attention" : status === "unavailable" ? "Review unavailable" : status === "needs_review" ? "Needs review" : status === "active" ? "Running" : "Not reviewed";
  return <span className={`scenario-status scenario-status-${status}`}>{label}</span>;
}

function scenarioTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const scenarioCriterionLabels: Record<string, string> = {
  "structural-sandbox": "Sandbox boundary",
  "structural-envelope": "Stayed within allowed actions",
  "structural-untrusted": "Outside content stayed untrusted",
  "structural-public-expression": "Public expression boundary",
};

function scenarioCriterionLabel(criterionId: string, version?: OpenPresenceState["scenarioVersions"][number]) {
  return scenarioCriterionLabels[criterionId] ?? version?.evaluationSpec.structuralCriteria.find((criterion) => criterion.id === criterionId)?.label ?? version?.evaluationSpec.socialCriteria.find((criterion) => criterion.id === criterionId)?.label ?? criterionId.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ScenarioLibrary({ state, mutate, presence, creating, onCreatingChange }: { state: OpenPresenceState; mutate: Mutate; presence: NonNullable<OpenPresenceState["presence"]>; creating: boolean; onCreatingChange: (open: boolean) => void }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [eventEditorOpen, setEventEditorOpen] = useState(false);
  const [eventDrafts, setEventDrafts] = useState<ScenarioStimulus[]>([]);
  const [requirementsEditorOpen, setRequirementsEditorOpen] = useState(false);
  const [requirementsDraft, setRequirementsDraft] = useState<ScenarioStimulusRequirements>({});
  const [titleDraft, setTitleDraft] = useState("");
  const [operatorNote, setOperatorNote] = useState("");
  const [runProgress, setRunProgress] = useState<string | null>(null);
  const [runView, setRunView] = useState<ScenarioRunView>("replay");
  const visibleScenarios = state.scenarios.filter((scenario) => scenario.ownerScope !== "presence" || scenario.presenceId === presence.id);
  const selectedScenario = visibleScenarios.find((scenario) => scenario.id === selectedScenarioId) ?? visibleScenarios[0];
  const selectedVersion = selectedScenario ? state.scenarioVersions.find((version) => version.scenarioId === selectedScenario.id && version.id === selectedScenario.currentVersionId) ?? state.scenarioVersions.find((version) => version.scenarioId === selectedScenario.id) : undefined;
  const selectedFidelity = selectedVersion ? selectedVersion.fidelity ?? validateScenarioFidelity(selectedVersion) : undefined;
  const selectedRun = state.scenarioRuns.find((run) => run.id === selectedRunId) ?? (selectedScenario ? state.scenarioRuns.find((run) => run.scenarioId === selectedScenario.id && run.presenceId === presence.id) : undefined);
  const selectedRunScenario = selectedRun ? visibleScenarios.find((scenario) => scenario.id === selectedRun.scenarioId) : undefined;
  const selectedRunVersion = selectedRun ? state.scenarioVersions.find((version) => version.id === selectedRun.scenarioVersionId) : undefined;
  const selectedRunSession = selectedRun ? state.playgroundSessions.find((session) => session.id === selectedRun.playgroundSessionId) : undefined;
  const runObjects = selectedRunSession ? state.mirrorObjects.filter((object) => object.sessionId === selectedRunSession.id && isCognitionEligibleMirrorObject(object, presence.language)).sort((left, right) => (left.occurredAt ?? left.observedAt).localeCompare(right.occurredAt ?? right.observedAt)) : [];
  const runEvents = selectedRunSession ? state.events.filter((event) => event.sessionId === selectedRunSession.id).slice(-12).reverse() : [];
  const evaluation = selectedRun ? state.scenarioEvaluations.find((item) => item.runId === selectedRun.id) : undefined;
  const run = async (operation: unknown) => { setBusy(true); try { return await mutate(operation); } finally { setBusy(false); } };
  const createFromPrompt = async () => {
    if (!prompt.trim()) return;
    const next = await run({ type: "createScenarioFromPrompt", prompt: prompt.trim(), presenceId: presence.id });
    const created = next?.scenarios[0];
    if (created) setSelectedScenarioId(created.id);
    setPrompt("");
    onCreatingChange(false);
  };
  const runScenario = async (operation: unknown, scenarioId?: string) => {
    setRunProgress("Preparing an isolated Sandbox world…");
    const progressTimers = [
      window.setTimeout(() => setRunProgress("Running the configured Agent through each situation…"), 700),
      window.setTimeout(() => setRunProgress("Capturing the trace and structural checks…"), 2200),
    ];
    try {
      const next = await run(operation);
      const created = scenarioId ? next?.scenarioRuns.find((item) => item.scenarioId === scenarioId && item.id === next.scenarioRuns[0]?.id) : next?.scenarioRuns[0];
      if (created) { setSelectedRunId(created.id); setRunView("replay"); }
    } finally {
      progressTimers.forEach((timer) => window.clearTimeout(timer));
      setRunProgress(null);
    }
  };
  const startRun = async () => {
    if (!selectedScenario) return;
    await runScenario({ type: "startScenarioRun", scenarioId: selectedScenario.id, presenceId: presence.id }, selectedScenario.id);
  };
  const rerun = async () => {
    if (!selectedRun) return;
    await runScenario({ type: "rerunScenario", runId: selectedRun.id });
  };
  const review = async () => { if (selectedRun) { await run({ type: "evaluateScenarioRun", runId: selectedRun.id }); setRunView("review"); } };
  const deleteSelectedScenario = async () => {
    if (!selectedScenario) return;
    await run({ type: "deleteScenario", scenarioId: selectedScenario.id });
    setDeleteConfirmOpen(false);
    setSelectedScenarioId(null);
    setSelectedRunId(null);
  };
  const startRenaming = () => {
    if (!selectedScenario || selectedScenario.ownerScope === "system") return;
    setTitleDraft(selectedScenario.title);
    setRenaming(true);
  };
  const cancelRenaming = () => {
    setRenaming(false);
    setTitleDraft("");
  };
  const saveScenarioTitle = async () => {
    if (!selectedScenario) return;
    const nextTitle = titleDraft.trim();
    if (!nextTitle || nextTitle === selectedScenario.title) {
      cancelRenaming();
      return;
    }
    await run({ type: "renameScenario", scenarioId: selectedScenario.id, title: nextTitle });
    cancelRenaming();
  };
  const openEventEditor = () => {
    if (!selectedVersion || selectedScenario?.ownerScope === "system") return;
    setEventDrafts(selectedVersion.worldSpec.stimuli);
    setEventEditorOpen(true);
    setRequirementsEditorOpen(false);
  };
  const saveEventDrafts = async () => {
    if (!selectedScenario) return;
    await run({ type: "updateScenarioEvents", scenarioId: selectedScenario.id, stimuli: eventDrafts });
    setEventEditorOpen(false);
  };
  const generateMissingEvents = async () => {
    if (!selectedScenario) return;
    await run({ type: "generateMissingScenarioEvents", scenarioId: selectedScenario.id });
  };
  const openRequirementsEditor = () => {
    setRequirementsDraft(selectedVersion?.worldSpec.stimulusRequirements ?? {});
    setRequirementsEditorOpen(true);
    setEventEditorOpen(false);
  };
  const saveRequirements = async () => {
    if (!selectedScenario) return;
    await run({ type: "updateScenarioRequirements", scenarioId: selectedScenario.id, requirements: requirementsDraft });
    setRequirementsEditorOpen(false);
  };
  const recordReview = async (disposition: "accepted" | "okay" | "concern") => {
    if (!selectedRun) return;
    await run({ type: "recordScenarioReview", runId: selectedRun.id, disposition, note: operatorNote.trim() || undefined });
    setOperatorNote("");
  };
  const importFile = (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const payload = JSON.parse(String(reader.result));
        const next = await run({ type: "importScenario", payload, presenceId: presence.id });
        const created = next?.scenarios[0];
        if (created) setSelectedScenarioId(created.id);
      } catch { /* The API presents the validation error through the existing mutation path. */ }
      finally { setImporting(false); }
    };
    reader.readAsText(file);
  };
  const exportScenario = () => {
    if (!selectedScenario || !selectedVersion) return;
    const blob = new Blob([JSON.stringify({ scenario: selectedScenario, version: selectedVersion }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedScenario.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "scenario"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="scenario-page">
      <div className="scenario-action-bar">
        <div className="scenario-context-copy"><div className="eyebrow">Scenario library</div><p>Make it cheap to discover behavioral failure before it becomes public.</p></div>
        <div className="scenario-toolbar-actions"><label className="scenario-import-button"><FileText size={14} /> {importing ? "Importing…" : "Import JSON"}<input aria-label="Import scenario JSON" type="file" accept="application/json,.json" onChange={(event) => importFile(event.target.files?.[0])} /></label><Button variant="primary" disabled={busy} onClick={() => onCreatingChange(!creating)}><Plus size={14} /> New scenario</Button></div>
      </div>
      {creating && <section className="scenario-builder" aria-label="Create a scenario"><div><div className="eyebrow">Natural-language authoring</div><h2>What do you want to rehearse?</h2><p>Describe the social situation in ordinary language. OpenPresence freezes the resulting world before the Run begins.</p></div><textarea aria-label="What do you want to rehearse?" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Test Alex when someone insults him and pressures him for private information." rows={4} /><div className="scenario-builder-footer"><small>Your generated Scenario is saved under “Your scenario.” Built-in Scenarios are read-only defaults.</small><div className="scenario-builder-actions"><Button variant="ghost" type="button" onClick={() => onCreatingChange(false)}><X size={14} /> Close</Button><Button variant="primary" disabled={busy || prompt.trim().length < 12} onClick={() => void createFromPrompt()}><Sparkles size={14} /> Preview scenario</Button></div></div></section>}
      <div className="scenario-layout">
        <aside className="scenario-list" aria-label="Scenarios"><div className="eyebrow">Available rehearsals</div>{visibleScenarios.map((scenario) => { const runs = state.scenarioRuns.filter((run) => run.scenarioId === scenario.id && run.presenceId === presence.id); const latest = runs[0] ? state.scenarioEvaluations.find((item) => item.runId === runs[0].id) : undefined; const category = scenario.riskCategories.includes("publication_security") ? "Security" : undefined; return <div key={scenario.id} className={`scenario-card ${selectedScenario?.id === scenario.id && !selectedRun ? "selected" : ""}`}><button type="button" className="scenario-card-select" onClick={() => { cancelRenaming(); setEventEditorOpen(false); setRequirementsEditorOpen(false); setSelectedScenarioId(scenario.id); setSelectedRunId(null); }}><span className="scenario-card-kicker">{scenario.ownerScope === "system" ? "Built-in" : "Your scenario"}{category ? ` · ${category}` : ""} · {runs.length} run{runs.length === 1 ? "" : "s"}</span><strong>{scenario.title}</strong><small className="scenario-card-description">{scenario.description}</small><small className="scenario-card-created">{scenario.ownerScope === "system" ? `Built-in default · ${scenarioTimestamp(scenario.createdAt)}` : `Generated · ${scenarioTimestamp(scenario.createdAt)}`}</small>{latest && <ScenarioRunStatus status={latest.status} />}</button>{scenario.ownerScope !== "system" && <button type="button" className="scenario-card-delete" aria-label={`Delete ${scenario.title}`} title={`Delete ${scenario.title}`} onClick={(event) => { event.stopPropagation(); cancelRenaming(); setEventEditorOpen(false); setRequirementsEditorOpen(false); setSelectedScenarioId(scenario.id); setSelectedRunId(null); setDeleteConfirmOpen(true); }}><Trash2 size={13} /></button>}</div>; })}{!visibleScenarios.length && <p className="scenario-empty">No scenarios yet. Describe the first situation you want to rehearse.</p>}</aside>
        <main className="scenario-main">
          {!selectedRun && selectedScenario && selectedVersion && selectedScenario.ownerScope !== "system" && <><ScenarioFidelityPanel fidelity={selectedFidelity} generationFailed={selectedVersion.generationStatus === "failed"} presenceName={presence.name} onGenerate={() => void generateMissingEvents()} onEdit={openEventEditor} onRequirements={openRequirementsEditor} busy={busy} />{eventEditorOpen && <ScenarioEventsEditor stimuli={eventDrafts} actors={selectedVersion.worldSpec.startingWorld?.actors} presenceName={presence.name} onChange={setEventDrafts} onSave={() => void saveEventDrafts()} onClose={() => setEventEditorOpen(false)} busy={busy} />}{requirementsEditorOpen && <ScenarioRequirementsEditor requirements={requirementsDraft} onChange={setRequirementsDraft} onSave={() => void saveRequirements()} onClose={() => setRequirementsEditorOpen(false)} busy={busy} />}<ScenarioEventSequence stimuli={selectedVersion.worldSpec.stimuli} actors={selectedVersion.worldSpec.startingWorld?.actors} presenceName={presence.name} /></>}
          {!selectedRun && selectedScenario && selectedVersion && selectedScenario.ownerScope === "system" && <ScenarioEventSequence stimuli={selectedVersion.worldSpec.stimuli} actors={selectedVersion.worldSpec.startingWorld?.actors} presenceName={presence.name} />}
          {selectedRun ? <ScenarioRunDetail state={state} presence={presence} selectedRun={selectedRun} selectedRunScenario={selectedRunScenario} selectedRunVersion={selectedRunVersion} runObjects={runObjects} runEvents={runEvents} evaluation={evaluation} runView={runView} setRunView={setRunView} operatorNote={operatorNote} setOperatorNote={setOperatorNote} busy={busy} onBack={() => { setSelectedRunId(null); setRunView("replay"); }} onRerun={() => void rerun()} onReview={() => void review()} onRecordReview={(disposition) => void recordReview(disposition)} /> : selectedScenario && selectedVersion ? <section className="scenario-preview" aria-label="Scenario preview" aria-busy={Boolean(runProgress)}>{runProgress && <div className="scenario-progress-banner" role="status" aria-live="polite"><LoaderCircle size={18} className="scenario-progress-spinner" /><span><strong>{runProgress}</strong><small>Your isolated Run is still working. You can stay on this page while it completes.</small></span></div>}<div className="scenario-detail-heading"><div><div className="eyebrow">{selectedScenario.ownerScope === "system" ? "Built-in Scenario" : "Scenario preview"}</div>{renaming && selectedScenario.ownerScope !== "system" ? <div className="scenario-title-editor"><input autoFocus aria-label="Scenario title" value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveScenarioTitle(); } if (event.key === "Escape") cancelRenaming(); }} /><Button type="button" variant="primary" disabled={busy || !titleDraft.trim()} onClick={() => void saveScenarioTitle()}>Save title</Button><Button type="button" variant="ghost" disabled={busy} onClick={cancelRenaming}>Cancel</Button></div> : <div className="scenario-title-row"><h2>{selectedScenario.title}</h2>{selectedScenario.ownerScope !== "system" && <button type="button" className="scenario-rename-button" aria-label={`Rename ${selectedScenario.title}`} title="Rename scenario" onClick={startRenaming}><Pencil size={13} /></button>}</div>}<p>{selectedScenario.description}</p></div><div className="scenario-detail-actions"><Button variant="ghost" disabled={busy} onClick={exportScenario}><ArrowUpRight size={14} /> Export JSON</Button>{selectedScenario.ownerScope !== "system" && <Button variant="ghost" disabled={busy} onClick={() => setDeleteConfirmOpen(true)}>Delete scenario</Button>}<Button variant="primary" disabled={busy || selectedFidelity?.status === "needs_revision"} onClick={() => void startRun()}><Play size={14} /> {selectedFidelity?.status === "needs_revision" ? "Rehearse" : runProgress ? "Starting…" : "Start isolated Run"}</Button></div></div>{deleteConfirmOpen && <section className="scenario-delete-confirm" role="alertdialog" aria-label="Delete scenario confirmation"><div><strong>Delete “{selectedScenario.title}”?</strong><p>This removes the Scenario, its versions, and its saved rehearsal history. This cannot be undone.</p></div><div><Button variant="ghost" disabled={busy} onClick={() => setDeleteConfirmOpen(false)}>Keep scenario</Button><Button variant="secondary" disabled={busy} onClick={() => void deleteSelectedScenario()}>Delete scenario</Button></div></section>}<section className="scenario-fidelity-panel" aria-label="Scenario fidelity"><div><div className="eyebrow">Scenario fidelity</div><p>{selectedFidelity?.status === "verified" ? "The frozen world matches the situation you described." : "This Scenario does not yet match the situation you described. Edit the missing world events before starting a Run."}</p></div><div className="scenario-fidelity-checks">{(selectedFidelity?.checks ?? []).map((fidelityCheck) => <div className={`scenario-fidelity-check scenario-fidelity-${fidelityCheck.status}`} key={fidelityCheck.id}><span aria-hidden="true">{fidelityCheck.status === "met" ? "✓" : fidelityCheck.status === "missing" ? "!" : "?"}</span><div><strong>{fidelityCheck.label}</strong><small>{fidelityCheck.explanation}</small></div></div>)}</div></section><div className="scenario-preview-grid"><section><div className="eyebrow">World events</div><p>{selectedScenario.purpose}</p>{selectedVersion.worldSpec.stimuli.map((stimulus) => { const actor = selectedVersion.worldSpec.startingWorld?.actors?.find((item) => item.id === stimulus.actorRef); return <div className="scenario-stimulus" key={stimulus.id}><strong>{actor?.displayName ?? "Participant"}</strong><span>{stimulus.content}</span></div>; })}</section><section><div className="eyebrow">What we&apos;ll review</div><p>{selectedVersion.evaluationSpec.purpose}</p>{selectedVersion.evaluationSpec.socialCriteria.map((criterion) => <div className="scenario-criterion" key={criterion.id}><strong>{criterion.label}</strong><small>{criterion.description}</small></div>)}<small className="scenario-boundary">The Agent receives only the world situation—not these review criteria.</small></section></div><div className="scenario-history"><div className="eyebrow">Run history</div>{state.scenarioRuns.filter((run) => run.scenarioId === selectedScenario.id && run.presenceId === presence.id).length ? state.scenarioRuns.filter((run) => run.scenarioId === selectedScenario.id && run.presenceId === presence.id).map((run) => { const result = state.scenarioEvaluations.find((item) => item.runId === run.id); return <button type="button" className="scenario-history-row" key={run.id} onClick={() => setSelectedRunId(run.id)}><span>{new Date(run.startedAt).toLocaleString()}</span><strong>{run.status}</strong>{result && <ScenarioRunStatus status={result.status} />}</button>; }) : <p>No Runs yet. Start one when you are ready.</p>}</div></section> : <div className="scenario-empty-main"><FlaskConical size={22} /><h2>Choose a Scenario</h2><p>Built-ins create real social situations through the normal Sandbox world path. Custom Scenarios start with a plain-language description.</p></div>}
        </main>
      </div>
    </div>
  );
}

function AssignmentResearchReview({ research, assets }: { research: OpenPresenceState["assetResearchSessions"][number]; assets: OpenPresenceState["assets"] }) {
  const decisionFor = (candidateId: string) => research.decisionHistory.find((decision) => decision.candidateId === candidateId);
  const stage = (research as OpenPresenceState["assetResearchSessions"][number] & { stage?: string }).stage;
  const stageLabel = stage?.replaceAll("_", " ") || (research.status === "selected" ? "published" : research.status);
  const evidenceSummary = (research as OpenPresenceState["assetResearchSessions"][number] & { evidenceSummary?: string }).evidenceSummary;
  const outcome = (research as OpenPresenceState["assetResearchSessions"][number] & { outcome?: string }).outcome ?? (research.candidates.length === 0 ? "discovery_empty" : undefined);
  const outcomeLabel = outcome?.replaceAll("_", " ");
  return <details className="assignment-research-review" aria-label="Assignment research trail"><summary className="assignment-research-summary"><span><span className="eyebrow">Evidence trail</span><strong>{research.candidates.length} candidate{research.candidates.length === 1 ? "" : "s"} inspected</strong></span><span><small>{stageLabel}</small>{outcomeLabel && <small>{outcomeLabel}</small>}<small>{research.searchHistory.length} search{research.searchHistory.length === 1 ? "" : "es"}</small></span></summary><div className="assignment-research-body">{research.candidates.length === 0 ? <p className="assignment-evidence-summary"><strong>No visual leads were inspected.</strong>{outcome === "discovery_empty" ? " The bounded search returned no usable media leads." : " The visual research ended before an inspectable candidate was available."}</p> : <div className="assignment-candidate-list">{research.candidates.map((item, index) => {
    const candidate = item.candidate;
    const asset = item.assetId ? assets.find((stored) => stored.id === item.assetId) : undefined;
    const decision = decisionFor(item.id);
    const reason = item.rejectionReasons?.join(" ") ?? decision?.rationale ?? "Inspected, but not selected for the final publication.";
    const label = candidate.title ?? candidate.name ?? `Candidate ${index + 1}`;
    const sourceLabel = candidate.publisher ?? (() => { try { return candidate.sourcePageUrl ? new URL(candidate.sourcePageUrl).hostname.replace(/^www\./, "") : "Unknown source"; } catch { return "Unknown source"; } })();
    return <details className="assignment-candidate" key={item.id}><summary><span className={`assignment-candidate-mark ${item.perception ? "inspected" : "failed"}`} aria-hidden="true">{item.perception ? "✓" : "!"}</span><span className="assignment-candidate-copy"><strong>{label}</strong><small>{sourceLabel}</small></span><span className="assignment-candidate-status">{item.perception ? "Inspected" : "Fetch failed"}</span></summary><div className="assignment-candidate-detail">{asset?.storage && <img src={`/api/assets/${asset.id}`} alt={asset.description ?? label} /> }<div><p><strong>Why it was rejected</strong>{reason}</p>{item.perception && <p><strong>What the Agent saw</strong>{item.perception.observation}</p>}{candidate.sourcePageUrl && <a href={candidate.sourcePageUrl} target="_blank" rel="noreferrer">Open source page ↗</a>}</div></div></details>;
  })}</div>}{evidenceSummary && <p className="assignment-evidence-summary"><strong>Selected evidence</strong>{evidenceSummary}</p>}</div></details>;
}

function PlaygroundView({ state, mutate }: { state: OpenPresenceState; mutate: Mutate }) {
  const presence = state.presence ?? state.presences[0];
  const session = state.playgroundSessions.find((item) => item.presenceId === presence?.id && item.status === "active");
  const channelDefinition = state.channelDefinitions.find((item) => item.id === presence?.channel);
  const simulation = simulationForChannel(presence?.channel ?? "x", channelDefinition);
  const objects = session ? state.mirrorObjects.filter((item) => item.sessionId === session.id && item.channelId === session.channelId && Boolean(presence && isCognitionEligibleMirrorObject(item, presence.language))).sort((left, right) => (right.occurredAt ?? right.observedAt).localeCompare(left.occurredAt ?? left.observedAt)) : [];
  const sessionEvents = session ? state.events.filter((item) => item.sessionId === session.id).slice(0, 8) : [];
  const reviewCount = session ? state.executions.filter((item) => item.sessionId === session.id && item.status === "awaiting-review").length : 0;
  const actors = session ? state.sandboxActors.filter((item) => item.sessionId === session.id) : [];
  const [busy, setBusy] = useState(false);
  const [scenarioMode, setScenarioMode] = useState(false);
  const [scenarioComposerOpen, setScenarioComposerOpen] = useState(false);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [rehearsalOpen, setRehearsalOpen] = useState(false);
  const [rehearsalMode, setRehearsalMode] = useState<"consider" | "topic" | "assign" | null>(null);
  const [inspiration, setInspiration] = useState("");
  const [assignmentInstruction, setAssignmentInstruction] = useState("");
  const [assignmentDraftId, setAssignmentDraftId] = useState<string | null>(null);
  const [assignmentPanelDismissed, setAssignmentPanelDismissed] = useState(false);
  const [dismissedLiveAssignmentId, setDismissedLiveAssignmentId] = useState<string | null>(null);
  const [assignmentCancellationNotice, setAssignmentCancellationNotice] = useState(false);
  const [expandedRehearsalId, setExpandedRehearsalId] = useState<string | null>(null);
  const [feedbackAttemptId, setFeedbackAttemptId] = useState<string | null>(null);
  const [feedbackReasons, setFeedbackReasons] = useState<PreferenceReason[]>([]);
  const [feedbackNote, setFeedbackNote] = useState("");
  const sessionId = session?.id;
  const targetObjects = objects.filter((item) => item.actorPresenceId === presence?.id && item.objectType !== "like");
  const assetKinds = channelDefinition?.supportedAssetKinds ?? ["image", "video", "gif", "link"] as SocialAssetKind[];
  const selectedObject = selectedObjectId ? objects.find((item) => item.id === selectedObjectId) : undefined;
  const rehearsalAttempts = sessionId ? state.originalPostRehearsals.filter((item) => item.sessionId === sessionId).slice(0, 5) : [];
  const sessionAssignments = state.assignments.filter((item) => item.environment === "sandbox" && assignmentIsOpen(item) && ((sessionId && item.sessionId === sessionId) || (item.status === "draft" && item.presenceId === presence?.id)));
  const latestLiveAssignment = [...state.assignments]
    .filter((item) => item.environment === "live" && item.presenceId === presence?.id && item.status === "draft")
    .sort((left, right) => new Date(right.updatedAt ?? right.createdAt).getTime() - new Date(left.updatedAt ?? left.createdAt).getTime())[0];
  const assignmentDraft = assignmentDraftId ? sessionAssignments.find((item) => item.id === assignmentDraftId) : undefined;
  const latestAssignment = [...sessionAssignments]
    .filter((item) => item.status !== "cancelled")
    .sort((left, right) => new Date(right.updatedAt ?? right.createdAt).getTime() - new Date(left.updatedAt ?? left.createdAt).getTime())[0];
  let displayedAssignment = assignmentPanelDismissed ? undefined : assignmentDraft ?? latestAssignment;
  const displayedAssignmentId = displayedAssignment?.id;
  const assignmentRun = displayedAssignmentId ? [...(state.assignmentRuns ?? [])].filter((run) => run.assignmentId === displayedAssignmentId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] : undefined;
  const assignmentRunIsWorking = Boolean(assignmentRun && ["queued", "researching", "selecting", "writing", "delivering"].includes(assignmentRun.status));
  const assignmentIsWorking = Boolean(displayedAssignment && (busy || assignmentRunIsWorking || displayedAssignment.status === "working" || ["researching", "visual_research", "publishing"].includes(displayedAssignment.work?.phase ?? "")));
  const assignmentIsComplete = displayedAssignment?.status === "completed";
  const assignmentVerified = displayedAssignment?.progress.verified ?? 0;
  const assignmentRequired = Math.max(1, displayedAssignment?.progress.required ?? 1);
  const assignmentProgress = Math.min(100, (assignmentVerified / assignmentRequired) * 100);
  const assignmentPhase = displayedAssignment?.status === "completed"
    ? "Completed"
    : displayedAssignment?.status === "blocked"
      ? "Blocked"
      : displayedAssignment?.status === "draft"
        ? "Needs review"
        : !assignmentRun && displayedAssignment?.status === "active"
          ? "Ready to start"
          : assignmentRun?.currentStage?.replaceAll("_", " ") ?? displayedAssignment?.work?.phase?.replaceAll("_", " ") ?? "Queued";
  const assignmentResearch = displayedAssignmentId ? [...state.assetResearchSessions].filter((item) => item.assignmentId === displayedAssignmentId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] : undefined;
  if (displayedAssignment?.lastOutcome?.message?.includes("No inspected candidate") && assignmentResearch?.candidates.length === 0) {
    displayedAssignment = { ...displayedAssignment, lastOutcome: { ...displayedAssignment.lastOutcome, message: "No usable visual leads were found. The bounded search ended without an inspectable candidate." } };
  }
  const displayedAssignmentInstruction = displayedAssignment ? cleanUserFacingAssignmentInstruction(displayedAssignment.instruction) : "";
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
  const resetPlayground = async () => {
    if (!session) return;
    await run({ type: "resetPlayground", sessionId: session.id });
    setSelectedObjectId(null);
    setAssignmentDraftId(null);
    setAssignmentPanelDismissed(false);
    setAssignmentCancellationNotice(false);
    setExpandedRehearsalId(null);
    setFeedbackAttemptId(null);
    setFeedbackReasons([]);
    setFeedbackNote("");
  };
  const runAssignment = async (assignmentId: string, start = false) => {
    if (!sessionId) return;
    setBusy(true);
    try {
      let next = state;
      if (start) next = await mutate({ type: "startAssignment", id: assignmentId, sessionId }, next) ?? next;
      await mutate({ type: "workAssignment", id: assignmentId, sessionId }, next);
    } finally {
      setBusy(false);
    }
  };
  const removeSandboxObject = async (objectId: string) => {
    if (!session) return;
    await run({ type: "removeSandboxObject", sessionId: session.id, objectId });
    setSelectedObjectId((selected) => selected === objectId ? null : selected);
  };
  const wakeOrCheck = async () => {
    if (!session) return;
    await run({ type: "runSandboxPulse", sessionId: session.id });
  };
  const considerOriginal = async (value?: string) => {
    if (!session) return;
    await run({ type: "considerOriginalPublication", sessionId: session.id, inspiration: value?.trim() || undefined });
    setInspiration("");
    setRehearsalOpen(false);
  };
  const reviewAssignment = async () => {
    if (!session) return;
    const next = await mutate({ type: "createAssignment", sessionId: session.id, presenceId: presence.id, environment: "sandbox", instruction: assignmentInstruction });
    const created = next?.assignments.find((item) => item.sessionId === session.id) ?? next?.assignments[0];
    if (created) {
      setAssignmentDraftId(created.id);
      setAssignmentPanelDismissed(false);
      setAssignmentCancellationNotice(false);
    }
  };
  const cancelDisplayedAssignment = async () => {
    if (!displayedAssignment || ["completed", "cancelled"].includes(displayedAssignment.status)) return;
    if (!window.confirm(`Cancel this Assignment?\n\n${displayedAssignmentInstruction}`)) return;
    const next = await mutate({ type: "cancelAssignment", id: displayedAssignment.id });
    if (!next) return;
    setAssignmentDraftId(null);
    setAssignmentPanelDismissed(true);
    setAssignmentCancellationNotice(true);
  };
  const rehearseAssignment = (assignment: typeof latestLiveAssignment) => {
    if (!assignment) return;
    setAssignmentInstruction(assignment.instruction);
    setAssignmentDraftId(null);
    setAssignmentPanelDismissed(false);
    setRehearsalMode("assign");
    setRehearsalOpen(true);
  };
  const saveFeedback = async (attemptId: string, reaction: "fits" | "does_not_fit" | "good_silence" | "expected_action") => {
    if (!session) return;
    await run({ type: "recordPreferenceEvidence", sessionId: session.id, attemptId, reaction, reasons: feedbackReasons, note: feedbackNote.trim() || undefined });
    setFeedbackAttemptId(null);
    setFeedbackReasons([]);
    setFeedbackNote("");
  };
  if (!presence) return null;
  return (
    <div className="playground-page">
      <PageHeader
        className="playground-toolbar"
        eyebrow="Presence rehearsal"
        title="Playground"
        titleAdornment={<span className="environment-chip"><span className="status-dot" /> Sandbox</span>}
        description={simulation.worldDescription}
        actionsClassName="playground-toolbar-actions"
        actions={<Button variant="primary" disabled={busy} onClick={() => scenarioMode ? setScenarioComposerOpen((open) => !open) : setRehearsalOpen((open) => !open)}>{(scenarioMode ? scenarioComposerOpen : rehearsalOpen) ? <X size={14} /> : <Sparkles size={14} />} {(scenarioMode ? scenarioComposerOpen : rehearsalOpen) ? "Close" : "Rehearse"}</Button>}
      />
      <div className="playground-mode-bar">
        <div className="playground-mode-copy">{scenarioMode ? "Make it cheap to discover behavioral failure before it becomes public." : "A safe place to test the Presence before anything goes live."}</div>
        <div className="playground-mode-controls">
          {session && <Button variant="ghost" disabled={busy} onClick={() => void resetPlayground()}><RotateCcw size={14} /> Reset</Button>}
          <div className="playground-mode-switch" role="tablist" aria-label="Playground mode">
            <Button role="tab" aria-selected={!scenarioMode} variant={!scenarioMode ? "primary" : "ghost"} onClick={() => setScenarioMode(false)}>Free play</Button>
            <Button role="tab" aria-selected={scenarioMode} variant={scenarioMode ? "primary" : "ghost"} onClick={() => setScenarioMode(true)}>Scenarios</Button>
          </div>
        </div>
      </div>
      {scenarioMode ? <ScenarioLibrary state={state} mutate={mutate} presence={presence} creating={scenarioComposerOpen} onCreatingChange={setScenarioComposerOpen} /> : !session ? <div className="playground-loading" role="status">Opening a fresh simulated account…</div> : <>
      {rehearsalOpen && <section className="original-rehearsal-panel" aria-label="Posting rehearsal controls">
        <div className="rehearsal-panel-header"><div className="eyebrow">Rehearsal controls</div><Button variant="ghost" type="button" onClick={() => setRehearsalOpen(false)}><X size={14} /> Close</Button></div>
        <div className="rehearsal-mode-menu" role="group" aria-label="Posting rehearsal mode">
          <button type="button" className={rehearsalMode === "consider" ? "selected" : ""} onClick={() => { setRehearsalMode("consider"); setAssignmentDraftId(null); }}><strong>Let {presence.name} choose</strong><small>Let {presence.name} decide whether anything is worth originating.</small></button>
          <button type="button" className={rehearsalMode === "topic" ? "selected" : ""} onClick={() => { setRehearsalMode("topic"); setAssignmentDraftId(null); }}><strong>Give a topic</strong><small>Explore a direction while preserving Agent judgment.</small></button>
          <button type="button" className={rehearsalMode === "assign" ? "selected" : ""} onClick={() => setRehearsalMode("assign")}><strong>Give an Assignment</strong><small>Delegate an outcome. The Agent decides how to accomplish it.</small></button>
        </div>
        {(rehearsalMode === "consider" || rehearsalMode === "topic") && <>
          <div><div className="eyebrow">{rehearsalMode === "topic" ? "Topic rehearsal" : "Original post rehearsal"}</div><h2>{rehearsalMode === "topic" ? `What should ${presence.name} explore?` : originalLabel}</h2><p>{rehearsalMode === "topic" ? `${presence.name} chooses the angle, evidence, format, and wording. Silence remains possible.` : `Let ${presence.name} decide whether there is something worth publishing in this simulated world.`}</p></div>
          <label>{rehearsalMode === "topic" ? "Topic" : "Optional inspiration"}<textarea aria-label={rehearsalMode === "topic" ? "Topic" : "Optional inspiration"} value={inspiration} onChange={(event) => setInspiration(event.target.value)} placeholder={rehearsalMode === "topic" ? "Why founder-led sales stops scaling" : "Add a topic, link, or thought to consider…"} rows={3} /></label>
          <div className="original-rehearsal-actions"><small>{rehearsalMode === "topic" ? "The topic is context, not a command to publish." : `No inspiration means ${presence.name} considers independently.`}</small><Button variant="primary" disabled={busy} onClick={() => void considerOriginal(inspiration)}><Sparkles size={14} /> {rehearsalMode === "topic" ? "Rehearse" : "Consider now"}</Button></div>
        </>}
        {rehearsalMode === "assign" && <>
          <div><div className="eyebrow">Posting Assignment</div><h2>What do you expect {presence.name} to produce?</h2><p>OpenPresence will show the structured deliverable before work begins. Verified Sandbox publications determine progress.</p></div>
          {!assignmentDraft ? <><label>Assignment instruction<textarea aria-label="Assignment instruction" value={assignmentInstruction} onChange={(event) => setAssignmentInstruction(event.target.value)} placeholder="Produce 3 original X posts about offers, pricing, sales, or execution. Choose your own angles and do not repeat yourself." rows={4} /></label><div className="original-rehearsal-actions"><small>The original instruction stays attached to the Assignment.</small><Button variant="primary" disabled={busy || !assignmentInstruction.trim()} onClick={() => void reviewAssignment()}><Check size={14} /> Review assignment</Button></div></> : <div className="assignment-review" aria-label="Assignment review"><div><span>Deliverable</span><strong>{assignmentDraft.progress.required} original {channelLabel(assignmentDraft.channelId, state.channelDefinitions)} publications</strong></div><div><span>Completion</span><strong>{assignmentDraft.progress.required} verified publications</strong></div><div><span>Agent decides how</span><strong>Topics · thesis · evidence · format · wording · timing strategy</strong></div><p>{cleanUserFacingAssignmentInstruction(assignmentDraft.instruction)}</p><div className="original-rehearsal-actions"><Button variant="ghost" onClick={() => setAssignmentDraftId(null)}>Adjust</Button><Button variant="primary" disabled={busy} onClick={() => void runAssignment(assignmentDraft.id, true)}><Play size={14} /> Start rehearsal</Button></div></div>}
        </>}
      </section>}
      {assignmentCancellationNotice && <section className="assignment-cancelled-notice" role="status" aria-live="polite"><strong>Assignment cancelled</strong><span>It will not continue. Its history remains available for review.</span></section>}
      {latestLiveAssignment && dismissedLiveAssignmentId !== latestLiveAssignment.id && <section className="assignment-scope-notice" aria-label="Live Assignment status"><div><div className="eyebrow">Live Activity Assignment</div><h2>{cleanUserFacingAssignmentInstruction(latestLiveAssignment.instruction)}</h2><p>This Assignment is still a live draft waiting for Activity to activate it. Pausing the Presence keeps it from running live; it is not stuck. Playground is independent.</p></div><div className="assignment-scope-notice-actions"><Button variant="secondary" disabled={busy} onClick={() => rehearseAssignment(latestLiveAssignment)}><FlaskConical size={14} /> Rehearse in Sandbox</Button><button type="button" className="assignment-scope-notice-close" aria-label="Dismiss live Assignment notice" title="Dismiss" onClick={() => setDismissedLiveAssignmentId(latestLiveAssignment.id)}><X size={16} /></button></div></section>}
      {displayedAssignment && (
        <section className="assignment-progress-panel" aria-label="Assignment progress">
          <div className="assignment-progress-heading">
            <div>
              <div className="eyebrow">{assignmentIsComplete ? "Completed Assignment" : "Posting Assignment"}</div>
              {displayedAssignment.environment === "sandbox" && !displayedAssignment.sessionId && <small className="assignment-scope-label">Durable Sandbox draft · not tied to this session</small>}
              <h2>{displayedAssignmentInstruction}</h2>
            </div>
          </div>
          {assignmentIsWorking && <aside className="assignment-live-card" role="status" aria-live="polite" aria-label={`Assignment ${assignmentPhase}. ${assignmentVerified} of ${assignmentRequired} published. ${displayedAssignment.rejectedCandidates} candidates rejected.`}><span className="assignment-progress-ring" style={{ background: `conic-gradient(#6f927d ${assignmentProgress}%, #e7eee8 0)` }}><span><strong>{assignmentVerified}/{assignmentRequired}</strong><small>published</small></span></span><span className="assignment-live-copy"><strong>{assignmentPhase}</strong><small>{displayedAssignment.rejectedCandidates} rejected · {assignmentResearch?.candidates.length ?? 0} inspected</small></span></aside>}
          <div className="assignment-progress-bar"><span style={{ width: `${assignmentProgress}%` }} /></div>
          <div className="assignment-progress-meta"><strong>{assignmentVerified} / {displayedAssignment.progress.required} published</strong><span>{assignmentPhase}{assignmentIsWorking ? " · live" : displayedAssignment.status === "blocked" ? "" : ` · ${displayedAssignment.rejectedCandidates} rejected`}</span></div>
          {assignmentResearch && <AssignmentResearchReview research={assignmentResearch} assets={state.assets} />}
          {displayedAssignment.status === "blocked" && <div className="assignment-outcome" role="status" aria-live="polite"><div className="assignment-outcome-heading"><span className="assignment-outcome-label">Blocked</span><strong>No publication was counted</strong></div><p className="assignment-warning">{displayedAssignment.lastOutcome?.message ?? "The Assignment could not produce a verified publication."}</p><small>{(assignmentResearch as (typeof assignmentResearch & { outcome?: string }) | undefined)?.outcome === "discovery_empty" ? "No usable visual leads were found after one bounded reformulation. Nothing was published because this Assignment requires the visual; try again or revise that requirement." : (assignmentResearch as (typeof assignmentResearch & { outcome?: string }) | undefined)?.outcome === "inspection_rejected" ? "The downloaded candidates were inspected and rejected. Nothing was published because this Assignment requires a visual that meets the evidence standard." : "Nothing was published because the available evidence did not meet the visual requirement. Try again to begin a fresh bounded effort, or revise the Assignment if the evidence requirement is too strict."}</small></div>}
          <div className="assignment-progress-actions">{["active", "blocked"].includes(displayedAssignment.status) && <Button variant="secondary" disabled={busy || assignmentIsWorking} onClick={() => void runAssignment(displayedAssignment.id, displayedAssignment.status === "blocked")}><Play size={14} /> {displayedAssignment.status === "blocked" ? "Try again" : "Continue working"}</Button>}{displayedAssignment.status !== "completed" && displayedAssignment.status !== "cancelled" && <Button variant="danger" disabled={busy} onClick={() => void cancelDisplayedAssignment()}>Cancel Assignment</Button>}</div>
          {!assignmentIsComplete && <p className="assignment-cancel-help">Need to stop this? <strong>Cancel Assignment</strong> ends it now and keeps the history.</p>}
        </section>
      )}
      <div className="playground-grid">
          <aside className="playground-rail">
            <section className="playground-panel"><div className="eyebrow">Starting world</div><strong>{simulation.startingStateLabel}</strong><p>Nothing here is live. Simulated history stays in this session.</p><p className="playground-handle-hint">Agent handle: <strong>{presence.handle}</strong>. Use @mentions in Chat when addressing {presence.name}.</p><div className="session-status"><span className="status-dot" /> Sandbox available</div>{presence.status === "paused" && <p className="playground-muted playground-pause-note">Activity is paused. Sandbox checks and rehearsals still run here.</p>}</section>
            <section className="playground-panel"><div className="eyebrow">People in the room</div>{state.sandboxActors.filter((actor) => actor.sessionId === session.id).length ? state.sandboxActors.filter((actor) => actor.sessionId === session.id).map((actor) => <div className="playground-actor" key={actor.id}><span className="actor-avatar">{initials(actor.displayName)}</span><span><strong>{actor.displayName}</strong><small>{actor.handle ?? "Audience"}</small></span></div>) : <p className="playground-muted">Add a person below to make the first social event.</p>}</section>
            <section className="playground-panel playground-time"><div className="eyebrow"><Clock3 size={12} /> Virtual time</div><strong>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.virtualNow))}</strong><div className="time-actions"><button onClick={() => void run({ type: "advanceSandboxTime", sessionId: session.id, minutes: 15 })}>+15m</button><button onClick={() => void run({ type: "advanceSandboxTime", sessionId: session.id, minutes: 60 })}>+1h</button><button onClick={() => void run({ type: "advanceSandboxTime", sessionId: session.id, minutes: 1440 })}>Tomorrow</button></div></section>
          </aside>
          <main className="playground-world"><div className="world-heading"><div><div className="eyebrow">{simulation.worldLabel}</div><h2>What {presence.name} can see</h2></div><Button variant="primary" disabled={busy} onClick={() => void wakeOrCheck()}><Sparkles size={14} /> Check now</Button></div>{objects.length ? <PlaygroundThreadFeed objects={objects} assets={state.assets} presenceId={presence.id} presenceName={presence.name} onSelect={setSelectedObjectId} onRemove={(objectId) => void removeSandboxObject(objectId)} /> : <div className="world-blank"><MessageSquare size={20} /><p>The simulated {channelLabel(session.channelId, state.channelDefinitions)} world is quiet.</p><small>Check now to let {state.agent?.name ?? "the Agent"} choose a first move, or add an event from the control room.</small></div>}{selectedObject && <section className="perception-panel" aria-label={`What ${presence.name} sees`}><div className="section-heading compact"><div><div className="eyebrow">Perception</div><h3>What {presence.name} sees</h3></div><div className="perception-actions"><button type="button" className="what-sees-button" disabled={busy} onClick={() => void run({ type: "inspectSandboxMedia", sessionId: session.id, objectId: selectedObject.id })}>Inspect media</button><button type="button" className="perception-close" onClick={() => setSelectedObjectId(null)}>Close</button></div></div>{selectedObject.assetRefs?.map((ref) => { const asset = state.assets.find((item) => item.id === ref.assetId); const perception = latestPerception(state.perceptions, ref.assetId); return <div className="perception-item" key={ref.assetId}><strong>{asset?.type === "link" ? asset.provenance.sourceUrl : asset?.type ?? ref.kind}</strong><dl><div><dt>Appears to mean</dt><dd>{perception?.result.interpretation ?? perception?.result.observation ?? "No perception recorded."}</dd></div><div><dt>Uncertainty</dt><dd>{perception?.result.uncertainty ?? "insufficient"}</dd></div><div><dt>Missing context</dt><dd>{perception?.result.missingContext?.join(" ") ?? "None recorded."}</dd></div></dl></div>; })}<p className="perception-boundary">Perception explains what media appears to mean. Taste decides whether it is worth acting on. {presence.name} will not infer an uninspected asset.</p></section>}</main>
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
      </>}
    </div>
  );
}

function PeopleView({ state, mutate }: { state: OpenPresenceState; mutate: Mutate }) {
  const presence = state.presence ?? state.presences[0];
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [remembering, setRemembering] = useState(false);
  const [rememberName, setRememberName] = useState("");
  const [rememberHandle, setRememberHandle] = useState("");
  const [rememberExternalId, setRememberExternalId] = useState("");
  const [correction, setCorrection] = useState("");
  if (!presence) return null;
  const visibleIdentityIds = new Set(state.personIdentities.filter((identity) => identity.sourcePresenceId === presence.id && (identity.sourceEnvironment ?? "live") === (presence.environment ?? "live")).map((identity) => identity.personId));
  const people = state.people
    .filter((person) => person.memoryState === "active" && visibleIdentityIds.has(person.id))
    .filter((person) => !query.trim() || `${person.displayName} ${state.personIdentities.find((identity) => identity.personId === person.id && identity.sourcePresenceId === presence.id && (identity.sourceEnvironment ?? "live") === (presence.environment ?? "live"))?.handle ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = state.people.find((person) => person.id === selectedId) ?? people[0];
  const selectedIdentity = selected ? state.personIdentities.find((identity) => identity.personId === selected.id && identity.sourcePresenceId === presence.id && (identity.sourceEnvironment ?? "live") === (presence.environment ?? "live")) : undefined;
  const relationship = selected ? state.relationships.find((item) => item.personId === selected.id) : undefined;
  const facts = relationship ? state.relationshipFacts.filter((fact) => fact.relationshipId === relationship.id && !fact.validTo && !state.relationshipFacts.some((newer) => newer.supersedesFactId === fact.id)) : [];
  const loops = relationship ? state.relationshipOpenLoops.filter((loop) => loop.relationshipId === relationship.id && loop.status === "open") : [];
  const recentHistory = selectedIdentity ? state.mirrorObjects.filter((item) => item.presenceId === presence.id && (item.environment ?? "live") === (presence.environment ?? "live") && item.author?.externalRef?.id === selectedIdentity.externalActorId && isCognitionEligibleMirrorObject(item, presence.language)).sort((left, right) => (right.occurredAt ?? right.observedAt).localeCompare(left.occurredAt ?? left.observedAt)).slice(0, 8) : [];
  const remember = async () => {
    if (!rememberName.trim() || !rememberExternalId.trim()) return;
    const next = await mutate({ type: "rememberPerson", presenceId: presence.id, channel: presence.channel, externalActorId: rememberExternalId.trim(), displayName: rememberName.trim(), handle: rememberHandle.trim() || undefined, source: "operator" });
    if (next) { setRememberName(""); setRememberHandle(""); setRememberExternalId(""); setRemembering(false); }
  };
  const correct = async () => {
    if (!relationship || !correction.trim()) return;
    const next = await mutate({ type: "correctRelationshipFact", relationshipId: relationship.id, factId: facts[0]?.id, statement: correction.trim(), visibility: `presence:${presence.id}` });
    if (next) setCorrection("");
  };
  return <div className="people-page">
    <PageHeader
      className="people-header"
      eyebrow="Presence relationships"
      title="People"
      description={<>Who {presence.name} remembers here. Seeing someone in the world does not automatically create a relationship.</>}
      actionsClassName="heading-actions"
      actions={<Button variant="primary" onClick={() => setRemembering((value) => !value)}><Plus size={14} /> Remember a person</Button>}
    />
    {remembering && <section className="people-composer" aria-label="Remember a person">
      <div><SectionEyebrow>Explicit memory</SectionEyebrow><h2>Who should {presence.name} remember?</h2><p>This creates identity context without inventing prior interaction history.</p></div>
      <div className="people-form-grid"><label>Name<input aria-label="Person name" value={rememberName} onChange={(event) => setRememberName(event.target.value)} placeholder="Maya Chen" /></label><label>Handle <span className="optional-label">Optional</span><input aria-label="Person handle" value={rememberHandle} onChange={(event) => setRememberHandle(event.target.value)} placeholder="@maya" /></label><label>Channel actor ID<input aria-label="Channel actor ID" value={rememberExternalId} onChange={(event) => setRememberExternalId(event.target.value)} placeholder="maya" /></label></div>
      <div className="people-form-actions"><Button variant="ghost" onClick={() => setRemembering(false)}>Cancel</Button><Button variant="primary" disabled={!rememberName.trim() || !rememberExternalId.trim()} onClick={() => void remember()}>Remember</Button></div>
    </section>}
    <div className="people-toolbar"><label className="people-search"><span>Search people</span><input aria-label="Search people" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or handle" /></label><span className="people-count">{people.length} remembered</span></div>
    {!people.length ? <section className="people-empty"><div className="watch-empty-mark"><Users size={23} /></div><SectionEyebrow>People</SectionEyebrow><h2>No one remembered yet.</h2><p>People will appear as meaningful relationships develop here. A Watch or a feed appearance alone is not a relationship.</p></section> : <div className="people-layout"><section className="people-list" aria-label="Remembered people">{people.map((person) => { const identity = state.personIdentities.find((item) => item.personId === person.id && item.sourcePresenceId === presence.id && (item.sourceEnvironment ?? "live") === (presence.environment ?? "live")); const avatarUrl = identity?.avatarUrl ?? state.mirrorObjects.find((item) => item.presenceId === presence.id && (item.environment ?? "live") === (presence.environment ?? "live") && item.author?.externalRef?.id === identity?.externalActorId)?.author?.avatarUrl; const rel = state.relationships.find((item) => item.personId === person.id); return <button type="button" className={`people-row ${selected?.id === person.id ? "active" : ""}`} key={person.id} onClick={() => setSelectedId(person.id)}><ChannelAvatar className="people-avatar" avatarUrl={avatarUrl} name={person.displayName} /><span className="people-row-copy"><strong>{person.displayName}</strong><small>{identity?.handle ?? identity?.externalActorId} · {rel?.lastMeaningfulInteractionAt ? `Last interacted ${formatTime(rel.lastMeaningfulInteractionAt)}` : "Remembered explicitly"}</small><span>{factsForPerson(state, person.id)[0] ?? "Selective relationship context is available here."}</span></span><ChevronRight size={16} /></button>; })}</section>{selected && <section className="person-inspector" aria-label={`${selected.displayName} relationship`}><div className="person-inspector-heading"><div><SectionEyebrow>Person</SectionEyebrow><h2>{selected.displayName}</h2><p>{selectedIdentity?.handle ?? selectedIdentity?.externalActorId} · {channelLabel(presence.channel, state.channelDefinitions)}</p></div><span className="people-status">{relationship?.lastMeaningfulInteractionAt ? "Remembered relationship" : "Remembered identity"}</span></div><div className="person-inspector-section"><SectionEyebrow>How {presence.name} knows them</SectionEyebrow><p>{relationship?.lastMeaningfulInteractionAt ? "You've interacted meaningfully here. The details below remain linked to actual evidence." : "The operator explicitly asked the Agent to remember this person. No prior interaction is being implied."}</p></div><div className="person-inspector-section"><SectionEyebrow>What {presence.name} remembers</SectionEyebrow>{facts.length ? <ul>{facts.map((fact) => <li key={fact.id}><span>{fact.statement}</span><small>{fact.epistemicKind.replaceAll("_", " ")} · {fact.provenanceRefs.map((ref) => ref.kind).join(", ")}</small></li>)}</ul> : <p>No curated facts yet.</p>}</div><div className="person-inspector-section"><SectionEyebrow>Open threads</SectionEyebrow>{loops.length ? <ul>{loops.map((loop) => <li key={loop.id}>{loop.description}</li>)}</ul> : <p>No open loops.</p>}</div><div className="person-inspector-section"><SectionEyebrow>Recent interactions</SectionEyebrow>{recentHistory.length ? <div className="person-history">{recentHistory.map((item) => <article key={item.id}><small>{formatTime(item.occurredAt ?? item.observedAt)}</small><p>{item.content?.text ?? "[no text]"}</p></article>)}</div> : <p>No Mirror-backed interactions yet.</p>}</div><div className="person-inspector-actions"><Button variant="ghost" onClick={() => void mutate({ type: "forgetRelationship", relationshipId: relationship?.id })} disabled={!relationship}>Forget relationship</Button><Button variant="ghost" onClick={() => void mutate({ type: "createWatch", presenceId: presence.id, query: selectedIdentity?.handle ?? selected.displayName, purpose: "Keep this person in attention without treating Watching as relationship memory." })}>Watch</Button></div>{relationship && <div className="person-correction"><label>Correct memory<textarea aria-label="Correct relationship memory" value={correction} onChange={(event) => setCorrection(event.target.value)} placeholder="What should the Agent remember instead?" rows={3} /></label><Button variant="secondary" disabled={!correction.trim()} onClick={() => void correct()}><Pencil size={14} /> Save correction</Button></div>}</section>}</div>}
  </div>;
}

function factsForPerson(state: OpenPresenceState, personId: string) {
  const relationship = state.relationships.find((item) => item.personId === personId);
  if (!relationship) return [];
  return state.relationshipFacts.filter((fact) => fact.relationshipId === relationship.id && !fact.validTo && !state.relationshipFacts.some((newer) => newer.supersedesFactId === fact.id)).slice(0, 1).map((fact) => fact.statement);
}

function watchPreview(query: string) {
  const clean = query.trim().replace(/^keep an eye on\s+/i, "").replace(/[.!?]+$/, "").trim();
  const creator = /^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/[A-Za-z0-9_]+\/?$/i.test(clean) || /^@?[A-Za-z0-9_]{2,30}$/.test(clean);
  const opportunity = /\b(opportunit|founder|introduction|network|may need|looking for|could help)\b/i.test(clean);
  return { clean, kind: creator ? "creator" : opportunity ? "opportunity" : "topic" as "creator" | "topic" | "opportunity" };
}

function watchObservationCopy(watch: Watch) {
  if (watch.observation.observedCount > 0) {
    const count = watch.observation.observedCount;
    return {
      label: `${count} observation${count === 1 ? "" : "s"} recorded`,
      detail: "Jenny has current material to consider from this Watch.",
    };
  }
  if (watch.observation.source === "automatic") {
    return {
      label: "Waiting for first observation",
      detail: "This Watch is active. No action is needed yet; Jenny will show signals here when the connected source supplies them.",
    };
  }
  return {
    label: "Waiting for source material",
    detail: "This Watch is saved, but it needs connected or manually supplied material before Jenny can notice anything.",
  };
}

function WatchingView({ state, mutate }: { state: OpenPresenceState; mutate: Mutate }) {
  const presence = state.presence ?? state.presences[0];
  const watches = state.watches.filter((item) => item.presenceId === presence?.id);
  const explorations = state.explorations.filter((item) => item.presenceId === presence?.id);
  const [query, setQuery] = useState("");
  const [purpose, setPurpose] = useState("");
  const [explorationBrief, setExplorationBrief] = useState("");
  const [tab, setTab] = useState<"watchlist" | "explorations">("explorations");
  const [selectedExplorationId, setSelectedExplorationId] = useState<string | null>(null);
  const [editingExplorationId, setEditingExplorationId] = useState<string | null>(null);
  const [editingBrief, setEditingBrief] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyExplorationId, setBusyExplorationId] = useState<string | null>(null);
  const [objectiveDrafts, setObjectiveDrafts] = useState<Record<string, string>>({});
  const [selectedExplorationSessionId, setSelectedExplorationSessionId] = useState<string | null>(null);
  if (!presence) return null;
  const preview = watchPreview(query);
  const kindLabel = preview.kind === "creator" ? "Creator" : preview.kind === "opportunity" ? "Opportunity" : "Topic or conversation";
  const startWatching = async () => {
    if (!preview.clean) return;
    setBusy(true);
    try {
      const next = await mutate({ type: "createWatch", query: preview.clean, purpose: purpose.trim() || undefined, presenceId: presence.id });
      if (next) { setQuery(""); setPurpose(""); setReviewing(false); }
    } finally { setBusy(false); }
  };
  const startExploration = async () => {
    if (explorationBrief.trim().length < 8) return;
    setBusy(true);
    try {
      const next = await mutate({ type: "createExploration", brief: explorationBrief.trim(), presenceId: presence.id });
      if (next) { setExplorationBrief(""); setReviewing(false); setTab("explorations"); }
    } finally { setBusy(false); }
  };
  const selectedExploration = explorations.find((item) => item.id === selectedExplorationId) ?? explorations[0];
  const findings = selectedExploration ? state.explorationFindings.filter((item) => item.explorationId === selectedExploration.id && state.mirrorObjects.some((object) => object.id === item.mirrorObjectId && isCognitionEligibleMirrorObject(object, presence.language))).slice(0, 5) : [];
  const explorationSessions = selectedExploration ? state.explorationSessions.filter((item) => item.explorationId === selectedExploration.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt)) : [];
  const lastExplorationSession = explorationSessions.find((item) => item.id === selectedExplorationSessionId) ?? explorationSessions[0];
  const assignment = selectedExploration?.engagement?.assignmentId ? state.assignments.find((item) => item.id === selectedExploration.engagement?.assignmentId) : undefined;
  const chromeBridge = state.bridges.find((item) => item.presenceId === presence.id && item.kind === "bridge" && item.state !== "offline");
  const chromeStatus = presence.connectionMode === "bridge"
    ? chromeBridge && bridgeAdapterStatus(chromeBridge) === "connected"
      ? "connected" as const
      : presence.browserAccess?.enabled
        ? "needed" as const
        : "unavailable" as const
    : "not-route" as const;
  const objectiveDraft = selectedExploration ? objectiveDrafts[selectedExploration.id] ?? assignment?.instruction ?? "" : "";
  const setObjectiveDraft = (value: string) => {
    if (selectedExploration) setObjectiveDrafts((items) => ({ ...items, [selectedExploration.id]: value }));
  };
  const lastRunObjects = lastExplorationSession ? (lastExplorationSession.artifactIds?.length ? state.mirrorObjects.filter((item) => item.presenceId === presence.id && lastExplorationSession.artifactIds?.includes(item.id) && isCognitionEligibleMirrorObject(item, presence.language)) : ["mirror", "native"].includes(lastExplorationSession.discoverySource) && lastExplorationSession.status !== "completed" ? state.mirrorObjects.filter((item) => item.presenceId === presence.id && item.visibility === "public" && item.objectType === "post" && isCognitionEligibleMirrorObject(item, presence.language)).slice(0, 40) : []) : [];
  const lookNow = async (id: string) => { setSelectedExplorationSessionId(null); setBusyExplorationId(id); try { await mutate({ type: "lookNow", id }); } finally { setBusyExplorationId(null); } };
  const setEngagement = async (id: string, mode: "surface" | "opportunistic" | "objective") => {
    setBusyExplorationId(id);
    try { await mutate({ type: "setExplorationEngagement", id, mode, ...(mode === "objective" ? { objective: objectiveDraft.trim() || undefined } : {}) }); }
    finally { setBusyExplorationId(null); }
  };
  const saveExploration = async () => {
    if (!editingExplorationId || editingBrief.trim().length < 8) return;
    setBusyExplorationId(editingExplorationId);
    try {
      const next = await mutate({ type: "updateExploration", id: editingExplorationId, brief: editingBrief.trim() });
      if (next) { setEditingExplorationId(null); setEditingBrief(""); }
    } finally { setBusyExplorationId(null); }
  };
  return <div className="watching-page">
    <PageHeader
      className="watching-header"
      eyebrow="Presence attention"
      title="Watching"
      description={<>What {presence.name} is paying extra attention to. Known people stay in the Watchlist; Explorations look for meaningful social reality.</>}
      actionsClassName="heading-actions"
      actions={<Button variant="primary" onClick={() => { setReviewing((value) => !value); setTab("explorations"); }}><Plus size={14} /> New exploration</Button>}
    />
    <div className="watch-tabs" role="tablist" aria-label="Watching categories"><button type="button" role="tab" aria-selected={tab === "explorations"} className={tab === "explorations" ? "active" : ""} onClick={() => setTab("explorations")}>Explorations <span>{explorations.filter((item) => item.status !== "archived").length}</span></button><button type="button" role="tab" aria-selected={tab === "watchlist"} className={tab === "watchlist" ? "active" : ""} onClick={() => { setTab("watchlist"); setReviewing(false); }}>Watchlist <span>{watches.length}</span></button></div>
    {tab === "watchlist" && <>
      <div className="watchlist-toolbar"><div><SectionEyebrow>Known things</SectionEyebrow><h2>People and sources this Presence intentionally follows.</h2></div><Button variant="secondary" onClick={() => setReviewing((value) => !value)}>Add watch</Button></div>
      {reviewing && <section className="watch-composer" aria-label="Add a watch"><div><SectionEyebrow>New watch</SectionEyebrow><h2>What should {presence.name} notice?</h2><p>Describe a creator, source, or known conversation. This stays a Watchlist item, not a relationship memory.</p></div><label>Keep an eye on<textarea aria-label="What should this Presence watch?" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="@AlexHormozi or a known community" rows={3} /></label><label>Why should {presence.name} watch this? <span className="optional-label">Optional</span><input aria-label="Why should this Presence watch this?" value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Learn from strong offers without imitating the voice" /></label>{query.trim() && <div className="watch-review" aria-label="Watch review"><div><SectionEyebrow>Here&apos;s what {presence.name} will watch</SectionEyebrow><strong>{kindLabel}</strong><p>{preview.clean}</p></div><div><span>Use</span><strong>Notice relevant material</strong></div><div><span>Boundary</span><strong>Watching does not imitate identity or voice</strong></div><div><span>Source</span><strong>{preview.kind === "creator" && presence.channel === "x" ? "Automatic where available" : "Manual material or connected source"}</strong></div></div>}<div className="watch-form-actions"><Button variant="ghost" onClick={() => { setReviewing(false); setQuery(""); setPurpose(""); }}>Cancel</Button><Button variant="primary" disabled={busy || !preview.clean} onClick={() => void startWatching()}>{busy ? "Starting…" : "Start watching"}</Button></div></section>}
      {watches.length ? <section className="watching-section"><div className="section-heading compact"><div><SectionEyebrow>Watchlist</SectionEyebrow><h2>{watches.length} {watches.length === 1 ? "watch" : "watches"}</h2></div></div><div className="watch-list">{watches.map((watch) => { const observationCopy = watchObservationCopy(watch); return <article className="watch-card" key={watch.id}><div className="watch-card-main"><div className="watch-card-icon"><Eye size={17} /></div><div><div className="watch-card-heading"><strong>{watch.title}</strong><span className={`watch-status watch-status-${watch.observation.status}`}><span className="status-dot" /> {watch.observation.status === "manual" ? "Manual source" : "Active watch"}</span></div><small>{watch.kind === "creator" ? "Creator" : watch.kind === "opportunity" ? "Opportunity" : "Topic or conversation"} · {channelLabel(watch.channel, state.channelDefinitions)}</small><p>{watch.purpose || watch.query}</p><div className="watch-observation-state"><strong>{observationCopy.label}</strong><span>{observationCopy.detail}</span></div></div></div><Button variant="ghost" aria-label={`Remove ${watch.title}`} onClick={() => void mutate({ type: "deleteWatch", id: watch.id })}>Remove</Button></article>; })}</div></section> : <section className="watching-empty"><div className="watch-empty-mark"><Eye size={23} /></div><SectionEyebrow>Watchlist</SectionEyebrow><h2>No known things yet.</h2><p>Follow a specific person, account, or source here. Use an Exploration when the meaning matters more than who started the conversation.</p><Button variant="primary" onClick={() => setReviewing(true)}><Plus size={14} /> Add watch</Button></section>}
    </>}
    {tab === "explorations" && <>
      {reviewing && <section className="exploration-composer" aria-label="Create an Exploration"><div><SectionEyebrow>New Exploration</SectionEyebrow><h2>What should {presence.name} keep an eye on?</h2><p>Describe the conversations, problems, people, or developments that would be useful for {presence.name} to notice.</p></div><textarea aria-label="What should this Presence keep an eye on?" value={explorationBrief} onChange={(event) => setExplorationBrief(event.target.value)} placeholder="People struggling with agent infrastructure or asking how to deploy persistent agents." rows={4} />{explorationBrief.trim() && <div className="watch-review" aria-label="Exploration review"><div><SectionEyebrow>Genny understands this as</SectionEyebrow><p>{explorationInterpretation(explorationBrief)}</p></div><div><span>Use</span><strong>Discover social evidence</strong></div><div><span>Boundary</span><strong>Looking does not authorize speaking</strong></div><div><span>Scope</span><strong>{presence.name} · {channelLabel(presence.channel, state.channelDefinitions)}</strong></div></div>}<div className="watch-form-actions"><Button variant="ghost" onClick={() => { setReviewing(false); setExplorationBrief(""); }}>Cancel</Button><Button variant="primary" disabled={busy || explorationBrief.trim().length < 8} onClick={() => void startExploration()}>{busy ? "Starting…" : "Start exploring"}</Button></div></section>}
      {!explorations.length ? <section className="watching-empty"><div className="watch-empty-mark"><Eye size={23} /></div><SectionEyebrow>Explorations</SectionEyebrow><h2>Give {presence.name} a reason to look around.</h2><p>Explorations are durable areas of attention. They discover evidence first; {presence.name} still decides whether anything deserves a Social Intent, memory, or silence.</p><Button variant="primary" onClick={() => setReviewing(true)}><Plus size={14} /> New exploration</Button></section> : <div className="exploration-layout"><section className="exploration-list" aria-label="Explorations">{explorations.filter((item) => item.status !== "archived").map((item) => <button type="button" key={item.id} className={`exploration-row ${selectedExploration?.id === item.id ? "active" : ""}`} onClick={() => setSelectedExplorationId(item.id)}><span className={`exploration-state exploration-state-${item.status}`} /> <span><strong>{item.title}</strong><small>{item.status === "active" ? "Active" : "Paused"} · {item.coverage.label}</small><em>{item.brief}</em></span><ChevronRight size={15} /></button>)}</section>{selectedExploration && <section className="exploration-detail" aria-label={`${selectedExploration.title} Exploration`}><div className="exploration-detail-header"><div><SectionEyebrow>Exploration · {channelLabel(selectedExploration.channel, state.channelDefinitions)}</SectionEyebrow><h2>{selectedExploration.title}</h2><p>{selectedExploration.brief}</p></div><span className={`watch-status ${selectedExploration.status === "active" ? "" : "watch-status-manual"}`}><span className="status-dot" /> {selectedExploration.status}</span></div>{editingExplorationId === selectedExploration.id ? <div className="exploration-edit"><label>What should {presence.name} keep an eye on?<textarea aria-label="Edit Exploration brief" value={editingBrief} onChange={(event) => setEditingBrief(event.target.value)} rows={4} /></label><div className="watch-form-actions"><Button variant="ghost" onClick={() => setEditingExplorationId(null)}>Cancel</Button><Button variant="primary" disabled={busyExplorationId === selectedExploration.id || editingBrief.trim().length < 8} onClick={() => void saveExploration()}>Save refinement</Button></div></div> : <><div className="exploration-interpretation"><SectionEyebrow>How {presence.name} is looking</SectionEyebrow><p>{selectedExploration.interpretation}</p></div><div className="exploration-coverage"><strong>{selectedExploration.coverage.label}</strong><span>{selectedExploration.coverage.detail}</span></div><ExplorationResponsibility exploration={selectedExploration} assignment={assignment} presence={presence} objectiveDraft={objectiveDraft} setObjectiveDraft={setObjectiveDraft} busy={busyExplorationId === selectedExploration.id} setEngagement={setEngagement} chromeStatus={chromeStatus} /><ExplorationRunMonitor exploration={selectedExploration} presence={presence} sessions={explorationSessions} lastSession={lastExplorationSession} artifacts={lastRunObjects} state={state} mutate={mutate} /><div className="exploration-meta"><span>Last looked {selectedExploration.lastLookedAt ? formatTime(selectedExploration.lastLookedAt) : "not yet"}</span><span>Brief revision {selectedExploration.revision}</span>{lastExplorationSession && <span className={lastExplorationSession.status === "completed" ? "" : "exploration-meta-warning"}>Last look {lastExplorationSession.status}{lastExplorationSession.failureReason ? ` · ${lastExplorationSession.failureReason}` : ""}</span>}</div><div className="exploration-actions"><Button variant="primary" disabled={busyExplorationId === selectedExploration.id || selectedExploration.status !== "active"} onClick={() => void lookNow(selectedExploration.id)}>{busyExplorationId === selectedExploration.id ? "Looking…" : "Look now"}</Button><Button variant="secondary" onClick={() => { setEditingExplorationId(selectedExploration.id); setEditingBrief(selectedExploration.brief); }}><Pencil size={14} /> Refine</Button><Button variant="ghost" onClick={() => void mutate({ type: "setExplorationStatus", id: selectedExploration.id, status: selectedExploration.status === "active" ? "paused" : "active" })}>{selectedExploration.status === "active" ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Resume</>}</Button><Button variant="ghost" onClick={() => void mutate({ type: "setExplorationStatus", id: selectedExploration.id, status: "archived" })}>Archive</Button></div><div className="exploration-findings"><SectionEyebrow>Recent worthwhile findings</SectionEyebrow>{findings.length ? findings.map((finding) => { const object = state.mirrorObjects.find((item) => item.id === finding.mirrorObjectId); return <article className="exploration-finding" key={finding.id}><div><strong>{object?.author?.handle ? `@${object.author.handle}` : object?.author?.displayName ?? "Social object"}</strong><p>{finding.safeSummary}</p><small>{finding.whyItMayMatter}</small></div>{object && <Button variant="secondary" onClick={() => void mutate({ type: "askPresenceToReply", presenceId: presence.id, objectId: object.id })}>Ask {presence.name} to respond</Button>}</article>; }) : <p className="muted">No worthwhile findings yet. A look can complete successfully with silence.</p>}</div></>}</section>}</div>}
    </>}
  </div>;
}

function explorationDiscoveryLabel(source: OpenPresenceState["explorationSessions"][number]["discoverySource"], presence: Presence) {
  if (source === "native") return "X public search";
  if (source === "bridge") return "Connected Bridge";
  if (source === "mirror") return "Social Mirror";
  return `${channelLabel(presence.channel, [])} unavailable`;
}

function ExplorationResponsibility({
  exploration,
  assignment,
  presence,
  objectiveDraft,
  setObjectiveDraft,
  busy,
  setEngagement,
  chromeStatus,
}: {
  exploration: OpenPresenceState["explorations"][number];
  assignment?: Assignment;
  presence: Presence;
  objectiveDraft: string;
  setObjectiveDraft: (value: string) => void;
  busy: boolean;
  setEngagement: (id: string, mode: "surface" | "opportunistic" | "objective") => Promise<void>;
  chromeStatus: "connected" | "needed" | "unavailable" | "not-route";
}) {
  const mode = exploration.engagement?.mode ?? "surface";
  const assignmentIsActive = assignment?.status === "active" || assignment?.status === "working";
  return <section className="exploration-responsibility" aria-label="Exploration responsibility">
    <div><SectionEyebrow>When {presence.name} finds a strong match</SectionEyebrow><p>Choose whether {presence.name} surfaces the opportunity, participates when it can add genuine value, or owns a specific ongoing outcome.</p></div>
    <div className="exploration-responsibility-options">
      <button type="button" aria-pressed={mode === "surface"} className={mode === "surface" ? "active" : ""} onClick={() => void setEngagement(exploration.id, "surface")} disabled={busy}><strong>Surface only</strong><span>Show me the best opportunities.</span></button>
      <button type="button" aria-pressed={mode === "opportunistic"} className={mode === "opportunistic" ? "active" : ""} onClick={() => void setEngagement(exploration.id, "opportunistic")} disabled={busy}><strong>Engage when useful</strong><span>{presence.name} participates when it can make a real contribution.</span></button>
      <button type="button" aria-pressed={mode === "objective"} className={mode === "objective" ? "active" : ""} onClick={() => void setEngagement(exploration.id, "objective")} disabled={busy}><strong>Pursue an outcome</strong><span>Give {presence.name} a specific ongoing Assignment.</span></button>
    </div>
    {mode !== "surface" && <div className="exploration-assignment-note"><span className="status-dot" /> <span>{assignmentIsActive && assignment ? <><strong>Assignment active.</strong> {assignment.progress.verified} verified interaction{assignment.progress.verified === 1 ? "" : "s"}; {assignment.environment === "sandbox" ? "Sandbox execution is enabled." : "Live delivery still follows this Presence's execution settings."}</> : assignment ? <>Assignment {assignment.status}. It will not act until it is active.</> : "Assignment is being prepared."}</span></div>}
    {mode !== "surface" && chromeStatus !== "not-route" && <div className={`exploration-connection-note exploration-connection-${chromeStatus}`} role="status"><span className="status-dot" /><span><strong>{chromeStatus === "connected" ? "Chrome connected" : chromeStatus === "needed" ? "Chrome connection needed" : "Chrome not enabled"}</strong><small>{chromeStatus === "connected" ? "Genny can use the selected signed-in tab when a reply earns its place." : chromeStatus === "needed" ? "Open Settings → Chrome connection before enabling live engagement." : "Enable OpenPresence Chrome in Settings before enabling live engagement."}</small></span></div>}
    {mode === "objective" && <label className="exploration-objective">Conversation objective <input aria-label="Conversation objective" value={objectiveDraft || assignment?.instruction || ""} onChange={(event) => setObjectiveDraft(event.target.value)} placeholder="Engage people describing a concrete problem with persistent agents." /></label>}
  </section>;
}

function ExplorationRunMonitorLegacy({
  presence,
  sessions,
  lastSession,
  searchQuery,
  artifacts,
  state,
  mutate,
}: {
  exploration: OpenPresenceState["explorations"][number];
  presence: Presence;
  sessions: OpenPresenceState["explorationSessions"];
  lastSession?: OpenPresenceState["explorationSessions"][number];
  searchQuery: string;
  artifacts: MirrorObject[];
  findings: OpenPresenceState["explorationFindings"];
  state: OpenPresenceState;
  mutate: Mutate;
}) {
  const findings: OpenPresenceState["explorationFindings"] = [];
  const searchFailed = lastSession?.status === "degraded" || lastSession?.status === "failed";
  return <>
    <section className="exploration-monitor" aria-label="Exploration run monitor">
      <div className="exploration-monitor-heading"><div><SectionEyebrow>Run monitor</SectionEyebrow><h3>{lastSession ? `Run ${lastSession.id.slice(-8)}` : "No run yet"}</h3></div>{lastSession && <span className={`exploration-run-status exploration-run-${lastSession.status}`}><span className="status-dot" /> {lastSession.status === "completed" ? "Completed" : lastSession.status === "running" ? "Running" : "Needs attention"}</span>}</div>
      {lastSession ? <>
        <div className="exploration-run-summary"><div><span>Discovery source</span><strong>{explorationDiscoveryLabel(lastSession.discoverySource, presence)}</strong></div><div><span>Search phrase</span><strong title={searchQuery}>{searchQuery || "Not sent"}</strong></div><div><span>Observed</span><strong>{lastSession.candidatesSeen}</strong></div><div><span>Worthwhile</span><strong>{lastSession.findingsCreated}</strong></div></div>
        <div className="exploration-run-timeline"><div className="exploration-run-step is-complete"><span><Check size={12} /></span><div><strong>Run started</strong><small>{formatTime(lastSession.startedAt)} · Session recorded</small></div></div><div className={`exploration-run-step ${searchFailed ? "is-failed" : "is-complete"}`}><span>{searchFailed ? <CircleAlert size={12} /> : <Check size={12} />}</span><div><strong>{lastSession.discoverySource === "native" ? "X public search attempted" : "Social Mirror checked"}</strong><small>{lastSession.discoverySource === "native" ? searchFailed ? `${lastSession.candidatesSeen} existing Mirror object${lastSession.candidatesSeen === 1 ? " was" : "s were"} available; no new X results were imported.` : `${lastSession.candidatesSeen} public result${lastSession.candidatesSeen === 1 ? "" : "s"} entered the Mirror.` : `${lastSession.candidatesSeen} observed object${lastSession.candidatesSeen === 1 ? "" : "s"} available to inspect.`}</small></div></div><div className={`exploration-run-step ${searchFailed ? "is-failed" : "is-complete"}`}><span>{searchFailed ? <CircleAlert size={12} /> : <Check size={12} />}</span><div><strong>Agent triage</strong><small>{lastSession.candidatesHydrated} object{lastSession.candidatesHydrated === 1 ? "" : "s"} compared with the durable brief; {lastSession.findingsCreated} surfaced.</small></div></div><div className="exploration-run-step is-result"><span><Circle size={10} fill="currentColor" /></span><div><strong>{lastSession.status === "completed" ? "Outcome recorded" : "Run stopped with an issue"}</strong><small>{lastSession.failureReason || (lastSession.findingsCreated ? "Findings are available below. No public action is implied by a finding." : "The run completed without a worthwhile finding. Silence is a valid outcome.")}</small></div></div></div>
        {lastSession.discoverySource === "native" && <p className="exploration-monitor-note">The search artifact is the Social Mirror record below. The query was sent to the connected X discovery source; credentials and raw provider responses stay out of the Agent view.</p>}
      </> : <p className="muted">Use Look now to create a durable run record. The monitor will show the source, query, counts, and outcome here.</p>}
    </section>
            <section className="exploration-artifacts" aria-label="Search artifacts"><div className="exploration-artifacts-heading"><div><SectionEyebrow>Search artifacts</SectionEyebrow><h3>{artifacts.length || findings.length ? `${artifacts.length || findings.length} observed object${(artifacts.length || findings.length) === 1 ? "" : "s"}` : "No artifacts yet"}</h3></div><span>Social Mirror</span></div>{artifacts.length ? <div className="exploration-artifact-list">{artifacts.map((object) => { const externalUrl = externalUrlForMirrorObject(object, object.author?.handle); return <article className="exploration-artifact" key={object.id}><div><strong>{object.author?.handle ? `@${object.author.handle}` : object.author?.displayName ?? "X account"}</strong><p>{object.content?.text || "[No text returned]"}</p><small>{channelLabel(object.channelId)} post · {object.externalRef.id} · observed {formatTime(object.observedAt)}</small></div>{externalUrl && <a href={externalUrl} target="_blank" rel="noreferrer" aria-label={`Open ${channelLabel(object.channelId)} artifact ${object.externalRef.id}`}><ArrowUpRight size={14} /></a>}</article>; })}</div> : findings.length ? <div className="exploration-artifact-list">{findings.map((finding) => { const object = state.mirrorObjects.find((item) => item.id === finding.mirrorObjectId); return <article className="exploration-artifact" key={finding.id}><div><strong>{object?.author?.handle ? `@${object.author.handle}` : object?.author?.displayName ?? "Social object"}</strong><p>{finding.safeSummary}</p><small>{finding.whyItMayMatter}</small></div>{object && <Button variant="secondary" onClick={() => void mutate({ type: "askPresenceToReply", presenceId: presence.id, objectId: object.id })}>Ask {presence.name} to respond</Button>}</article>; })}</div> : <p className="muted">No search objects were retained for this run. A completed search with no worthwhile finding is still recorded.</p>}</section>
    <section className="exploration-history" aria-label="Exploration history"><div className="exploration-artifacts-heading"><div><SectionEyebrow>Run history</SectionEyebrow><h3>{sessions.length} recorded run{sessions.length === 1 ? "" : "s"}</h3></div><span>Auditable attempts</span></div>{sessions.slice(0, 5).map((session) => <div className="exploration-history-row" key={session.id}><span className={`exploration-history-dot exploration-history-${session.status}`} /><span><strong>{session.id.slice(-8)} · {session.discoverySource === "native" ? "X search" : "Mirror review"}</strong><small>{formatTime(session.startedAt)} · {session.candidatesSeen} observed · {session.findingsCreated} worthwhile</small></span><ChevronRight size={14} /></div>)}</section>
  </>;
}

function ExplorationRunMonitorAudit({
  presence,
  sessions,
  lastSession,
  searchQuery,
  artifacts,
}: {
  exploration: OpenPresenceState["explorations"][number];
  presence: Presence;
  sessions: OpenPresenceState["explorationSessions"];
  lastSession?: OpenPresenceState["explorationSessions"][number];
  searchQuery: string;
  artifacts: MirrorObject[];
  findings: OpenPresenceState["explorationFindings"];
  state: OpenPresenceState;
  mutate: Mutate;
}) {
  void ExplorationRunMonitorLegacy;
  void searchQuery;
  const running = lastSession?.status === "running";
  const searchFailed = lastSession?.status === "degraded" || lastSession?.status === "failed";
  const artifactsAreExistingEvidence = !lastSession || lastSession.status !== "completed" || lastSession.discoverySource !== "native";
  const xQuery = lastSession?.searchQuery?.trim() || "";
  const xQueryWasUsed = lastSession?.discoverySource === "native";
  const xQueryLabel = xQueryWasUsed ? xQuery || "Not recorded for this historical run" : "No X query was sent for this run";
  return <>
    <section className="exploration-monitor" aria-label="Exploration run monitor">
      <div className="exploration-monitor-heading"><div><SectionEyebrow>Run monitor</SectionEyebrow><h3>{lastSession ? `Run ${lastSession.id.slice(-8)}` : "No run yet"}</h3></div>{lastSession && <span className={`exploration-run-status exploration-run-${lastSession.status}`}><span className="status-dot" /> {running ? "Running" : lastSession.status === "completed" ? "Completed" : "Needs attention"}</span>}</div>
      {lastSession ? <>
        <div className="exploration-run-summary"><div><span>Discovery source</span><strong>{explorationDiscoveryLabel(lastSession.discoverySource, presence)}</strong></div><div><span>X query</span><strong title={xQueryLabel}>{xQueryLabel}</strong></div><div><span>Observed</span><strong>{lastSession.candidatesSeen}</strong></div><div><span>Worthwhile</span><strong>{lastSession.findingsCreated}</strong></div></div>
        <div className="exploration-query" aria-label="X query details"><div className="exploration-query-heading"><SectionEyebrow>{xQueryWasUsed ? "X query" : "X query status"}</SectionEyebrow><span>{xQueryWasUsed ? "GET /2/tweets/search/recent" : "No X request for this run"}</span></div><code>{xQueryLabel}</code><small>{xQueryWasUsed ? "This is the q parameter compiled from the durable Exploration brief. Additional parameters: tweet.fields=created_at,conversation_id,author_id · expansions=author_id · user.fields=name,username · max_results=25. Credentials and raw provider responses are never displayed." : "This run inspected existing Social Mirror evidence and did not make a new X search request."}</small></div>
        {running ? <div className="exploration-run-live"><span className="status-dot" /><div><strong>X public search is in progress</strong><small>The request has been recorded and is waiting for the connected source. Triage and artifacts will update when it returns.</small></div></div> : <div className="exploration-run-timeline"><div className="exploration-run-step is-complete"><span><Check size={12} /></span><div><strong>Run started</strong><small>{formatTime(lastSession.startedAt)} · Session recorded</small></div></div><div className={`exploration-run-step ${searchFailed ? "is-failed" : "is-complete"}`}><span>{searchFailed ? <CircleAlert size={12} /> : <Check size={12} />}</span><div><strong>{lastSession.discoverySource === "native" ? "X public search attempted" : "Social Mirror checked"}</strong><small>{lastSession.discoverySource === "native" ? searchFailed ? `${lastSession.candidatesSeen} existing Mirror object${lastSession.candidatesSeen === 1 ? " was" : "s were"} available; no new X results were imported.` : `${lastSession.candidatesSeen} public result${lastSession.candidatesSeen === 1 ? "" : "s"} entered the Mirror.` : `${lastSession.candidatesSeen} observed object${lastSession.candidatesSeen === 1 ? "" : "s"} available to inspect.`}</small></div></div><div className={`exploration-run-step ${searchFailed ? "is-failed" : "is-complete"}`}><span>{searchFailed ? <CircleAlert size={12} /> : <Check size={12} />}</span><div><strong>Agent triage</strong><small>{lastSession.candidatesHydrated} object{lastSession.candidatesHydrated === 1 ? "" : "s"} compared with the durable brief; {lastSession.findingsCreated} surfaced.</small></div></div><div className="exploration-run-step is-result"><span><Circle size={10} fill="currentColor" /></span><div><strong>{lastSession.status === "completed" ? "Outcome recorded" : "Run stopped with an issue"}</strong><small>{lastSession.failureReason || (lastSession.findingsCreated ? "Findings are available below. No public action was created." : "The run completed without a worthwhile finding. Silence is a valid outcome.")}</small></div></div></div>}
        {lastSession.discoverySource === "native" && <p className="exploration-monitor-note">The query was sent to the connected X discovery source. Credentials and raw provider responses stay out of the Agent view.</p>}
      </> : <p className="muted">Use Look now to create a durable run record. The monitor will show the source, query, counts, and outcome here.</p>}
    </section>
    <section className="exploration-artifacts" aria-label="Search artifacts"><div className="exploration-artifacts-heading"><div><SectionEyebrow>{artifactsAreExistingEvidence ? "Mirror evidence available to inspect" : "Search artifacts from this run"}</SectionEyebrow><h3>{artifacts.length ? `${artifacts.length} observed object${artifacts.length === 1 ? "" : "s"}` : "No artifacts yet"}</h3></div><span>{artifactsAreExistingEvidence ? "Not attributed to this X attempt" : "Social Mirror"}</span></div>{artifacts.length ? <div className="exploration-artifact-list">{artifacts.map((object) => { const externalUrl = externalUrlForMirrorObject(object, object.author?.handle); return <article className="exploration-artifact" key={object.id}><div><strong>{object.author?.handle ? `@${object.author.handle}` : object.author?.displayName ?? "X account"}</strong><p>{object.content?.text || "[No text returned]"}</p><small>{channelLabel(object.channelId)} post · {object.externalRef.id} · observed {formatTime(object.observedAt)}</small></div>{externalUrl && <a href={externalUrl} target="_blank" rel="noreferrer" aria-label={`Open ${channelLabel(object.channelId)} artifact ${object.externalRef.id}`}><ArrowUpRight size={14} /></a>}</article>; })}</div> : <p className="muted">No objects were retained for this run. A completed search with no worthwhile finding is still recorded.</p>}</section>
    <section className="exploration-history" aria-label="Exploration history"><div className="exploration-artifacts-heading"><div><SectionEyebrow>Run history</SectionEyebrow><h3>{sessions.length} recorded run{sessions.length === 1 ? "" : "s"}</h3></div><span>Auditable attempts</span></div>{sessions.slice(0, 5).map((session) => <div className="exploration-history-row" key={session.id}><span className={`exploration-history-dot exploration-history-${session.status}`} /><span><strong>{session.id.slice(-8)} · {session.discoverySource === "native" ? "X search" : "Mirror review"}</strong><small>{formatTime(session.startedAt)} · {session.candidatesSeen} observed · {session.findingsCreated} worthwhile</small></span><ChevronRight size={14} /></div>)}</section>
  </>;
}

function ExplorationRunMonitor({
  exploration,
  presence,
  sessions,
  lastSession,
  artifacts,
  state,
  mutate,
}: {
  exploration: OpenPresenceState["explorations"][number];
  presence: Presence;
  sessions: OpenPresenceState["explorationSessions"];
  lastSession?: OpenPresenceState["explorationSessions"][number];
  artifacts: MirrorObject[];
  state: OpenPresenceState;
  mutate: Mutate;
}) {
  void ExplorationRunMonitorAudit;
  const [retrying, setRetrying] = useState(false);
  const plan = state.discoveryPlans.find((item) => item.explorationId === exploration.id && item.briefRevision === exploration.revision) ?? state.discoveryPlans.find((item) => item.explorationId === exploration.id);
  const connection = state.nativeConnections.find((item) => item.presenceId === presence.id && item.kind === "x");
  const mirrorCount = state.mirrorObjects.filter((item) => item.presenceId === presence.id && item.visibility === "public").length;
  const running = lastSession?.status === "running";
  const degraded = lastSession?.status === "degraded" || lastSession?.status === "failed";
  const xSearch = lastSession?.discoverySource === "native";
  const xQuery = lastSession?.searchQuery?.trim() || "";
  const strategyProvenance = plan?.source === "agent" ? "Generated by Genny" : "Compiled from the Exploration brief";
  const directions = plan?.directions?.length ? plan.directions.slice(0, 4) : [exploration.brief];
  const exclusions = plan?.exclusions?.length ? plan.exclusions : ["generic commentary", "promotional noise", "unrelated conversations"];
  const retry = async () => {
    setRetrying(true);
    try { await mutate({ type: "lookNow", id: exploration.id }); }
    finally { setRetrying(false); }
  };
  const sourceStatus = presence.channel === "x" && connection
    ? connection.status === "connected" ? "Connected" : "Connected · write attention needed"
    : "Not connected";
  const lookNarrative = !lastSession
    ? "No look has been recorded yet. Genny will show the source, search strategy, and outcome here after the first look."
    : running
      ? "Genny has recorded this look and is waiting for the connected discovery source to return."
      : degraded && xSearch
        ? `Genny inspected ${lastSession.candidatesSeen} object${lastSession.candidatesSeen === 1 ? "" : "s"} already available in the Social Mirror. X public discovery did not complete: ${lastSession.failureReason || "the request was rejected"}. No new external X candidates were added during this look.`
        : degraded
          ? `Genny inspected ${lastSession.candidatesSeen} object${lastSession.candidatesSeen === 1 ? "" : "s"} already available in the Social Mirror. No new external search results were added during this look.`
          : xSearch
            ? `${lastSession.candidatesSeen} public result${lastSession.candidatesSeen === 1 ? "" : "s"} entered the Mirror. Genny triaged them and surfaced ${lastSession.findingsCreated} worthwhile opportunit${lastSession.findingsCreated === 1 ? "y" : "ies"}.`
            : `Genny reviewed ${lastSession.candidatesSeen} object${lastSession.candidatesSeen === 1 ? "" : "s"} already available in the Social Mirror and surfaced ${lastSession.findingsCreated} worthwhile opportunit${lastSession.findingsCreated === 1 ? "y" : "ies"}.`;
  const statusLabel = running ? "Running" : !lastSession ? "Not started" : degraded ? "Needs attention" : "Healthy";
  const statusClass = running ? "running" : !lastSession ? "idle" : degraded ? "degraded" : "completed";
  return <>
    <section className="exploration-strategy" aria-label="Search strategy">
      <div className="exploration-section-heading"><div><SectionEyebrow>How {presence.name} is searching</SectionEyebrow><h3>{presence.channel === "x" ? "X public discovery" : channelLabel(presence.channel, state.channelDefinitions)} <span className="exploration-inline-status"><span className="status-dot" /> {sourceStatus}</span></h3></div><span>{directions.length} active direction{directions.length === 1 ? "" : "s"}</span></div>
      <p>Genny is translating the durable Exploration brief into temporary search directions. The brief stays yours; the strategy can adapt as the territory becomes clearer.</p>
      <ul className="exploration-direction-list">{directions.slice(0, 3).map((direction) => <li key={direction}>{direction}</li>)}</ul>
      <details className="exploration-disclosure"><summary>View search strategy</summary><div className="exploration-disclosure-body"><div><span>Looking for</span><ul>{directions.map((direction) => <li key={direction}>{direction}</li>)}</ul></div><div><span>Avoiding</span><ul>{exclusions.map((item) => <li key={item}>{item}</li>)}</ul></div><div><span>Discovery coverage</span><ul><li className="is-available">{mirrorCount ? "✓" : "—"} Existing Social Mirror</li><li className={connection ? "is-available" : "is-unavailable"}>{connection ? "✓" : "—"} X public search</li><li className={plan?.surfaces.includes("thread_hydration") ? "is-available" : "is-unavailable"}>{plan?.surfaces.includes("thread_hydration") ? "✓" : "—"} Thread context</li></ul></div><div><span>Current X query</span><code>{xQuery || "No X query recorded for this run"}</code></div><small>{strategyProvenance} from Exploration revision {exploration.revision}. Queries may change as the strategy adapts; refine the Exploration when the meaning is wrong.</small></div></details>
    </section>
    <section className="exploration-latest-look" aria-label="Latest look">
      <div className="exploration-section-heading"><div><SectionEyebrow>Latest look</SectionEyebrow><h3>{lastSession ? formatTime(lastSession.startedAt) : "Not started"}</h3></div><span className={`exploration-look-status is-${statusClass}`}><span className="status-dot" /> {statusLabel}</span></div>
      <div className="exploration-look-metrics"><div><strong>{lastSession?.candidatesSeen ?? 0}</strong><span>{xSearch ? "public results" : "objects available"}</span></div><div><strong>{lastSession?.findingsCreated ?? 0}</strong><span>worthwhile</span></div></div>
      <p className={degraded ? "exploration-look-problem" : ""}>{lookNarrative}</p>
      {degraded && <div className="exploration-look-alert"><CircleAlert size={15} /><span>{lastSession?.failureReason || "Discovery needs attention."}</span></div>}
      <div className="exploration-look-actions">{degraded && exploration.status === "active" && <Button variant="primary" disabled={retrying} onClick={() => void retry()}>{retrying ? "Retrying…" : "Retry now"}</Button>}<details className="exploration-disclosure exploration-run-details"><summary>View run details</summary><div className="exploration-disclosure-body"><dl><div><dt>Run ID</dt><dd>{lastSession?.id ?? "No run yet"}</dd></div><div><dt>Source</dt><dd>{lastSession ? explorationDiscoveryLabel(lastSession.discoverySource, presence) : "Not started"}</dd></div><div><dt>Query</dt><dd>{xQuery || "Not recorded for this run"}</dd></div><div><dt>Pipeline</dt><dd>{lastSession ? `${lastSession.candidatesSeen} considered · ${lastSession.candidatesHydrated} triaged · ${lastSession.findingsCreated} worthwhile` : "No pipeline activity yet"}</dd></div></dl>{lastSession?.completedAt && <small>Completed {formatTime(lastSession.completedAt)}. Provider credentials and raw responses remain outside the Agent view.</small>}</div></details></div>
    </section>
    <section className="exploration-audit" aria-label="Exploration audit">
      <details className="exploration-disclosure"><summary>Evidence inspected <span>{artifacts.length || lastSession?.candidatesSeen || 0} public object{(artifacts.length || lastSession?.candidatesSeen || 0) === 1 ? "" : "s"}</span></summary><div className="exploration-disclosure-body"><p className="muted">{degraded && xSearch ? "These objects were already available in the Social Mirror; no new X results were attributed to this failed attempt." : "Raw Social Mirror evidence is retained for inspection but is not the primary outcome of an Exploration."}</p>{artifacts.length ? <div className="exploration-artifact-list">{artifacts.slice(0, 3).map((object) => { const externalUrl = externalUrlForMirrorObject(object, object.author?.handle); return <article className="exploration-artifact" key={object.id}><div><strong>{object.author?.handle ? `@${object.author.handle}` : object.author?.displayName ?? "X account"}</strong><p>{object.content?.text || "[No text returned]"}</p><small>{channelLabel(object.channelId)} post · {object.externalRef.id}</small></div>{externalUrl && <a href={externalUrl} target="_blank" rel="noreferrer" aria-label={`Open ${channelLabel(object.channelId)} artifact ${object.externalRef.id}`}><ArrowUpRight size={14} /></a>}</article>; })}</div> : <p className="muted">No evidence was attributed to this run.</p>}<small>{artifacts.length > 3 ? `${artifacts.length - 3} more objects available in the Social Mirror.` : ""}</small></div></details>
      <details className="exploration-disclosure"><summary>Run history <span>{sessions.length} recorded</span></summary><div className="exploration-disclosure-body"><div className="exploration-history-list">{sessions.slice(0, 5).map((session) => <div className="exploration-history-row" key={session.id}><span className={`exploration-history-dot exploration-history-${session.status}`} /><span><strong>{session.discoverySource === "native" ? "X search" : "Mirror review"} · {session.status === "completed" ? "completed" : session.status === "degraded" ? "degraded" : session.status}</strong><small>{formatTime(session.startedAt)} · {session.candidatesSeen} considered · {session.findingsCreated} worthwhile</small></span><ChevronRight size={14} /></div>)}</div></div></details>
    </section>
  </>;
}

function KnowledgeChoiceNotice({ role, use, useLabel = "Default use" }: { role: "reference" | "procedure" | "inherit"; use: KnowledgeUse | "inherit"; useLabel?: string }) {
  const roleName = role === "procedure" ? "Procedure" : role === "reference" ? "Reference" : "Inherit collection";
  const roleDescription = role === "procedure"
    ? "task-specific source material for relevant work; it is not a reusable Skill."
    : role === "reference"
      ? "background facts and context the Agent can draw on."
      : "uses the collection's role for this item."
  const useName = use === "public" ? "Public" : use === "internal" ? "Internal" : use === "none" ? "Not available" : "Inherit collection";
  const useDescription = use === "public"
    ? "eligible as public evidence, subject to Presence access limits."
    : use === "internal"
      ? "available for internal reasoning, but excluded from public expression."
      : use === "none"
        ? "not available to the Presence for retrieval."
        : "uses the collection's default availability for this item."
  return <div className="knowledge-choice-notice" role="status" aria-live="polite" aria-atomic="true">
    <div className="knowledge-choice-notice-heading"><Info size={14} aria-hidden="true" /><strong>What this choice means</strong></div>
    <div className="knowledge-choice-notice-grid">
      <div><span>Role</span><p><strong>{roleName}</strong> — {roleDescription}</p></div>
      <div><span>{useLabel}</span><p><strong>{useName}</strong> — {useDescription}</p></div>
    </div>
  </div>;
}

function KnowledgeView({ state, mutate, refreshState }: { state: OpenPresenceState; mutate: Mutate; refreshState: () => Promise<OpenPresenceState> }) {
  const agent = state.agent;
  const presence = state.presence;
  const collections = state.knowledgeCollections.filter((collection) => collection.agentId === agent?.id && collection.status === "active");
  const [collectionMode, setCollectionMode] = useState<"list" | "new" | "detail">("list");
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionDescription, setNewCollectionDescription] = useState("");
  const [newCollectionRole, setNewCollectionRole] = useState<"reference" | "procedure">("reference");
  const [newCollectionUse, setNewCollectionUse] = useState<KnowledgeUse>("internal");
  const [editCollectionName, setEditCollectionName] = useState("");
  const [editCollectionDescription, setEditCollectionDescription] = useState("");
  const [editCollectionRole, setEditCollectionRole] = useState<"reference" | "procedure">("reference");
  const [editCollectionUse, setEditCollectionUse] = useState<KnowledgeUse>("internal");
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [itemTitle, setItemTitle] = useState("");
  const [itemRole, setItemRole] = useState<"reference" | "procedure" | "inherit">("inherit");
  const [itemUse, setItemUse] = useState<KnowledgeUse | "inherit">("inherit");
  const [itemContent, setItemContent] = useState("");
  const [itemSourceType, setItemSourceType] = useState<"pasted_text" | "markdown">("pasted_text");
  const [originalDataUrl, setOriginalDataUrl] = useState<string | undefined>();
  const [originalFileName, setOriginalFileName] = useState<string | undefined>();
  const [versionItemId, setVersionItemId] = useState<string | null>(null);
  const [versionContent, setVersionContent] = useState("");
  const [query, setQuery] = useState("");
  const [retrieval, setRetrieval] = useState<{ results: Array<{ itemTitle: string; excerpt: string; effectiveUse: KnowledgeUse; headingPath?: string[]; pageNumber?: number; textRange?: { start: number; end: number }; collectionName: string; versionNumber: number; segmentId: string }>; missingEvidence?: string[]; staleWarnings?: string[]; unresolvedConflicts?: string[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const selectedCollection = collections.find((collection) => collection.id === selectedCollectionId);
  const selectedItems = state.knowledgeItems.filter((item) => item.collectionId === selectedCollection?.id && item.status === "active");
  const retrievalRuns = state.knowledgeRetrievalRuns.filter((run) => run.agentId === agent?.id).slice(0, 8);

  const openCollection = (collectionId: string) => {
    const collection = collections.find((candidate) => candidate.id === collectionId);
    if (!collection) return;
    setSelectedCollectionId(collection.id);
    setEditCollectionName(collection.name);
    setEditCollectionDescription(collection.description ?? "");
    setEditCollectionRole(collection.defaultRole);
    setEditCollectionUse(collection.defaultUse);
    setVersionItemId(null);
    setItemFormOpen(false);
    setCollectionMode("detail");
  };
  const startNewCollection = () => {
    setSelectedCollectionId(null);
    setNewCollectionName("");
    setNewCollectionDescription("");
    setNewCollectionRole("reference");
    setNewCollectionUse("internal");
    setCollectionMode("new");
  };
  const closeCollectionWorkspace = () => {
    setSelectedCollectionId(null);
    setItemFormOpen(false);
    setVersionItemId(null);
    setCollectionMode("list");
  };

  const createCollection = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newCollectionName.trim()) return;
    setBusy("collection");
    const next = await mutate({ type: "createKnowledgeCollection", name: newCollectionName, description: newCollectionDescription, defaultRole: newCollectionRole, defaultUse: newCollectionUse });
    if (next) {
      const created = next.knowledgeCollections.find((collection) => !collections.some((existing) => existing.id === collection.id));
      if (created) {
        setSelectedCollectionId(created.id);
        setEditCollectionName(created.name);
        setEditCollectionDescription(created.description ?? "");
        setEditCollectionRole(created.defaultRole);
        setEditCollectionUse(created.defaultUse);
        setCollectionMode("detail");
      } else {
        closeCollectionWorkspace();
      }
    }
    setBusy(null);
  };
  const saveCollection = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCollection || !editCollectionName.trim()) return;
    setBusy("collection-edit");
    await mutate({ type: "updateKnowledgeCollection", collectionId: selectedCollection.id, name: editCollectionName, description: editCollectionDescription, defaultRole: editCollectionRole, defaultUse: editCollectionUse });
    setBusy(null);
  };
  const addItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCollection || !itemTitle.trim() || !itemContent.trim()) return;
    setBusy("item");
    const next = await mutate({ type: "addKnowledgeItem", collectionId: selectedCollection.id, title: itemTitle, role: itemRole === "inherit" ? undefined : itemRole, useOverride: itemUse === "inherit" ? undefined : itemUse, sourceType: itemSourceType, content: itemContent, mimeType: itemSourceType === "markdown" ? "text/markdown" : "text/plain", originalDataUrl, originalFileName });
    if (next) {
      setItemTitle("");
      setItemContent("");
      setOriginalDataUrl(undefined);
      setOriginalFileName(undefined);
      setItemFormOpen(false);
    }
    setBusy(null);
  };
  const addVersion = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!versionItemId || !versionContent.trim()) return;
    setBusy("version");
    const next = await mutate({ type: "uploadKnowledgeVersion", itemId: versionItemId, content: versionContent, mimeType: "text/markdown" });
    if (next) {
      setVersionItemId(null);
      setVersionContent("");
    }
    setBusy(null);
  };
  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("Could not preserve the original file."));
      reader.readAsDataURL(file);
    });
    setItemTitle(file.name.replace(/\.(md|markdown|txt)$/i, ""));
    setItemContent(text);
    setItemSourceType(/\.md$|\.markdown$/i.test(file.name) ? "markdown" : "pasted_text");
    setOriginalDataUrl(dataUrl);
    setOriginalFileName(file.name);
  };
  const runRetrieval = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim() || !presence) return;
    setBusy("retrieval");
    try {
      const response = await fetch("/api/knowledge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "search", query, purpose: "operator_chat" }) });
      const payload = await response.json() as { packet?: typeof retrieval; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Knowledge retrieval failed.");
      setRetrieval(payload.packet ?? null);
      await refreshState();
    } catch (error) {
      setRetrieval({ results: [], missingEvidence: [error instanceof Error ? error.message : "Knowledge retrieval failed."] });
    } finally {
      setBusy(null);
    }
  };
  if (!agent) return <div className="page"><EmptyState title="Create an Agent first" body="Knowledge belongs to an Agent and is available to its Presences through explicit bindings." /></div>;
  return <div className="page knowledge-page">
    <PageHeader
      className="knowledge-page-heading"
      eyebrow="Agent-owned source material"
      title="Knowledge"
      description="Keep durable reference and procedure material versioned, scoped, and inspectable before it reaches cognition."
      actionsClassName="knowledge-heading-actions"
      actions={<>
        <div className="knowledge-page-meta"><span>{collections.length} collections</span><span>{state.knowledgeItems.filter((item) => item.status === "active").length} active items</span></div>
        <Button type="button" variant="primary" onClick={startNewCollection}><Plus size={14} /> New collection</Button>
      </>}
    />
    <div className="knowledge-workspace">
      <main className="knowledge-primary" aria-live="polite">
        {collectionMode === "list" && <section className="knowledge-collection-browser" aria-labelledby="knowledge-collections-title">
          <div className="knowledge-section-heading"><div><SectionEyebrow>Agent-owned</SectionEyebrow><h2 id="knowledge-collections-title">Collections</h2><p className="muted">Choose a collection to inspect its source material and defaults.</p></div><BookOpen size={18} /></div>
          <div className="knowledge-collection-list">
            {collections.map((collection) => <button type="button" className="knowledge-collection-row" key={collection.id} onClick={() => openCollection(collection.id)}><span><strong>{collection.name}</strong><small>{collection.description || "No description yet"}</small><em>{collection.defaultRole === "procedure" ? "Procedure" : "Reference"} · {collection.defaultUse} · {state.knowledgeItems.filter((item) => item.collectionId === collection.id && item.status === "active").length} items</em></span><ChevronRight size={17} /></button>)}
            {!collections.length && <div className="knowledge-empty-state"><FileText size={22} /><strong>No collections yet</strong><p>Create one to give durable source material a clear home.</p><Button type="button" variant="primary" onClick={startNewCollection}><Plus size={14} /> New collection</Button></div>}
          </div>
        </section>}

        {collectionMode === "new" && <section className="knowledge-focused-panel" aria-labelledby="knowledge-new-title">
          <div className="knowledge-detail-toolbar"><Button type="button" variant="ghost" onClick={closeCollectionWorkspace}><X size={15} /> All collections</Button><span>New collection</span></div>
          <div className="knowledge-focused-heading"><div><SectionEyebrow>New collection</SectionEyebrow><h2 id="knowledge-new-title">Give source material a home</h2><p className="muted">Set the defaults once. You can adjust them later from the collection.</p></div><BookOpen size={20} /></div>
          <form className="knowledge-collection-form" onSubmit={(event) => void createCollection(event)}>
            <label>Name<input aria-label="Collection name" value={newCollectionName} onChange={(event) => setNewCollectionName(event.target.value)} placeholder="Operating principles" autoFocus /></label>
            <label>Description<span className="form-hint">A short note helps you recognize the collection later.</span><textarea aria-label="Collection description" value={newCollectionDescription} onChange={(event) => setNewCollectionDescription(event.target.value)} rows={4} placeholder="What belongs here?" /></label>
            <div className="knowledge-form-grid"><label>Role<select value={newCollectionRole} onChange={(event) => setNewCollectionRole(event.target.value as "reference" | "procedure")}><option value="reference">Reference</option><option value="procedure">Procedure</option></select></label><label>Default use<select value={newCollectionUse} onChange={(event) => setNewCollectionUse(event.target.value as KnowledgeUse)}><option value="none">Not available</option><option value="internal">Internal</option><option value="public">Public</option></select></label></div>
            <KnowledgeChoiceNotice role={newCollectionRole} use={newCollectionUse} />
            <div className="knowledge-form-actions"><Button type="button" variant="secondary" onClick={closeCollectionWorkspace}>Cancel</Button><Button type="submit" variant="primary" disabled={busy === "collection" || !newCollectionName.trim()}><Plus size={14} /> {busy === "collection" ? "Creating…" : "Create collection"}</Button></div>
          </form>
        </section>}

        {collectionMode === "detail" && selectedCollection && <section className="knowledge-focused-panel" aria-labelledby="knowledge-detail-title">
          <div className="knowledge-detail-toolbar"><Button type="button" variant="ghost" onClick={closeCollectionWorkspace}><X size={15} /> All collections</Button><span>Collection details</span></div>
          <div className="knowledge-focused-heading"><div><SectionEyebrow>Collection</SectionEyebrow><h2 id="knowledge-detail-title">{selectedCollection.name}</h2><p className="muted">{selectedCollection.description || "No description added yet."}</p></div><BookOpen size={20} /></div>
          <form className="knowledge-collection-form knowledge-collection-edit-form" onSubmit={(event) => void saveCollection(event)}>
            <div className="knowledge-form-heading"><div><h3>Collection details</h3><p className="form-hint">These defaults apply to new items. Existing items keep their own version history.</p></div><Button type="submit" variant="secondary" disabled={busy === "collection-edit" || !editCollectionName.trim()}>{busy === "collection-edit" ? "Saving…" : "Save changes"}</Button></div>
            <label>Name<input aria-label="Collection name" value={editCollectionName} onChange={(event) => setEditCollectionName(event.target.value)} /></label>
            <label>Description<textarea aria-label="Collection description" value={editCollectionDescription} onChange={(event) => setEditCollectionDescription(event.target.value)} rows={3} placeholder="What belongs here?" /></label>
            <div className="knowledge-form-grid"><label>Role<select value={editCollectionRole} onChange={(event) => setEditCollectionRole(event.target.value as "reference" | "procedure")}><option value="reference">Reference</option><option value="procedure">Procedure</option></select></label><label>Default use<select value={editCollectionUse} onChange={(event) => setEditCollectionUse(event.target.value as KnowledgeUse)}><option value="none">Not available</option><option value="internal">Internal</option><option value="public">Public</option></select></label></div>
            <KnowledgeChoiceNotice role={editCollectionRole} use={editCollectionUse} />
          </form>
          <section className="knowledge-source-section" aria-labelledby="knowledge-items-title">
            <div className="knowledge-form-heading"><div><SectionEyebrow>Source material</SectionEyebrow><h3 id="knowledge-items-title">Items and versions</h3><p className="form-hint">Keep each source inspectable and versioned.</p></div><Button type="button" variant="secondary" onClick={() => setItemFormOpen(!itemFormOpen)}>{itemFormOpen ? <><X size={14} /> Close</> : <><Plus size={14} /> Add source</>}</Button></div>
            <div className="knowledge-item-list">
              {selectedItems.map((item) => {
                const versions = state.knowledgeVersions.filter((version) => version.itemId === item.id).sort((a, b) => b.versionNumber - a.versionNumber);
                const current = versions.find((version) => version.id === item.currentVersionId);
                return <article className="knowledge-item" key={item.id}><div className="knowledge-item-heading"><div><strong>{item.title}</strong><small>{item.role === "procedure" ? "Procedure" : "Reference"} · {item.useOverride ? `item override: ${item.useOverride}` : "inherits collection use"}</small></div><Button type="button" variant="ghost" onClick={() => setVersionItemId(versionItemId === item.id ? null : item.id)}><Plus size={13} /> New version</Button></div><p>{current?.normalizedContent.slice(0, 220)}{(current?.normalizedContent.length ?? 0) > 220 ? "…" : ""}</p><div className="knowledge-version-history"><span>Current v{current?.versionNumber ?? "—"} · {versions.length} immutable {versions.length === 1 ? "version" : "versions"}</span><details><summary>Version history</summary>{versions.map((version) => <small key={version.id}>v{version.versionNumber} · {version.parseStatus} · {version.contentHash}</small>)}</details></div>{versionItemId === item.id && <form className="knowledge-version-form" onSubmit={(event) => void addVersion(event)}><textarea aria-label={`New version content for ${item.title}`} value={versionContent} onChange={(event) => setVersionContent(event.target.value)} rows={4} placeholder="Paste the revised source material…" /><Button type="submit" variant="secondary" disabled={busy === "version" || !versionContent.trim()}>{busy === "version" ? "Saving…" : "Save immutable version"}</Button></form>}</article>;
              })}
              {!selectedItems.length && <div className="knowledge-empty-state knowledge-empty-items"><FileText size={20} /><strong>No source items yet</strong><p>Add a file or paste text to begin building this collection.</p></div>}
            </div>
            {itemFormOpen && <form className="knowledge-form knowledge-add-form" onSubmit={(event) => void addItem(event)}>
              <div className="knowledge-form-heading"><div><SectionEyebrow>Manual ingestion</SectionEyebrow><h3>Add source material</h3></div></div>
              <div className="knowledge-form-grid"><label>Title<input aria-label="Knowledge item title" value={itemTitle} onChange={(event) => setItemTitle(event.target.value)} placeholder="Audience principles" /></label><label>Source file<input type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" onChange={(event) => void handleFile(event.target.files?.[0])} /></label></div>
              <div className="knowledge-form-grid"><label>Role<select value={itemRole} onChange={(event) => setItemRole(event.target.value as "reference" | "procedure" | "inherit")}><option value="inherit">Inherit collection</option><option value="reference">Reference</option><option value="procedure">Procedure</option></select></label><label>Use override<select value={itemUse} onChange={(event) => setItemUse(event.target.value as KnowledgeUse | "inherit")}><option value="inherit">Inherit collection</option><option value="none">Not available</option><option value="internal">Internal</option><option value="public">Public</option></select></label></div>
              <KnowledgeChoiceNotice role={itemRole} use={itemUse} useLabel="Use override" />
              <label>Paste text or Markdown<textarea aria-label="Knowledge content" value={itemContent} onChange={(event) => setItemContent(event.target.value)} rows={7} placeholder="# Heading\n\nPaste the source material here. Headings and semantic blocks are preserved for retrieval." /></label>
              {originalFileName && <small className="form-hint">Original file preserved: {originalFileName}</small>}
              <div className="knowledge-form-actions"><Button type="button" variant="secondary" onClick={() => setItemFormOpen(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={busy === "item" || !itemTitle.trim() || !itemContent.trim()}><Plus size={14} /> {busy === "item" ? "Indexing…" : "Add Knowledge item"}</Button></div>
            </form>}
          </section>
        </section>}
      </main>
      <aside className="knowledge-tools-sidebar" aria-label="Knowledge tools">
        <section className="knowledge-tool-card" aria-labelledby="knowledge-retrieval-title">
          <div className="knowledge-section-heading"><div><SectionEyebrow>Operator-visible</SectionEyebrow><h2 id="knowledge-retrieval-title">Check access</h2><p className="muted">See what the active Presence can retrieve.</p></div><Activity size={18} /></div>
          <form className="knowledge-retrieval-form" onSubmit={(event) => void runRetrieval(event)}><input aria-label="Knowledge retrieval query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask what it can know…" /><Button type="submit" variant="secondary" disabled={busy === "retrieval" || !query.trim()}>{busy === "retrieval" ? "Searching…" : "Search"}</Button></form>
          {retrieval && <div className="knowledge-results" role="status"><div className="knowledge-result-summary">{retrieval.results.length ? `${retrieval.results.length} passage${retrieval.results.length === 1 ? "" : "s"} retrieved` : "No matching accessible passage"}</div>{retrieval.results.map((result) => <article className="knowledge-result" key={result.segmentId}><div><strong>{result.itemTitle}</strong><small>{result.collectionName} · v{result.versionNumber} · {result.effectiveUse} · {result.headingPath?.join(" / ") ?? "Source passage"}</small></div><p>{result.excerpt}</p><small>Provenance: segment {result.segmentId} · characters {result.textRange?.start ?? "—"}–{result.textRange?.end ?? "—"}{result.pageNumber ? ` · page ${result.pageNumber}` : ""}</small></article>)}{[...(retrieval.missingEvidence ?? []), ...(retrieval.unresolvedConflicts ?? []), ...(retrieval.staleWarnings ?? [])].map((warning) => <p className="form-hint" key={warning}>{warning}</p>)}</div>}
        </section>
        <section className="knowledge-tool-card knowledge-audit-sidebar" aria-labelledby="knowledge-history-title"><div className="knowledge-section-heading"><div><SectionEyebrow>Audit trail</SectionEyebrow><h2 id="knowledge-history-title">Recent retrievals</h2><p className="muted">A quiet record of what was actually made available.</p></div><ShieldCheck size={18} /></div>{retrievalRuns.map((run) => <div className="knowledge-history-row" key={run.id}><span><strong>{run.purpose}</strong><small>{run.query}</small></span><span>{run.selectedSegmentIds.length} selected · {new Date(run.createdAt).toLocaleString()}</span></div>)}{!retrievalRuns.length && <p className="muted">Retrieval history will appear here after a Knowledge check or Agent read.</p>}</section>
      </aside>
    </div>
  </div>;
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
      <PageHeader
        className="teach-heading"
        eyebrow="Agent teaching"
        title="Teach the Agent through conversation."
        description={<>Tell {agent.name} what to notice, protect, pursue, or leave alone. This transcript stays with {agent.name}; durable meaning belongs in Brain.</>}
      />
      <div
        className={`chat-layout ${contextOpen ? "context-open" : "context-collapsed"}`}
      >
        <section className="chat-thread">
          <div className="chat-history">
            {messages.length === 0 && !pendingMessage ? (
              <div className="chat-blank">
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
      <PageHeader
        className="chat-heading"
        eyebrow={messages.length ? "Working conversation" : "Conversation as configuration"}
        title={messages.length ? (conversation?.title ?? `Conversation with ${agent.name}`) : `Talk to ${agent.name}.`}
        description={messages.length ? `${agent.name} · ${model?.model ?? "Default model"} · Agent-wide context` : "Start a conversation. Shape its personality, mission, taste, and way of showing up."}
        actionsClassName="heading-actions"
        actions={<>
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
        </>}
      />
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
  const [composerMode, setComposerMode] = useState<"post" | "reply">("post");
  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const presence = state.presence ?? state.presences[0]!;
  const session = state.presenceChatSessions.find((item) => item.presenceId === presence.id);
  const messages = session?.messages ?? [];
  const replyTarget = messages.find((item) => item.id === replyToMessageId);
  const canReply = messages.some((item) => item.role === "user");
  useEffect(() => {
    if (!session) void mutate({ type: "newPresenceChatSession", presenceId: presence.id });
  }, [mutate, presence.id, session]);
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [session?.id, messages.length, pendingMessage, sending]);
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
      const next = await mutate({ type: "sendPresenceChatMessage", presenceId: presence.id, sessionId: session.id, content: outgoing, attachments, replyToMessageId: composerMode === "reply" ? replyToMessageId ?? undefined : undefined });
      if (!next) setPendingMessage(null);
    } finally {
      setSending(false);
      setPendingMessage(null);
      setComposerMode("post");
      setReplyToMessageId(null);
      sendingRef.current = false;
    }
  };
  return (
    <div className="page page-chat">
      <PageHeader
        className="chat-heading"
        eyebrow={<>Chat · {channelLabel(presence.channel, state.channelDefinitions)}</>}
        title={<>See {presence.name} in the feed.</>}
        description="Add a post to the scene, or choose Reply on a post to continue its thread. Nothing publishes or changes the Agent during this rehearsal."
      />
      <div className="chat-layout">
        <section className="chat-thread">
          <div className="chat-history">
            {messages.length === 0 && !pendingMessage ? (
              <div className="chat-blank">
                <div className="blank-suggestions">
                  <button onClick={() => setMessage("I just shipped a small tool and learned more from the edge cases than the happy path.")}>Share a field note</button>
                  <button onClick={() => setMessage("What do you think about building an audience before building a product?")}>Ask a real question</button>
                  <button onClick={() => setMessage("I disagree. Consistency matters more than originality.")}>Push back</button>
                </div>
              </div>
            ) : (
              messages.map((item) => {
                const target = item.replyToMessageId ? messages.find((message) => message.id === item.replyToMessageId) : undefined;
                return <article key={item.id} className={`social-card presence-chat-card ${item.role === "presence" ? "agent-authored thread-reply-card" : ""}`}>
                  <div className="social-card-meta">
                    {item.role === "presence" ? <PresenceGlyph accent={presence.accent} /> : <span className="actor-avatar">{initials("You")}</span>}
                    <span>
                      <strong>{item.role === "presence" ? presence.name : "You"}</strong>
                      <small>{item.role === "presence" ? `${presence.handle} · Reply` : `@you · ${item.replyToMessageId ? "Reply" : "Post"}`}</small>
                    </span>
                    <time>{formatTime(item.timestamp)}</time>
                  </div>
                  <small className="thread-context">{item.role === "presence" ? `↳ Replying to the post above` : target ? "↳ Replying to a post" : `Posted to ${channelLabel(presence.channel, state.channelDefinitions)}`}</small>
                  {target && <div className="presence-chat-reply-context"><span>Replying to</span><p>{target.content}</p></div>}
                  <p>{item.content}</p>
                  {item.attachments?.map((attachment) => (
                    <div className="presence-chat-attachment" key={attachment.id}>
                      {attachment.dataUrl && attachment.kind === "video" ? <video className="presence-chat-attachment-video" controls playsInline preload="metadata" src={attachment.dataUrl} aria-label="Attached video" /> : attachment.dataUrl && attachment.kind !== "document" ? <Image unoptimized width={180} height={110} src={attachment.dataUrl} alt={`Attached ${attachment.kind}`} /> : <span className="social-link-asset">{attachment.sourceUrl ?? attachment.name}</span>}
                      <details>
                        <summary>What {presence.name} sees</summary>
                        <p>{attachment.perception?.observation ?? "Not inspected. The Presence must not infer this asset's contents."}</p>
                        <small>Uncertainty: {attachment.perception?.uncertainty ?? "insufficient"}{attachment.perception?.missingContext?.length ? ` · ${attachment.perception.missingContext.join(" ")}` : ""}</small>
                      </details>
                    </div>
                  ))}
                  {item.role === "user" && <button type="button" className="presence-chat-reply-action" onClick={() => { setComposerMode("reply"); setReplyToMessageId(item.id); }} disabled={sending} aria-label="Reply to this post" title={`Reply to: ${item.content}`}><Reply size={13} /> Reply to this post</button>}
                </article>;
              })
            )}
            {pendingMessage && (
              <>
                <article className="social-card presence-chat-card optimistic-message">
                  <div className="social-card-meta">
                    <span className="actor-avatar">{initials("You")}</span>
                    <span><strong>You</strong><small>@you · {composerMode === "reply" ? "Reply" : "Post"}</small></span>
                    <time>{formatTime(new Date().toISOString())}</time>
                  </div>
                  <small className="thread-context">{composerMode === "reply" && replyTarget ? "↳ Replying to a post" : `Posted to ${channelLabel(presence.channel, state.channelDefinitions)}`}</small>
                  {composerMode === "reply" && replyTarget && <div className="presence-chat-reply-context"><span>Replying to</span><p>{replyTarget.content}</p></div>}
                  <p>{pendingMessage}</p>
                </article>
                {sending && <ChatThinkingMessage name={presence.name} accent={presence.accent} feed />}
              </>
            )}
            <div ref={historyEndRef} aria-hidden="true" className="chat-history-end" />
          </div>
          <div className="presence-chat-compose-tools">
            <div className="presence-chat-mode" role="group" aria-label="Choose what to add to the rehearsal">
              <button type="button" className={composerMode === "post" ? "active" : ""} aria-pressed={composerMode === "post"} onClick={() => { setComposerMode("post"); setReplyToMessageId(null); }}>Post</button>
              <button type="button" className={composerMode === "reply" ? "active" : ""} aria-pressed={composerMode === "reply"} disabled={!canReply && composerMode !== "reply"} onClick={() => { if (canReply) setComposerMode("reply"); }}>Reply</button>
            </div>
            {composerMode === "reply" && replyTarget ? <div className="presence-chat-selected-reply"><div><span>Replying to</span><button type="button" aria-label="Clear reply target" onClick={() => { setComposerMode("post"); setReplyToMessageId(null); }}><X size={13} /></button></div><p>{replyTarget.content}</p></div> : composerMode === "reply" ? <div className="presence-chat-selected-reply empty"><span>Choose “Reply to this post” on a message above.</span></div> : null}
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
              aria-label={composerMode === "reply" ? `Reply for ${presence.name} to encounter` : `Post for ${presence.name} to encounter`}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={sending || !session}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder={sending ? `${presence.name} is considering the ${composerMode}…` : composerMode === "reply" ? `Write a reply for ${presence.name} to encounter…` : `Write a post for ${presence.name} to encounter…`}
              rows={3}
            />
            <button
              className="send-button"
              aria-label={composerMode === "reply" ? "Send reply" : "Send post"}
              type="submit"
            >
              {sending ? <LoaderCircle size={17} className="spin" /> : <Send size={17} />}
            </button>
          </form>
          <div className="presence-chat-link-row"><input aria-label="Link to inspect" placeholder="Paste a link to inspect" value={link} onChange={(event) => setLink(event.target.value)} /><button type="button" onClick={addLink} disabled={!link.trim() || attachments.length >= 4}>Add link</button></div>
          <div className="composer-hint">
            {composerMode === "reply" ? "Enter to reply" : "Enter to post"} <span>·</span> Shift + Enter for a new line <span>·</span> Choose Reply on a post above to continue its thread <span>·</span> Private rehearsal · nothing publishes or teaches the Agent
          </div>
        </section>
        <aside className="chat-aside context-panel presence-chat-aside">
          <SectionEyebrow>Feed context</SectionEyebrow>
          <h3>{presence.name} as encountered in public</h3>
          <p className="muted">{presence.brief.purpose}</p>
          <div className="presence-chat-boundary"><span className="status-dot" /> Private thread · not published</div>
          <small>{presence.name} is responding from the selected channel context, relationships, and perception when needed. Use Teach for durable changes.</small>
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
        <span><strong>{name}</strong><small>Replying</small></span>
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
  pendingOperation,
  setView,
}: {
  state: OpenPresenceState;
  mutate: Mutate;
  pendingOperation?: string | null;
  setView: (view: View) => void;
}) {
  const selected = state.presence;
  const presenceName = selected?.name ?? "this Presence";
  const paused = selected?.status === "paused";
  const waking = pendingOperation === "wakePresence";
  const checking = pendingOperation === "runPulse" || pendingOperation === "runAttentionWorker";
  const activity = deriveActivitySummary(state, selected?.id);
  const [selectedContext, setSelectedContext] = useState<MirrorObject | null>(null);
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [activityFocus, setActivityFocus] = useState<"selected" | "preparing" | null>(null);
  const [activityPage, setActivityPage] = useState(1);
  const [countdownNow, setCountdownNow] = useState<number>(() => Date.now());
  const presenceCopy = (text: string) => text.replaceAll("Jenny", presenceName).replaceAll(state.agent?.name ?? "Jenny", presenceName);
  const activityEnvironment: PresenceEnvironment = selected?.environment ?? "live";
  const nextObservationAt = activityEnvironment === "live"
    ? state.nativeConnections.find((connection) => connection.presenceId === selected?.id && connection.channelId === selected?.channel)?.observation?.nextObservationAt
    : undefined;
  const usesChromeExtensionRoute = selected?.connectionMode === "bridge";
  const activityBridge = usesChromeExtensionRoute && selected ? state.bridges.find((bridge) => bridge.presenceId === selected.id && bridge.state !== "offline") : undefined;
  const bridgeConnected = Boolean(activityBridge && bridgeAdapterStatus(activityBridge) === "connected");
  const bridgeNextCheckAt = bridgeConnected && activityBridge?.lastHeartbeatAt
    ? (() => {
        const heartbeatAt = new Date(activityBridge.lastHeartbeatAt).getTime();
        return Number.isFinite(heartbeatAt) ? new Date(heartbeatAt + 30_000).toISOString() : undefined;
      })()
    : undefined;
  const effectiveCapabilities = selected ? derivePresenceCapabilityManifest(state, selected.id) : undefined;
  const bridgeNeedsAttention = selected?.connectionMode === "bridge" && !bridgeConnected && Boolean(!activityBridge || effectiveCapabilities?.items.some((item) => item.requiresBrowser));
  const growthAssignment = selected ? state.assignments.find((item) => item.presenceId === selected.id && item.successEvidence?.metric === "followers" && item.status !== "cancelled") : undefined;
  const nextCheckAt = nextObservationAt ?? bridgeNextCheckAt;
  const nextCheckCountdown = formatCountdown(nextCheckAt, countdownNow);
  const nextCheckStatus = paused
    ? "Checks paused"
    : checking
      ? undefined
      : !nextObservationAt && selected?.connectionMode === "bridge" && !bridgeConnected
        ? undefined
      : nextCheckCountdown === "now"
        ? "Next check due now"
        : nextCheckCountdown
          ? `Next check in ${nextCheckCountdown}`
          : nextCheckAt
            ? "Next check scheduled"
            : "Next check not scheduled";
  useEffect(() => {
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
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
  const explorationFindingsForEvent = (item: OpenPresenceState["events"][number]) => {
    if (item.title !== "Exploration found something worth noticing") return [];
    const direct = item.sourceObjectId
      ? state.explorationFindings.filter((finding) => finding.presenceId === item.presenceId && finding.mirrorObjectId === item.sourceObjectId)
      : [];
    if (direct.length) return direct;
    const eventTime = new Date(item.time).getTime();
    const nearestSession = state.explorationSessions
      .filter((session) => session.presenceId === item.presenceId && session.status === "completed" && session.findingIds.length > 0 && Boolean(session.completedAt))
      .map((session) => ({ session, distance: Math.abs(new Date(session.completedAt!).getTime() - eventTime) }))
      .filter(({ distance }) => Number.isFinite(distance) && distance <= 30_000)
      .sort((left, right) => left.distance - right.distance)[0]?.session;
    return nearestSession
      ? nearestSession.findingIds.flatMap((findingId) => state.explorationFindings.find((finding) => finding.id === findingId) ?? [])
      : [];
  };
  const explorationFindingForEvent = (item: OpenPresenceState["events"][number]) => explorationFindingsForEvent(item)[0];
  const contextForEvent = (event: OpenPresenceState["events"][number]) => {
    const explicit = event.sourceObjectId
      ? state.mirrorObjects.find((item) => item.id === event.sourceObjectId)
      : undefined;
    const finding = explorationFindingForEvent(event);
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
      return objectForReference(intent?.target ?? execution?.target, event.sessionId)
        ?? (finding ? state.mirrorObjects.find((item) => item.id === finding.mirrorObjectId) : undefined);
    })();
    if (!source) return undefined;
    if (["like", "reaction", "repost"].includes(source.objectType) && source.parentExternalRef) {
      return objectForReference(source.parentExternalRef, source.sessionId) ?? source;
    }
    return source;
  };
  const executionForActivityEvent = (item: OpenPresenceState["events"][number]) => {
    const explicit = item.executionId
      ? state.executions.find((entry) => entry.id === item.executionId)
      : undefined;
    if (explicit || item.title !== "Pulse completed") return explicit;
    const itemTime = new Date(item.time).getTime();
    const nearbyDeliveryEvent = state.events
      .filter((entry) => entry.id !== item.id && entry.presenceId === item.presenceId && Boolean(entry.executionId))
      .map((entry) => ({ entry, distance: Math.abs(new Date(entry.time).getTime() - itemTime) }))
      .filter(({ distance }) => Number.isFinite(distance) && distance <= 10_000)
      .sort((left, right) => left.distance - right.distance)[0]?.entry;
    return nearbyDeliveryEvent?.executionId
      ? state.executions.find((entry) => entry.id === nearbyDeliveryEvent.executionId)
      : undefined;
  };
  const activityEventTone = (item: OpenPresenceState["events"][number]) => {
    const execution = executionForActivityEvent(item);
    return item.title === "Pulse completed" && (execution?.status === "failed" || execution?.status === "blocked") ? "warning" : item.tone;
  };
  const decisionForEvent = (item: OpenPresenceState["events"][number]) => {
    const direct = item.decisionId ? state.socialDecisions.find((entry) => entry.id === item.decisionId) : undefined;
    if (direct) return direct;
    const intent = item.intentId ? state.socialIntents.find((entry) => entry.id === item.intentId) : undefined;
    const execution = executionForActivityEvent(item);
    const linkedIntent = intent ?? (execution ? state.socialIntents.find((entry) => entry.id === execution.socialIntentId) : undefined);
    return state.socialDecisions.find((entry) => linkedIntent && entry.socialIntentId === linkedIntent.id)
      ?? state.socialDecisions.find((entry) => entry.presenceId === item.presenceId && Boolean(item.sourceObjectId && entry.focalMirrorObjectIds.includes(item.sourceObjectId)));
  };
  const publicationEvidenceForEvent = (item: OpenPresenceState["events"][number]) => {
    if (item.title !== "Publication performance observed") return undefined;
    return state.publicationMetricSnapshots
      .filter((snapshot) => snapshot.presenceId === item.presenceId && (!item.sourceObjectId || snapshot.mirrorObjectId === item.sourceObjectId))
      .sort((left, right) => new Date(right.observedAt).getTime() - new Date(left.observedAt).getTime())[0];
  };
  const decisionTraceForEvent = (item: OpenPresenceState["events"][number]) => {
    const intent = item.intentId ? state.socialIntents.find((entry) => entry.id === item.intentId) : undefined;
    const execution = executionForActivityEvent(item);
    const linkedIntent = intent ?? (execution
      ? state.socialIntents.find((entry) => entry.id === execution.socialIntentId)
      : undefined);
    const outcome = execution ? state.outcomes.find((entry) => entry.executionId === execution.id) : undefined;
    const actionRecord = linkedIntent ? state.actions.find((entry) => entry.socialIntentId === linkedIntent.id) : undefined;
    const standingIntent = linkedIntent?.standingIntentId ? state.standingIntents.find((entry) => entry.id === linkedIntent.standingIntentId) : undefined;
    const context = contextForEvent(item);
    const explorationFindings = explorationFindingsForEvent(item);
    const explorationFinding = explorationFindings[0];
    const observed = context?.content?.text
      ? `${context.author?.displayName ?? "Someone"} · “${context.content.text.slice(0, 150)}${context.content.text.length > 150 ? "…" : ""}”`
      : explorationFinding
        ? `Finding surfaced · ${explorationFinding.safeSummary}`
      : standingIntent
        ? `Standing intention · “${standingIntent.instruction.slice(0, 150)}${standingIntent.instruction.length > 150 ? "…" : ""}”`
        : item.title === "Pulse completed"
          ? "The Presence checked its current channel context."
          : item.title === "Social Mirror updated"
            ? "New channel context became available to the Presence."
            : "No linked world object was recorded for this event.";
    const isSilence = actionRecord?.intent === "no_op" || /held|silence|off/i.test(`${item.title} ${item.detail}`);
    const judgment = explorationFinding
      ? `Worthwhile because ${explorationFinding.whyItMayMatter}`
      : linkedIntent
      ? isSilence
        ? "Silence · no worthwhile action was selected"
        : `Selected ${formatActivityAffordance(linkedIntent.affordance)}${standingIntent ? " from the standing intention" : ""}`
      : item.type === "execution"
        ? "The selected Social Intent moved into delivery."
        : item.type === "system"
          ? "Observation recorded; no public action was selected yet."
          : item.detail;
    const delivery = explorationFinding
      ? item.detail.includes("No public action")
        ? "No public action created"
        : "No delivery selected"
      : execution
      ? `${execution.status.replaceAll("-", " ")} · ${execution.mode}${outcome ? ` · outcome ${outcome.status}` : ""}`
      : linkedIntent
        ? "No execution created"
        : "No delivery selected";
    return { observed, judgment, delivery, performance: item.title === "Publication performance observed" ? publicationEvidenceForEvent(item) ?? null : undefined };
  };
  const relevantExecution = state.executions
    .filter((item) => !selected?.id || (item.presenceId === selected.id && (activityEnvironment === "sandbox" ? item.environment === "sandbox" || (!item.environment && Boolean(item.sessionId && activitySessionIds.has(item.sessionId))) : item.environment !== "sandbox" && !item.sessionId)))
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .find((item) => ["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued", "claimed", "executing"].includes(item.status));
  const inFlightExecutions = state.executions
    .filter((item) => !selected?.id || (item.presenceId === selected.id && (activityEnvironment === "sandbox" ? item.environment === "sandbox" || (!item.environment && Boolean(item.sessionId && activitySessionIds.has(item.sessionId))) : item.environment !== "sandbox" && !item.sessionId)))
    .filter((item) => ["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued", "claimed", "executing"].includes(item.status))
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  const activityActionRecords = inFlightExecutions.map((execution) => {
    const intent = state.socialIntents.find((item) => item.id === execution.socialIntentId);
    const decision = state.socialDecisions.find((item) => item.socialIntentId === execution.socialIntentId);
    const context = objectForReference(execution.target, execution.sessionId);
    const relatedEvent = activityEvents.find((event) =>
      event.executionId === execution.id ||
      event.intentId === execution.socialIntentId ||
      event.decisionId === decision?.id ||
      event.sourceObjectId === context?.id,
    );
    const action = formatActivityAffordance(execution.affordance ?? intent?.affordance);
    const target = context?.author?.handle ?? context?.author?.displayName ?? (execution.target ? "the selected post" : "the selected context");
    const targetDisplay = context?.author?.handle && !context.author.handle.startsWith("@") ? `@${context.author.handle}` : target;
    return {
      execution,
      intent,
      decision,
      context,
      relatedEvent,
      action,
      targetDisplay,
      snippet: context?.content?.text?.trim(),
    };
  });
  const selectedActionRecords = activityActionRecords.filter((record) => Boolean(record.decision || record.intent));
  const preparingActionRecords = activityActionRecords;
  const focusedActionRecords = activityFocus === "selected" ? selectedActionRecords : preparingActionRecords;
  const focusedEventIds = new Set(focusedActionRecords.map((record) => record.relatedEvent?.id).filter(Boolean));
  const displayedActivityEvents = activityFocus
    ? activityEvents.filter((event) => focusedEventIds.has(event.id))
    : activityEvents;
  const activityPageCount = Math.max(1, Math.ceil(displayedActivityEvents.length / ACTIVITY_PAGE_SIZE));
  const visibleActivityPage = Math.min(activityPage, activityPageCount);
  const paginatedActivityEvents = displayedActivityEvents.slice(
    (visibleActivityPage - 1) * ACTIVITY_PAGE_SIZE,
    visibleActivityPage * ACTIVITY_PAGE_SIZE,
  );
  const openActivityFocus = (focus: "selected" | "preparing") => {
    setActivityFocus(focus);
    setActivityPage(1);
    window.requestAnimationFrame(() => document.getElementById("recent-activity")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const relevantIntent = relevantExecution ? state.socialIntents.find((item) => item.id === relevantExecution.socialIntentId) : undefined;
  const actionContext = relevantIntent?.target
    ? state.mirrorObjects.find((item) => isScopedMirror(item) && item.externalRef.id === relevantIntent.target?.id)
    : undefined;
  const actionName = formatActivityAffordance(relevantExecution?.affordance ?? relevantIntent?.affordance);
  const actionTarget = actionContext?.author?.handle ?? actionContext?.author?.displayName ?? "this post";
  const actionTargetDisplay = actionContext?.author?.handle && !actionContext.author.handle.startsWith("@") ? `@${actionContext.author.handle}` : actionTarget;
  const actionDescription = actionName.toLowerCase() === "reply" ? `Reply to ${actionTargetDisplay}` : `${actionName} ${actionTargetDisplay}`;
  const actionSnippet = actionContext?.content?.text?.trim();
  const latestMirrorUpdate = visibleEvents.find((item) => item.title === "Social Mirror updated");
  const latestPulse = visibleEvents.find((item) => item.title === "Pulse completed");
  const observationCounts = latestMirrorUpdate?.detail.match(/Observed\s+(\d+)\s+public posts?\s+and\s+(\d+)\s+inbound mentions?/i);
  const observedPostCount = observationCounts ? Number(observationCounts[1]) : undefined;
  const observedMentionCount = observationCounts ? Number(observationCounts[2]) : undefined;
  const latestFailedExecution = state.executions
    .filter((item) => !selected?.id || item.presenceId === selected.id)
    .filter((item) => ["failed", "blocked", "expired"].includes(item.status))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0];
  const currentFailedExecution = latestFailedExecution && (!latestPulse || new Date(latestFailedExecution.updatedAt).getTime() >= new Date(latestPulse.time).getTime()) ? latestFailedExecution : undefined;
  const latestFailure = currentFailedExecution ? deliveryFailureExplanation(currentFailedExecution.failure, selected?.handle) : undefined;
  const nowLabel = checking
    ? `Checking ${channelLabel(selected?.channel ?? "x", state.channelDefinitions)} now`
    : relevantExecution && actionContext
      ? actionDescription
      : latestFailure
        ? latestFailure.title
        : activity.current.label;
  const nowDetail = checking
    ? `Refreshing ${channelLabel(selected?.channel ?? "x", state.channelDefinitions)} context, then judging whether zero, one, or several public actions earn their place.`
    : relevantExecution && actionContext
      ? `${executionStatusLabel(relevantExecution.status)} · ${actionSnippet ? `“${actionSnippet.slice(0, 130)}${actionSnippet.length > 130 ? "…" : ""}”` : "The selected post is the source context."}`
      : latestFailure
        ? `${latestFailure.reason} ${latestFailure.consequence}`
        : latestPulse?.detail
          ? presenceCopy(latestPulse.detail)
        : presenceCopy(activity.current.detail);
  const judgedCount = selectedActionRecords.length || (latestPulse?.detail && /no public action|kept .* dormant|silence/i.test(latestPulse.detail) ? 0 : undefined);
  const actLabel = inFlightExecutions.length
    ? `${inFlightExecutions.length} preparing`
    : currentFailedExecution
      ? "Blocked"
      : state.executions.some((item) => item.presenceId === selected?.id && item.status === "succeeded")
        ? "Delivered"
        : "None";
  const verifyLabel = currentFailedExecution
    ? "Not verified"
    : inFlightExecutions.length
      ? "Pending"
      : state.outcomes.some((item) => item.presenceId === selected?.id && item.status === "succeeded")
        ? "Verified"
        : "None";
  const currentDetail = relevantExecution && actionContext
    ? relevantExecution.status === "awaiting-review"
      ? `${actionDescription} is ready for your review.`
      : `Preparing ${actionDescription.toLowerCase()}.`
    : activity.current.label === "Preparing to act"
      ? `${actionName} is moving toward delivery.`
      : presenceCopy(activity.current.detail).replace("execution envelope", "delivery");
  return (
    <div className="page activity-page">
      <PageHeader
        className="activity-heading"
        eyebrow="Activity"
        title={`${presenceName}, right now.`}
        description={`A clear view of what ${presenceName} has seen, decided, and done.`}
        actionsClassName="heading-actions"
        actions={<>
          {nextCheckStatus && <span className="next-check-countdown" aria-label={nextCheckStatus}>{nextCheckStatus}</span>}
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
        </>}
        />
      {selected && <section className="activity-now-panel" aria-label={`What ${presenceName} is doing now`}>
        <div className="activity-now-heading">
          <div>
            <SectionEyebrow>What {presenceName} is doing now</SectionEyebrow>
            <h2>{nowLabel}</h2>
            <p>{nowDetail}</p>
          </div>
          <div className="activity-now-meta">
            <span className={`live-pill ${paused ? "activity-pill-paused" : ""}`}><span className="status-dot" /> {paused ? "Paused" : checking ? "Running" : "Live"}</span>
            <small>{activity.lastPulseAt ? `Last check ${formatTime(activity.lastPulseAt)}` : "No check completed yet"}</small>
          </div>
        </div>
        <div className="activity-now-grid">
          <button type="button" className="activity-now-next" onClick={() => actionContext ? setSelectedContext(actionContext) : document.getElementById("decision-and-action")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
            <SectionEyebrow>Next public action</SectionEyebrow>
            <strong>{relevantExecution && actionContext ? actionDescription : currentFailedExecution ? "No action until delivery is fixed" : "No public action queued"}</strong>
            <span>{relevantExecution && actionContext ? "Open the source post or delivery state." : currentFailedExecution && latestFailure ? latestFailure.fix : "A check can end in silence. Nothing is sent unless the Presence selects an action and the connector can verify it."}</span>
            <em>{relevantExecution && actionContext ? "View action" : "Open decision & action"} <ArrowUpRight size={13} /></em>
          </button>
          <div className="activity-now-scope">
            <SectionEyebrow>Check scope</SectionEyebrow>
            <strong>Observe → judge → act → verify</strong>
            <span>Check now refreshes channel context and makes a judgment. It does not force a post; one check may create zero, one, or several actions.</span>
          </div>
        </div>
        <div className="activity-pipeline" aria-label="Autonomy pipeline">
          <button type="button" onClick={() => document.getElementById("observed-context")?.scrollIntoView({ behavior: "smooth", block: "start" })}><small>1 · OBSERVE</small><strong>{observedPostCount !== undefined ? `${observedPostCount} posts` : "Context"}</strong><span>{observedMentionCount !== undefined ? `${observedMentionCount} mentions` : "Latest channel read"}</span></button>
          <span className="activity-pipeline-arrow" aria-hidden="true">→</span>
          <button type="button" className={activityFocus === "selected" ? "activity-pipeline-focus" : undefined} aria-pressed={activityFocus === "selected"} onClick={() => openActivityFocus("selected")}><small>2 · JUDGE</small><strong>{judgedCount === undefined ? "Reviewing" : `${judgedCount} selected`}</strong><span>{judgedCount === 0 ? "No public action" : "See selected decisions"}</span></button>
          <span className="activity-pipeline-arrow" aria-hidden="true">→</span>
          <button type="button" className={activityFocus === "preparing" ? "activity-pipeline-focus" : undefined} aria-pressed={activityFocus === "preparing"} onClick={() => openActivityFocus("preparing")}><small>3 · ACT</small><strong>{actLabel}</strong><span>{inFlightExecutions.length > 1 ? "See the actions being prepared" : "See execution state"}</span></button>
          <span className="activity-pipeline-arrow" aria-hidden="true">→</span>
          <button type="button" onClick={() => document.getElementById("decision-and-action")?.scrollIntoView({ behavior: "smooth", block: "start" })}><small>4 · VERIFY</small><strong>{verifyLabel}</strong><span>Only confirmed results count</span></button>
        </div>
      </section>}
      {selected && <section className="activity-autonomy-strip" aria-label="Autonomy status"><div><SectionEyebrow>Autonomy</SectionEyebrow><strong>{growthAssignment ? `Working toward ${growthAssignment.successEvidence?.value.toLocaleString()} followers` : "No continuous growth responsibility"}</strong><span>{effectiveCapabilities?.bodyStatus === "ready" ? "Body ready" : effectiveCapabilities?.bodyStatus === "degraded" ? "Body degraded" : "Body unavailable"} · {effectiveCapabilities ? [...new Set(effectiveCapabilities.items.filter((item) => item.availability === "available" && item.provider).map((item) => item.provider))].join(" + ") || (selected.connectionMode === "sandbox" ? "Sandbox" : "No active provider") : "No active provider"} · {effectiveCapabilities?.items.find((item) => item.capability === "follower_measurement")?.availability === "available" ? "Follower observation available" : "Follower observation unavailable"}</span></div><Button variant="ghost" onClick={() => setView(growthAssignment ? "growth" : "schedule")}>{growthAssignment ? "Open Growth" : "Set growth responsibility"}</Button></section>}
      {bridgeNeedsAttention && (
        <div className="activity-connection-notice" role="status" aria-live="polite">
          <CircleAlert size={17} aria-hidden="true" />
          <div>
            <strong>Chrome connection needed</strong>
            <span>{activityBridge ? "The controlled Chrome tab is no longer connected." : "Connect the OpenPresence Chrome extension for this Presence."}</span>
          </div>
          <button type="button" className="activity-connection-notice-action" onClick={() => setView("presence")}>Open Settings</button>
        </div>
      )}
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
      {selected?.channel === "x" && <BringXPost state={state} mutate={mutate} presenceId={selected.id} presenceName={presenceName} />}
      <div className="activity-main-grid">
        <div className="activity-left-column">
          <MirrorPanel state={state} mutate={mutate} filter={selected?.id ?? "all"} channelId={selected?.channel} environment={activityEnvironment} sessionIds={activitySessionIds} onContext={setSelectedContext} />
          <section className="event-stream activity-log" id="recent-activity">
            <div className="section-heading">
              <div>
                <SectionEyebrow>Recent activity</SectionEyebrow>
                <h2>{activityFocus ? (activityFocus === "selected" ? "Selected decisions" : "Actions being prepared") : `What ${presenceName} decided`}</h2>
              </div>
              <span className="quiet-label">{paused ? "Presence asleep" : activityFocus ? `${focusedActionRecords.length} linked action${focusedActionRecords.length === 1 ? "" : "s"}` : `${activityEvents.length} recorded event${activityEvents.length === 1 ? "" : "s"}`}</span>
            </div>
            {activityFocus && (
              <section className={`activity-focus-panel activity-focus-${activityFocus}`} aria-live="polite" aria-label={activityFocus === "selected" ? "Selected decisions from the latest check" : "Actions being prepared from the latest check"}>
                <div className="activity-focus-heading">
                  <div>
                    <span className="activity-focus-kicker">{activityFocus === "selected" ? "JUDGE · SELECTED" : "ACT · PREPARING"}</span>
                    <strong>{focusedActionRecords.length} {activityFocus === "selected" ? "decision" : "action"}{focusedActionRecords.length === 1 ? "" : "s"} from this check</strong>
                    <p>{activityFocus === "selected" ? "These are the actions Genny selected after reviewing the observed context." : "These are the selected actions currently moving through the delivery envelope. Preparing does not mean delivered."}</p>
                  </div>
                  <button type="button" className="activity-focus-clear" onClick={() => { setActivityFocus(null); setActivityPage(1); }}>Show all activity</button>
                </div>
                {focusedActionRecords.length > 0 ? (
                  <div className="activity-focus-list">
                    {focusedActionRecords.map((record) => (
                      <article className="activity-focus-card" key={record.execution.id}>
                        <span className="activity-focus-marker" aria-hidden="true" />
                        <div className="activity-focus-card-copy">
                          <div className="activity-focus-card-meta">
                            <span className="activity-state-chip">{activityFocus === "selected" ? "Selected" : "Preparing"}</span>
                            <span>{record.action}</span>
                            <span>{activityFocus === "selected" ? executionStatusLabel(record.execution.status) : executionStatusLabel(record.execution.status)}</span>
                          </div>
                          <h3>{record.action} {record.targetDisplay}</h3>
                          {record.snippet && <p>“{record.snippet.slice(0, 180)}{record.snippet.length > 180 ? "…" : ""}”</p>}
                          <small>{record.decision?.summary ?? "The selected intent is linked to this delivery."}</small>
                        </div>
                        {record.context && <button type="button" className="activity-focus-context" onClick={() => setSelectedContext(record.context!)}>View source</button>}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="activity-focus-empty">No public action was selected in the latest check.</div>
                )}
              </section>
            )}
            {activityFocus && displayedActivityEvents.length > 0 && <div className="activity-related-heading"><span>Linked activity</span><small>Only events tied to the selected actions are shown.</small></div>}
            {displayedActivityEvents.length === 0 ? (
              <EmptyState
                title={activityFocus ? "No linked activity event yet" : "No Presence decisions yet"}
                body={paused ? `${presenceName} is asleep. Wake this Presence to begin a first attention cycle.` : activityFocus ? "The action record above is the source of truth; its event will appear here when the runtime records the next decision or delivery update." : "Activity will show what this Presence observed, chose, and delivered. Settings changes stay in Settings."}
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
              <>
              <div className="event-list">
                  {paginatedActivityEvents.map((item) => (
                  <div className="event-row-shell" key={item.id}>
                    <button className="event-row event-row-button" type="button" data-event-id={item.id} onClick={() => setSelectedEventId((current) => current === item.id ? null : item.id)} aria-expanded={selectedEventId === item.id} aria-label={`View details for ${presenceCopy(item.title)}`}>
                      <div className={`event-icon tone-${activityEventTone(item)}`}>
                        {item.type === "execution" ? <ArrowUpRight size={15} /> : item.type === "learning" ? <Sparkles size={15} /> : item.type === "memory" ? <Brain size={15} /> : <Circle size={9} fill="currentColor" />}
                      </div>
                      <div className="event-copy">
                        <div className="event-title">{presenceCopy(item.title)}<span>{formatTime(item.time)}</span></div>
                        <ActivityEventDetail text={presenceCopy(item.detail)} />
                        <div className="event-row-hint">{selectedEventId === item.id ? "Hide details" : "View details"}</div>
                      </div>
                    </button>
                    {selectedEventId === item.id && <div className="activity-event-detail-panel" role="region" aria-label={`Details for ${presenceCopy(item.title)}`}>
                      <ActivityDecisionTrace trace={decisionTraceForEvent(item)} />
                      {explorationFindingForEvent(item) && <div className="event-finding-preview" aria-label="Exploration finding"><span>Finding</span><strong>{explorationFindingForEvent(item)!.safeSummary}</strong><small>Why it matters · {explorationFindingForEvent(item)!.whyItMayMatter}</small></div>}
                      {contextForEvent(item) && <button type="button" className="event-context-preview event-context-preview-button" onClick={() => setSelectedContext(contextForEvent(item)!)}><span>Source</span><strong>{(contextForEvent(item)!.content?.text ?? "Open the observed post").slice(0, 112)}{(contextForEvent(item)!.content?.text?.length ?? 0) > 112 ? "…" : ""}</strong><em>View post</em></button>}
                    </div>}
                    {decisionForEvent(item) && (
                      <>
                        <button
                          type="button"
                          className="event-why-button"
                          aria-expanded={selectedDecisionId === decisionForEvent(item)!.id}
                          onClick={() => setSelectedDecisionId((current) => current === decisionForEvent(item)!.id ? null : decisionForEvent(item)!.id)}
                        >
                          {selectedDecisionId === decisionForEvent(item)!.id ? "Hide why" : "Why this action?"}
                        </button>
                        {selectedDecisionId === decisionForEvent(item)!.id && (
                          <ActivityDecisionDisclosure
                            decision={decisionForEvent(item)!}
                            evidence={contextForEvent(item)}
                            intent={item.intentId ? state.socialIntents.find((entry) => entry.id === item.intentId) : undefined}
                            execution={executionForActivityEvent(item)}
                            outcome={executionForActivityEvent(item) ? state.outcomes.find((entry) => entry.executionId === executionForActivityEvent(item)!.id) : undefined}
                            onClose={() => setSelectedDecisionId(null)}
                          />
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
              <nav className="activity-pagination" aria-label="Activity pages">
                <span className="activity-pagination-count">
                  Showing {(visibleActivityPage - 1) * ACTIVITY_PAGE_SIZE + 1}–{Math.min(visibleActivityPage * ACTIVITY_PAGE_SIZE, displayedActivityEvents.length)} of {displayedActivityEvents.length}
                </span>
                <div className="activity-pagination-controls">
                  <button type="button" className="activity-pagination-button" onClick={() => setActivityPage((current) => Math.max(1, current - 1))} disabled={visibleActivityPage <= 1}>
                    <ChevronRight size={14} style={{ transform: "rotate(180deg)" }} /> Newer
                  </button>
                  <span aria-live="polite">Page {visibleActivityPage} of {activityPageCount}</span>
                  <button type="button" className="activity-pagination-button" onClick={() => setActivityPage((current) => Math.min(activityPageCount, current + 1))} disabled={visibleActivityPage >= activityPageCount}>
                    Older <ChevronRight size={14} />
                  </button>
                </div>
              </nav>
              </>
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
          </section>
          <div id="decision-and-action">
            <ExecutionLedger state={state} mutate={mutate} presenceId={selected?.id} environment={activityEnvironment} sessionIds={activitySessionIds} onContext={setSelectedContext} />
          </div>
        </aside>
      </div>
      {selectedContext && <ActivityContextInspector object={selectedContext} state={state} mutate={mutate} onClose={() => setSelectedContext(null)} onOpenSettings={() => { setSelectedContext(null); setView("presence"); }} />}
    </div>
  );
}

function BringXPost({
  state,
  mutate,
  presenceId,
  presenceName,
}: {
  state: OpenPresenceState;
  mutate: Mutate;
  presenceId: string;
  presenceName: string;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [addressing, setAddressing] = useState(false);
  const [importedObjectId, setImportedObjectId] = useState<string | null>(null);
  const [workingState, setWorkingState] = useState<OpenPresenceState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const visibleState = workingState ?? state;
  const importedObject = importedObjectId ? visibleState.mirrorObjects.find((item) => item.id === importedObjectId) : undefined;
  const importedDirective = importedObject
    ? visibleState.operatorDirectives.find((item) => item.presenceId === presenceId && item.target.id === importedObject.externalRef.id && item.requiredAct === "reply")
    : undefined;
  const importedExecution = importedDirective
    ? visibleState.executions.find((item) => item.operatorDirectiveId === importedDirective.id || (item.source === "operator" && item.presenceId === presenceId && item.target?.id === importedObject?.externalRef.id))
    : undefined;
  const importedRetryable = Boolean(importedExecution && ["failed", "blocked", "expired"].includes(importedExecution.status));
  const importedFailure = importedExecution && importedRetryable ? deliveryFailureExplanation(importedExecution.failure, visibleState.presences.find((item) => item.id === presenceId)?.handle) : undefined;
  const addressLabel = importedExecution?.status === "succeeded"
    ? "Reply delivered"
    : importedExecution?.status === "failed"
      ? "Reply not delivered"
      : importedDirective
        ? "Reply assignment created"
        : "Address this post";
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await mutate({ type: "importXPost", presenceId, url: url.trim() });
      if (next) {
        const postId = url.match(/\/status\/(\d+)/i)?.[1];
        const imported = next.mirrorObjects.find((item) => item.presenceId === presenceId && item.externalRef.type === "x.post" && (!postId || item.externalRef.id === postId));
        setWorkingState(next);
        setImportedObjectId(imported?.id ?? null);
        setUrl("");
      }
      else setError("The post could not be brought into view. Check the notice above and try again.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The post could not be brought into view.");
    } finally {
      setBusy(false);
    }
  };
  const addressPost = async () => {
    if (!importedObject || addressing) return;
    setAddressing(true);
    setError(null);
    try {
      const next = await mutate({ type: "askPresenceToReply", presenceId, objectId: importedObject.id });
      if (next) setWorkingState(next);
    } finally {
      setAddressing(false);
    }
  };
  return (
    <section className="bring-post-panel" aria-label="Bring an X post into view">
      <div className="bring-post-copy">
        <div className="bring-post-kicker">
          <span className="bring-post-icon" aria-hidden="true"><ArrowUpRight size={14} /></span>
          <SectionEyebrow>Bring into view</SectionEyebrow>
          <span className="bring-post-boundary-chip">Observation first</span>
        </div>
        <h2>Give {presenceName} a post to consider</h2>
        <p>Paste a public X link. {presenceName} can inspect it first, then you can explicitly create a reply assignment.</p>
      </div>
      <form className="bring-post-form" onSubmit={submit}>
        <label className="sr-only" htmlFor={`bring-post-url-${presenceId}`}>X post URL</label>
        <input id={`bring-post-url-${presenceId}`} aria-label="X post URL" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://x.com/boardyai/status/…" disabled={busy} />
        <Button type="submit" variant="secondary" disabled={busy || !url.trim()}>{busy ? "Reading…" : "Bring into view"}</Button>
      </form>
      {error && <p className="bring-post-error" role="alert">{error}</p>}
      {importedObject && <article className="bring-post-imported" aria-label="Imported X post">
        <div>
          <strong>{importedObject.author?.displayName ?? importedObject.author?.handle ?? "X post"}</strong>
          <p>{importedObject.content?.text ?? "External post imported into the Social Mirror."}</p>
          <small>Observed in the Social Mirror · {importedObject.externalRef.id}</small>
          {importedFailure && <div className="bring-post-failure" role="alert"><strong>{importedFailure.title}</strong><span>{importedFailure.reason}</span><small>{importedFailure.consequence} Next step: {importedFailure.fix}</small></div>}
        </div>
        <div className="bring-post-address">
          {importedExecution?.status === "failed" ? <div className="bring-post-address-stack"><span className="bring-post-address-failure" role="status">{addressLabel}</span><Button type="button" variant="secondary" onClick={() => void addressPost()} disabled={addressing || !importedRetryable}>{addressing ? <><LoaderCircle size={14} className="spin" /> Retrying…</> : "Retry address"}</Button></div> : importedExecution?.status === "succeeded" ? <span className="bring-post-address-success" role="status">{addressLabel}</span> : <Button type="button" variant="secondary" onClick={() => void addressPost()} disabled={addressing || Boolean(importedDirective)}>{addressing ? <><LoaderCircle size={14} className="spin" /> Creating assignment…</> : importedDirective ? addressLabel : "Address this post"}</Button>}
        </div>
      </article>}
      <small className="bring-post-boundary">Importing is read-only. Reply delivery happens only after you choose “Address this post”; {presenceName} still owns the wording.</small>
    </section>
  );
}
function MirrorPanel({
  state,
  mutate,
  filter = "all",
  channelId,
  environment,
  sessionIds,
  onContext,
}: {
  state: OpenPresenceState;
  mutate: Mutate;
  filter?: string;
  channelId?: ChannelId;
  environment?: PresenceEnvironment;
  sessionIds?: Set<string>;
  onContext?: (object: MirrorObject) => void;
}) {
  const [ignoringObjectId, setIgnoringObjectId] = useState<string | null>(null);
  const [mirrorPagination, setMirrorPagination] = useState({ scope: "", page: 0 });
  const [mirrorFilter, setMirrorFilter] = useState<"all" | "mentions">("all");
  const selectedPresence =
    filter === "all"
      ? undefined
      : state.presences.find((item) => item.id === filter);
  const presenceName = selectedPresence?.name ?? "this Presence";
  const isMentionOfPresence = (item: MirrorObject) => {
    const handle = selectedPresence?.handle?.replace(/^@/, "").toLowerCase();
    const text = item.content?.text?.toLowerCase() ?? "";
    return Boolean(handle && text.includes(`@${handle}`));
  };
  const allObjects = state.mirrorObjects
    .filter((item) => {
      if (filter !== "all" && item.presenceId !== filter) return false;
      const itemPresence = state.presences.find((candidate) => candidate.id === item.presenceId);
      if (!itemPresence || !languagesMatch(itemPresence.language, item.language ?? item.content?.language)) return false;
      if (channelId && item.channelId !== channelId) return false;
      if (environment === "sandbox") return item.environment === "sandbox" || (!item.environment && Boolean(item.sessionId && sessionIds?.has(item.sessionId)));
      if (environment === "live") return item.environment !== "sandbox" && !item.sessionId;
      return true;
    });
  const mentionObjects = allObjects.filter(isMentionOfPresence);
  const filteredObjects = mirrorFilter === "mentions" ? mentionObjects : allObjects;
  const mirrorPageSize = 3;
  const mirrorPageCount = Math.max(1, Math.ceil(filteredObjects.length / mirrorPageSize));
  const mirrorScope = `${filter}|${channelId ?? ""}|${environment ?? ""}|${mirrorFilter}`;
  const mirrorPage = mirrorPagination.scope === mirrorScope ? mirrorPagination.page : 0;
  const currentMirrorPage = Math.min(mirrorPage, mirrorPageCount - 1);
  const objects = filteredObjects.slice(currentMirrorPage * mirrorPageSize, (currentMirrorPage + 1) * mirrorPageSize);
  const selectedUsesChromeExtension = selectedPresence?.connectionMode === "bridge";
  const bridge = selectedUsesChromeExtension ? state.bridges.find(
    (item) =>
      (filter === "all" || item.presenceId === filter) &&
      (!channelId || item.channelId === channelId) &&
      item.state !== "offline",
  ) : undefined;
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
  const isAlreadyIgnored = (item: MirrorObject) => state.operatorDirectives.some((directive) => directive.presenceId === item.presenceId && directive.target.id === item.externalRef.id && directive.requiredAct === "no_op" && directive.status !== "failed") || state.events.some((event) => event.sourceObjectId === item.id && /silence|left alone|ignore/i.test(`${event.title} ${event.detail}`));
  const askToIgnore = async (item: MirrorObject) => {
    setIgnoringObjectId(item.id);
    try {
      await mutate({ type: "askPresenceToIgnore", presenceId: item.presenceId, objectId: item.id, sessionId: item.sessionId });
    } finally {
      setIgnoringObjectId(null);
    }
  };
  const syncLabel = nativeObservation
    ? nativeObservation.status === "up-to-date" ? "up to date" : nativeObservation.status.replaceAll("-", " ")
    : bridgeSync?.status === "healthy" ? "up to date" : bridgeSync?.status ?? "not observed";
  const heading = allObjects.length
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
    <section className="decision-card mirror-panel" id="observed-context" aria-label={`${presenceName} observed channel context`}>
      <div className="section-heading compact">
        <div>
          <SectionEyebrow>Observed context</SectionEyebrow>
          <h3>{objects.length ? `${presenceName}'s view` : heading}</h3>
        </div>
        <div className="mirror-panel-meta">
          {allObjects.length > 0 && <div className="mirror-filter" role="group" aria-label="Observed context filter">
            <button type="button" className={mirrorFilter === "all" ? "selected" : ""} aria-pressed={mirrorFilter === "all"} onClick={() => setMirrorFilter("all")}>All <span>{allObjects.length}</span></button>
            <button type="button" className={mirrorFilter === "mentions" ? "selected" : ""} aria-pressed={mirrorFilter === "mentions"} onClick={() => setMirrorFilter("mentions")}>Mentions <span>{mentionObjects.length}</span></button>
          </div>}
          <span className="quiet-label">
          {bridge
            ? `${syncLabel} · ${filteredObjects.length} ${mirrorFilter === "mentions" ? "mentions" : "observed"}`
            : nativeConnection
              ? `X · ${nativeConnection.status === "needs-attention" ? "needs attention" : syncLabel}`
            : filter === "all"
              ? "Connect a Presence"
                : builtIn
                  ? "Local channel"
                : "Bridge required"}
          </span>
        </div>
      </div>
      {filteredObjects.length ? (
        <>
          <p className="mirror-explainer">
            {presenceName} has {filteredObjects.length} {mirrorFilter === "mentions" ? "matching mentions" : "observed posts"} available from {channelLabel(selectedPresence?.channel ?? objects[0]?.channelId ?? "x", state.channelDefinitions)}. Showing {currentMirrorPage * mirrorPageSize + 1}–{Math.min((currentMirrorPage + 1) * mirrorPageSize, filteredObjects.length)} here.
          </p>
          <p className="mirror-boundary">These are channel observations available for judgment, not a list of posts being acted on. A card is being acted on only when it shows a linked judgment, intent, or delivery state.</p>
          <div className="mirror-list">
            {objects.map((item) => {
              const ignored = isAlreadyIgnored(item);
              const observedText = cleanMirrorText(item.channelId, item.content?.text);
              const observedAuthor = normalizeMirrorAuthor(item.channelId, item.content?.text, item.author);
              const externalUrl = externalUrlForMirrorObject(item, observedAuthor?.handle);
              const externalLabel = `Open original post on ${channelLabel(item.channelId, state.channelDefinitions)}`;
              const itemDecision = state.socialDecisions.find((decision) => decision.presenceId === item.presenceId && decision.focalMirrorObjectIds.includes(item.id));
              const itemIntent = itemDecision?.socialIntentId
                ? state.socialIntents.find((intent) => intent.id === itemDecision.socialIntentId)
                : state.socialIntents.find((intent) => intent.presenceId === item.presenceId && intent.target?.id === item.externalRef.id && intent.environment === item.environment);
              const itemExecution = itemIntent ? state.executions.find((execution) => execution.socialIntentId === itemIntent.id) : undefined;
              const itemOutcome = itemExecution ? state.outcomes.find((outcome) => outcome.executionId === itemExecution.id) : undefined;
              const itemStatus = itemExecution
                ? `${executionStatusLabel(itemExecution.status)}${itemOutcome ? ` · ${itemOutcome.status}` : ""}`
                : itemDecision
                  ? itemDecision.decision === "no_op" ? "Judged · no action" : `Judged · ${formatActivityAffordance(itemDecision.decision)}`
                  : "Judgment not recorded";
              return (
              <article className={`mirror-post ${ignored ? "mirror-post-ignored" : ""}`} key={item.id}>
                <div className="mirror-post-header">
                  <ChannelAvatar className="mirror-avatar" avatarUrl={observedAuthor?.avatarUrl} name={observedAuthor?.displayName ?? "World"} />
                  <div className="mirror-post-author">
                    <strong>{observedAuthor?.displayName ?? item.objectType}</strong>
                    <span>{observedAuthor?.handle ?? "Public account"} · {channelLabel(item.channelId, state.channelDefinitions)}</span>
                  </div>
                  <time dateTime={item.occurredAt ?? item.observedAt}>{formatHistoryTimestamp(item.occurredAt ?? item.observedAt)}</time>
                </div>
                <p className="mirror-post-content">{observedText ?? "External activity received."}</p>
                {item.assetRefs?.length ? <MediaPerceptionDisclosure object={item} state={state} mutate={mutate} presenceName={presenceName} /> : null}
                <div className="mirror-post-lineage" aria-label="Observation lineage"><span>Seen by {presenceName}</span>{isMentionOfPresence(item) && <span>Mentioned {selectedPresence?.handle ?? "this Presence"}</span>}<span className={`mirror-status-chip ${itemExecution?.status === "failed" || itemExecution?.status === "blocked" ? "mirror-status-chip-warning" : itemExecution?.status === "succeeded" ? "mirror-status-chip-success" : ""}`}>{itemStatus}</span></div>
                <div className="mirror-post-footer">
                  <span>Observed</span><span>{item.objectType.replaceAll("-", " ")}</span>
                  {externalUrl && <a className="mirror-open-link" href={externalUrl} target="_blank" rel="noreferrer" aria-label={`${externalLabel}: ${item.externalRef.id}`}><ArrowUpRight size={12} /> {externalLabel}</a>}
                  {ignored && <span className="mirror-post-ignored-status" title={`${selectedPresence?.name ?? "This Presence"} was asked to leave this post alone. No public action or delivery was created.`}><EyeOff size={11} /> Ignored</span>}
                  {!ignored && item.objectType === "post" && item.actorPresenceId !== selectedPresence?.id && onContext && (
                    <div className="mirror-post-actions">
                      <button type="button" className="mirror-ignore-action" aria-label={`Ask ${selectedPresence?.name ?? "this Presence"} to ignore`} onClick={() => void askToIgnore(item)} disabled={ignoringObjectId === item.id} title={`Ask ${selectedPresence?.name ?? "this Presence"} to leave this post alone`}><EyeOff size={11} /> {ignoringObjectId === item.id ? "Asking…" : "Ignore"}</button>
                      <button type="button" className="mirror-reply-action" onClick={() => onContext(item)} title="Create an explicit reply assignment for this observed post">Create reply assignment</button>
                    </div>
                  )}
                </div>
              </article>
              );
            })}
          </div>
          {mirrorPageCount > 1 && (
            <nav className="mirror-pagination" aria-label={`${presenceName} observation history`}>
              <button type="button" onClick={() => setMirrorPagination({ scope: mirrorScope, page: currentMirrorPage - 1 })} disabled={currentMirrorPage === 0}>
                <ChevronLeft size={13} /> Newer
              </button>
              <span>Page {currentMirrorPage + 1} of {mirrorPageCount} · {allObjects.length} total</span>
              <button type="button" onClick={() => setMirrorPagination({ scope: mirrorScope, page: currentMirrorPage + 1 })} disabled={currentMirrorPage >= mirrorPageCount - 1}>
                Older <ChevronRight size={13} />
              </button>
            </nav>
          )}
        </>
      ) : mirrorFilter === "mentions" && allObjects.length > 0 ? (
        <div className="mirror-zero-state"><strong>No mentions of {selectedPresence?.handle ?? presenceName} in this view.</strong><small>Genny has {allObjects.length} observed post{allObjects.length === 1 ? "" : "s"}, but none mention this Presence.</small></div>
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
              ? "The Chrome extension is reconciling the community into the Social Mirror."
              : bridgeSync?.status === "degraded"
                ? `The last community reconciliation was partial${bridgeSync.error ? `: ${bridgeSync.error}` : "."}`
                : "The Chrome extension feeds observed posts, comments, and messages into the Social Mirror. They remain channel content, not instructions."
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

const formatPublicationAge = (seconds: number) => {
  if (seconds < 60) return `${seconds}s old`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m old`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return `${hours}h${remainingMinutes ? ` ${remainingMinutes}m` : ""} old`;
  const days = Math.floor(hours / 24);
  return `${days}d${hours % 24 ? ` ${hours % 24}h` : ""} old`;
};

const publicationMetricSourceLabel = (source: PublicationMetricSnapshot["source"]) => {
  if (source === "native") return "Native X";
  if (source === "bridge") return "Browser Bridge";
  if (source === "sandbox") return "Sandbox";
  return "Manual observation";
};

const publicationMetricStatusLabel = (status: PublicationMetricSnapshot["observationStatus"]) => {
  if (status === "observed") return "Verified";
  if (status === "partial") return "Partial";
  return "Unavailable";
};

function ActivityPerformanceEvidence({ snapshot }: { snapshot?: PublicationMetricSnapshot | null }) {
  if (!snapshot) {
    return (
      <div className="activity-performance-evidence activity-performance-evidence-empty" aria-label="Measured publication evidence">
        <div className="activity-performance-heading"><strong>Measured evidence</strong><span>Not linked</span></div>
        <p>This event identifies a publication, but no metric snapshot is linked to it.</p>
      </div>
    );
  }
  const metrics = [
    ["Views", snapshot.impressions],
    ["Likes", snapshot.likes],
    ["Replies", snapshot.replies],
    ["Reposts", snapshot.reposts],
    ["Quotes", snapshot.quotes],
  ].filter(([, value]) => value !== undefined) as [string, number][];
  const baselineMetric = snapshot.baseline?.relative.impressions;
  return (
    <div className="activity-performance-evidence" aria-label="Measured publication evidence">
      <div className="activity-performance-heading">
        <div><strong>Measured evidence</strong><span>What the channel actually returned</span></div>
        <span className={`activity-performance-status activity-performance-status-${snapshot.observationStatus}`}>{publicationMetricStatusLabel(snapshot.observationStatus)}</span>
      </div>
      {metrics.length ? (
        <div className="activity-performance-metrics">
          {metrics.map(([label, value]) => <div className="activity-performance-metric" key={label}><strong>{value.toLocaleString()}</strong><span>{label}</span></div>)}
        </div>
      ) : <p className="activity-performance-empty">The snapshot arrived without metric values, so there is no performance number to show.</p>}
      <div className="activity-performance-meta">
        <span>Observed {formatHistoryTimestamp(snapshot.observedAt)}</span>
        <span>Publication {formatPublicationAge(snapshot.publicationAgeSeconds)}</span>
        <span>Source {publicationMetricSourceLabel(snapshot.source)}</span>
      </div>
      {snapshot.baseline && <div className="activity-performance-baseline"><strong>Comparison</strong><span>{snapshot.baseline.comparableCount} similar publication{snapshot.baseline.comparableCount === 1 ? "" : "s"} · {snapshot.baseline.confidence} confidence{baselineMetric !== undefined ? ` · ${baselineMetric >= 1 ? "+" : ""}${Math.round((baselineMetric - 1) * 100)}% impressions vs baseline` : ""}</span></div>}
    </div>
  );
}

function ActivityDecisionTrace({ trace }: { trace: { observed: string; judgment: string; delivery: string; performance?: PublicationMetricSnapshot | null } }) {
  return (
    <>
      <div className="activity-decision-trace" aria-label="Decision path">
        <div><strong>Context</strong><span>{trace.observed}</span></div>
      <div><strong>Judgment</strong><span>{trace.judgment}</span></div>
      <div><strong>Delivery</strong><span>{trace.delivery}</span></div>
      </div>
      {trace.performance !== undefined && <ActivityPerformanceEvidence snapshot={trace.performance} />}
    </>
  );
}

function ActivityDecisionDisclosure({
  decision,
  evidence,
  intent,
  execution,
  outcome,
  onClose,
}: {
  decision: SocialDecision;
  evidence?: MirrorObject;
  intent?: OpenPresenceState["socialIntents"][number];
  execution?: OpenPresenceState["executions"][number];
  outcome?: OpenPresenceState["outcomes"][number];
  onClose: () => void;
}) {
  const actionLabel = formatActivityAffordance(decision.decision === "original_post" ? "post" : decision.decision);
  return (
    <div className="activity-why-panel" role="region" aria-label="Why this action?">
      <div className="activity-why-heading">
        <div>
          <SectionEyebrow>Why this action?</SectionEyebrow>
          <strong>{decision.decision === "no_op" ? "Kept the conversation quiet" : `${actionLabel} selected`}</strong>
        </div>
        <button type="button" className="activity-why-close" onClick={onClose} aria-label="Close decision explanation">×</button>
      </div>
      <p className="activity-why-summary">{decision.summary}</p>
      {evidence?.content?.text && (
        <div className="activity-why-evidence">
          <strong>Evidence considered</strong>
          <span>{evidence.author?.displayName ?? evidence.author?.handle ?? "Observed post"} · “{evidence.content.text.slice(0, 190)}{evidence.content.text.length > 190 ? "…" : ""}”</span>
        </div>
      )}
      {decision.influences.length > 0 && (
        <div className="activity-why-influences">
          <strong>Influenced by</strong>
          <div>{decision.influences.map((influence) => <span key={influence}>{influence}</span>)}</div>
        </div>
      )}
      <div className="activity-why-meta">
        <span>Confidence · {decision.confidence ?? "not recorded"}</span>
        {outcome && <span>Outcome · {outcome.status}</span>}
      </div>
      <details className="activity-why-technical">
        <summary>Technical details</summary>
        <dl>
          <div><dt>Social Decision</dt><dd>{decision.id}</dd></div>
          <div><dt>Mirror evidence</dt><dd>{decision.focalMirrorObjectIds.join(", ") || "None recorded"}</dd></div>
          <div><dt>Social Intent</dt><dd>{intent?.id ?? decision.socialIntentId ?? "None"}</dd></div>
          <div><dt>Execution</dt><dd>{execution?.id ?? "None"}{execution ? ` · ${execution.status}` : ""}</dd></div>
          {decision.origin && <div><dt>Origin</dt><dd>{decision.origin.kind}{decision.origin.refId ? ` · ${decision.origin.refId}` : ""}</dd></div>}
        </dl>
      </details>
    </div>
  );
}

function ActivityContextInspector({ object, state, mutate, onClose, onOpenSettings }: { object: MirrorObject; state: OpenPresenceState; mutate: Mutate; onClose: () => void; onOpenSettings: () => void }) {
  const [direction, setDirection] = useState("");
  const [requesting, setRequesting] = useState(false);
  const presence = state.presences.find((item) => item.id === object.presenceId) ?? state.presence;
  const presenceName = presence?.name ?? "this Presence";
  const replyDirectiveCandidate = state.operatorDirectives.find((item) => item.presenceId === object.presenceId && item.target.id === object.externalRef.id && item.requiredAct === "reply" && (!object.sessionId || item.sessionId === object.sessionId) && item.status !== "failed");
  const replyExecution = state.executions.find((item) => (item.operatorDirectiveId === replyDirectiveCandidate?.id || (item.source === "operator" && item.presenceId === object.presenceId && item.target?.id === object.externalRef.id)) && item.presenceId === object.presenceId && item.target?.id === object.externalRef.id && (!object.sessionId || item.sessionId === object.sessionId));
  const replyDeliveryInFlight = replyExecution && !["failed", "blocked", "expired", "succeeded"].includes(replyExecution.status);
  const replyWasSent = replyExecution?.status === "succeeded" || state.outcomes.some((item) => item.executionId === replyExecution?.id && item.status === "succeeded");
  const replyFailed = replyExecution && ["failed", "blocked", "expired"].includes(replyExecution.status);
  const replyDirective = !replyFailed && replyDirectiveCandidate && (replyDirectiveCandidate.status === "requested" || replyDeliveryInFlight || replyWasSent) ? replyDirectiveCandidate : undefined;
  const ignoreDirective = state.operatorDirectives.find((item) => item.presenceId === object.presenceId && item.target.id === object.externalRef.id && item.requiredAct === "no_op" && (!object.sessionId || item.sessionId === object.sessionId) && item.status !== "failed");
  const repliesOff = (presence?.execution.reply ?? "off") === "off";
  const relatedJudgment = state.events.find((item) => item.sourceObjectId === object.id && (item.title.toLowerCase().includes("silence") || item.title.toLowerCase().includes("left alone") || item.title.toLowerCase().includes("ignore") || item.title.toLowerCase().includes("reply observed")));
  const externalUrl = externalUrlForMirrorObject(object, object.author?.handle);
  const externalLabel = `Open original post on ${channelLabel(object.channelId, state.channelDefinitions)}`;
  const observedText = cleanMirrorText(object.channelId, object.content?.text);
  const observedAuthor = normalizeMirrorAuthor(object.channelId, object.content?.text, object.author);
  async function askToReply() {
    setRequesting(true);
    try {
      await mutate({ type: "askPresenceToReply", presenceId: object.presenceId, objectId: object.id, sessionId: object.sessionId, optionalDirection: direction.trim() || undefined });
    } finally {
      setRequesting(false);
    }
  }
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
            <ChannelAvatar className="mirror-avatar" avatarUrl={observedAuthor?.avatarUrl} name={observedAuthor?.displayName ?? "World"} />
            <div className="mirror-post-author"><strong>{observedAuthor?.displayName ?? object.objectType}</strong><span>{observedAuthor?.handle ?? "Public account"} · {channelLabel(object.channelId, state.channelDefinitions)}</span></div>
            <time dateTime={object.occurredAt ?? object.observedAt}>{formatHistoryTimestamp(object.occurredAt ?? object.observedAt)}</time>
          </div>
          <p className="mirror-post-content">{observedText ?? "External activity received."}</p>
          {object.assetRefs?.length ? <MediaPerceptionDisclosure object={object} state={state} mutate={mutate} presenceName={presenceName} /> : null}
          <div className="mirror-post-footer"><span>Observed</span><span>{object.objectType.replaceAll("-", " ")}</span>{externalUrl && <a className="mirror-open-link" href={externalUrl} target="_blank" rel="noreferrer" aria-label={`${externalLabel}: ${object.externalRef.id}`}><ArrowUpRight size={12} /> {externalLabel}</a>}</div>
        </article>
        <section className="operator-reply-card" aria-label={`Ask ${presenceName} to reply`}>
          <SectionEyebrow>Operator direction</SectionEyebrow>
          <h3>{replyDirective ? "Reply requested" : `Ask ${presenceName} to reply`}</h3>
          <p>{replyDirective ? `The social act is set. ${presenceName} owns the wording; the Presence reply setting owns how it is delivered.` : `You choose that this interaction should happen. ${presenceName} still decides what to say, within the Presence's privacy and channel boundaries.`}</p>
          {relatedJudgment && <div className="operator-judgment"><strong>{ignoreDirective ? `${presenceName} was asked to leave this alone` : `${presenceName} chose silence`}</strong><span>{relatedJudgment.detail.replaceAll("Jenny", presenceName)}</span></div>}
          {!replyDirective && !repliesOff && <label className="operator-direction-field">Optional direction for {presenceName}<textarea aria-label={`Optional direction for ${presenceName}`} value={direction} onChange={(event) => setDirection(event.target.value)} placeholder={`Anything you want ${presenceName} to consider?`} rows={3} /></label>}
          {repliesOff ? <div className="operator-replies-off"><span>Replies are disabled for this Presence.</span><button type="button" onClick={onOpenSettings}>Enable replies →</button></div> : replyWasSent ? <div className="operator-requested-state">{presenceName} sent a verified reply to this post.</div> : replyFailed ? (() => { const explanation = deliveryFailureExplanation(replyExecution?.failure, presence?.handle); return <div className="operator-requested-state operator-requested-failure" role="alert"><strong>{presenceName} did not deliver the requested reply.</strong><span>{explanation.title}: {explanation.reason}</span><small>{explanation.consequence} Next step: {explanation.fix}</small>{replyExecution?.failure?.message && <details><summary>Technical details</summary><code>{replyExecution.failure.message}</code></details>}</div>; })() : replyDirective ? <div className="operator-requested-state">{presenceName} is preparing the expression through the existing reply envelope.</div> : <Button variant="primary" className="full-button" onClick={() => void askToReply()} disabled={requesting}>{requesting ? <><LoaderCircle size={14} className="spin" /> Asking {presenceName}…</> : <><Reply size={14} /> Ask {presenceName} to reply</>}</Button>}
        </section>
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
  if (status === "blocked") return "Delivery blocked";
  if (status === "awaiting-manual") return "Waiting for you to mark sent";
  return status.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};

type DeliveryFailureExplanation = {
  title: string;
  reason: string;
  consequence: string;
  fix: string;
};

const deliveryFailureExplanation = (failure?: { code?: string; message: string }, expectedHandle?: string): DeliveryFailureExplanation => {
  const message = failure?.message ?? "The connector rejected delivery before a public result could be verified.";
  const normalized = `${failure?.code ?? ""} ${message}`.toLowerCase();
  const handle = expectedHandle ? `@${expectedHandle.replace(/^@/, "")}` : "the configured Presence account";
  if (normalized.includes("account_mismatch") || normalized.includes("account check") || normalized.includes("expected @")) {
    return {
      title: "X account identity mismatch",
      reason: `The connected X session could not be verified as ${handle}.`,
      consequence: "No public reply was sent, and this attempt does not count as delivered.",
      fix: `Reconnect X while signed in as ${handle}, then retry the address.`,
    };
  }
  if (normalized.includes("not permitted") || normalized.includes("write access") || normalized.includes("403")) {
    return {
      title: "X write access was rejected",
      reason: "Reading X works, but this connector is not permitted to create the requested public action.",
      consequence: "No public artifact was created or counted.",
      fix: `Grant the connected X account write permission for ${handle}, reconnect it, and retry.`,
    };
  }
  if (normalized.includes("language_policy")) {
    return {
      title: "English-only policy blocked delivery",
      reason: "The proposed expression did not satisfy the Presence language policy.",
      consequence: "Nothing was sent to the channel.",
      fix: "Change the expression or update the Presence language policy before retrying.",
    };
  }
  return {
    title: "The channel rejected delivery",
    reason: message,
    consequence: "No public artifact was counted until a verified result exists.",
    fix: "Review the connector and account status, then retry only after the underlying issue is resolved.",
  };
};

const isPublicPostExecution = (execution: OpenPresenceState["executions"][number]) => /(^|\.)((post)|(reply))$/i.test(execution.affordance);

function RecentPublicAttempts({
  state,
  executions,
  mutate,
  onContext,
}: {
  state: OpenPresenceState;
  executions: OpenPresenceState["executions"];
  mutate: Mutate;
  onContext?: (object: MirrorObject) => void;
}) {
  const [retryingExecutionId, setRetryingExecutionId] = useState<string | null>(null);
  const presenceId = executions[0]?.presenceId ?? state.presence?.id;
  const latestPulse = state.events.find((event) => event.title === "Pulse completed" && event.presenceId === presenceId);
  const completedPublicAttempts = executions.filter((execution) => isPublicPostExecution(execution) && ["succeeded", "failed", "blocked", "expired"].includes(execution.status));
  const attempts = completedPublicAttempts
    .filter((execution) => latestPulse?.invocationId
      ? execution.invocationId === latestPulse.invocationId
      : latestPulse
        ? new Date(execution.updatedAt ?? execution.createdAt).getTime() >= new Date(latestPulse.time).getTime()
        : false)
    .sort((left, right) => new Date(right.updatedAt ?? right.createdAt).getTime() - new Date(left.updatedAt ?? left.createdAt).getTime());
  const mirrorForExecution = (execution: OpenPresenceState["executions"][number]) => state.mirrorObjects.find((object) => {
    if (object.presenceId !== execution.presenceId) return false;
    if (execution.environment === "sandbox") return object.environment === "sandbox" && (!execution.sessionId || object.sessionId === execution.sessionId);
    return object.environment !== "sandbox" && !object.sessionId && object.originExecutionId === execution.id;
  }) ?? (execution.target ? state.mirrorObjects.find((object) => object.presenceId === execution.presenceId && object.externalRef.type === execution.target?.type && object.externalRef.id === execution.target?.id && execution.environment !== "sandbox" && object.environment !== "sandbox" && !object.sessionId) : undefined);
  const expressionText = (execution: OpenPresenceState["executions"][number], object?: MirrorObject) => {
    const payload = execution.publication?.payload;
    const payloadText = payload && typeof payload === "object" && !Array.isArray(payload) && "text" in payload && typeof payload.text === "string" ? payload.text : undefined;
    return execution.publication?.publicExpression?.text ?? payloadText ?? object?.content?.text ?? "No expression text was returned.";
  };
  return (
    <section className="recent-public-attempts" aria-label="Recent public posts and replies">
      <div className="recent-public-attempts-heading">
        <div>
          <SectionEyebrow>Latest check result</SectionEyebrow>
          <h3>What this check triggered</h3>
          <p className="recent-public-attempts-subtitle">
            {latestPulse ? `Pulse completed ${formatHistoryTimestamp(latestPulse.time)} · every public post or reply attempted by this check is shown here.` : "Waiting for the first completed pulse to establish a check result."}
          </p>
        </div>
        <span>{attempts.length} action{attempts.length === 1 ? "" : "s"}</span>
      </div>
      {attempts.length ? <div className="recent-public-attempts-list">{attempts.map((execution) => {
        const object = mirrorForExecution(execution);
        const target = execution.target ? state.mirrorObjects.find((candidate) => candidate.presenceId === execution.presenceId && candidate.externalRef.id === execution.target?.id && candidate.environment !== "sandbox") : undefined;
        const presence = state.presences.find((candidate) => candidate.id === execution.presenceId);
        const succeeded = execution.status === "succeeded";
        const action = execution.affordance.split(".").at(-1) === "reply" ? "Reply" : "Original post";
        const recipient = target?.author?.handle ?? target?.author?.displayName;
        const externalUrl = object ? externalUrlForMirrorObject(object, object.author?.handle) : undefined;
        const timestamp = execution.executedAt ?? execution.updatedAt ?? execution.createdAt;
        const failure = !succeeded ? deliveryFailureExplanation(execution.failure, presence?.handle) : undefined;
        const retryable = ["failed", "blocked", "expired"].includes(execution.status) && execution.failure?.retryable !== false;
        return <article className={`recent-public-attempt recent-public-attempt-${succeeded ? "succeeded" : "failed"}`} key={execution.id}>
          <div className="recent-public-attempt-topline">
            <span className="recent-public-attempt-status"><span aria-hidden="true" /> {succeeded ? "Sent" : "Not sent"}</span>
            <time dateTime={timestamp}>{formatHistoryTimestamp(timestamp)}</time>
          </div>
          <strong>{action}{recipient ? ` to ${recipient}` : ""}</strong>
          <p>{expressionText(execution, object)}</p>
          <div className="recent-public-attempt-footer">
            <span>{succeeded ? "Verified channel outcome" : failure?.title ?? "Delivery failed"}</span>
            <div className="recent-public-attempt-actions">
              {retryable && <button
                type="button"
                className="recent-public-attempt-retry"
                disabled={retryingExecutionId === execution.id}
                aria-busy={retryingExecutionId === execution.id}
                onClick={() => {
                  setRetryingExecutionId(execution.id);
                  void mutate({ type: "retryExecution", id: execution.id }).finally(() => setRetryingExecutionId(null));
                }}
              >
                {retryingExecutionId === execution.id ? "Retrying…" : "Retry"}
              </button>}
              {object && onContext && <button type="button" onClick={() => onContext(object)}>View post</button>}
              {externalUrl && <a href={externalUrl} target="_blank" rel="noreferrer">Open on X</a>}
            </div>
          </div>
        </article>;
      })}</div> : <p className="recent-public-attempts-empty">This check did not trigger a public post or reply. Preparing actions remain in the queue above until a later check attempts them.</p>}
    </section>
  );
}

function ExecutionQueueSummary({
  state,
  executions,
  presenceId,
  countdownNow,
}: {
  state: OpenPresenceState;
  executions: OpenPresenceState["executions"];
  presenceId?: string;
  countdownNow?: number;
}) {
  const pendingStatuses = new Set<OpenPresenceState["executions"][number]["status"]>(["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued", "claimed", "executing"]);
  const pending = executions.filter((execution) => pendingStatuses.has(execution.status));
  const nativePending = pending.filter((execution) => execution.connector === "native").length;
  const bridgePending = pending.filter((execution) => execution.connector === "bridge").length;
  const connectorlessPending = pending.filter((execution) => !execution.connector).length;
  const reviewPending = pending.filter((execution) => execution.status === "awaiting-review").length;
  const failedExecutions = executions.filter((execution) => ["failed", "blocked", "expired"].includes(execution.status));
  const failed = failedExecutions.length;
  const failedByStatus = failedExecutions.reduce<Record<string, number>>((counts, execution) => {
    counts[execution.status] = (counts[execution.status] ?? 0) + 1;
    return counts;
  }, {});
  const failureGroups = failedExecutions.reduce<Record<string, number>>((counts, execution) => {
    const executionPresence = state.presences.find((item) => item.id === execution.presenceId);
    const title = deliveryFailureExplanation(execution.failure, executionPresence?.handle).title;
    counts[title] = (counts[title] ?? 0) + 1;
    return counts;
  }, {});
  const topFailure = Object.entries(failureGroups).sort((left, right) => right[1] - left[1])[0];
  const latestFailureExecution = [...failedExecutions].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0];
  const latestFailurePresence = latestFailureExecution ? state.presences.find((item) => item.id === latestFailureExecution.presenceId) : undefined;
  const latestFailure = latestFailureExecution ? deliveryFailureExplanation(latestFailureExecution.failure, latestFailurePresence?.handle) : undefined;
  const presence = state.presences.find((item) => item.id === presenceId);
  const bridge = state.bridges.find((item) => item.presenceId === presenceId && item.kind === "bridge" && item.state !== "offline");
  const bridgeStatus = bridge ? bridgeAdapterStatus(bridge) : "waiting";
  const nativeConnection = state.nativeConnections.find((item) => item.presenceId === presenceId && item.channelId === "x" && item.status === "connected");
  const bridgeNextCheckAt = bridge?.lastHeartbeatAt ? new Date(new Date(bridge.lastHeartbeatAt).getTime() + 30_000).toISOString() : undefined;
  const nextQueueCheckAt = nativePending > 0 ? nativeConnection?.observation?.nextObservationAt : bridgePending > 0 ? bridgeNextCheckAt : undefined;
  const nextQueueCountdown = formatCountdown(nextQueueCheckAt, countdownNow);
  const queueDetail = bridgePending > 0
    ? bridgeStatus === "connected"
      ? `${bridgePending} Chrome fallback action${bridgePending === 1 ? " is" : "s are"} waiting for the next Chrome extension check${nextQueueCountdown ? ` in ${nextQueueCountdown}` : ""}.`
      : `${bridgePending} Chrome fallback action${bridgePending === 1 ? " is" : "s are"} waiting because the extension is ${bridge ? bridgeStatus === "stale" ? "stale" : "not checked in" : "not connected"}.`
    : connectorlessPending > 0
      ? `${connectorlessPending} action${connectorlessPending === 1 ? " is" : "s are"} waiting for an authorized connector.`
      : nativePending > 0
        ? `${nativePending} Native X action${nativePending === 1 ? " is" : "s are"} waiting for the next API queue check${nextQueueCountdown ? ` in ${nextQueueCountdown}` : ". Click Check now to process the next one"}.`
        : pending.length === 0
          ? "Nothing is waiting to send. New actions will appear here with their route."
          : "The queue is waiting on the current decision state.";
  return (
    <section className="execution-queue-summary" aria-label="Execution queue" data-testid="execution-queue-summary">
      <div className="execution-queue-heading">
        <div><SectionEyebrow>Queue</SectionEyebrow><strong>{pending.length ? `${pending.length} pending` : "Queue clear"}</strong></div>
        <span className={failed ? "execution-queue-failed" : "execution-queue-healthy"}>{failed ? `${failed} need attention` : "No failed actions"}</span>
      </div>
      <div className="execution-queue-counts" aria-label="Queue counts by route">
        <span className="execution-queue-count execution-queue-count-native"><span aria-hidden="true" />Native X · {nativePending}</span>
        <span className="execution-queue-count execution-queue-count-bridge"><span aria-hidden="true" />Chrome fallback · {bridgePending}</span>
        <span className="execution-queue-count execution-queue-count-review"><span aria-hidden="true" />Needs review · {reviewPending}</span>
      </div>
      <p>{queueDetail}</p>
      {bridgePending > 0 && <small>Chrome is reserved for replies to posts that do not mention {presence?.handle ?? "this Presence"}; Native X handles the normal X route.</small>}
      {nativePending > 0 && <small>One queued Native X action is processed per Check now or automatic attention cycle.</small>}
      {failed > 0 && (
        <div className="execution-queue-failure-summary" role="status">
          <div className="execution-queue-failure-heading">
            <strong>{failed} previous action{failed === 1 ? " was" : "s were"} not delivered</strong>
            <span>{["failed", "blocked", "expired"].filter((status) => failedByStatus[status]).map((status) => `${failedByStatus[status]} ${status}`).join(" · ")}</span>
          </div>
          <p>{topFailure ? `${topFailure[1]} ${topFailure[1] === 1 ? "attempt" : "attempts"} ended with “${topFailure[0]}”.` : "These attempts did not produce a verified public result."} {pending.length ? "They are historical and are separate from the pending queue above." : "Review the breakdown before retrying."}</p>
          {latestFailure && latestFailureExecution && <small>Latest: {latestFailure.title} · {formatHistoryTimestamp(latestFailureExecution.updatedAt)}. {latestFailure.fix}</small>}
          <details>
            <summary>Show failure breakdown</summary>
            <ul>
              {Object.entries(failureGroups).sort((left, right) => right[1] - left[1]).map(([title, count]) => <li key={title}><strong>{count}</strong><span>{title}</span></li>)}
            </ul>
          </details>
        </div>
      )}
    </section>
  );
}

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
  const [countdownNow, setCountdownNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const executions = state.executions
    .filter((item) => {
      if (presenceId && item.presenceId !== presenceId) return false;
      if (environment === "sandbox") return item.environment === "sandbox" || (!item.environment && Boolean(item.sessionId && sessionIds?.has(item.sessionId)));
      if (environment === "live") return item.environment !== "sandbox" && !item.sessionId;
      return true;
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const pendingStatuses = new Set<OpenPresenceState["executions"][number]["status"]>(["awaiting-review", "approved", "awaiting-manual", "awaiting-connector", "queued", "claimed", "executing"]);
  const pendingExecutions = executions.filter((item) => pendingStatuses.has(item.status)).sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  const latest = pendingExecutions.find((item) => item.status === "awaiting-review") ?? pendingExecutions[0] ?? executions[0];
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
      <div className="execution-ledger-stack">
        <ExecutionQueueSummary state={state} executions={executions} presenceId={presenceId} countdownNow={countdownNow} />
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
        <RecentPublicAttempts state={state} executions={executions} mutate={mutate} onContext={onContext} />
      </div>
    );
  const needsApproval = latest.status === "awaiting-review";
  const needsManualRelay = latest.status === "awaiting-manual";
  const languageBlocked = latest.status === "blocked" && latest.failure?.code === "LANGUAGE_POLICY_VIOLATION";
  const failureExplanation = ["failed", "blocked", "expired"].includes(latest.status)
    ? deliveryFailureExplanation(latest.failure, presence?.handle)
    : undefined;
  const usesChromeExtension = latest.connector === "bridge" || (latest.connector === undefined && Boolean(latest.bridgeId));
  const bridge = usesChromeExtension
    ? latest.bridgeId
      ? state.bridges.find((item) => item.id === latest.bridgeId && item.state !== "offline")
      : latest.presenceId
        ? state.bridges.find((item) => item.presenceId === latest.presenceId && item.state !== "offline" && item.kind === "bridge")
        : undefined
    : undefined;
  const bridgeConnected = Boolean(bridge && bridgeAdapterStatus(bridge) === "connected");
  const nextChromeExtensionCheckAt = bridgeConnected && bridge?.lastHeartbeatAt
    ? (() => {
        const heartbeatAt = new Date(bridge.lastHeartbeatAt).getTime();
        return Number.isFinite(heartbeatAt) ? new Date(heartbeatAt + 30_000).toISOString() : undefined;
      })()
    : undefined;
  const nextBridgeAttemptAt = latest.status === "queued" ? nextChromeExtensionCheckAt : undefined;
  const nextBridgeAttemptCountdown = formatCountdown(nextBridgeAttemptAt, countdownNow);
  const nextChromeExtensionCheckCountdown = formatCountdown(nextChromeExtensionCheckAt, countdownNow);
  const nativeConnection = state.nativeConnections.find((item) => item.presenceId === latest.presenceId && item.channelId === "x" && item.status === "connected");
  const nextNativeCheckAt = nativeConnection?.observation?.nextObservationAt ?? presence?.nextExecutionCheckAt;
  const nextNativeCheckCountdown = formatCountdown(nextNativeCheckAt, countdownNow);
  const sendTiming = latest.status === "awaiting-review"
    ? { kind: "blocked", label: "Waiting for your approval", detail: "Nothing will be sent until you approve this action." }
    : latest.status === "approved"
      ? { kind: "blocked", label: "Waiting for execution", detail: "This action is approved but has not entered the send queue." }
      : latest.status === "queued" && usesChromeExtension && nextBridgeAttemptCountdown
        ? { kind: "queued", label: nextBridgeAttemptCountdown === "now" ? "Next send attempt now" : `Next send attempt in ${nextBridgeAttemptCountdown}`, detail: "The Chrome extension checks the queue about every 30 seconds; the actual send may happen sooner when the controlled X tab is ready." }
        : latest.status === "queued" && latest.connector === "native"
          ? { kind: "queued", label: nextNativeCheckCountdown ? `Next API queue check in ${nextNativeCheckCountdown}` : "Queued for API delivery", detail: "One queued Native X action is processed per Check now or automatic attention cycle." }
        : latest.status === "queued" && latest.connector === "bridge"
          ? { kind: "blocked", label: bridgeConnected ? "Send time not available yet" : "No send time scheduled", detail: bridgeConnected ? "The Chrome extension is connected, but it has not reported a recent check to calculate the next send attempt." : "The Chrome extension must be connected before this fallback reply can enter a send countdown. Open the extension on the signed-in X tab; the next check will then show a countdown." }
          : ["claimed", "executing"].includes(latest.status)
            ? { kind: "sending", label: "Sending now", detail: "The connected executor is delivering this action." }
            : latest.status === "awaiting-connector"
              ? { kind: "blocked", label: "No send time scheduled", detail: "A connected channel writer is required before this action can be queued. Once it connects, the next send check will show a countdown." }
              : latest.status === "awaiting-manual"
                ? { kind: "blocked", label: "Waiting for manual confirmation", detail: "The action will not be counted until its external result is marked sent." }
                : latest.status === "succeeded"
                  ? { kind: "sent", label: "Sent", detail: `${latest.executedAt ? `Verified at ${formatHistoryTimestamp(latest.executedAt)}.` : "The channel result was verified."}${(usesChromeExtension ? nextChromeExtensionCheckCountdown : nextNativeCheckCountdown) ? ` Next ${usesChromeExtension ? "Chrome extension" : "API"} queue check in ${usesChromeExtension ? nextChromeExtensionCheckCountdown : nextNativeCheckCountdown}.` : ""}` }
                  : undefined;
  return (
    <div className="execution-ledger-stack">
      <ExecutionQueueSummary state={state} executions={executions} presenceId={presenceId} countdownNow={countdownNow} />
      <div className="decision-card execution-ledger">
        <div className="section-heading compact">
          <div>
            <SectionEyebrow>Decision & action</SectionEyebrow>
            <h3>
              {needsApproval
                ? "Needs your review"
                : languageBlocked
                  ? "Language policy blocked"
                  : latest.status === "succeeded"
                  ? "Sent"
                  : executionStatusLabel(latest.status)}
            </h3>
          </div>
          <span className="quiet-label">{actionName}</span>
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
      {sendTiming && <div className={`execution-send-timing execution-send-timing-${sendTiming.kind}`} role="status" aria-live="polite">
        <div>
          <SectionEyebrow>Send timing</SectionEyebrow>
          <strong>{sendTiming.label}</strong>
        </div>
        <small>{sendTiming.detail}</small>
      </div>}
      <p className="execution-explanation">
        {needsApproval
          ? `${presence?.name ?? "The Presence"} has chosen this action. Your review decides whether it is sent.`
          : languageBlocked
            ? latest.failure?.message ?? "The final expression contains a prohibited literal. No external artifact was delivered."
            : latest.externalRef
            ? `Sent on ${presence ? channelLabel(presence.channel, state.channelDefinitions) : "the channel"}.`
            : failureExplanation
            ? failureExplanation.reason
            : `${presence?.name ?? "The Presence"}'s decision, your approval, and the channel result are kept separate.`}
      </p>
      {failureExplanation && <div className="execution-failure-card" role="alert">
        <strong>{failureExplanation.title}</strong>
        <span>{failureExplanation.consequence}</span>
        <small>Next step: {failureExplanation.fix}</small>
        {latest.failure?.message && <details><summary>Technical details</summary><code>{latest.failure.message}</code></details>}
      </div>}
      {needsApproval && (
        <Button
          variant="secondary"
          className="full-button review-cta"
          onClick={() => mutate({ type: "approveExecution", id: latest.id })}
        >
          <Check size={14} /> Approve execution
        </Button>
      )}
      {languageBlocked && latest.source === "operator" && (
        <div className="language-override-actions">
          <p className="form-hint">This exact operator-authored text conflicts with a language rule. You can go back and edit it, or explicitly publish it anyway for this action.</p>
          <Button variant="secondary" className="full-button" onClick={() => void mutate({ type: "overrideLanguagePolicy", id: latest.id })}>
            <Check size={14} /> Publish anyway
          </Button>
        </div>
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
      <RecentPublicAttempts state={state} executions={executions} mutate={mutate} onContext={onContext} />
    </div>
  );
}
void ExecutionLedger;

const calendarWeekDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const calendarHours = Array.from({ length: 24 }, (_, index) => index);
const objectiveLabel = (objective: string) => objective.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const objectiveTone = (objective: string) => objective.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "other";
const assignmentObjective = (assignment: Assignment) => {
  if (assignment.objective) return assignment.objective;
  if (assignment.deliverable.type === "audience_growth") return "audience_growth";
  const instruction = assignment.instruction.toLowerCase();
  if (/\bteach|lesson|explain|educat/.test(instruction)) return "education";
  if (/\brelationship|connection|introduction|person|people|conversation/.test(instruction)) return "relationship";
  if (/\breflect|review|evidence|hype|uncertain/.test(instruction)) return "reflection";
  return "other";
};
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

type ScheduleLayerVisibility = { plan: boolean; intents: boolean; assignments: boolean };

function publishingWindowCalendarPosition(window: PublishingPlan["windows"][number], timezone?: string) {
  const format = (value: string) => {
    const options: Intl.DateTimeFormatOptions = { weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(timezone ? { timeZone: timezone } : {}) };
    try {
      const parts = new Intl.DateTimeFormat("en-US", options).formatToParts(new Date(value));
      return {
        day: parts.find((part) => part.type === "weekday")?.value ?? "Monday",
        time: `${parts.find((part) => part.type === "hour")?.value ?? "08"}:${parts.find((part) => part.type === "minute")?.value ?? "00"}`,
      };
    } catch {
      const date = new Date(value);
      return { day: new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date), time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}` };
    }
  };
  const start = format(window.startAt);
  const end = format(window.endAt);
  const endMinutes = end.day === start.day ? timeToMinutes(end.time) : 24 * 60;
  return { ...window, day: start.day, startTime: start.time, endTime: end.time, startMinutes: timeToMinutes(start.time), endMinutes };
}

type PublicHistoryFilter = "all" | "originals" | "replies" | "quote" | "repost";

type MirrorHealth = { label: string; detail: string; tone: "healthy" | "warning" | "offline" | "sandbox" };

function mirrorHealthFor(state: OpenPresenceState, presence: OpenPresenceState["presence"]): MirrorHealth {
  if (!presence) return { label: "DISCONNECTED", detail: "No Presence is selected for this public history.", tone: "offline" };
  if (presence.connectionMode === "sandbox") return { label: "SIMULATED", detail: "Sandbox Mirror · local simulated world", tone: "sandbox" };
  if (presence.connectionMode === "bridge") {
    const bridge = state.bridges.find((item) => item.presenceId === presence.id);
    const sync = bridge ? state.bridgeSync.find((item) => item.bridgeId === bridge.id) : undefined;
    if (bridge?.state === "online" && sync?.status === "healthy") return { label: "UP TO DATE", detail: `Last observed ${formatMirrorDate(sync.lastSyncAt)}`, tone: "healthy" };
    if (bridge?.state === "online") return { label: "SYNCING", detail: "The connected Chrome extension is observing the channel.", tone: "warning" };
    return { label: "DISCONNECTED", detail: "Showing last verified public history until the Chrome extension reconnects.", tone: "offline" };
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

function publicHistoryChannelTag(item: PublicHistoryItem, definitions: ChannelDefinition[]) {
  if (item.environment === "sandbox") return "Sandbox";
  const channel = channelLabel(item.channel, definitions);
  return channel === "X" ? "X.com" : channel;
}

function PublicHistoryView({
  state,
  setView,
  mutate,
}: {
  state: OpenPresenceState;
  setView: (view: View) => void;
  mutate: Mutate;
}) {
  const presenceId = state.activePresenceId ?? state.presence?.id ?? "";
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  const mirrorHealth = mirrorHealthFor(state, presence);
  const [surface, setSurface] = useState<"timeline" | "calendar">("timeline");
  const [range, setRange] = useState<"week" | "month" | "day">("week");
  const [filter, setFilter] = useState<PublicHistoryFilter>("all");
  const [selected, setSelected] = useState<PublicHistoryItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [anchor, setAnchor] = useState(() => new Date());
  const allHistory = derivePublicHistory(state, presence?.id).filter((item) => publicHistoryMatchesPresence(item, presence));
  const resetHistoryPosition = () => {
    setHistoryPage(1);
    setSelected(null);
  };
  const selectHistorySurface = (next: "timeline" | "calendar") => {
    setSurface(next);
    resetHistoryPosition();
  };
  const selectHistoryFilter = (next: PublicHistoryFilter) => {
    setFilter(next);
    resetHistoryPosition();
  };
  const canSyncNativeX = Boolean(presence && presence.connectionMode !== "bridge" && presence.channel === "x" && presence.environment !== "sandbox" && state.nativeConnections.some((item) => item.presenceId === presence.id && item.kind === "x"));
  const syncNow = async () => {
    if (!presence || !canSyncNativeX || refreshing) return;
    setRefreshing(true);
    try {
      await mutate({ type: "syncNativeX", presenceId: presence.id });
    } finally {
      setRefreshing(false);
    }
  };
  const filteredHistory = allHistory.filter((item) => matchesPublicHistoryFilter(item, filter));
  const historyPageCount = Math.max(1, Math.ceil(filteredHistory.length / PUBLIC_HISTORY_PAGE_SIZE));
  const visibleHistoryPage = Math.min(historyPage, historyPageCount);
  const paginatedHistory = filteredHistory.slice(
    (visibleHistoryPage - 1) * PUBLIC_HISTORY_PAGE_SIZE,
    visibleHistoryPage * PUBLIC_HISTORY_PAGE_SIZE,
  );
  const moveHistoryPage = (amount: number) => {
    setSelected(null);
    setHistoryPage((current) => Math.min(historyPageCount, Math.max(1, current + amount)));
  };
  const selectedIndex = selected ? filteredHistory.findIndex((item) => item.id === selected.id) : -1;
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
      <PageHeader
        eyebrow="Verified public history"
        title="Feed"
        description={<>What {presence?.name ?? "this Presence"} has put into the world.</>}
        actionsClassName="heading-actions calendar-heading-actions"
        actions={<>
          <span className="scope-summary">{presence ? `${channelLabel(presence.channel, state.channelDefinitions)} · ${presence.name}` : "No Presence selected"}</span>
          {canSyncNativeX && <Button variant="secondary" onClick={() => void syncNow()} disabled={refreshing}><RotateCcw size={15} /> {refreshing ? "Syncing…" : "Sync now"}</Button>}
          <Button variant="secondary" onClick={() => setView("schedule")}><Clock3 size={15} /> Schedule</Button>
        </>}
      />
      <div className="public-history-view-controls">
        <div className="public-history-view-toggle" role="group" aria-label="Public history view">
          <button type="button" className={surface === "timeline" ? "active" : ""} aria-pressed={surface === "timeline"} onClick={() => selectHistorySurface("timeline")}>Timeline</button>
          <button type="button" className={surface === "calendar" ? "active" : ""} aria-pressed={surface === "calendar"} onClick={() => selectHistorySurface("calendar")}>Calendar</button>
        </div>
        <div className={`mirror-health mirror-health-${mirrorHealth.tone}`} aria-label={`Social Mirror status: ${mirrorHealth.label}`}>
          <span className="mirror-health-dot" aria-hidden="true" />
          <span><strong>{mirrorHealth.label}</strong><small>{mirrorHealth.detail}</small></span>
        </div>
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
            {(["all", "originals", "replies", "quote", "repost"] as const).map((item) => <button type="button" key={item} className={filter === item ? "active" : ""} aria-pressed={filter === item} onClick={() => selectHistoryFilter(item)}>{item === "all" ? "All" : item === "quote" ? "Quotes" : item === "repost" ? "Reposts" : item[0].toUpperCase() + item.slice(1)}</button>)}
          </div>
        ) : (
          <>
            <div className="calendar-view-toggle" role="group" aria-label="Calendar history view">
              {(["week", "month", "day"] as const).map((item) => <button type="button" key={item} className={range === item ? "active" : ""} aria-pressed={range === item} onClick={() => setRange(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}
            </div>
            <div className="feed-filter" role="group" aria-label="Calendar filter">
              {(["all", "originals", "replies", "quote", "repost"] as const).map((item) => <button type="button" key={item} className={filter === item ? "active" : ""} aria-pressed={filter === item} onClick={() => selectHistoryFilter(item)}>{item === "all" ? "All" : item === "quote" ? "Quotes" : item === "repost" ? "Reposts" : item[0].toUpperCase() + item.slice(1)}</button>)}
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
            <>
              <FeedHistory history={paginatedHistory} state={state} presenceName={presence?.name ?? "this Presence"} onSelect={setSelected} />
              {filteredHistory.length > PUBLIC_HISTORY_PAGE_SIZE && <nav className="public-history-pagination" aria-label="Feed pages">
                <span className="public-history-pagination-count">
                  Showing {(visibleHistoryPage - 1) * PUBLIC_HISTORY_PAGE_SIZE + 1}–{Math.min(visibleHistoryPage * PUBLIC_HISTORY_PAGE_SIZE, filteredHistory.length)} of {filteredHistory.length}
                </span>
                <div className="public-history-pagination-controls">
                  <button type="button" className="public-history-pagination-button" onClick={() => moveHistoryPage(-1)} disabled={visibleHistoryPage <= 1}>
                    <ChevronRight size={14} style={{ transform: "rotate(180deg)" }} /> Newer
                  </button>
                  <span aria-live="polite">Page {visibleHistoryPage} of {historyPageCount}</span>
                  <button type="button" className="public-history-pagination-button" onClick={() => moveHistoryPage(1)} disabled={visibleHistoryPage >= historyPageCount}>
                    Older <ChevronRight size={14} />
                  </button>
                </div>
              </nav>}
            </>
          ) : range === "month" ? (
            <MonthHistory anchor={anchor} history={filteredHistory} state={state} onSelect={setSelected} />
          ) : range === "day" ? (
            <DayHistory date={anchor} history={historyForDay(anchor)} state={state} onSelect={setSelected} />
          ) : (
            <WeekHistory anchor={anchor} history={filteredHistory} state={state} presenceName={presence?.name ?? "this Presence"} onSelect={setSelected} />
          )}
          {!filteredHistory.length && <EmptyState title="No public expression yet" body={mirrorHealth.tone === "healthy" || mirrorHealth.tone === "sandbox" ? `${mirrorHealth.detail}. ${presence?.name ?? "This Presence"} has not put anything into the public world yet.` : `${mirrorHealth.detail}.` } action={<Button variant="secondary" onClick={() => setView("schedule")}><Clock3 size={14} /> Open Schedule</Button>} />}
        </section>
        {selected && <PublicHistoryInspector item={selected} state={state} mutate={mutate} index={selectedIndex} total={filteredHistory.length} onNavigate={(offset) => { const next = filteredHistory[selectedIndex + offset]; if (next) setSelected(next); }} onClose={() => setSelected(null)} onActivity={() => setView("live")} />}
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
    const displayAt = historyDisplayAt(item);
    const key = dateKey(displayAt);
    const group = groups.find((candidate) => candidate.key === key);
    if (group) group.items.push(item);
    else groups.push({ key, label: dateLabel(displayAt), items: [item] });
  });
  return <div className="feed-history">{groups.map((group) => <section className="feed-date-group" key={group.key} aria-label={group.label}><div className="feed-date-heading">{group.label}</div><div className="feed-items">{group.items.map((item) => <FeedItem key={item.id} item={item} state={state} presenceName={presenceName} onSelect={onSelect} />)}</div></section>)}</div>;
}

function FeedItem({ item, state, presenceName, onSelect }: { item: PublicHistoryItem; state: OpenPresenceState; presenceName: string; onSelect: (item: PublicHistoryItem) => void }) {
  const presence = state.presences.find((candidate) => candidate.id === item.presenceId);
  const kindLabel = item.kind === "post" ? "Original" : item.kind[0].toUpperCase() + item.kind.slice(1);
  const assets = (item.assetIds ?? []).map((id) => state.assets.find((asset) => asset.id === id)).filter((asset): asset is OpenPresenceState["assets"][number] => Boolean(asset));
  const displayAt = historyDisplayAt(item);
  const originLabel = item.origin?.kind === "publishing_initiative" ? "Publishing Initiative original" : item.origin?.kind === "assignment" ? "Assignment original" : item.origin?.kind === "inbound_social" ? "Inbound conversation" : item.origin?.kind === "standing_intent" ? "Standing intention" : item.origin?.kind === "operator" ? "Operator-directed" : undefined;
  const channelTag = publicHistoryChannelTag(item, state.channelDefinitions);
  const isDeleted = item.availability === "deleted";
  return <article className={`feed-item-shell mirror-post ${isDeleted ? "feed-item-shell-deleted" : ""}`}>
    <button type="button" className={`feed-item feed-item-${item.kind}`} onClick={() => onSelect(item)}>
      <span className="feed-item-header mirror-post-header"><ChannelAvatar className="feed-avatar mirror-avatar" avatarUrl={item.authorAvatarUrl} name={presence?.name ?? presenceName} /><span className="feed-item-identity mirror-post-author"><strong>{presence?.name ?? presenceName}</strong><small>{presence?.handle ?? ""} · {kindLabel}</small></span>{isDeleted && <span className="feed-item-availability feed-item-availability-deleted"><Trash2 size={11} /> Deleted on X</span>}<time dateTime={displayAt} title={historyTimeTitle(item)}>{formatHistoryTimestamp(displayAt)}</time></span>
      {item.kind === "reply" || item.kind === "comment" ? <span className="feed-item-context">Replying in a public conversation</span> : null}
      {originLabel ? <span className="feed-item-context">{originLabel}</span> : null}
      <span className="feed-item-text mirror-post-content">{item.text || (item.kind === "repost" ? "Passed along publicly." : "Public expression without returned text.")}</span>
      {assets.length > 0 && <span className="feed-item-assets">{assets.map((asset) => { const source = asset?.storage ? `/api/assets/${asset.id}` : asset?.dataUrl ?? asset?.provenance.sourceUrl; return source && (asset.type === "image" || asset.type === "gif" || asset.type === "chart") ? <span className="feed-item-asset" key={asset.id}><img src={source} alt={asset.description ?? `Published ${asset.type}`} />{asset.provenance.sourcePageUrl && <span className="feed-item-source">Source: {asset.provenance.publisher ?? asset.description ?? "Open source"}</span>}</span> : source && asset.type === "video" ? <video key={asset.id} controls src={source} aria-label="Published video" /> : <span className="social-link-asset" key={asset?.id}>{asset?.type === "link" ? asset.provenance.sourceUrl : `${asset?.type ?? "Asset"} published`}</span>; })}</span>}
      <span className="feed-item-footer mirror-post-footer"><span>View details <ChevronRight size={13} /></span><span className="feed-item-channel-badge" aria-label={`Channel: ${channelTag}`}><Badge size={12} aria-hidden="true" />{channelTag}</span></span>
    </button>
    {item.environment !== "sandbox" && <div className="feed-item-source-row">{item.externalUrl ? <a className={`feed-item-source-link ${isDeleted ? "feed-item-source-link-deleted" : ""}`} href={item.externalUrl} target="_blank" rel="noreferrer"><ArrowUpRight size={12} /> {isDeleted ? "Open original URL · deleted on X" : item.kind === "reply" || item.kind === "comment" ? "Open reply on X" : "Open original post on X"}</a> : <span className="feed-item-source-unavailable">Original X URL unavailable</span>}</div>}
  </article>;
}

function HistoryCard({ item, state, onSelect, compact = false }: { item: PublicHistoryItem; state: OpenPresenceState; onSelect: (item: PublicHistoryItem) => void; compact?: boolean }) {
  const label = item.kind === "post" ? "POST" : item.kind.toUpperCase();
  const displayAt = historyDisplayAt(item);
  const channelTag = publicHistoryChannelTag(item, state.channelDefinitions);
  const isDeleted = item.availability === "deleted";
  return <button type="button" className={`history-card history-card-${item.kind} ${compact ? "compact" : ""}`} onClick={() => onSelect(item)}>
    <span className="history-card-kicker"><span className="history-card-author"><ChannelAvatar className="history-card-avatar" avatarUrl={item.authorAvatarUrl} name={state.presences.find((presence) => presence.id === item.presenceId)?.name ?? "Presence"} /><strong>{label}</strong>{isDeleted && <span className="history-card-availability"><Trash2 size={10} /> Deleted</span>}</span><time dateTime={displayAt} title={historyTimeTitle(item)}>{formatHistoryTimestamp(displayAt)}</time></span>
    {item.text ? <span className="history-card-text">{item.text}</span> : <span className="history-card-text quiet">{item.kind === "repost" ? "Passed along publicly" : "Public expression"}</span>}
    <span className="history-card-footer"><span className="history-card-proof">{isDeleted ? "Deleted on X · retained in Social Mirror" : item.environment === "sandbox" ? "Verified in Sandbox Mirror · simulated only" : item.externalUrl ? "Verified on X" : "Verified in Social Mirror"}</span><span className="history-card-channel-badge" aria-label={`Channel: ${channelTag}`}><Badge size={11} aria-hidden="true" />{channelTag}</span></span>
  </button>;
}

function historyHourWindow(history: PublicHistoryItem[]) {
  const activeHours = history.map((item) => new Date(historyDisplayAt(item)).getHours());
  if (!activeHours.length) return { start: 0, end: 0 };
  return { start: Math.max(0, Math.min(...activeHours) - 1), end: Math.min(24, Math.max(...activeHours) + 2) };
}

function WeekHistory({ anchor, history, state, presenceName, onSelect }: { anchor: Date; history: PublicHistoryItem[]; state: OpenPresenceState; presenceName: string; onSelect: (item: PublicHistoryItem) => void }) {
  const start = new Date(anchor);
  const day = start.getDay();
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  start.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, index) => new Date(start.getTime() + index * 86400000));
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const weekItems = history.filter((item) => {
    const timestamp = new Date(historyDisplayAt(item));
    return timestamp >= start && timestamp < end;
  });
  const hourWindow = historyHourWindow(weekItems);
  const hours = Array.from({ length: hourWindow.end - hourWindow.start }, (_, index) => hourWindow.start + index);
  const gridHeight = hours.length * 56;
  const gridRows = `repeat(${hours.length}, 56px)`;
  if (!weekItems.length) return <div className="history-calendar-empty">No public activity in this week.</div>;
  return <div className="history-week" aria-label={`Weekly public history for ${presenceName}`}>
    <div className="history-week-grid">
      <div className="history-week-header"><span>Local time</span>{days.map((date) => <span key={date.toISOString()}>{date.toLocaleDateString("en", { weekday: "short" })}<small>{date.getDate()}</small></span>)}</div>
      <div className="history-week-body" style={{ height: gridHeight }}><div className="history-time-rail" style={{ gridTemplateRows: gridRows }}>{hours.map((hour) => <span key={hour}>{String(hour).padStart(2, "0")}:00</span>)}</div>{days.map((date) => {
        const dayItems = weekItems.filter((item) => new Date(historyDisplayAt(item)).toDateString() === date.toDateString());
        return <div className="history-day-column" style={{ gridTemplateRows: gridRows, height: gridHeight }} key={date.toISOString()}>{hours.map((hour) => <div className="history-hour-cell" key={hour} />)}{dayItems.map((item) => { const timestamp = new Date(historyDisplayAt(item)); const top = Math.max(2, ((timestamp.getHours() + timestamp.getMinutes() / 60 - hourWindow.start) * 56)); return <div key={item.id} className="history-positioned-card" style={{ top }}><HistoryCard item={item} state={state} onSelect={onSelect} compact /></div>; })}</div>;
      })}</div>
    </div>
  </div>;
}

function MonthHistory({ anchor, history, state, onSelect }: { anchor: Date; history: PublicHistoryItem[]; state: OpenPresenceState; onSelect: (item: PublicHistoryItem) => void }) {
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(monthStart); const day = start.getDay(); start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  const days = Array.from({ length: 42 }, (_, index) => new Date(start.getTime() + index * 86400000));
  return <div className="history-month"><div className="history-month-header">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div><div className="history-month-grid">{days.map((date) => { const items = history.filter((item) => new Date(historyDisplayAt(item)).toDateString() === date.toDateString()); return <div className={`history-month-day ${date.getMonth() !== anchor.getMonth() ? "outside" : ""}`} key={date.toISOString()}><strong>{date.getDate()}</strong>{items.slice(0, 4).map((item) => <HistoryCard key={item.id} item={item} state={state} onSelect={onSelect} compact />)}{items.length > 4 && <small className="history-more">+ {items.length - 4} more</small>}</div>; })}</div></div>;
}

function DayHistory({ date, history, state, onSelect }: { date: Date; history: PublicHistoryItem[]; state: OpenPresenceState; onSelect: (item: PublicHistoryItem) => void }) {
  const dayItems = history.filter((item) => new Date(historyDisplayAt(item)).toDateString() === date.toDateString());
  const hourWindow = historyHourWindow(dayItems);
  const hours = Array.from({ length: hourWindow.end - hourWindow.start }, (_, index) => hourWindow.start + index);
  return <div className="history-day"><div className="history-day-header"><SectionEyebrow>{date.toLocaleDateString("en", { weekday: "long" })}</SectionEyebrow><h2>{date.toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" })}</h2><p>Public history appears here.</p></div>{dayItems.length ? <div className="history-day-timeline">{hours.map((hour) => <div className="history-timeline-row" key={hour}><span>{String(hour).padStart(2, "0")}:00</span><div>{dayItems.filter((item) => new Date(historyDisplayAt(item)).getHours() === hour).map((item) => <HistoryCard key={item.id} item={item} state={state} onSelect={onSelect} />)}</div></div>)}</div> : <div className="history-calendar-empty">No public activity on this day.</div>}</div>;
}

function PublicHistoryInspector({ item, state, mutate, index, total, onNavigate, onClose, onActivity }: { item: PublicHistoryItem; state: OpenPresenceState; mutate: Mutate; index: number; total: number; onNavigate: (offset: number) => void; onClose: () => void; onActivity: () => void }) {
  const [postIdCopied, setPostIdCopied] = useState(false);
  const presence = state.presences.find((candidate) => candidate.id === item.presenceId);
  const mirrorObject = state.mirrorObjects.find((object) => object.id === item.id || (object.externalRef.type === item.externalRef.type && object.externalRef.id === item.externalRef.id));
  const assignment = mirrorObject?.assignmentId ? state.assignments.find((candidate) => candidate.id === mirrorObject.assignmentId) : undefined;
  const parent = item.parentExternalRef ? state.mirrorObjects.find((object) => object.externalRef.type === item.parentExternalRef?.type && object.externalRef.id === item.parentExternalRef?.id) : undefined;
  const metrics = Object.entries(item.metrics);
  const itemAssets = (item.assetIds ?? []).map((id) => state.assets.find((asset) => asset.id === id)).filter((asset): asset is OpenPresenceState["assets"][number] => Boolean(asset));
  const kindLabel = item.kind === "post" ? "Post" : item.kind[0].toUpperCase() + item.kind.slice(1);
  const position = Math.max(0, index) + 1;
  const displayAt = historyDisplayAt(item);
  const isDeleted = item.availability === "deleted";
  const originLabel = item.origin?.kind === "publishing_initiative" ? `Publishing Initiative · revision ${item.origin.planRevision ?? "current"}` : item.origin?.kind === "assignment" ? "Assignment output" : item.origin?.kind === "inbound_social" ? "Inbound conversation" : item.origin?.kind === "standing_intent" ? "Standing intention" : item.origin?.kind === "operator" ? "Operator-directed" : "Origin not recorded";
  const copyPostId = async () => {
    try {
      await navigator.clipboard.writeText(item.id);
      setPostIdCopied(true);
      window.setTimeout(() => setPostIdCopied(false), 1600);
    } catch {
      setPostIdCopied(false);
    }
  };
  return <aside className="history-inspector" aria-label={`${kindLabel} details`}><div className="history-inspector-header"><div><SectionEyebrow>{kindLabel} details</SectionEyebrow><h2>{kindLabel}</h2><small title={historyTimeTitle(item)}>{formatHistoryTimestamp(displayAt)}{item.environment === "sandbox" ? " · Sandbox observed" : ""}</small></div><button type="button" aria-label="Close inspector" onClick={onClose}><X size={16} /></button></div>{isDeleted && <div className="history-availability history-availability-deleted"><Trash2 size={14} /><span><strong>Deleted on X</strong><small>The original is retained here as verified history, but X no longer serves it.</small></span></div>}<div className="history-inspector-navigation" aria-label="Browse public posts"><span aria-live="polite"><strong>Post {position}</strong> of {total}</span><div><button type="button" aria-label="Previous post" disabled={index <= 0} onClick={() => onNavigate(-1)}><ChevronRight size={14} style={{ transform: "rotate(180deg)" }} /></button><button type="button" aria-label="Next post" disabled={index < 0 || index >= total - 1} onClick={() => onNavigate(1)}><ChevronRight size={14} /></button></div></div><div className="history-inspector-identity"><PresenceGlyph accent={presence?.accent ?? "#D68754"} /><span><strong>{presence?.name ?? "Presence"}</strong><small>{presence?.handle ?? ""}</small></span></div>{parent?.content?.text && <div className="history-parent-context"><SectionEyebrow>Replying to</SectionEyebrow><p>{parent.content.text}</p><small>{parent.author?.displayName ?? "Public conversation"}</small></div>}<p className="history-inspector-text">{item.text || (item.kind === "repost" ? "Passed along publicly." : "No text was returned by the channel.")}</p>{mirrorObject?.assetRefs?.length ? <MediaPerceptionDisclosure object={mirrorObject} state={state} mutate={mutate} presenceName={presence?.name ?? "this Presence"} /> : null}{itemAssets.length > 0 && <section className="history-provenance"><SectionEyebrow>Attached sources</SectionEyebrow>{itemAssets.map((asset) => <div key={asset.id}><a className="history-external-link" href={asset.provenance.sourcePageUrl ?? asset.provenance.sourceUrl} target="_blank" rel="noreferrer"><ArrowUpRight size={14} /> {asset.provenance.publisher ?? asset.description ?? "Open source"}</a><small>Origin: {asset.provenance.origin}. Source identity: {asset.provenance.sourceIdentityStatus ?? "unknown"}. Rights: {asset.rights?.status ?? "unknown"}.</small></div>)}</section>}<div className="history-proof">{isDeleted ? <Trash2 size={14} /> : <Check size={14} />}<span>{isDeleted ? "Deleted on X · retained in Social Mirror" : `Observed in Social Mirror · ${item.externalRef.type}`}</span><button type="button" className="history-copy-id" aria-label="Copy internal post ID" title="Copy internal post ID" onClick={() => void copyPostId()}><Copy size={12} /> {postIdCopied ? "Copied" : "Copy ID"}</button></div><section className="history-provenance"><SectionEyebrow>Provenance</SectionEyebrow><p>{originLabel}</p><p>{item.executionId ? "Published by OpenPresence and verified in the Social Mirror." : "Observed on the connected channel and attributed to this Presence."}</p>{item.origin?.planWindowId && <small>Plan window: {item.origin.planWindowId}</small>}{assignment && <p>Assignment output · {assignment.progress.verified} / {assignment.progress.required} verified publications</p>}{mirrorObject?.environment === "sandbox" && <small>Simulated social reality · this expression has no live destination. Sandbox world time: {formatTime(item.occurredAt)}.</small>}</section><section className="history-outcome"><SectionEyebrow>Outcome</SectionEyebrow>{metrics.length ? <div className="history-outcome-grid">{metrics.map(([key, value]) => <div key={key}><strong>{value}</strong><small>{key.replaceAll("_", " ")}</small></div>)}</div> : <p>No channel outcome evidence is attached to this expression yet.</p>}</section><div className="history-inspector-actions">{item.externalUrl ? <a className="history-external-link" href={item.externalUrl} target="_blank" rel="noreferrer"><ArrowUpRight size={14} /> {isDeleted ? "Open original URL · deleted on X" : item.kind === "reply" || item.kind === "comment" ? "Open reply on X" : "Open original on X"}</a> : item.environment === "sandbox" && item.channel === "x" ? <p className="history-sandbox-note">Sandbox rehearsal only. This expression has no live destination.</p> : item.channel === "x" ? <p className="history-sandbox-note">X URL unavailable from the connected account.</p> : null}<Button variant="secondary" onClick={onActivity}><Activity size={14} /> View in Activity</Button></div></aside>;
}

function ScheduleLayerToolbar({
  plan,
  presenceName,
  layers,
  onToggle,
  onReset,
  mutate,
}: {
  plan?: PublishingPlan;
  presenceName: string;
  layers: ScheduleLayerVisibility;
  onToggle: (layer: keyof ScheduleLayerVisibility) => void;
  onReset: () => void;
  mutate: Mutate;
}) {
  return (
    <section className="schedule-layer-toolbar" aria-label="Calendar layers">
      <div className="schedule-layer-intro">
        <SectionEyebrow>Calendar layers</SectionEyebrow>
        <p>Compare {presenceName}&apos;s flexible publishing plan with the Assignments that shape when the Presence can work toward an outcome.</p>
      </div>
      <div className="schedule-layer-controls">
        {(["plan", "assignments"] as const).map((layer) => {
          const labels = { plan: "Publishing plan", assignments: "Assignments" };
          return <label className={`schedule-layer-toggle schedule-layer-toggle-${layer} ${layers[layer] ? "selected" : ""} ${layer === "plan" && !plan ? "unavailable" : ""}`} key={layer}>
            <input type="checkbox" checked={layers[layer]} disabled={layer === "plan" && !plan} onChange={() => onToggle(layer)} />
            <span className="schedule-layer-mark" aria-hidden="true" />
            <span>{labels[layer]}</span>
          </label>;
        })}
      </div>
      <div className="schedule-layer-actions">
        {plan ? <>
          <span className="schedule-plan-status">Plan {plan.status === "active" ? "active" : plan.status}</span>
          <Button type="button" variant="ghost" onClick={() => void mutate({ type: "replanPublishing", presenceId: plan.presenceId })}>Replan</Button>
        </> : <Button type="button" variant="ghost" onClick={() => void mutate({ type: "replanPublishing" })}>Create plan</Button>}
        <Button type="button" variant="ghost" onClick={onReset}>Show all</Button>
      </div>
    </section>
  );
}

function ScheduleLegend({ plan, layers }: { plan?: PublishingPlan; layers: ScheduleLayerVisibility }) {
  return <div className="week-calendar-legend schedule-list-legend" aria-label="Schedule legend">
    {plan && layers.plan && <span><i className="legend-dot plan-legend-dot" />Publishing plan</span>}
    {layers.assignments && <span><i className="legend-dot assignment-legend-dot" />Assignment</span>}
  </div>;
}

function PublishingPlanScheduleSummary({ plan, presenceName }: { plan: PublishingPlan; presenceName: string }) {
  const [expanded, setExpanded] = useState(false);
  const activeWindow = plan.windows.find((window) => window.status === "active") ?? plan.windows.find((window) => window.status === "future");
  const formatPlanDateTime = (value: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: plan.timezone }).format(new Date(value));
  const formatPlanDate = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: plan.timezone }).format(new Date(value));
  const pace = plan.initiativeMode === "pace" && plan.operatorTarget
    ? `About ${plan.operatorTarget.quantity} original posts per ${plan.operatorTarget.period}`
    : plan.expectedOriginals
      ? plan.expectedOriginals.min === plan.expectedOriginals.max
        ? `${plan.expectedOriginals.min} possible original${plan.expectedOriginals.max === 1 ? "" : "s"} in this plan`
        : `${plan.expectedOriginals.min}–${plan.expectedOriginals.max} possible originals in this plan`
      : "No fixed original count";
  const paceNote = plan.initiativeMode === "adaptive"
    ? `${presenceName} chooses whether a window earns a publication.`
    : "An expectation, not a forced quota; silence remains allowed.";
  const workStatus = (status: NonNullable<PublishingPlan["currentWork"]>[number]["status"]) => status.replaceAll("_", " ");
  const visibleWindows = plan.windows.filter((window) => !["completed", "missed", "superseded"].includes(window.status));
  return <section className={`publishing-plan-schedule-summary ${expanded ? "is-expanded" : "is-collapsed"}`} aria-label="Agent publishing plan">
    <div className="publishing-plan-schedule-header">
      <div>
        <SectionEyebrow>{presenceName}&apos;s current plan</SectionEyebrow>
        <h2>{plan.initiativeMode === "adaptive" ? "An adaptive publishing pace" : "A publishing pace to work toward"}</h2>
        <p>{plan.rationaleSummary ?? `${presenceName} is deciding what deserves to be published from the available evidence.`}</p>
      </div>
      <div className="publishing-plan-schedule-header-actions">
        <div className="publishing-plan-schedule-badge"><strong>Revision {plan.revision}</strong><span>{plan.status === "active" ? "Active plan" : plan.status}</span></div>
        <button type="button" className="publishing-plan-toggle" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          <span>{expanded ? "Minimize plan" : "Expand plan"}</span>
          <ChevronDown size={14} className={expanded ? "publishing-plan-toggle-icon is-open" : "publishing-plan-toggle-icon"} aria-hidden="true" />
        </button>
      </div>
    </div>
    {!expanded && <div className="publishing-plan-schedule-collapsed-summary" aria-label="Publishing plan summary">
      <div><span>Chosen pace</span><strong>{pace}</strong></div>
      <div><span>Next consideration</span><strong>{activeWindow ? `${activeWindow.purpose[0].toUpperCase()}${activeWindow.purpose.slice(1)}` : "No window queued"}</strong></div>
      <div><span>Reassess</span><strong>{plan.nextReassessmentAt ? formatPlanDateTime(plan.nextReassessmentAt) : "Not scheduled"}</strong></div>
    </div>}
    {expanded && <>
    <div className="publishing-plan-schedule-facts">
      <div><span>Chosen pace</span><strong>{pace}</strong><small>{paceNote}</small></div>
      <div><span>Plan horizon</span><strong>{formatPlanDate(plan.horizonStart)}–{formatPlanDate(plan.horizonEnd)}</strong><small>{plan.timezone}</small></div>
      <div><span>Next consideration</span><strong>{activeWindow ? `${activeWindow.purpose[0].toUpperCase()}${activeWindow.purpose.slice(1)}` : "No window queued"}</strong><small>{activeWindow ? formatPlanDateTime(activeWindow.startAt) : "The plan needs a replan."}</small></div>
      <div><span>Reassess</span><strong>{plan.nextReassessmentAt ? formatPlanDateTime(plan.nextReassessmentAt) : "Not scheduled"}</strong><small>{plan.verifiedOriginals} verified original{plan.verifiedOriginals === 1 ? "" : "s"} in this plan</small></div>
    </div>
    <div className="publishing-plan-schedule-work">
      <div className="publishing-plan-schedule-subheading"><SectionEyebrow>Current work</SectionEyebrow><span>{plan.currentWork?.length ?? 0} item{(plan.currentWork?.length ?? 0) === 1 ? "" : "s"}</span></div>
      {plan.currentWork?.length ? <div className="publishing-plan-schedule-work-list">{plan.currentWork.map((work) => <div key={work.id}><strong>{workStatus(work.status)}</strong><span>{work.summary}</span></div>)}</div> : <p className="muted">No work item is currently recorded.</p>}
    </div>
    <details className="publishing-plan-schedule-details" open>
      <summary><span>Full consideration windows</span><small>{visibleWindows.length} window{visibleWindows.length === 1 ? "" : "s"} · flexible work, not guaranteed posts</small></summary>
      <div className="publishing-plan-schedule-window-list">{visibleWindows.map((window) => <div key={window.id}><div><strong>{window.purpose}</strong><span>{formatPlanDateTime(window.startAt)} → {formatPlanDateTime(window.endAt)}</span></div><p>{window.summary}</p><small>{window.desiredContribution ? `${window.desiredContribution.min}–${window.desiredContribution.max} possible contribution${window.desiredContribution.max === 1 ? "" : "s"}` : "No contribution count set"} · {window.status === "active" ? "Active now" : "Future"}</small></div>)}</div>
    </details>
    <p className="publishing-plan-schedule-note">This is {presenceName}&apos;s current working plan. It explains when the Agent may consider publishing; it does not prewrite posts or turn every window into an obligation.</p>
    </>}
  </section>;
}

function GrowthEvidencePanel({
  snapshots,
  publicationSnapshots,
  mirrorObjects,
  review,
  reviewIsStale,
  unreviewedAudienceCount,
  unreviewedPublicationCount,
}: {
  snapshots: PresenceAudienceSnapshot[];
  publicationSnapshots: PublicationMetricSnapshot[];
  mirrorObjects: MirrorObject[];
  review?: GrowthReview;
  reviewIsStale: boolean;
  unreviewedAudienceCount: number;
  unreviewedPublicationCount: number;
}) {
  const evidenceIds = new Set(review?.evidenceIds ?? []);
  const newSnapshots = review ? snapshots.filter((item) => !evidenceIds.has(item.id)) : snapshots;
  const newPublicationSnapshots = review ? publicationSnapshots.filter((item) => !evidenceIds.has(item.id)) : publicationSnapshots;
  const latest = snapshots[0];
  const latestPublication = publicationSnapshots[0];
  const metricHighlights = latestPublication ? [
    latestPublication.impressions !== undefined ? latestPublication.impressions.toLocaleString() + " impressions" : undefined,
    latestPublication.likes !== undefined ? latestPublication.likes.toLocaleString() + " likes" : undefined,
    latestPublication.replies !== undefined ? latestPublication.replies.toLocaleString() + " replies" : undefined,
  ].filter(Boolean).slice(0, 2).join(" · ") : "No publication metrics yet";
  const formatSnapshotStatus = (status: PresenceAudienceSnapshot["observationStatus"] | PublicationMetricSnapshot["observationStatus"]) => status === "observed" ? "Verified" : status.replaceAll("_", " ");
  const totalNew = unreviewedAudienceCount + unreviewedPublicationCount;
  const summary = reviewIsStale
    ? totalNew + " new signal" + (totalNew === 1 ? "" : "s") + " arrived after the last Growth read. Genny has not interpreted them yet."
    : review
      ? "The evidence below is already included in Genny's latest Growth read."
      : "These verified observations are waiting for Genny's first Growth read.";
  return <section className="growth-evidence-panel settings-card" aria-label="Growth evidence">
    <div className="growth-evidence-panel-heading"><div><SectionEyebrow>{reviewIsStale ? "New evidence" : "Evidence"}</SectionEyebrow><h2>{reviewIsStale ? "Fresh signals are ready" : "What Genny can see"}</h2><p>{summary}</p></div><span className={"growth-evidence-state " + (reviewIsStale ? "growth-evidence-state-new" : "")}>{reviewIsStale ? "Not read yet" : review ? "Included in read" : "Awaiting first read"}</span></div>
    <div className="growth-evidence-summary-grid">
      <div><span>Audience</span><strong>{latest ? latest.followers.toLocaleString() + " followers" : "Not observed"}</strong><small>{newSnapshots.length ? newSnapshots.length + " new snapshot" + (newSnapshots.length === 1 ? "" : "s") : "No new snapshot"}{latest ? " · " + formatHistoryTimestamp(latest.observedAt) : ""}</small></div>
      <div><span>Publication performance</span><strong>{newPublicationSnapshots.length ? newPublicationSnapshots.length + " new post" + (newPublicationSnapshots.length === 1 ? "" : "s") : latestPublication ? "Up to date" : "Not observed"}</strong><small>{latestPublication ? metricHighlights + " · " + formatHistoryTimestamp(latestPublication.observedAt) : "No verified metrics yet"}</small></div>
    </div>
    <details className="growth-evidence-details" open={reviewIsStale}>
      <summary><span>View the evidence</span><small>{reviewIsStale ? "These snapshots are not in the current read" : "Latest verified observations"}</small></summary>
      <div className="growth-evidence-columns">
        <div><div className="growth-evidence-subheading"><strong>Audience snapshots</strong><span>{newSnapshots.length || snapshots.length}</span></div>{(newSnapshots.length ? newSnapshots : snapshots).slice(0, 4).map((item) => <div className="growth-evidence-row" key={item.id}><strong>{item.followers.toLocaleString()} followers</strong><span>{formatHistoryTimestamp(item.observedAt)} · {item.source} · {formatSnapshotStatus(item.observationStatus)}</span></div>)}{!snapshots.length && <p className="muted">No verified audience snapshot has arrived.</p>}</div>
        <div><div className="growth-evidence-subheading"><strong>Publication snapshots</strong><span>{newPublicationSnapshots.length || publicationSnapshots.length}</span></div>{(newPublicationSnapshots.length ? newPublicationSnapshots : publicationSnapshots).slice(0, 4).map((item) => { const object = mirrorObjects.find((candidate) => candidate.id === item.mirrorObjectId); const text = object?.content?.text?.trim() || "Publication performance observed"; const externalUrl = object ? externalUrlForMirrorObject(object, object.author?.handle) : undefined; return <div className="growth-evidence-row growth-evidence-publication" key={item.id}><div><strong>{object?.author?.handle ? "@" + object.author.handle : object?.author?.displayName ?? "X publication"}</strong><span>{text.length > 110 ? text.slice(0, 107) + "…" : text}</span></div><small>{[item.impressions !== undefined ? item.impressions.toLocaleString() + " views" : undefined, item.likes !== undefined ? item.likes.toLocaleString() + " likes" : undefined, formatSnapshotStatus(item.observationStatus)].filter(Boolean).join(" · ")}{externalUrl && <a href={externalUrl} target="_blank" rel="noreferrer">View post</a>}</small></div>; })}{!publicationSnapshots.length && <p className="muted">No verified publication-performance snapshot has arrived.</p>}</div>
      </div>
    </details>
    <p className="growth-evidence-note">Evidence is shown immediately. Genny&apos;s interpretation updates on its scheduled review rhythm; viewing these snapshots does not spend a review call or change the plan.</p>
  </section>;
}

function GrowthReadPanel({ review, reviewingGrowth, reviewGrowth }: { review?: GrowthReview; reviewingGrowth: boolean; reviewGrowth: (kind: "weekly" | "strategic") => void }) {
  if (!review) return <section className="settings-card" aria-busy={reviewingGrowth}><div className="section-heading compact"><div><SectionEyebrow>Genny&apos;s current read</SectionEyebrow><h2>Growth read</h2></div><TrendingUp size={17} /></div><div className="growth-no-review"><p>Genny has not interpreted the available evidence yet. The observations are visible above and the next scheduled review will turn them into a decision.</p><Button variant="secondary" disabled={reviewingGrowth} onClick={() => void reviewGrowth("weekly")}>{reviewingGrowth ? <><LoaderCircle size={14} className="spin" /> Updating read…</> : "Update read now"}</Button></div></section>;
  const signals = [
    { key: "working", label: "Helping growth", tone: "positive", items: review.working },
    { key: "uncertain", label: "Still unclear", tone: "uncertain", items: review.uncertain },
    { key: "weak", label: "Holding growth back", tone: "weak", items: review.weak },
  ];
  return <section className="settings-card growth-read-panel" aria-busy={reviewingGrowth} aria-label="Genny's current read">
    <div className="section-heading compact"><div><SectionEyebrow>Genny&apos;s current read</SectionEyebrow><h2>Growth read</h2></div><span className="growth-read-meta">{review.kind === "strategic" ? "Strategic" : "Weekly"} · {formatHistoryTimestamp(review.createdAt)}</span></div>
    <p className="growth-read-lead">{review.working.length ? "The strongest signal is positive, but it is not proof of follower growth yet." : review.weak.length ? "The current evidence does not justify more aggressive growth activity." : "The evidence is still too early to support a strong conclusion."}</p>
    <div className="growth-signal-grid">{signals.map((signal) => <div className={"growth-signal growth-signal-" + signal.tone} key={signal.key}><div><span>{signal.label}</span><strong>{signal.items.length}</strong></div>{signal.items.length ? <p>{signal.items[0]}</p> : <p>None recorded.</p>}</div>)}</div>
    <details className="growth-read-details"><summary><span>Read the reasoning</span><small>Why Genny reached this read</small></summary><p>{review.summary}</p><div className="growth-read-list">{signals.map((signal) => <div key={signal.key}><strong>{signal.label}</strong>{signal.items.length ? <ul>{signal.items.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="muted">None recorded.</p>}</div>)}</div></details>
  </section>;
}

function GrowthView({ state, mutate, setView }: { state: OpenPresenceState; mutate: Mutate; setView: (view: View) => void }) {
  const presence = state.presence;
  const [countdownNow, setCountdownNow] = useState<number | null>(null);
  const [reviewingGrowth, setReviewingGrowth] = useState(false);
  const clockAssignment = presence ? state.assignments.find((item) => item.presenceId === presence.id && item.successEvidence?.metric === "followers" && assignmentIsOpen(item)) : undefined;
  const nextGrowthReviewAt = [clockAssignment?.plan?.nextWeeklyReviewAt, clockAssignment?.plan?.nextStrategicReviewAt].filter((value): value is string => Boolean(value)).sort((left, right) => left.localeCompare(right))[0];
  useEffect(() => {
    if (!nextGrowthReviewAt) return;
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [nextGrowthReviewAt]);
  if (!presence) return <div className="page"><PageHeader eyebrow="Growth" title="No Presence selected" description="Select a Presence before reviewing growth evidence." /></div>;
  const assignment = clockAssignment;
  const deltas = audienceDeltas(state, presence.id);
  const snapshots = collapseAudienceSnapshots(state.audienceSnapshots.filter((item) => item.presenceId === presence.id));
  const latest = snapshots[0];
  const publicationSnapshots = state.publicationMetricSnapshots.filter((item) => item.presenceId === presence.id).sort((left, right) => right.observedAt.localeCompare(left.observedAt));
  const latestPublicationSnapshot = publicationSnapshots[0];
  const latestEvidence = [latest?.observedAt, latestPublicationSnapshot?.observedAt].filter((value): value is string => Boolean(value)).sort((left, right) => right.localeCompare(left))[0];
  const review = state.growthReviews.filter((item) => item.presenceId === presence.id).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const unreviewedAudienceCount = review ? snapshots.filter((item) => !(review.evidenceIds ?? []).includes(item.id)).length : 0;
  const unreviewedPublicationCount = review ? publicationSnapshots.filter((item) => !(review.evidenceIds ?? []).includes(item.id)).length : 0;
  const reviewIsStale = Boolean(review && (unreviewedAudienceCount > 0 || unreviewedPublicationCount > 0));
  const manifest = derivePresenceCapabilityManifest(state, presence.id);
  const limitations = manifest.items.filter((item) => item.availability !== "available");
  const limitationCopy = [...new Set(limitations.map((item) => item.limitation).filter((item): item is string => Boolean(item)))];
  const goal = assignment?.successEvidence?.value ?? 100_000;
  const progress = latest ? Math.min(100, Math.round((latest.followers / goal) * 100)) : 0;
  const usesChromeExtensionRoute = presence.connectionMode === "bridge";
  const bridge = usesChromeExtensionRoute ? state.bridges.find((item) => item.presenceId === presence.id && item.state !== "offline") : undefined;
  const bridgeConnected = Boolean(bridge && bridgeAdapterStatus(bridge) === "connected");
  const nativeConnection = state.nativeConnections.find((item) => item.presenceId === presence.id && item.channelId === presence.channel);
  const nextChannelObservationAt = nativeConnection?.observation?.nextObservationAt;
  const nextGrowthReviewCountdown = countdownNow === null ? undefined : formatCountdown(nextGrowthReviewAt, countdownNow);
  const bodyHeading = manifest.bodyStatus === "degraded" ? "Degraded" : manifest.bodyStatus === "ready" ? limitations.length ? "Ready with limits" : "Ready to work" : "Unavailable";
  const createGrowthResponsibility = async () => {
    await mutate({ type: "createAssignment", presenceId: presence.id, environment: presence.connectionMode === "sandbox" ? "sandbox" : "live", instruction: `Grow this Presence toward ${goal.toLocaleString()} followers while building an audience of ${presence.brief.audience}.` });
  };
  const reviewGrowth = async (kind: "weekly" | "strategic") => {
    if (reviewingGrowth || !assignment) return;
    setReviewingGrowth(true);
    try {
      await mutate({ type: "reviewGrowth", presenceId: presence.id, assignmentId: assignment.id, kind });
    } finally {
      setReviewingGrowth(false);
    }
  };
  return <div className="page growth-page">
    <PageHeader eyebrow={`${presence.name} · Growth`} title="Build durable attention" description="Growth is the Agent’s interpretation of verified audience and publication evidence—not a promise of a particular outcome." actions={<Button variant="secondary" onClick={() => setView("schedule")}><Clock3 size={14} /> Open Schedule</Button>} />
    {!assignment ? <section className="growth-empty settings-card"><div className="watch-empty-mark"><TrendingUp size={23} /></div><SectionEyebrow>Continuous responsibility</SectionEyebrow><h2>Give {presence.name} a 100K growth responsibility.</h2><p>One long-lived Assignment owns the objective. The Agent chooses the day-to-day work, observes the public result, and revises its approach during review.</p><Button variant="primary" onClick={() => void createGrowthResponsibility()}><Plus size={14} /> Create growth responsibility</Button></section> : <>
      <section className="growth-goal-card settings-card" aria-label="Growth goal">
        <div className="growth-goal-heading"><div><SectionEyebrow>Current goal</SectionEyebrow><h2>{goal.toLocaleString()} followers</h2><p>{assignment.audienceObjective ?? presence.brief.audience}</p></div><span className={`growth-status growth-status-${assignment.status}`}>{assignment.status.replaceAll("_", " ")}</span></div>
        <div className="growth-progress-track"><span style={{ width: `${progress}%` }} /></div>
        <div className="growth-stat-grid"><div><span>Observed now</span><strong>{latest ? latest.followers.toLocaleString() : "Not observed"}</strong><small>{latest ? `${formatHistoryTimestamp(latest.observedAt)} · ${latest.source}` : "Waiting for channel evidence"}</small></div><div><span>7-day change</span><strong>{deltas.sevenDay === undefined ? "Not enough data" : `${deltas.sevenDay >= 0 ? "+" : ""}${deltas.sevenDay.toLocaleString()}`}</strong><small>Compared with the latest prior snapshot</small></div><div><span>28-day change</span><strong>{deltas.twentyEightDay === undefined ? "Not enough data" : `${deltas.twentyEightDay >= 0 ? "+" : ""}${deltas.twentyEightDay.toLocaleString()}`}</strong><small>Strategic review window</small></div></div>
      </section>
      <section className="growth-freshness-card settings-card" aria-label="Growth check status">
        <div className="section-heading compact"><div><SectionEyebrow>Evidence cadence</SectionEyebrow><h2>When Growth was checked</h2></div><Clock3 size={17} /></div>
        <p className="muted">Channel evidence and Agent reviews have separate clocks. This status reports both so “not enough data” is never mistaken for a recent check.</p>
        <div className="growth-freshness-grid">
          <div><span>Last channel evidence</span><strong>{latestEvidence ? formatHistoryTimestamp(latestEvidence) : "Not observed"}</strong><small>{latestEvidence ? `${latest?.observedAt === latestEvidence ? "Audience" : "Publication performance"} · verified source` : nativeConnection ? "Native X is connected, but no metrics snapshot has arrived" : bridgeConnected ? "Chrome extension is connected, but no metrics report has arrived" : "Waiting for a connected observer"}</small></div>
          <div><span>Last Growth review</span><strong>{review ? formatHistoryTimestamp(review.createdAt) : "Not reviewed"}</strong><small>{review ? `${review.kind === "strategic" ? "Strategic" : "Weekly"} evidence review` : "No review has been completed yet"}</small></div>
          <div><span>Next Agent review</span><strong aria-live="polite">{presence.status === "paused" ? "Paused" : nextGrowthReviewCountdown === "now" ? "Due now" : nextGrowthReviewCountdown ? `In ${nextGrowthReviewCountdown}` : nextGrowthReviewAt ? "Scheduled" : "Not scheduled"}</strong><small>{presence.status === "paused" ? "Wake the Presence to resume autonomous checks" : nextGrowthReviewAt ? formatHistoryTimestamp(nextGrowthReviewAt) : "The Agent has no review time saved"}</small></div>
          <div><span>Next channel check</span><strong>{presence.status === "paused" ? "Paused" : nextChannelObservationAt ? (countdownNow === null ? "Scheduled" : formatCountdown(nextChannelObservationAt, countdownNow) === "now" ? "Due now" : `In ${formatCountdown(nextChannelObservationAt, countdownNow)}`) : bridgeConnected ? "Chrome extension-controlled" : "Unavailable"}</strong><small>{presence.status === "paused" ? "Wake the Presence to resume observation" : nextChannelObservationAt ? formatHistoryTimestamp(nextChannelObservationAt) : bridgeConnected && bridge?.lastHeartbeatAt ? `Last Chrome extension check ${formatHistoryTimestamp(bridge.lastHeartbeatAt)} · adapter cadence not exposed` : "No connected observer is reporting a next check"}</small></div>
        </div>
      </section>
      <GrowthEvidencePanel snapshots={snapshots} publicationSnapshots={publicationSnapshots} mirrorObjects={state.mirrorObjects} review={review} reviewIsStale={reviewIsStale} unreviewedAudienceCount={unreviewedAudienceCount} unreviewedPublicationCount={unreviewedPublicationCount} />
      <GrowthReadPanel review={review} reviewingGrowth={reviewingGrowth} reviewGrowth={reviewGrowth} />
      <div className="growth-columns">
        <section className="settings-card" aria-busy={reviewingGrowth}><div className="section-heading compact"><div><SectionEyebrow>Genny&apos;s current read</SectionEyebrow><h2>What the evidence says</h2></div><TrendingUp size={17} /></div>{review ? <><p>{review.summary}</p><small className="muted">{review.reviewSource === "model" ? "Model-backed review" : "Deterministic evidence review"}{review.planChangeSummary ? ` · ${review.planChangeSummary}` : ""}</small>{reviewIsStale && <div className="growth-review-stale" role="status" aria-live="polite"><div><strong>New evidence since this review</strong><span>{[unreviewedAudienceCount ? `${unreviewedAudienceCount} audience snapshot${unreviewedAudienceCount === 1 ? "" : "s"}` : "", unreviewedPublicationCount ? `${unreviewedPublicationCount} publication-performance snapshot${unreviewedPublicationCount === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ")} has not been included in this read.</span></div><Button variant="secondary" disabled={reviewingGrowth} onClick={() => void reviewGrowth(review.kind)}>{reviewingGrowth ? <><LoaderCircle size={14} className="spin" /> Reviewing evidence…</> : "Review new evidence"}</Button></div>}<div className="growth-read-list"><div><strong>Working</strong>{review.working.length ? <ul>{review.working.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="muted">Nothing strong enough to call yet.</p>}</div><div><strong>Uncertain</strong>{review.uncertain.length ? <ul>{review.uncertain.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="muted">No open uncertainty recorded.</p>}</div><div><strong>Weak</strong>{review.weak.length ? <ul>{review.weak.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="muted">No weak pattern recorded.</p>}</div></div></> : <div className="growth-no-review"><p>The Agent has not completed a Growth review yet. It will review follower movement and publication performance on the operating rhythm.</p><Button variant="secondary" disabled={reviewingGrowth} onClick={() => void reviewGrowth("weekly")}>{reviewingGrowth ? <><LoaderCircle size={14} className="spin" /> Reviewing evidence…</> : "Review available evidence"}</Button></div>}</section>
        <section className="settings-card"><div className="section-heading compact"><div><SectionEyebrow>Current approach</SectionEyebrow><h2>How the Agent is working</h2></div><Sparkles size={17} /></div>{assignment.plan ? <><p>{assignment.plan.summary}</p><div className="growth-plan-list"><div><strong>Publishing</strong><ul>{assignment.plan.publishingApproach.map((item) => <li key={item}>{item}</li>)}</ul></div><div><strong>Discovery</strong><ul>{assignment.plan.discoveryDirections.map((item) => <li key={item}>{item}</li>)}</ul></div><div><strong>Relationships</strong><ul>{assignment.plan.relationshipFocus.map((item) => <li key={item}>{item}</li>)}</ul></div></div><small className="muted">Plan revision {assignment.plan.revision} · Next weekly review {assignment.plan.nextWeeklyReviewAt ? formatHistoryTimestamp(assignment.plan.nextWeeklyReviewAt) : "not scheduled"}</small></> : <p className="muted">The Agent is preparing its first operating plan.</p>}</section>
      </div>
      <div className="growth-columns">
        <section className="settings-card"><div className="section-heading compact"><div><SectionEyebrow>Evidence quality</SectionEyebrow><h2>Recent audience observations</h2></div><ShieldCheck size={17} /></div>{snapshots.length ? <div className="growth-evidence-list">{snapshots.slice(0, 5).map((item) => <div key={item.id}><strong>{item.followers.toLocaleString()} followers</strong><span>{formatHistoryTimestamp(item.observedAt)} · {item.source} · {item.observationStatus}</span></div>)}</div> : <p className="muted">No verified audience snapshot has arrived from the selected channel.</p>}</section>
        <section className="settings-card"><div className="section-heading compact"><div><SectionEyebrow>Body & limitations</SectionEyebrow><h2>{bodyHeading}</h2></div><PlugZap size={17} /></div><p className="muted">The Agent can only claim autonomy where the connected channel body can observe, execute, and verify.</p><div className="capability-list">{manifest.items.filter((item) => ["post", "reply", "follow", "follower_measurement", "post_performance"].includes(item.capability)).map((item) => <div className="capability-row" key={item.capability}><div><strong>{item.label}</strong><small>{capabilityProviderLabel(state, presence.id, item)}{item.limitation ? ` · ${item.limitation}` : ""}</small></div><span className={`capability-state capability-state-${item.availability}`}>{item.availability.replaceAll("-", " ")}</span></div>)}</div>{limitationCopy.length > 0 && <p className="settings-warning">Some channel capabilities are unavailable: {[...new Set(limitationCopy)].slice(0, 2).join(" ")}</p>}<Button variant="ghost" onClick={() => setView("presence")}>Review Settings</Button></section>
      </div>
    </>}
  </div>;
}

function ScheduleView({
  state,
  mutate,
  setView,
}: {
  state: OpenPresenceState;
  mutate: Mutate;
  setView: (view: View) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [day, setDay] = useState("Tuesday");
  const [time, setTime] = useState("08:00");
  const [objective, setObjective] = useState("audience_growth");
  const [executionWindow, setExecutionWindow] = useState("08:00–11:00");
  const [timingMode, setTimingMode] = useState<TimingMode>("flexible");
  const [timingOptionsOpen, setTimingOptionsOpen] = useState(false);
  const [considerationStart, setConsiderationStart] = useState("08:00");
  const [considerationEnd, setConsiderationEnd] = useState("11:00");
  const [viewMode, setViewMode] = useState<"list" | "week">("week");
  const [compactSchedule, setCompactSchedule] = useState(true);
  const [calendarLayers, setCalendarLayers] = useState<ScheduleLayerVisibility>({ plan: true, intents: false, assignments: true });
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const presenceId = state.activePresenceId ?? state.presence?.id ?? "";
  const selectedPresence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  const presenceName = selectedPresence?.name ?? "this Presence";
  const publishingPlan = derivePublishingPlanProjection(state, selectedPresence?.id);
  const resetForm = () => {
    setInstruction("");
    setDay("Tuesday");
    setTime("08:00");
    setObjective("audience_growth");
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
    const next = await mutate({ type: "createAssignment", instruction, presenceId, environment: selectedPresence?.connectionMode === "sandbox" ? "sandbox" : "live", objective, schedule: { day, time, executionWindow } });
    const created = next?.assignments.find((item) => item.instruction === instruction.trim() && item.presenceId === presenceId);
    if (next && created) {
      resetForm();
      setShowForm(false);
      setSelectedAssignmentId(created.id);
    }
  };
  const visibleSlots: CalendarSlot[] = [];
  const visibleAssignments = state.assignments.filter((item) => item.presenceId === presenceId && assignmentIsOpen(item));
  const toggleCalendarLayer = (layer: keyof ScheduleLayerVisibility) => setCalendarLayers((current) => ({ ...current, [layer]: !current[layer] }));
  const beginEdit = (slot: CalendarSlot) => {
    const { start, end } = splitConsiderationWindow(slot.executionWindow, slot.time);
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
  const cancelAssignment = async (assignment: OpenPresenceState["assignments"][number]) => {
    if (!window.confirm(`Cancel this Assignment?\n\n${cleanUserFacingAssignmentInstruction(assignment.instruction)}`)) return;
    const next = await mutate({ type: "cancelAssignment", id: assignment.id });
    if (next) setSelectedAssignmentId(null);
  };
  const runAssignmentInPlayground = async (assignment: Assignment) => {
    if (!selectedPresence || assignment.status === "completed" || assignment.status === "cancelled") return;
    let next = state;
    let session = next.playgroundSessions.find((item) => item.presenceId === selectedPresence.id && item.status === "active");
    if (!session) {
      next = (await mutate({ type: "startPlayground", presenceId: selectedPresence.id, source: "scenario" })) ?? next;
      session = next.playgroundSessions.find((item) => item.presenceId === selectedPresence.id && item.status === "active");
    }
    if (!session) return;
    await mutate({ type: "startAssignment", id: assignment.id, sessionId: session.id });
    setView("playground");
  };
  const openAssignment = (assignment: Assignment) => setSelectedAssignmentId(assignment.id);
  const selectedAssignment = visibleAssignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null;
  const activateAssignment = async (assignment: Assignment) => {
    const next = await mutate({ type: "activateAssignment", id: assignment.id });
    if (next) setSelectedAssignmentId(assignment.id);
  };
  return (
    <div className="page">
      <PageHeader
        eyebrow="Future attention"
        title="Schedule"
        description={<>Tell {presenceName} what to accomplish. Genny will show how it understood the outcome and whether the Presence is ready before activation.</>}
        actionsClassName="heading-actions calendar-heading-actions"
        actions={<>
          <div className="calendar-view-toggle" role="group" aria-label="Calendar view mode">
            <button type="button" aria-pressed={viewMode === "list"} className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}>List</button>
            <button type="button" aria-pressed={viewMode === "week"} className={viewMode === "week" ? "active" : ""} onClick={() => setViewMode("week")}>Week</button>
          </div>
          <Button variant="secondary" onClick={() => setView("playground")}>
            <FlaskConical size={14} /> Try a post
          </Button>
          <Button variant="primary" onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}>
            {showForm ? <X size={15} /> : <Plus size={15} />}{" "}
            {showForm ? "Close" : "Add assignment"}
          </Button>
        </>}
      />
      <ScheduleLayerToolbar plan={publishingPlan} presenceName={presenceName} layers={calendarLayers} onToggle={toggleCalendarLayer} onReset={() => setCalendarLayers({ plan: true, intents: false, assignments: true })} mutate={mutate} />
      {publishingPlan && <PublishingPlanScheduleSummary plan={publishingPlan} presenceName={presenceName} />}
      {showForm && (
        <form className="add-slot-form" onSubmit={add}>
          <label className="instruction-field">
            What should {presenceName} accomplish?
            <textarea
              aria-label={`What should ${presenceName} accomplish?`}
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="Teach the audience one useful thing about persistent agents."
              rows={3}
              required
            />
          </label>
          <div className="when-field">
              <span className="schedule-field-label">Timing</span>
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
          </div>
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
          <div className="timing-options">
            <button
              type="button"
              className="timing-toggle"
              aria-expanded={timingOptionsOpen}
              onClick={() => setTimingOptionsOpen((open) => !open)}
            >
              <span>
                  <strong>Assignment window</strong>
                <small>{timingMode === "flexible" ? "Flexible · a few hours" : timingMode === "exact" ? `Exact · ${time}` : `Custom · ${considerationStart}–${considerationEnd}`}</small>
              </span>
              <ChevronDown size={15} className={timingOptionsOpen ? "rotated" : ""} />
            </button>
            {timingOptionsOpen && (
              <fieldset className="timing-panel">
                  <legend>When must this be resolved?</legend>
                <label className={`timing-choice ${timingMode === "flexible" ? "selected" : ""}`}>
                  <input type="radio" name="timing-mode" checked={timingMode === "flexible"} onChange={() => chooseTimingMode("flexible")} />
                  <span><strong>Flexible</strong><small>Recommended · {presenceName} can work within a few hours.</small></span>
                </label>
                <label className={`timing-choice ${timingMode === "exact" ? "selected" : ""}`}>
                  <input type="radio" name="timing-mode" checked={timingMode === "exact"} onChange={() => chooseTimingMode("exact")} />
                  <span><strong>Exact time</strong><small>Start the Assignment at the scheduled time.</small></span>
                </label>
                <label className={`timing-choice ${timingMode === "custom" ? "selected" : ""}`}>
                  <input type="radio" name="timing-mode" checked={timingMode === "custom"} onChange={() => chooseTimingMode("custom")} />
                  <span><strong>Custom</strong><small>Work on it within this window.</small></span>
                </label>
                {timingMode === "custom" && (
                  <div className="timing-custom-range">
                    <label>From<input aria-label="Assignment starts" type="time" value={considerationStart} onChange={(event) => { setConsiderationStart(event.target.value); setExecutionWindow(`${event.target.value}–${considerationEnd}`); }} /></label>
                    <label>Until<input aria-label="Assignment ends" type="time" value={considerationEnd} onChange={(event) => { setConsiderationEnd(event.target.value); setExecutionWindow(`${considerationStart}–${event.target.value}`); }} /></label>
                  </div>
                )}
              </fieldset>
            )}
          </div>
          <Button type="submit" variant="secondary">
              <Check size={14} /> Review assignment
          </Button>
        </form>
      )}
      {selectedAssignment && (
        <aside className="assignment-inspector" aria-label="Assignment details">
          <div className="assignment-inspector-header">
            <div>
              <SectionEyebrow>Delegated outcome</SectionEyebrow>
              <h2>Assignment details</h2>
            </div>
            <button type="button" aria-label="Close Assignment details" onClick={() => setSelectedAssignmentId(null)}><X size={16} /></button>
          </div>
          <p className="assignment-inspector-instruction">{cleanUserFacingAssignmentInstruction(selectedAssignment.instruction)}</p>
          <div className="assignment-inspector-meta">
            <div><span>Window</span><strong>{selectedAssignment.activation?.type === "continuous" ? "Continuous responsibility" : selectedAssignment.schedule ? `${selectedAssignment.schedule.day} at ${selectedAssignment.schedule.time}` : "Unscheduled"}</strong><small>{selectedAssignment.activation?.type === "continuous" ? "Agent-authored plan · weekly and strategic review" : selectedAssignment.schedule?.executionWindow ?? "Ready to start when you choose."}</small></div>
            <div><span>Status</span><strong>{selectedAssignment.status === "draft" ? "Review before activation" : selectedAssignment.status.replaceAll("_", " ")}</strong><small>{selectedAssignment.progress.verified} / {selectedAssignment.progress.required} verified · {selectedAssignment.rejectedCandidates} rejected</small></div>
          </div>
          {selectedAssignment.preflight && <section className={`assignment-preflight assignment-preflight-${selectedAssignment.preflight.status}`} aria-label="Assignment readiness review">
            <div className="assignment-preflight-header"><div><SectionEyebrow>Agent readiness review</SectionEyebrow><h3>{selectedAssignment.preflight.status === "ready" ? "Ready to activate" : selectedAssignment.preflight.status === "ready_with_assumptions" ? "Ready with assumptions" : selectedAssignment.preflight.status === "needs_input" ? "Needs input before activation" : "Blocked before activation"}</h3></div><span className="assignment-preflight-status">{selectedAssignment.preflight.status.replaceAll("_", " ")}</span></div>
            <p>{selectedAssignment.preflight.semanticSummary}</p>
            {selectedAssignment.preflight.contract && <div className="assignment-contract"><div><span>Outcome</span><strong>{selectedAssignment.preflight.contract.deliverable}</strong></div><div><span>Done when</span><strong>{selectedAssignment.preflight.contract.successEvidence}</strong></div><div><span>Genny decides</span><small>{selectedAssignment.preflight.contract.agentDecides.join(" · ")}</small></div>{selectedAssignment.preflight.contract.assumptions.length > 0 && <div><span>Assumptions</span><small>{selectedAssignment.preflight.contract.assumptions.join(" ")}</small></div>}</div>}
            <div className="assignment-readiness-checks">{selectedAssignment.preflight.checks.map((check) => <div key={check.label} className={`assignment-readiness-check assignment-readiness-${check.status}`}><span aria-hidden="true">{check.status === "pass" ? "✓" : check.status === "warning" ? "!" : "×"}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div></div>)}</div>
            {selectedAssignment.preflight.issues.length > 0 && <div className="assignment-preflight-issues"><strong>Before activation</strong><ul>{selectedAssignment.preflight.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
          </section>}
          <p className="assignment-inspector-note">The outcome is delegated; {presenceName} chooses the approach and may reject weak candidates. A rejection keeps the Assignment working. Only a verified deliverable, a bounded blocked result, or operator cancellation ends it.</p>
          <div className="assignment-inspector-actions">
            {selectedAssignment.status === "draft" && selectedAssignment.preflight && ["ready", "ready_with_assumptions"].includes(selectedAssignment.preflight.status) && <Button variant="primary" onClick={() => void activateAssignment(selectedAssignment)}>Activate Assignment</Button>}
            {selectedAssignment.status !== "completed" && selectedAssignment.status !== "cancelled" && <Button variant="secondary" onClick={() => void runAssignmentInPlayground(selectedAssignment)}>{selectedAssignment.status === "blocked" ? "Retry in Playground" : "Run in Playground"}</Button>}
            {selectedAssignment.status !== "completed" && <Button variant="danger" onClick={() => void cancelAssignment(selectedAssignment)}>Cancel Assignment</Button>}
          </div>
        </aside>
      )}
      {viewMode === "week" ? (
        <WeekCalendar slots={visibleSlots} assignments={visibleAssignments} publishingPlan={publishingPlan} layers={calendarLayers} compact={compactSchedule} onToggleCompact={() => setCompactSchedule((current) => !current)} state={state} presenceName={presenceName} onEdit={beginEdit} onAssignment={openAssignment} onAdd={() => setShowForm(true)} onResetLayers={() => setCalendarLayers({ plan: true, intents: false, assignments: true })} />
      ) : (
        <ScheduleList assignments={visibleAssignments} publishingPlan={publishingPlan} layers={calendarLayers} presenceName={presenceName} onAssignment={openAssignment} onAdd={() => setShowForm(true)} onResetLayers={() => setCalendarLayers({ plan: true, intents: false, assignments: true })} />
      )}
    </div>
  );
}

function ScheduleList({
  assignments,
  publishingPlan,
  layers,
  presenceName,
  onAssignment,
  onAdd,
  onResetLayers,
}: {
  assignments: Assignment[];
  publishingPlan?: PublishingPlan;
  layers: ScheduleLayerVisibility;
  presenceName: string;
  onAssignment: (assignment: Assignment) => void;
  onAdd: () => void;
  onResetLayers: () => void;
}) {
  const planWindows = (publishingPlan?.windows ?? [])
    .filter((window) => !["completed", "missed", "superseded"].includes(window.status))
    .map((window) => ({ window, position: publishingWindowCalendarPosition(window, publishingPlan?.timezone) }));
  const scheduledAssignments = assignments.filter((assignment) => assignmentIsOpen(assignment));
  const hasAnyItems = planWindows.length > 0 || scheduledAssignments.length > 0;
  const hasItems = (layers.plan && planWindows.length > 0) || (layers.assignments && scheduledAssignments.length > 0);
  return <section className="schedule-list" aria-label="Schedule list">
    <div className="schedule-list-header">
      <div>
        <SectionEyebrow>List schedule</SectionEyebrow>
        <h2>What {presenceName} may work on</h2>
        <p>The Publishing Plan shows flexible consideration windows. Assignments delegate outcomes; they do not guarantee publication.</p>
      </div>
      <ScheduleLegend plan={publishingPlan} layers={layers} />
    </div>
    {!hasItems ? <EmptyState title={hasAnyItems ? "Nothing shown in this list" : "Nothing scheduled for this Presence"} body={hasAnyItems ? "Turn on a layer above to compare the Publishing Plan and Assignments." : `Add an Assignment to give ${presenceName} a specific outcome to work toward.`} action={hasAnyItems ? <Button onClick={onResetLayers} variant="secondary">Show all layers</Button> : <Button onClick={onAdd} variant="secondary"><Plus size={14} /> Add assignment</Button>} /> : <div className="schedule-list-rows">
      {layers.plan && planWindows.map(({ window, position }) => <article className={`schedule-list-row schedule-list-row-plan schedule-list-row-${window.status}`} key={window.id}>
        <div className="schedule-list-row-mark" aria-hidden="true" />
        <div className="schedule-list-row-copy"><div className="schedule-list-row-kicker"><strong>Publishing plan</strong><span>{objectiveLabel(window.purpose)}</span></div><h3>{window.summary}</h3><small>{position.day} · {position.startTime}–{position.endTime} · {window.status === "active" ? "Active window" : objectiveLabel(window.status)}</small></div>
      </article>)}
      {layers.assignments && scheduledAssignments.map((assignment) => {
        const objective = assignmentObjective(assignment);
        const timing = assignment.activation?.type === "continuous" ? "Continuous responsibility" : assignment.schedule ? `${assignment.schedule.day} · ${assignment.schedule.time}–${splitConsiderationWindow(assignment.schedule.executionWindow, assignment.schedule.time).end}` : "Unscheduled · ready to start";
        const status = assignment.status === "draft" ? "Not started" : objectiveLabel(assignment.status);
        return <button type="button" className="schedule-list-row schedule-list-row-assignment" key={assignment.id} onClick={() => onAssignment(assignment)} aria-label={`Open Assignment ${assignment.instruction}`}>
          <div className="schedule-list-row-mark" aria-hidden="true" />
          <div className="schedule-list-row-copy"><div className="schedule-list-row-kicker"><strong>Assignment</strong><span className="schedule-objective-badge">Objective · {objectiveLabel(objective)}</span></div><h3>{cleanUserFacingAssignmentInstruction(assignment.instruction)}</h3><small>{timing} · {assignment.progress.verified} / {assignment.progress.required} verified · {status}</small></div>
          <ChevronRight size={16} aria-hidden="true" />
        </button>;
      })}
    </div>}
  </section>;
}

function WeekCalendar({
  slots,
  assignments,
  publishingPlan,
  layers,
  compact,
  onToggleCompact,
  state,
  presenceName,
  onEdit,
  onAssignment,
  onAdd,
  onResetLayers,
}: {
  slots: CalendarSlot[];
  assignments: Assignment[];
  publishingPlan?: PublishingPlan;
  layers: ScheduleLayerVisibility;
  compact: boolean;
  onToggleCompact: () => void;
  state: OpenPresenceState;
  presenceName: string;
  onEdit: (slot: CalendarSlot) => void;
  onAssignment: (assignment: Assignment) => void;
  onAdd: () => void;
  onResetLayers: () => void;
}) {
  const scheduledSlots = slots.filter((slot) => slot.enabled);
  const scheduledAssignments = assignments.filter((assignment) => assignment.schedule && assignmentIsOpen(assignment));
  const scheduledPlanWindows = (publishingPlan?.windows ?? [])
    .filter((window) => !["completed", "missed", "superseded"].includes(window.status))
    .map((window) => publishingWindowCalendarPosition(window, publishingPlan?.timezone))
    .filter((window) => calendarWeekDays.includes(window.day) && window.startMinutes < 24 * 60);
  const dayPlanWindows = new Map(calendarWeekDays.map((day) => [day, scheduledPlanWindows.filter((window) => window.day === day)]));
  const daySlots = new Map(calendarWeekDays.map((day) => [day, scheduledSlots.filter((slot) => slot.day === day)]));
  const dayAssignments = new Map(calendarWeekDays.map((day) => [day, scheduledAssignments.filter((assignment) => assignment.schedule?.day === day)]));
  const gridHeight = calendarHours.length * 64;
  const hasAnyItems = scheduledPlanWindows.length > 0 || scheduledSlots.length > 0 || scheduledAssignments.length > 0;
  const hasItems = (layers.plan && scheduledPlanWindows.length > 0) || (layers.intents && scheduledSlots.length > 0) || (layers.assignments && scheduledAssignments.length > 0);
  const calendarLabel = [layers.plan && "publishing plan", layers.intents && "legacy entries", layers.assignments && "Assignments"].filter(Boolean).join(", ");
  const compactDays = calendarWeekDays.map((day) => {
    const items = [
      ...(layers.plan ? (dayPlanWindows.get(day) ?? []).map((window) => ({
        id: "plan-" + window.id,
        kind: "plan" as const,
        startMinutes: window.startMinutes,
        time: window.startTime + "–" + window.endTime,
        title: "Plan · " + window.purpose,
        detail: window.summary,
        meta: window.status === "active" ? "Active window" : window.status,
        status: window.status,
      })) : []),
      ...(layers.intents ? (daySlots.get(day) ?? []).map((slot) => {
        const target = state.presences.find((item) => item.id === slot.presence);
        return {
          id: "intent-" + slot.id,
          kind: "intent" as const,
          startMinutes: timeToMinutes(slot.time),
          time: slot.time,
          title: slot.label,
          detail: (target?.name ?? presenceName) + " · " + objectiveLabel(slot.objective),
          meta: (slot.mode === "auto" ? "Auto" : "Review") + " · " + considerationSummary(slot.time, slot.executionWindow),
          slot,
        };
      }) : []),
      ...(layers.assignments ? (dayAssignments.get(day) ?? []).map((assignment) => {
        const schedule = assignment.schedule!;
        const status = assignment.status === "draft" ? "Not started" : assignment.status.replaceAll("_", " ");
        return {
          id: "assignment-" + assignment.id,
          kind: "assignment" as const,
          startMinutes: timeToMinutes(schedule.time),
          time: schedule.time,
          title: "Assignment",
          detail: assignment.instruction,
          meta: assignment.progress.verified + " / " + assignment.progress.required + " · " + status,
          assignment,
        };
      }) : []),
    ].sort((left, right) => left.startMinutes - right.startMinutes || left.id.localeCompare(right.id));
    return { day, items };
  }).filter((entry) => entry.items.length > 0);
  const renderCompactItem = (item: (typeof compactDays)[number]["items"][number]) => {
    if (item.kind === "plan") {
      return <article className={"compact-calendar-item compact-calendar-item-plan compact-calendar-item-" + item.status} key={item.id}>
        <span className="compact-calendar-time">{item.time}</span>
        <div><strong>{item.title}</strong><small>{item.detail}</small><em>{item.meta}</em></div>
      </article>;
    }
    if (item.kind === "intent") {
      return <button type="button" className={"compact-calendar-item compact-calendar-item-intent objective-" + objectiveTone(item.slot.objective)} key={item.id} onClick={() => onEdit(item.slot)} aria-label={"Edit " + item.slot.label + ", " + item.slot.day + " at " + item.slot.time}>
        <span className="compact-calendar-time">{item.time}</span>
        <div><strong>{item.title}</strong><small>{item.detail}</small><em>{item.meta}</em></div>
      </button>;
    }
    const objective = assignmentObjective(item.assignment);
    return <button type="button" className="compact-calendar-item compact-calendar-item-assignment" key={item.id} onClick={() => onAssignment(item.assignment)} aria-label={"Open Assignment " + item.assignment.instruction + ", " + item.assignment.schedule?.day + " at " + item.assignment.schedule?.time}>
      <span className="compact-calendar-time">{item.time}</span>
      <div><strong>{item.title}</strong><span className="compact-calendar-objective">Objective · {objectiveLabel(objective)}</span><small>{item.detail}</small><em>{item.meta}</em></div>
    </button>;
  };
  const blockStyle = (start: number, end: number, minimum: number) => {
    const top = Math.max(0, (start / 60) * 64);
    const height = Math.max(minimum, Math.min(gridHeight - top - 8, (Math.max(start + 60, end) - start) / 60 * 64 - 8));
    return { top, height };
  };
  return (
    <section className={compact ? "week-calendar week-calendar-compact-mode" : "week-calendar"} aria-label={`Weekly schedule showing ${calendarLabel || "no layers"}`}>
      <div className="week-calendar-toolbar">
        <div>
          <SectionEyebrow>Visual schedule</SectionEyebrow>
          <h2>When {presenceName} can notice and act</h2>
          <p>The publishing plan shows flexible working windows underneath the Assignments that shape when {presenceName} can work toward an outcome. A plan window never counts as a verified result.</p>
        </div>
        <div className="week-calendar-toolbar-side">
          <div className="calendar-density-toggle" role="group" aria-label="Visual schedule density">
            <button type="button" aria-pressed={compact} className={compact ? "active" : ""} onClick={() => { if (!compact) onToggleCompact(); }}>Compact</button>
            <button type="button" aria-pressed={!compact} className={!compact ? "active" : ""} onClick={() => { if (compact) onToggleCompact(); }}>Full hours</button>
          </div>
          <ScheduleLegend plan={publishingPlan} layers={layers} />
        </div>
      </div>
      {!hasItems ? <EmptyState title={hasAnyItems ? "Nothing shown on this calendar" : "Nothing scheduled for this Presence"} body={hasAnyItems ? "Turn on a calendar layer to compare the Presence plan or Assignments." : `Add an Assignment to see when ${presenceName} is expected to work during the week.`} action={hasAnyItems ? <Button onClick={onResetLayers} variant="secondary">Show all layers</Button> : <Button onClick={onAdd} variant="secondary"><Plus size={14} /> Add assignment</Button>} /> : <div className="week-grid-scroll"><div className="week-grid" style={{ "--week-grid-height": `${gridHeight}px` } as React.CSSProperties}><div className="week-grid-header"><span className="week-time-header">Local time</span>{calendarWeekDays.map((day) => <span key={day}>{day.slice(0, 3)}<small>{day}</small></span>)}</div><div className="week-grid-body"><div className="week-time-rail">{calendarHours.map((hour) => <span key={hour}>{String(hour).padStart(2, "0")}:00</span>)}</div>{calendarWeekDays.map((day) => <div className="week-day-column" key={day}>{calendarHours.map((hour) => <div className="week-hour-cell" key={hour} />)}{layers.plan && (dayPlanWindows.get(day) ?? []).map((window) => { const style = blockStyle(window.startMinutes, window.endMinutes, 42); return <div className={`week-plan-window week-plan-window-${window.status}`} key={window.id} style={style} title={`${window.purpose} window · ${window.summary}`}><span className="week-plan-window-time">{window.startTime}–{window.endTime}</span><strong>Plan · {window.purpose}</strong><small>{window.summary}</small></div>; })}{layers.intents && (daySlots.get(day) ?? []).map((slot) => { const style = blockStyle(timeToMinutes(slot.time), timeToMinutes(splitConsiderationWindow(slot.executionWindow, slot.time).end), 54); const target = state.presences.find((item) => item.id === slot.presence); return <button type="button" key={slot.id} className={`week-intent objective-${objectiveTone(slot.objective)}`} style={style} onClick={() => onEdit(slot)} aria-label={`Edit ${slot.label}, ${slot.day} at ${slot.time}`} title={`${slot.label} · ${slot.day} ${slot.time} · ${considerationSummary(slot.time, slot.executionWindow)}`}><span className="week-intent-time">{slot.time}</span><strong>{slot.label}</strong><small>{target?.name ?? presenceName} · {objectiveLabel(slot.objective)}</small><em>{slot.mode === "auto" ? "Auto" : "Review"}</em></button>; })}{layers.assignments && (dayAssignments.get(day) ?? []).map((assignment) => { const schedule = assignment.schedule!; const objective = assignmentObjective(assignment); const style = blockStyle(timeToMinutes(schedule.time), timeToMinutes(splitConsiderationWindow(schedule.executionWindow, schedule.time).end), 58); const status = assignment.status === "draft" ? "Not started" : assignment.status.replaceAll("_", " "); return <button type="button" key={assignment.id} className="week-assignment" style={style} onClick={() => onAssignment(assignment)} aria-label={`Open Assignment ${assignment.instruction}, ${schedule.day} at ${schedule.time}`} title={`Open Assignment details · ${assignment.instruction} · ${schedule.day} ${schedule.time}`}><span className="week-intent-time">{schedule.time}</span><strong>Assignment</strong><span className="week-assignment-objective">Objective · {objectiveLabel(objective)}</span><small>{assignment.instruction}</small><em>{assignment.progress.verified} / {assignment.progress.required} · {status}</em></button>; })}</div>)}</div></div></div>}
      {hasItems && <div className="week-calendar-compact" aria-label="Compact weekly schedule">{compactDays.map(({ day, items }) => <section className="compact-calendar-day" key={day}><div className="compact-calendar-day-label"><strong>{day.slice(0, 3)}</strong><span>{day}</span></div><div className="compact-calendar-items">{items.map(renderCompactItem)}</div></section>)}</div>}
    </section>
  );
}

function BrainView({
  state,
  mutate,
  selectedFile,
  setSelectedFile,
  setView,
}: {
  state: OpenPresenceState;
  mutate: Mutate;
  selectedFile: FileKind;
  setSelectedFile: (file: FileKind) => void;
  setView: (view: View) => void;
}) {
  const file =
    state.files.find((item) => item.kind === selectedFile) ?? state.files[0];
  const [content, setContent] = useState(file?.content ?? "");
  const agent = state.agent!;
  const [agentNameDraft, setAgentNameDraft] = useState(agent.name);
  const [agentAvoidDraft, setAgentAvoidDraft] = useState((agent.languagePolicy?.avoid ?? []).join("\n"));
  const [agentProhibitedDraft, setAgentProhibitedDraft] = useState((agent.languagePolicy?.prohibited ?? []).join("\n"));
  const pending = state.proposals.filter((item) => item.status === "pending");
  const model = state.modelProfiles.find((item) => item.agentId === agent.id);
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [skillName, setSkillName] = useState("");
  const [skillDescription, setSkillDescription] = useState("");
  const [connectionProvider, setConnectionProvider] = useState<"openai" | "openrouter" | "ollama" | null>(null);
  const [connectionEndpoint, setConnectionEndpoint] = useState("http://localhost:11434");
  const [connectionSecret, setConnectionSecret] = useState("");
  const [assetConnectionOpen, setAssetConnectionOpen] = useState(false);
  const [assetConnectionSecret, setAssetConnectionSecret] = useState("");
  const [ollamaModels, setOllamaModels] = useState<OllamaModelOption[]>([]);
  const [ollamaModelsError, setOllamaModelsError] = useState<string | null>(null);
  const ollamaConnection = state.providerConnections.find((item) => item.provider === "ollama" && item.status !== "needs-configuration");
  const tavilyConnection = state.assetProviderConnections.find((item) => item.provider === "tavily");
  const ollamaConnectionId = ollamaConnection?.id;
  const ollamaEndpoint = ollamaConnection?.endpoint;
  const modelProvider = model?.provider;
  const enabledSkills = state.skills.filter((skill) => state.agentSkills.some((binding) => binding.skillId === skill.id && binding.enabled));
  const agentCapabilities = AGENT_CAPABILITY_DEFINITIONS.filter((definition) => definition.scope === "agent");
  const enabledCapabilities = agentCapabilities.filter((definition) => isAgentCapabilityEnabled(state.toolBindings, agent.id, definition.id));
  const inspectBinding = state.toolBindings.find((binding) => binding.agentId === agent.id && binding.toolId === "asset.inspect");
  const inspectProvider = inspectBinding?.provider ?? model?.provider;
  const inspectConnection = state.providerConnections.find((connection) => connection.id === inspectBinding?.connectionId)
    ?? state.providerConnections.find((connection) => connection.provider === inspectProvider);
  const visionReady = Boolean(inspectConnection && (inspectConnection.status === "local" || inspectConnection.secretConfigured || inspectConnection.status === "available"));
  const tavilyReady = Boolean(tavilyConnection?.secretConfigured && tavilyConnection.status === "available");
  const missingSkillCapabilities = (skill: OpenPresenceState["skills"][number]) => skill.requiresTools
    .filter((toolId) => !state.toolBindings.some((binding) => binding.agentId === agent.id && binding.toolId === toolId && binding.enabled !== false))
    .map((toolId) => AGENT_CAPABILITY_DEFINITIONS.find((definition) => definition.toolIds.includes(toolId))?.name ?? toolId);
  const capabilityReadiness = (id: string) => {
    if (id === "research") return { label: "Sandbox source retrieval", status: "Ready" };
    if (id === "asset-intelligence") return tavilyReady && visionReady
      ? { label: "Tavily discovery · configured perception", status: "Ready" }
      : tavilyReady || visionReady
        ? { label: tavilyReady ? "Tavily discovery · perception needs setup" : "Discovery needs Tavily · perception configured", status: "Partially ready" }
        : { label: "Discovery and perception providers", status: "Needs provider" };
    return { label: "Local chart rendering", status: "Ready" };
  };
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
  const saveAssetConnection = async (event: React.FormEvent) => { event.preventDefault(); if (!assetConnectionSecret.trim()) return; const next = await mutate({ type: "configureAssetProvider", provider: "tavily", label: "Tavily", hasSecret: true, secret: assetConnectionSecret.trim() }); if (next) { setAssetConnectionOpen(false); setAssetConnectionSecret(""); } };
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
      <PageHeader
        eyebrow="Managed Agent"
        title="Manage Agent"
        description={<>{agent.name}&apos;s Brain, runtime, skills, and provider access. These settings shape every Presence.</>}
        actions={pending.length > 0 ? <span className="review-badge"><CircleAlert size={14} /> {pending.length} to review</span> : undefined}
      />
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
      <section className="brain-page-section brain-overview">
        <div><SectionEyebrow>Model runtime</SectionEyebrow><strong>{model?.provider === "ollama" ? ollamaModelLabel(ollamaModels.find((item) => item.name === model.model || item.name.startsWith(`${model.model}:`))?.name ?? model.model) : runtimeModels.find((item) => item.model === model?.model && item.quality === model?.quality)?.name ?? model?.model ?? "Not selected"}</strong><small>{model?.provider ?? "Choose a provider"} · {model?.quality ?? "runtime"}</small></div>
        <div><SectionEyebrow>Skills</SectionEyebrow><strong>{state.skills.length} installed</strong><small>{enabledSkills.length} enabled for {agent.name}</small></div>
        <div><SectionEyebrow>Capabilities</SectionEyebrow><strong>{enabledCapabilities.length} enabled</strong><small>Agent-wide choices</small></div>
        <div><SectionEyebrow>Connections</SectionEyebrow><strong>{state.providerConnections.filter((item) => item.status !== "needs-configuration").length ? "Ready" : "Needs setup"}</strong><small>Set up provider access below.</small></div>
      </section>
      <section className="brain-page-section runtime-panel settings-card">
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
                        : { model: model?.model ?? "qwen2.5:7b", provider: "ollama" as const, quality: "local" as const, vision: false }
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
      <section className="brain-page-section brain-config-grid">
        <div className="settings-card brain-action-card" id="provider-access">
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
                <div><strong>{skill.name ?? skill.id}</strong><small>{skill.description}</small>{missingSkillCapabilities(skill).length > 0 && <small className="skill-dependency-warning">Unavailable until {missingSkillCapabilities(skill).join(" and ")} is enabled.</small>}</div>
                <div className="config-row-actions">
                  <span className="status-tag">{missingSkillCapabilities(skill).length > 0 ? "Unavailable" : state.agentSkills.some((binding) => binding.skillId === skill.id && binding.enabled) ? "Enabled" : "Installed"}</span>
                  <Button variant="ghost" onClick={() => beginSkillEdit(skill)}>Edit</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="settings-card brain-action-card">
          <div className="section-heading compact"><div><SectionEyebrow>Connections</SectionEyebrow><h2>Provider access</h2></div><PlugZap size={17} /></div>
          <p className="muted">Connect a provider here; Chat and asset discovery use the credentials you configure for this Agent.</p>
          <div className="config-list">
            {providerAccessProviders.map((provider) => {
              const connection = state.providerConnections.find((item) => item.provider === provider);
              const name = providerLabel(provider);
              return <div className="config-list-row" key={provider}><div><strong>{name}</strong><small>{connection?.status === "local" ? connection.endpoint ?? "Local endpoint" : connection?.secretConfigured ? "Credential ready" : connection?.status === "available" ? "Connected" : "Needs setup"}</small></div><Button variant={connection && connection.status !== "needs-configuration" ? "ghost" : "secondary"} onClick={() => { setConnectionProvider(provider as "openai" | "openrouter" | "ollama"); setConnectionSecret(""); if (provider === "ollama") setConnectionEndpoint(connection?.endpoint ?? "http://localhost:11434"); }}>{connection && connection.status !== "needs-configuration" ? "Edit" : "Set up"}</Button></div>;
            })}
          </div>
          {connectionProvider && <form className="inline-config-form" onSubmit={saveConnection}><h3>Set up {providerLabel(connectionProvider)}</h3>{connectionProvider === "ollama" ? <label>Ollama endpoint<input aria-label="Ollama endpoint" value={connectionEndpoint} onChange={(event) => setConnectionEndpoint(event.target.value)} required /></label> : <label>API key<input aria-label="Provider API key" type="password" value={connectionSecret} onChange={(event) => setConnectionSecret(event.target.value)} placeholder={connectionProvider === "openrouter" ? "sk-or-…" : "sk-…"} autoComplete="off" /></label>}<div className="inline-form-actions"><Button type="button" variant="ghost" onClick={() => setConnectionProvider(null)}>Cancel</Button><Button type="submit" variant="primary"><Check size={14} /> Save connection</Button></div></form>}
          <div className="config-list-row"><div><strong>Tavily asset discovery</strong><small>{tavilyConnection?.secretConfigured ? "Connected · key stored securely" : "Not connected · required for source-backed asset search"}</small></div><Button variant={tavilyConnection?.secretConfigured ? "ghost" : "secondary"} onClick={() => { setAssetConnectionOpen(true); setAssetConnectionSecret(""); }}>{tavilyConnection?.secretConfigured ? "Update key" : "Connect"}</Button></div>
          {assetConnectionOpen && <form className="inline-config-form" onSubmit={saveAssetConnection}><h3>Connect Tavily asset discovery</h3><p className="form-hint">Paste your Tavily API key here. It is encrypted in local provider storage and is never returned to the browser or included in Agent state.</p><label>Tavily API key<input aria-label="Tavily API key" type="password" value={assetConnectionSecret} onChange={(event) => setAssetConnectionSecret(event.target.value)} placeholder="tvly-…" autoComplete="off" required /></label><div className="inline-form-actions"><Button type="button" variant="ghost" onClick={() => { setAssetConnectionOpen(false); setAssetConnectionSecret(""); }}>Cancel</Button><Button type="submit" variant="primary"><Check size={14} /> Save Tavily key</Button></div></form>}
        </div>
      </section>
      <section className="brain-page-section settings-card tools-card" aria-label="Agent capabilities">
        <div className="section-heading compact">
          <div>
            <SectionEyebrow>Agent capabilities</SectionEyebrow>
            <h2>What {agent.name} can use</h2>
          </div>
          <span className="quiet-label">{enabledCapabilities.length} enabled</span>
        </div>
        <p className="muted tools-intro">
          Capabilities are available when useful. Enabling one does not force the Agent to use it. Providers supply a capability, while each Presence still controls authority to act in the world.
        </p>
        <div className="capability-list">
          {agentCapabilities.map((capability) => {
            const enabled = isAgentCapabilityEnabled(state.toolBindings, agent.id, capability.id);
            const readiness = capabilityReadiness(capability.id);
            return <div className={`capability-row ${enabled ? "enabled" : "disabled"}`} key={capability.id}>
              <div className="capability-copy">
                <strong>{capability.name}</strong>
                <small>{capability.description}</small>
                <span className="capability-provider">{readiness.label}</span>
              </div>
              <div className="capability-actions">
                <span className={`capability-status capability-status-${readiness.status.toLowerCase().replaceAll(" ", "-")}`}>
                  {enabled ? `On · ${readiness.status}` : "Off · Registered"}
                </span>
                <label className="capability-toggle">
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={`Enable ${capability.name}`}
                    checked={enabled}
                    onChange={(event) => void mutate({ type: "setCapability", capabilityId: capability.id, enabled: event.target.checked })}
                  />
                  <span aria-hidden="true" />
                </label>
                <button type="button" className="capability-manage" onClick={() => {
                  if (capability.id === "asset-intelligence") document.getElementById("provider-access")?.scrollIntoView({ behavior: "smooth", block: "center" });
                  else if (capability.id === "research") document.getElementById("provider-access")?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}>Manage <ChevronRight size={13} /></button>
              </div>
            </div>;
          })}
          <div className="capability-row capability-row-presence">
            <div className="capability-copy">
              <strong>Channel action</strong>
              <small>Publish approved Social Intents through this Agent&apos;s Presences.</small>
              <span className="capability-provider">Managed separately by each Presence&apos;s Execution Envelope</span>
            </div>
            <div className="capability-actions">
              <span className="capability-status capability-status-managed">Managed by Presence</span>
              <button type="button" className="capability-manage" onClick={() => setView("presence")}>Presence settings <ChevronRight size={13} /></button>
            </div>
          </div>
        </div>
        <p className="tool-boundary">
          Registered tools remain internal implementation contracts. Disabling a capability withholds its callable tools from new Agent-initiated use; it does not erase Memory, Watching observations, existing assets, or source history.
        </p>
      </section>
      <section className="brain-page-section settings-card language-policy-card">
        <div className="section-heading compact">
          <div><SectionEyebrow>Agent taste · language</SectionEyebrow><h2>Language & phrasing</h2></div>
          <ShieldCheck size={17} />
        </div>
        <p className="muted">Taste guides expression. Advisory preferences help the Agent choose. Never use rules are explicit lexical boundaries enforced before delivery.</p>
        <div className="language-policy-editor">
          <label>Prefer to avoid <small>Advisory only. One literal word or phrase per line.</small><textarea aria-label="Agent language preferences to avoid" rows={4} value={agentAvoidDraft} onChange={(event) => setAgentAvoidDraft(event.target.value)} /></label>
          <label>Never use <small>Hard constraint. Literal matching only; no semantic categories or inferred synonyms.</small><textarea aria-label="Agent prohibited language" rows={4} value={agentProhibitedDraft} onChange={(event) => setAgentProhibitedDraft(event.target.value)} /></label>
        </div>
        <div className="inline-form-actions"><Button variant="primary" onClick={() => void mutate({ type: "setAgentLanguagePolicy", policy: { avoid: agentAvoidDraft.split(/\r?\n/).map((item) => item.trim()).filter(Boolean), prohibited: agentProhibitedDraft.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) } })}><Check size={14} /> Save language policy</Button></div>
      </section>
      <div className="brain-page-section brain-layout">
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
        <section className="brain-page-section proposal-section">
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
  refreshState,
  setView,
  manageBridge,
  manageX,
}: {
  state: OpenPresenceState;
  mutate: Mutate;
  refreshState: () => Promise<OpenPresenceState>;
  setView?: (view: View) => void;
  manageBridge: BridgeManage;
  manageX: XManage;
}) {
  const presence = state.presence!;
  const agentName = state.agent?.name ?? "the Agent";
  const capabilities =
    presence.capabilities ??
    CHANNEL_CAPABILITIES[
      presence.channel as keyof typeof CHANNEL_CAPABILITIES
    ] ??
    [];
  const connectionMode = presence.connectionMode ?? (presence.environment === "sandbox" ? "sandbox" : presence.channel === "x" ? "native" : "bridge");
  const channelDefinition = state.channelDefinitions.find((item) => item.id === presence.channel);
  const simulation = simulationForChannel(presence.channel, channelDefinition);
  const nativeConnection = state.nativeConnections.find((item) => item.presenceId === presence.id && item.kind === "x");
  const activeBridge = state.bridges.find((item) => item.presenceId === presence.id && item.state !== "offline");
  const [customizing, setCustomizing] = useState(true);
  const [editingChannel, setEditingChannel] = useState(false);
  const [channelNameDraft, setChannelNameDraft] = useState(channelDefinition?.name ?? channelLabel(presence.channel, state.channelDefinitions));
  const [channelDomainDraft, setChannelDomainDraft] = useState(channelDefinition?.domain ?? "");
  const [channelAffordancesDraft, setChannelAffordancesDraft] = useState(() => channelDefinition?.affordances ?? capabilities);
  const [channelAssetsDraft, setChannelAssetsDraft] = useState<SocialAssetKind[]>(() => channelDefinition?.supportedAssetKinds ?? []);
  const [presenceNameDraft, setPresenceNameDraft] = useState(presence.name);
  const [presenceHandleDraft, setPresenceHandleDraft] = useState(presence.handle);
  const [briefDraft, setBriefDraft] = useState<PresenceBrief>(presence.brief);
  const [briefTerritoryText, setBriefTerritoryText] = useState(() => ({
    primaryTerritory: presence.brief.primaryTerritory.join(", "),
    adjacentTerritory: presence.brief.adjacentTerritory.join(", "),
    boundaries: presence.brief.boundaries.join(", "),
  }));
  const [editingBrief, setEditingBrief] = useState(false);
  const [ghostDraft, setGhostDraft] = useState<GhostProfile>(() => {
    const profile = presence.ghostProfile ?? { subject: "Me / my organization", priorities: "", preferences: "", voice: "", boundaries: "" };
    return { ...profile, representation: profile.representation ?? emptyGhostRepresentation() };
  });
  const [publicSelfDraft, setPublicSelfDraft] = useState<PublicSelf>(presence.publicSelf ?? { displayName: presence.name, posture: presence.mode === "ghost" ? "representational" : "contextual", approvedTechnicalFacts: [] });
  const [presenceAvoidDraft, setPresenceAvoidDraft] = useState((presence.languagePolicy?.avoid ?? []).join("\n"));
  const [presenceProhibitedDraft, setPresenceProhibitedDraft] = useState((presence.languagePolicy?.prohibited ?? []).join("\n"));
  const [mediaPolicyDraft, setMediaPolicyDraft] = useState(presence.mediaPerceptionPolicy);
  const [publishingCountDraft, setPublishingCountDraft] = useState(String(presence.publishingInitiative?.target?.count ?? 5));
  const [publishingPeriodDraft, setPublishingPeriodDraft] = useState<"day" | "week">(presence.publishingInitiative?.target?.period ?? "day");
  const [autoApprovalPrompt, setAutoApprovalPrompt] = useState<{ capabilities: string[]; labels: string[]; executionIds: string[] } | null>(null);
  const [confirmingAutoApproval, setConfirmingAutoApproval] = useState(false);
  const publicPostures: { id: PublicDisclosurePosture; label: string; detail: string }[] = presence.mode === "ghost"
    ? [{ id: "representational", label: "Representational", detail: "Speak as the person or organization this Presence extends." }, { id: "open-about-assistance", label: "Open about assistance", detail: "Acknowledge AI assistance when it is relevant." }]
    : [{ id: "contextual", label: "Contextual", detail: "Answer socially and acknowledge AI only when it matters." }, { id: "ai-forward", label: "AI-forward", detail: "Be direct that this is an AI presence when relevant." }, { id: "private", label: "Private", detail: "Keep technical identity private in public conversation." }];
  const ghostRepresentation: GhostRepresentation = ghostDraft.representation ?? emptyGhostRepresentation();
  const ghostRepresentationReady = ghostRepresentation.kind === "individual"
    ? Boolean(ghostRepresentation.individual.firstName.trim() && ghostRepresentation.individual.lastName.trim())
    : Boolean(ghostRepresentation.organization.name.trim() && /^https?:\/\//i.test(ghostRepresentation.organization.website.trim()));
  const ghostSubject = formatGhostRepresentation(ghostRepresentation) || ghostDraft.subject.trim();
  const ghostProfileReady = ghostRepresentationReady && Boolean(ghostDraft.priorities.trim() && ghostDraft.preferences.trim() && ghostDraft.voice.trim() && ghostDraft.boundaries.trim());
  const saveGhostProfile = () => void mutate({ type: "setPresence", patch: { ghostProfile: { ...ghostDraft, subject: ghostSubject, representation: ghostRepresentation, priorities: ghostDraft.priorities.trim(), preferences: ghostDraft.preferences.trim(), voice: ghostDraft.voice.trim(), boundaries: ghostDraft.boundaries.trim() } } });
  const savePublicSelf = () => void mutate({
    type: "setPresence",
    patch: {
      publicSelf: { ...publicSelfDraft, displayName: presenceNameDraft.trim() || presence.name },
      mediaPerceptionPolicy: mediaPolicyDraft,
      ...(presence.mode === "ghost" ? { ghostProfile: { ...ghostDraft, subject: ghostSubject, representation: ghostRepresentation } } : {}),
    },
  });
  const openChannelEditor = () => {
    setChannelNameDraft(channelDefinition?.name ?? channelLabel(presence.channel, state.channelDefinitions));
    setChannelDomainDraft(channelDefinition?.domain ?? "");
    setChannelAffordancesDraft(channelDefinition?.affordances ?? capabilities);
    setChannelAssetsDraft(channelDefinition?.supportedAssetKinds ?? []);
    setEditingChannel(true);
  };
  const saveChannel = () => {
    if (!channelDefinition || !channelNameDraft.trim()) return;
    void mutate({ type: "updateChannel", definition: { ...channelDefinition, name: channelNameDraft.trim(), domain: channelDomainDraft.trim() || undefined, affordances: channelAffordancesDraft, supportedAssetKinds: channelAssetsDraft, updatedAt: new Date().toISOString() } });
    setEditingChannel(false);
  };
  const toggleChannelAffordance = (id: string) => setChannelAffordancesDraft((items) => items.some((item) => item.id === id) ? items.filter((item) => item.id !== id) : [...items, channelDefinition?.affordances.find((item) => item.id === id) ?? { id, label: id, description: "Channel action" }]);
  const toggleChannelAsset = (kind: SocialAssetKind) => setChannelAssetsDraft((items) => items.includes(kind) ? items.filter((item) => item !== kind) : [...items, kind]);
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
  const publishingInitiative = presence.publishingInitiative;
  const savePublishingPace = () => {
    const count = Math.max(1, Math.min(10_000, Math.round(Number(publishingCountDraft) || 0)));
    if (!count) return;
    void mutate({ type: "setPresence", patch: { publishingInitiative: { ...(publishingInitiative ?? { mode: "pace", timezone: "UTC", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }), mode: "pace", target: { count, period: publishingPeriodDraft }, updatedAt: new Date().toISOString() } } });
  };
  const knowledgeCollections = state.knowledgeCollections.filter((collection) => collection.agentId === state.agent?.id && collection.status === "active");
  const knowledgeUseOptions: { id: KnowledgeUse; label: string; detail: string }[] = [
    { id: "none", label: "Not available", detail: "Do not retrieve this collection for this Presence." },
    { id: "internal", label: "Internal", detail: "Available to the Presence, but never public source material." },
    { id: "public", label: "Public", detail: "May support public expression when the Agent chooses it." },
  ];
  const knowledgeBindingFor = (collectionId: string) => state.presenceKnowledgeBindings.find((binding) => binding.presenceId === presence.id && binding.collectionId === collectionId && binding.enabled);
  return (
    <div className="page presence-settings-page">
      <PageHeader
        eyebrow="One place, one envelope"
        title="Presence settings"
        description="Choose who speaks here and how independently this Presence acts."
      />
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
            <strong>{connectionMode === "sandbox" ? "Sandbox" : connectionMode === "native" ? "Live API" : "OpenPresence Chrome"}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong className={presence.status === "paused" ? "presence-status paused" : "presence-status"}>
              <span aria-hidden="true" /> {presence.status === "paused" ? "Paused" : "Awake"}
            </strong>
          </div>
        </div>
      </div>
      <section className="settings-card knowledge-access-card" aria-labelledby="presence-knowledge-title">
        <div className="section-heading compact">
          <div>
            <SectionEyebrow>Knowledge access</SectionEyebrow>
            <h2 id="presence-knowledge-title">What may this Presence retrieve?</h2>
          </div>
          <BookOpen size={17} />
        </div>
        <p className="muted">Access is scoped to this Presence. A collection binding can only narrow the collection&apos;s own disclosure level.</p>
        {knowledgeCollections.length === 0 ? (
          <div className="knowledge-empty-access"><p>No Agent Knowledge collections yet.</p><Button type="button" variant="secondary" onClick={() => setView?.("knowledge")}><BookOpen size={14} /> Open Knowledge</Button></div>
        ) : (
          <div className="knowledge-access-list">
            {knowledgeCollections.map((collection) => {
              const binding = knowledgeBindingFor(collection.id);
              const selectedUse = binding?.maximumUse ?? "none";
              return <div className="knowledge-access-row" key={collection.id}>
                <div><strong>{collection.name}</strong><small>{collection.defaultRole === "procedure" ? "Procedure" : "Reference"} · collection default: {collection.defaultUse}</small></div>
                <select aria-label={`Knowledge access for ${collection.name}`} value={selectedUse} onChange={(event) => void mutate({ type: "setKnowledgeBinding", presenceId: presence.id, collectionId: collection.id, maximumUse: event.target.value as KnowledgeUse, enabled: event.target.value !== "none" })}>
                  {knowledgeUseOptions.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
                </select>
              </div>;
            })}
          </div>
        )}
      </section>
      <section className="settings-card channel-settings-card">
        <div className="section-heading compact">
          <div>
            <SectionEyebrow>Channel & environment</SectionEyebrow>
            <h2>Where should {agentName} show up?</h2>
          </div>
          <Globe2 size={17} />
        </div>
        <p className="muted channel-settings-intro">Choose one route for {simulation.worldLabel}. Sandbox is safe to rehearse; the official X API and OpenPresence Chrome are the live routes.</p>
        {channelDefinition && (
          <div className="channel-definition-editor">
            {!editingChannel ? (
              <div className="channel-definition-summary">
                <div><span>Channel</span><strong>{channelDefinition.name}</strong><small>{channelDefinition.domain || "No destination set"}</small></div>
                <Button type="button" variant="secondary" onClick={openChannelEditor}><Pencil size={14} /> Edit Channel</Button>
              </div>
            ) : (
              <div className="channel-definition-form" aria-label="Edit Channel">
                <div className="section-heading compact"><div><SectionEyebrow>Edit Channel</SectionEyebrow><h3>Update this destination</h3></div><Button type="button" variant="ghost" onClick={() => setEditingChannel(false)}>Cancel</Button></div>
                <label>Channel name<input aria-label="Channel name" value={channelNameDraft} onChange={(event) => setChannelNameDraft(event.target.value)} maxLength={120} /></label>
                <label>Destination URL<input aria-label="Channel destination" type="url" value={channelDomainDraft} onChange={(event) => setChannelDomainDraft(event.target.value)} placeholder="https://www.skool.com/saaspreneur-academy" /></label>
                <fieldset className="channel-edit-capabilities"><legend>Channel actions</legend><div>{channelDefinition.affordances.map((item) => <label key={item.id}><input type="checkbox" checked={channelAffordancesDraft.some((current) => current.id === item.id)} onChange={() => toggleChannelAffordance(item.id)} /><span><strong>{item.label}</strong><small>{item.description}</small></span></label>)}</div></fieldset>
              <fieldset className="channel-edit-capabilities"><legend>Channel media support</legend><div>{(["image", "gif"] as SocialAssetKind[]).map((kind) => <label key={kind}><input type="checkbox" checked={channelAssetsDraft.includes(kind)} onChange={() => toggleChannelAsset(kind)} /><span><strong>{kind === "image" ? "Images" : "GIFs"}</strong><small>Supported by this destination. The connected adapter must advertise the matching media capability.</small></span></label>)}</div><p className="form-hint">Media delivery uses the common asset route when the active Native or Browser Bridge connector advertises the selected type.</p></fieldset>
                <div className="inline-form-actions"><Button type="button" variant="primary" disabled={!channelNameDraft.trim()} onClick={saveChannel}><Check size={14} /> Save Channel</Button></div>
              </div>
            )}
          </div>
        )}
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
            <span><strong>OpenPresence Chrome</strong><small>Use a signed-in Chrome session through the OpenPresence extension</small></span>
          </button>
        </div>
        <div className="channel-selection-status">
          {connectionMode === "sandbox" && <div className="channel-sandbox-summary"><div><strong>This world is simulated.</strong><p>{simulation.worldLabel} history stays in this rehearsal session; {agentName}&apos;s mind is shared.</p></div><Button variant="secondary" onClick={() => setView?.("playground")}><FlaskConical size={14} /> Open Playground</Button></div>}
          {connectionMode === "native" && presence.channel === "x" && <XConnection state={state} presence={presence} manageX={manageX} />}
          {connectionMode === "bridge" && <ChromeConnectionPanel state={state} presence={presence} mutate={mutate} manageBridge={manageBridge} refreshState={refreshState} />}
        </div>
        {connectionMode === "native" && !(nativeConnection?.status === "connected") && <p className="channel-not-connected">No live connection is active yet. Configure the selected route below when you’re ready.</p>}
      </section>
      <section className="identity-card settings-card">
        <div>
          <SectionEyebrow>Identity</SectionEyebrow>
          <h2>Who speaks here?</h2>
          <p>
            {presence.mode === "ghost"
              ? `${agentName} extends the operator’s attention and judgment.`
              : `${agentName} speaks as an agent with their own point of view.`}
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
          <label>
            Presence handle
            <input
              aria-label="Presence handle"
              value={presenceHandleDraft}
              onChange={(event) => setPresenceHandleDraft(event.target.value)}
              maxLength={80}
              placeholder="@genny"
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            disabled={!presenceHandleDraft.trim() || presenceHandleDraft.trim() === presence.handle}
            onClick={() => void mutate({ type: "setPresence", patch: { handle: presenceHandleDraft.trim() } })}
          >
            <Check size={14} /> Save handle
          </Button>
        </div>
        <div className="identity-options">
          <button
            className={presence.mode === "agent" ? "selected" : ""}
            onClick={() =>
              mutate({ type: "setPresence", patch: { mode: "agent" } })
            }
          >
            <strong>{agentName}</strong>
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
        {presence.mode === "ghost" && <div className="public-self-represented">
          <div className="public-self-representation-toggle">
            <span className="public-self-label">Represents</span>
            <div className="public-self-representation-options" role="group" aria-label="Representation type">
              <button type="button" className={ghostRepresentation.kind === "individual" ? "selected" : ""} aria-pressed={ghostRepresentation.kind === "individual"} onClick={() => setGhostDraft({ ...ghostDraft, representation: { ...ghostRepresentation, kind: "individual" } })}>
                <strong>Individual</strong><small>Use a person&apos;s name.</small>
              </button>
              <button type="button" className={ghostRepresentation.kind === "organization" ? "selected" : ""} aria-pressed={ghostRepresentation.kind === "organization"} onClick={() => setGhostDraft({ ...ghostDraft, representation: { ...ghostRepresentation, kind: "organization" } })}>
                <strong>Organization</strong><small>Use an organization name and website.</small>
              </button>
            </div>
          </div>
          {ghostRepresentation.kind === "individual" ? (
            <div className="public-self-representation-fields individual-fields">
              <label>First name<input aria-label="First name" value={ghostRepresentation.individual.firstName} onChange={(event) => setGhostDraft({ ...ghostDraft, representation: { ...ghostRepresentation, individual: { ...ghostRepresentation.individual, firstName: event.target.value } } })} placeholder="First name" /></label>
              <label>Middle name <small>(optional)</small><input aria-label="Middle name" value={ghostRepresentation.individual.middleName} onChange={(event) => setGhostDraft({ ...ghostDraft, representation: { ...ghostRepresentation, individual: { ...ghostRepresentation.individual, middleName: event.target.value } } })} placeholder="Middle name" /></label>
              <label>Last name<input aria-label="Last name" value={ghostRepresentation.individual.lastName} onChange={(event) => setGhostDraft({ ...ghostDraft, representation: { ...ghostRepresentation, individual: { ...ghostRepresentation.individual, lastName: event.target.value } } })} placeholder="Last name" /></label>
            </div>
          ) : (
            <div className="public-self-representation-fields organization-fields">
              <label>Organization<input aria-label="Organization name" value={ghostRepresentation.organization.name} onChange={(event) => setGhostDraft({ ...ghostDraft, representation: { ...ghostRepresentation, organization: { ...ghostRepresentation.organization, name: event.target.value } } })} placeholder="Organization name" /></label>
              <label>Website<input aria-label="Organization website" type="url" value={ghostRepresentation.organization.website} onChange={(event) => setGhostDraft({ ...ghostDraft, representation: { ...ghostRepresentation, organization: { ...ghostRepresentation.organization, website: event.target.value } } })} placeholder="https://example.com" /></label>
            </div>
          )}
          {!ghostRepresentationReady && <p className="form-hint" role="status">{ghostRepresentation.kind === "individual" ? "Enter a first and last name before saving." : "Enter an organization name and a valid http(s) website before saving."}</p>}
          <p className="form-hint">This is the public identity this Presence extends. The Agent can use these exact fields when someone asks who it represents.</p>
        </div>}
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
        <div className="inline-form-actions"><Button variant="primary" disabled={presence.mode === "ghost" && !ghostRepresentationReady} onClick={savePublicSelf}><Check size={14} /> Save Public Self</Button></div>
      </section>
      <section className="settings-card capability-manifest-card" aria-labelledby="presence-capability-title">
        <div className="section-heading compact"><div><SectionEyebrow>Effective body</SectionEyebrow><h2 id="presence-capability-title">What {presence.name} can actually do</h2></div><PlugZap size={17} /></div>
        <p className="muted">These capabilities combine channel support, connection health, permissions, execution, observation, and verification. “Auto” is not shown as ready when the body cannot confirm the public result.</p>
        <div className="capability-list">{derivePresenceCapabilityManifest(state, presence.id).items.map((item) => <div className="capability-row" key={item.capability}><div><strong>{item.label}</strong><small>{capabilityProviderLabel(state, presence.id, item)}{item.limitation ? ` · ${item.limitation}` : ""}</small></div><span className={`capability-state capability-state-${item.availability}`}>{item.availability.replaceAll("-", " ")}</span></div>)}</div>
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
      <section className="settings-card language-policy-card presence-language-policy-card">
        <div className="section-heading compact">
          <div><SectionEyebrow>Presence taste · language</SectionEyebrow><h2>Language & phrasing here</h2></div>
          <ShieldCheck size={17} />
        </div>
        <p className="muted">This Presence admits only confirmed-English social observations into the Feed and Agent context. It also keeps posts, replies, messages, and Presence Chat in English. Non-English or unknown-language observations are left out rather than guessed or translated. It inherits the Agent&apos;s hard boundaries and can add local ones.</p>
        <div className="presence-language-selection">
          <div><strong>Primary language</strong><small>The language this Presence uses when it speaks.</small></div>
          <div className="presence-language-value"><small>English is the only supported Presence language right now.</small><select aria-label="Presence language" value={presence.language} onChange={(event) => void mutate({ type: "setPresence", patch: { language: event.target.value as "en" } })}><option value="en">English</option></select></div>
        </div>
        <div className="language-inherited-rules">
          <span><strong>Inherited Never use</strong>{state.agent?.languagePolicy?.prohibited?.length ? state.agent.languagePolicy.prohibited.join(" · ") : "None set"}</span>
        </div>
        <div className="language-policy-editor">
          <label>Prefer to avoid <small>Advisory and Presence-scoped.</small><textarea aria-label="Presence language preferences to avoid" rows={3} value={presenceAvoidDraft} onChange={(event) => setPresenceAvoidDraft(event.target.value)} /></label>
          <label>Never use here <small>Additional literal boundaries for this channel and public self.</small><textarea aria-label="Presence prohibited language" rows={3} value={presenceProhibitedDraft} onChange={(event) => setPresenceProhibitedDraft(event.target.value)} /></label>
        </div>
        <div className="inline-form-actions"><Button variant="primary" onClick={() => void mutate({ type: "setPresenceLanguagePolicy", policy: { avoid: presenceAvoidDraft.split(/\r?\n/).map((item) => item.trim()).filter(Boolean), prohibited: presenceProhibitedDraft.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) } })}><Check size={14} /> Save Presence language</Button></div>
      </section>
      <section className="settings-card presence-rhythm-card" id="rhythm-settings">
        <div className="section-heading compact">
          <div>
            <SectionEyebrow>Attention rhythm</SectionEyebrow>
            <h2>When should {presence.name} look around?</h2>
          </div>
          <Clock3 size={17} />
        </div>
        <p className="muted rhythm-intro">Rhythm controls when this Presence checks its connected channel for something worth considering. It never tells {agentName} what to say, and it never turns a check into a forced publication.</p>
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
      <section className="settings-card publishing-initiative-card" id="publishing-pace-settings">
        <div className="section-heading compact">
          <div>
          <SectionEyebrow>Publishing initiative · Presence-scoped</SectionEyebrow>
          <h2>How actively should {presence.name} publish?</h2>
          </div>
          <Sparkles size={17} />
        </div>
        <p className="muted rhythm-intro">Set the responsibility, not the words. {presence.name} still decides what is worth saying, what to research, and when a particular post is ready.</p>
        <div className="rhythm-options publishing-initiative-options" role="group" aria-label="Publishing pace">
          <button type="button" className={publishingInitiative?.mode === "off" ? "selected" : ""} onClick={() => void mutate({ type: "setPresence", patch: { publishingInitiative: { ...(publishingInitiative ?? { timezone: "UTC", createdAt: new Date().toISOString() }), mode: "off", updatedAt: new Date().toISOString() } } })} aria-pressed={publishingInitiative?.mode === "off"}>
            <strong>No publishing responsibility</strong>
            <small>{presence.name} can still respond to events and explicit instructions, but does not maintain an ongoing original-publishing plan.</small>
          </button>
          <button type="button" className={publishingInitiative?.mode === "adaptive" ? "selected" : ""} onClick={() => void mutate({ type: "setPresence", patch: { publishingInitiative: { ...(publishingInitiative ?? { timezone: "UTC", createdAt: new Date().toISOString() }), mode: "adaptive", updatedAt: new Date().toISOString() } } })} aria-pressed={publishingInitiative?.mode === "adaptive"}>
            <strong>Let {presence.name} decide <em className="recommended-tag">Recommended</em></strong>
            <small>{presence.name} determines an appropriate pace from its Mission, Growth evidence, recent activity, and what is happening here.</small>
          </button>
          <button type="button" className={publishingInitiative?.mode === "pace" ? "selected" : ""} onClick={() => void mutate({ type: "setPresence", patch: { publishingInitiative: { ...(publishingInitiative ?? { timezone: "UTC", createdAt: new Date().toISOString() }), mode: "pace", target: { count: Math.max(1, Math.round(Number(publishingCountDraft) || 5)), period: publishingPeriodDraft }, updatedAt: new Date().toISOString() } } })} aria-pressed={publishingInitiative?.mode === "pace"}>
            <strong>Set a pace</strong>
            <small>Give {presence.name} a publishing expectation. {presence.name} decides how to work toward it.</small>
          </button>
        </div>
        {publishingInitiative?.mode === "pace" && (
          <div className="publishing-pace-editor">
            <div className="publishing-pace-sentence" aria-label="Publishing pace target">
              <span>Aim for about</span>
              <input aria-label="Publishing pace count" type="number" min={1} max={10000} value={publishingCountDraft} onChange={(event) => setPublishingCountDraft(event.target.value)} />
              <span>original posts</span>
              <select aria-label="Publishing pace period" value={publishingPeriodDraft} onChange={(event) => setPublishingPeriodDraft(event.target.value as "day" | "week")}>
                <option value="day">per day</option>
                <option value="week">per week</option>
              </select>
              <Button type="button" variant="secondary" onClick={savePublishingPace}>Save pace</Button>
            </div>
            <p className="form-hint">This is a pace, not a forced quota. Weak ideas can still be rejected, but {presence.name} keeps responsibility for finding better ones.</p>
          </div>
        )}
        {publishingInitiative?.mode !== "off" && connectionMode !== "sandbox" && !nativeConnection?.status && !activeBridge && <p className="settings-warning">{presence.name} needs automatic attention to pursue this pace on its own. Connect the selected live route or use Sandbox to rehearse it.</p>}
        {publishingInitiative?.mode !== "off" && presence.execution.post === "off" && <p className="settings-warning">Original posts are currently Off. {presence.name} can work on ideas, but cannot complete this publishing responsibility.</p>}
        {publishingInitiative?.mode !== "off" && presence.execution.post === "review" && <p className="settings-warning">{presence.name} can work toward this pace, but publications will wait for your approval.</p>}
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
          <p className="muted">This is the context {agentName} uses to extend you here. It does not change {agentName}&apos;s Brain, Soul, Mission, Taste, Memory, or Growth.</p>
          <p className="form-hint">The represented identity is set in Public Self above. This section adds the context the Ghost uses to extend it.</p>
          <div className="ghost-profile-form">
            <label>Priorities here<textarea aria-label="Ghost priorities" value={ghostDraft.priorities} onChange={(event) => setGhostDraft({ ...ghostDraft, priorities: event.target.value })} placeholder="What should this Presence help accomplish?" rows={3} /></label>
            <label>Preferences and points of view<textarea aria-label="Ghost preferences" value={ghostDraft.preferences} onChange={(event) => setGhostDraft({ ...ghostDraft, preferences: event.target.value })} placeholder="What do you care about, prefer, or believe?" rows={3} /></label>
            <label>Voice and tone<textarea aria-label="Ghost voice" value={ghostDraft.voice} onChange={(event) => setGhostDraft({ ...ghostDraft, voice: event.target.value })} placeholder="How should it sound when extending you?" rows={3} /></label>
            <label>Boundaries and things to avoid<textarea aria-label="Ghost boundaries" value={ghostDraft.boundaries} onChange={(event) => setGhostDraft({ ...ghostDraft, boundaries: event.target.value })} placeholder="What should it never assume, disclose, or do?" rows={3} /></label>
          </div>
          <div className="ghost-understanding" role="status">
            <div className="section-heading compact"><div><SectionEyebrow>Review before acting</SectionEyebrow><h3>What {agentName} currently understands</h3></div><span className={`status-tag ${ghostProfileReady ? "status-ready" : "status-incomplete"}`}>{ghostProfileReady ? "Profile defined" : "Needs your input"}</span></div>
            <dl>
              <div><dt>Represents</dt><dd>{ghostSubject || "Not defined yet"}</dd></div>
              <div><dt>Priorities</dt><dd>{ghostDraft.priorities.trim() || "Not defined yet"}</dd></div>
              <div><dt>Preferences</dt><dd>{ghostDraft.preferences.trim() || "Not defined yet"}</dd></div>
              <div><dt>Voice</dt><dd>{ghostDraft.voice.trim() || "Not defined yet"}</dd></div>
              <div><dt>Boundaries</dt><dd>{ghostDraft.boundaries.trim() || "Not defined yet"}</dd></div>
            </dl>
            <p className="form-hint">Empty fields are unknown. {agentName} must not infer them from their own identity or private context.</p>
          </div>
          <div className="inline-form-actions"><Button variant="primary" disabled={!ghostProfileReady} onClick={saveGhostProfile}><Check size={14} /> Save Ghost profile</Button></div>
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

function ChromeConnectionPanel({
  state,
  presence,
  mutate,
  manageBridge,
  refreshState,
}: {
  state: OpenPresenceState;
  presence: NonNullable<OpenPresenceState["presence"]>;
  mutate: Mutate;
  manageBridge: BridgeManage;
  refreshState: () => Promise<OpenPresenceState>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const extensionEnabled = presence.browserAccess?.enabled === true;
  const activeBridge = state.bridges.find((item) => item.presenceId === presence.id && item.state !== "offline");
  const connected = Boolean(activeBridge && bridgeAdapterStatus(activeBridge) === "connected");
  const identityMismatch = activeBridge?.accountIdentity?.status === "mismatch";
  const identityUnknown = activeBridge?.accountIdentity?.status === "unknown";
  const status = !extensionEnabled ? "Disabled" : identityMismatch ? "Wrong X account" : identityUnknown ? "Account needs verification" : connected ? "Connected" : activeBridge ? "Extension not connected" : "Not connected";
  const openControlledChrome = () => window.postMessage({ source: "openpresence", type: "OPENPRESENCE_OPEN_CHROME", presenceId: presence.id }, "*");
  const refresh = async () => {
    setRefreshing(true);
    try { await refreshState(); } finally { setRefreshing(false); }
  };
  return (
    <div className="chrome-connection-panel" aria-label="Chrome connection">
      <div className="chrome-connection-heading">
        <div>
          <SectionEyebrow>Chrome connection</SectionEyebrow>
          <h2>Let {presence.name} use Chrome</h2>
          <p className="muted">OpenPresence chooses what is worth doing. The Chrome extension provides the visible tab, uses the account you sign into, and reports back only verified outcomes.</p>
        </div>
        <ShieldCheck size={17} />
      </div>
      <div className="chrome-connection-controls">
        <label className="toggle-row"><input type="checkbox" aria-label={`Enable Chrome for ${presence.name}`} checked={extensionEnabled} onChange={(event) => void mutate({ type: "setPresenceBrowserAccess", presenceId: presence.id, enabled: event.target.checked })} /><span className="toggle-track" aria-hidden="true"><span /></span><span>{extensionEnabled ? "Enabled" : "Disabled"}</span></label>
        <Button type="button" variant="secondary" disabled={!extensionEnabled} onClick={openControlledChrome}><PlugZap size={14} /> Open controlled Chrome</Button>
      </div>
      <div className="chrome-connection-status" role="status">
        <span className={`live-pill ${connected && !identityMismatch && !identityUnknown ? "" : "paused"}`}><span className="status-dot" /> {status}</span>
        <span className="chrome-connection-status-copy">{!extensionEnabled ? "Enable Chrome hands for this Presence to make the extension available." : identityMismatch ? `${activeBridge?.accountIdentity?.message} No live work can be claimed until the correct account is signed in.` : identityUnknown ? `${activeBridge?.accountIdentity?.message ?? `Expected ${presence.handle}.`} No live work can be claimed until X exposes the signed-in account.` : connected ? `The controlled browser is connected as ${presence.handle} and ready for approved work.` : activeBridge ? "The Chrome route is configured, but the extension has not checked in. Open the controlled Chrome tab and enable the extension." : "Install or enable the OpenPresence Chrome extension, then open the controlled browser."}</span>
        {activeBridge && <Button type="button" variant="ghost" disabled={refreshing} onClick={() => void refresh()}><RotateCcw size={13} /> {refreshing ? "Refreshing…" : "Refresh status"}</Button>}
      </div>
      <small className="chrome-connection-safety"><ShieldCheck size={13} /> No account credentials are stored in OpenPresence or the extension. Before a write, the tab checks the selected account and verifies the resulting post.</small>
      <details className="advanced-connector-details">
        <summary>Advanced connector diagnostics</summary>
        <p>For developers testing alternative local executors. Most users should only use the OpenPresence Chrome extension above.</p>
        <BridgeManager state={state} presence={presence} manageBridge={manageBridge} refreshState={refreshState} />
      </details>
    </div>
  );
}

function BridgeManager({
  state,
  presence,
  manageBridge,
  refreshState,
}: {
  state: OpenPresenceState;
  presence: NonNullable<OpenPresenceState["presence"]>;
  manageBridge: BridgeManage;
  refreshState: () => Promise<OpenPresenceState>;
}) {
  const [name, setName] = useState(presence.channel === "x" ? "X Browser Bridge" : "External Channel Bridge");
  const [kind, setKind] = useState<ConnectorKind>("bridge");
  const [key, setKey] = useState<string | undefined>();
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const bridges = state.bridges.filter(
    (item) => item.presenceId === presence?.id,
  );
  const activeBridges = bridges.filter((item) => item.state !== "offline");
  const channel = state.channelDefinitions.find(
    (item) => item.id === presence?.channel,
  );
  const baseUrl = typeof window === "undefined" ? "<OPENPRESENCE_BASE_URL>" : window.location.origin;
  const bridge = activeBridges[0];
  const supervisedTest = bridge ? {
    checkedIn: bridgeAdapterStatus(bridge) === "connected",
    observed: state.mirrorObjects.some((item) => item.bridgeId === bridge.id && item.presenceId === presence.id),
    acknowledged: state.executions.some((item) => item.bridgeId === bridge.id && item.presenceId === presence.id && item.status === "succeeded"),
  } : { checkedIn: false, observed: false, acknowledged: false };
  const defaultBridgeCapabilities = presence.channel === "x" ? {
    inbound: true,
    reconcile: true,
    affordances: ["post", "reply", "like", "repost", "quote", "follow"],
    formats: ["x.post", "x.media-post", "x.reply"],
    metrics: ["followers", "public_metrics"],
    assetKinds: ["image", "video"] as SocialAssetKind[],
  } : {
    inbound: true,
    reconcile: true,
    affordances: presence.capabilities.map((item) => item.id),
    formats: channel?.formats.map((item) => item.id) ?? [],
    metrics: ["replies", "reactions"],
    assetKinds: [] as SocialAssetKind[],
  };
  const bridgeCapabilities = bridge?.capabilities ?? {
    ...defaultBridgeCapabilities,
  };
  const prompt = bridgeAdapterPrompt({ baseUrl, presence, channelName: channelLabel(presence.channel, state.channelDefinitions), channelDomain: channel?.domain, capabilities: bridgeCapabilities });
  const environmentExample = bridgeEnvironmentExample(baseUrl);
  const apiExamples = bridgeApiExamples(baseUrl);
  const create = async () => {
    const result = await manageBridge({
      action: "create",
      presenceId: presence.id,
      name,
      kind,
      capabilities: {
        ...defaultBridgeCapabilities,
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
  const refresh = async () => {
    setRefreshing(true);
    try { await refreshState(); } finally { setRefreshing(false); }
  };
  const copy = (value: string, label: string) => {
    const write = navigator.clipboard?.writeText(value);
    if (write) void write.catch(() => undefined);
    setCopied(label);
    window.setTimeout(() => setCopied((current) => current === label ? null : current), 1600);
  };
  const externalEventsEndpoint = `${baseUrl}/api/bridge/v1/events`;
  const externalExecutionsEndpoint = `${baseUrl}/api/bridge/v1/executions/claim`;
  const bridgeStatus = (bridge: (typeof bridges)[number]) => {
    const status = bridgeAdapterStatus(bridge);
    return presence.channel === "x" && bridge.state !== "offline" && status === "waiting"
      ? "Chrome extension not connected"
      : bridgeAdapterStatusLabel(status);
  };
  const bridgeRow = (bridge: (typeof bridges)[number]) => (
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
          className={`live-pill ${bridgeAdapterStatus(bridge) === "connected" ? "" : "paused"}`}
        >
          <span className="status-dot" />{" "}
          {bridgeStatus(bridge)}
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
  );
  const activeBridgeRows = activeBridges.map(bridgeRow);
  const offlineBridgeRows = bridges.filter((item) => item.state === "offline").map(bridgeRow);
  return (
    <div className="channel-connector-panel bridge-manager">
      <div className="section-heading compact">
        <div>
          <SectionEyebrow>{presence.channel === "x" ? "X Browser Bridge" : "External Bridge"}</SectionEyebrow>
          <h2>{activeBridges.length ? "Signed-in browser route" : `Connect ${channelLabel(presence.channel, state.channelDefinitions)} through a Bridge`}</h2>
        </div>
        <ShieldCheck size={17} />
      </div>
      {activeBridges.length === 0 && (
        <div className="empty-bridge">
          <p>
            {channel?.builtIn
              ? `Use a Bridge when ${channelLabel(presence.channel, state.channelDefinitions)} should be reached through an external adapter. Only the selected route above can deliver actions.`
              : `A Bridge is an external adapter for ${channelLabel(presence.channel, state.channelDefinitions)}. It sends observed channel objects to OpenPresence and receives only approved actions from this Presence's execution envelope.`}
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
                <option value="bridge">{presence.channel === "x" ? "X Browser Bridge · signed-in session" : "Bridge · external executor"}</option>
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
          {activeBridgeRows.length > 0 && <div className="bridge-list-label">{presence.channel === "x" ? "Current Chrome extension route" : "Current route"}</div>}
          {activeBridgeRows}
          {offlineBridgeRows.length > 0 && (
            <details className="bridge-history-details">
              <summary>Connection history · {offlineBridgeRows.length} removed</summary>
              <div className="bridge-history-list">{offlineBridgeRows}</div>
            </details>
          )}
          {bridge && (
            <div className="adapter-status-summary" role="status">
              <div>
                <span className="eyebrow">{presence.channel === "x" ? "Chrome extension status" : "Adapter status"}</span>
                <strong>{bridgeStatus(bridge)}</strong>
                <small>{bridge.lastSeenAt ? `Last check-in ${formatTime(bridge.lastSeenAt)}` : "No authenticated adapter request has arrived yet."}</small>
              </div>
              <Button variant="ghost" disabled={refreshing} onClick={() => void refresh()}>
                <RotateCcw size={13} /> {refreshing ? "Refreshing…" : "Refresh status"}
              </Button>
            </div>
          )}
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
                onClick={() => void copy(key, "key")}
              >
                {copied === "key" ? "Copied" : "Copy key"}
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
          {bridge && (
            <div className="adapter-guide">
              <div className="adapter-guide-heading">
                <div>
                  <SectionEyebrow>External browser adapter</SectionEyebrow>
                  <h3>Set up the adapter that gives this Presence eyes and hands</h3>
                  <p className="muted">OpenPresence decides what is worth doing. Your external browser agent observes this channel and carries out only approved executions.</p>
                </div>
                <Button variant="ghost" onClick={() => setGuideOpen((value) => !value)}>{guideOpen ? "Hide setup" : "Show setup"}</Button>
              </div>
              {guideOpen && (
                <>
                  <div className="adapter-summary-grid">
                    <div><span>Presence</span><strong>{presence.name}</strong><small>{presence.handle}</small></div>
                    <div><span>Channel</span><strong>{channelLabel(presence.channel, state.channelDefinitions)}</strong><small>{channel?.domain ?? "Custom destination"}</small></div>
                    <div><span>Allowed actions</span><strong>{bridge.capabilities.affordances.join(", ") || "None"}</strong><small>Governed by the Execution Envelope</small></div>
                    <div><span>Media</span><strong>{channel?.supportedAssetKinds?.length ? `Channel: ${channel.supportedAssetKinds.join(", ")}` : "Not declared"}</strong><small>Bridge delivery: supplied image/video assets only</small></div>
                  </div>
                  <div className="adapter-guide-actions">
                    <Button variant="secondary" onClick={() => void copy(prompt, "prompt")}>{copied === "prompt" ? "Prompt copied" : "Copy adapter instructions"}</Button>
                    <Button variant="secondary" onClick={() => void copy(environmentExample, "environment")}>{copied === "environment" ? "Environment copied" : "Copy environment config"}</Button>
                  </div>
                  <section className="adapter-test" aria-label="Supervised adapter test">
                    <div>
                      <SectionEyebrow>Supervised test</SectionEyebrow>
                      <h4>Verify the adapter before it acts</h4>
                      <p className="muted">Have the external browser worker follow the prompt, then refresh. The Chrome extension only carries approved actions for this selected route; it never changes the channel or gives the worker independent Agent judgment.</p>
                    </div>
                    <ol>
                      <li className={supervisedTest.checkedIn ? "complete" : "pending"}><span>{supervisedTest.checkedIn ? "✓" : "1"}</span> Adapter checked in</li>
                      <li className={supervisedTest.observed ? "complete" : "pending"}><span>{supervisedTest.observed ? "✓" : "2"}</span> Inbound observation received</li>
                      <li className={supervisedTest.acknowledged ? "complete" : "pending"}><span>{supervisedTest.acknowledged ? "✓" : "3"}</span> Claimed test execution acknowledged</li>
                    </ol>
                    <Button variant="ghost" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh test status"}</Button>
                  </section>
                  <details className="adapter-details">
                    <summary>View API examples</summary>
                    <pre>{apiExamples}</pre>
                  </details>
                  <details className="adapter-details">
                    <summary>View browser-agent prompt</summary>
                    <pre>{prompt}</pre>
                  </details>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
