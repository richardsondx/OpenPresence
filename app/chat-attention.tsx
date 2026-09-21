"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowUpRight, CircleAlert, X } from "lucide-react";
import type { OpenPresenceState, OperationalHealthSnapshot } from "@/lib/types";
import { isXCreditsError, X_API_CONSOLE_URL } from "@/lib/x-credits";
import { bridgeExecutionStatus } from "@/lib/bridge-contract";

const reminderFallback = new Map<string, string | null>();
const reminderEvent = "openpresence:chat-attention-changed";
function readReminder(key: string) {
  if (reminderFallback.has(key)) return reminderFallback.get(key) ?? null;
  try { return localStorage.getItem(key); } catch { return reminderFallback.get(key) ?? null; }
}
function saveReminder(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value); else localStorage.removeItem(key);
    reminderFallback.delete(key);
  } catch { reminderFallback.set(key, value); }
  window.dispatchEvent(new Event(reminderEvent));
}
function subscribeReminder(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(reminderEvent, listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener(reminderEvent, listener); };
}

/** A reminder is dismissible; the underlying responsibility is never dismissed. */
export function ChatAttention({ state, health, busy, onCheck, onReview }: {
  state: OpenPresenceState;
  health?: OperationalHealthSnapshot | null;
  busy: boolean;
  onCheck: (content: string) => boolean;
  onReview: () => void;
}) {
  const presence = state.presence;
  const tasks = state.assignments.filter((task) => task.presenceId === presence?.id && ["blocked", "needs_operator"].includes(task.status));
  const incidents = (health?.incidents ?? []).filter((incident) => incident.state === "needs_operator" || incident.operatorActionRequired);
  const xBillingIncident = (incident: NonNullable<OperationalHealthSnapshot["incidents"]>[number]) => incident.rootCauseKey === "native_x.credits_exhausted" || incident.rootCauseKey === "runtime.credits_exhausted" && /\bX\b/.test(incident.safeSummary);
  const billingTasks = tasks.filter((task) => isXCreditsError(task.lastOutcome?.message) || isXCreditsError(task.work?.blockedReason));
  const billing = billingTasks.length > 0 && (incidents.some((incident) => xBillingIncident(incident) || isXCreditsError(incident.safeSummary)) || isXCreditsError(health?.summary) || tasks.length === billingTasks.length);
  const browserRouteAvailable = Boolean(presence?.channel === "x" && state.bridges.some((bridge) => bridge.presenceId === presence.id && bridge.name.startsWith("OpenPresence Chrome") && bridgeExecutionStatus(bridge) === "connected"));
  const billingContinuingInBrowser = billing && browserRouteAvailable;
  const duplicate = incidents.some((incident) => incident.rootCauseKey === "runtime.duplicate_public_outcome");
  // X billing is a connector concern, not a conversational interruption. The
  // delivery receipt is the durable place to inspect it; only unrelated
  // paused work should occupy the Chat surface.
  const relevantTasks = billingContinuingInBrowser || billing ? tasks.filter((task) => !billingTasks.includes(task)) : tasks;
  const summary = billingContinuingInBrowser
    ? "Public work is continuing through the authorized browser."
    : billing ? "X previously reported a billing or spending-limit block. Check again to see whether access has recovered." : incidents[0]?.safeSummary ?? tasks[0]?.lastOutcome?.message ?? health?.summary;
  const onlyBilling = isXCreditsError(health?.summary) || (incidents.length > 0 && incidents.every((incident) => xBillingIncident(incident) || isXCreditsError(incident.safeSummary)));
  const visible = relevantTasks.length > 0 || health?.status === "needs_you" && !onlyBilling;
  // Dismissal follows the paused responsibility, not the latest diagnostic
  // text or retry count. Those fields can change while a reply is in flight,
  // which used to make a dismissed card reappear immediately.
  const cause = billing ? "billing" : duplicate ? "duplicate" : "task";
  const fingerprint = JSON.stringify([
    cause,
    relevantTasks.length > 0 ? relevantTasks.map((task) => task.id).sort() : incidents.map((incident) => incident.id).sort(),
  ]);
  const storageKey = `openpresence:chat-attention:${state.activeAgentId}:${presence?.id}`;
  const hidden = useSyncExternalStore(subscribeReminder, () => readReminder(storageKey), () => null);
  useEffect(() => {
    // A projection can briefly omit health/tasks while a chat response is
    // being reconciled. Wait for a settled absent state before clearing a
    // dismissal, otherwise the card resurfaces during the same reply.
    if (!health || visible) return;
    const timer = window.setTimeout(() => {
      if (!visible && readReminder(storageKey)) saveReminder(storageKey, null);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [storageKey, visible, health]);
  const [checking, setChecking] = useState(false);
  const dismiss = (value: string | null) => saveReminder(storageKey, value);
  if (!visible) return null;
  if (hidden === fingerprint) return <div className="chat-attention-collapsed"><span>Paused work</span><button type="button" onClick={() => dismiss(null)}>Show paused work</button></div>;

  const check = () => {
    if (checking) return;
    setChecking(true);
    const accepted = onCheck(`Please check the ${billing ? "X billing issue" : "issue"} holding up my public work. If it’s fixed, continue the existing ${relevantTasks.length > 1 ? "tasks" : "task"} and let me know what happens.`);
    setChecking(false);
    if (accepted) dismiss(fingerprint);
  };

  return <section className="chat-attention" data-testid="operator-chat-needs-you" aria-label="Paused public work">
    <div className="chat-attention-heading"><CircleAlert size={16} aria-hidden="true" /><strong>{billing ? "X access needs a recheck" : duplicate ? "A public action needs your review" : "A task needs your attention"}</strong><button type="button" className="chat-attention-dismiss" aria-label="Dismiss reminder" onClick={() => dismiss(fingerprint)}><X size={16} /></button></div>
    <p>{summary}</p>
    {billing && <p>Manage credits in the <a href={X_API_CONSOLE_URL} target="_blank" rel="noreferrer">X Developer Console <ArrowUpRight size={12} /></a>.</p>}
    <p className="chat-attention-hint">Tell {presence?.name ?? "your Agent"} what you changed, or ask to check again.</p>
    <details><summary>Task details</summary>{relevantTasks.length > 0 && <ul>{relevantTasks.map((task) => <li key={task.id}>{task.title ?? task.instruction}</li>)}</ul>}{billing && incidents.filter((incident) => isXCreditsError(incident.safeSummary)).map((incident) => <p key={incident.id}>{incident.safeSummary}</p>)}<p>Hiding this reminder leaves the work paused. Its status changes only after a check or your decision to stop it.</p></details>
    <div className="chat-attention-actions"><button type="button" className="button button-secondary" disabled={duplicate ? false : checking} onClick={duplicate ? onReview : check}>{duplicate ? "Review decision" : busy ? "Queue check" : "Check again"}</button><button type="button" className="chat-attention-later" onClick={() => dismiss(fingerprint)}>Not now</button></div>
  </section>;
}
