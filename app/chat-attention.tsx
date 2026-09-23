"use client";

import { useState } from "react";
import { CircleAlert } from "lucide-react";
import type { ChatRecoveryEntry } from "@/lib/chat-recovery-history";

/** Recovery is a dated transcript entry, never a composer attachment. */
export function ChatAttention({ entry, busy, onCheck }: {
  entry: ChatRecoveryEntry;
  busy: boolean;
  onCheck: (content: string) => boolean;
}) {
  const [queued, setQueued] = useState(false);
  return <article className="operator-chat-message is-presence chat-attention operator-chat-attention-message" data-testid="operator-chat-recovery-event" aria-label="Task recovery history">
    <div className="operator-chat-message-meta"><strong>OpenPresence</strong><time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString()}</time></div>
    <div className="chat-attention-heading"><CircleAlert size={16} aria-hidden="true" /><strong>{entry.title}</strong></div>
    <p>{entry.summary}</p>
    {entry.needsOperator && <div className="chat-attention-actions"><button type="button" className="button button-secondary" disabled={queued} onClick={() => setQueued(onCheck("Please check the issue holding up my work, try the available alternatives, and continue the existing task if possible."))}>{queued ? "Check queued" : busy ? "Queue check" : "Check again"}</button></div>}
  </article>;
}
