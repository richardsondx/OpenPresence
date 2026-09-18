"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OperatorConversationMessage, SandboxAssetInput } from "./types";

type PendingTurn = OperatorConversationMessage & {
  clientRequestId: string;
  threadId: string;
  inputAttachments: SandboxAssetInput[];
  delivery: "pending" | "sending" | "unconfirmed";
};

/** Browser-owned turns survive disconnects; only a server acknowledgement removes them. */
export function useOperatorChatOutbox(
  scope: string,
  savedRequestIds: string[],
  transmit: (turn: PendingTurn) => Promise<boolean>,
) {
  const storageKey = `openpresence.chat-outbox.v1:${scope}`;
  const [turns, setTurns] = useState<PendingTurn[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as PendingTurn[];
      return stored.map((turn) => ({ ...turn, delivery: "unconfirmed" }));
    } catch { return []; }
  });
  const current = useRef(turns);
  const inFlight = useRef(false);
  const transmitRef = useRef(transmit);
  useEffect(() => { transmitRef.current = transmit; }, [transmit]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const update = useCallback((next: PendingTurn[]) => {
    // Write before clearing the composer. If browser storage is full, retain
    // the draft and do not claim that the message is safely queued.
    try {
      if (next.length) localStorage.setItem(storageKey, JSON.stringify(next));
      else localStorage.removeItem(storageKey);
      setStorageError(null);
    } catch {
      setStorageError("This browser could not update its recovery copy. Keep this tab open and free browser storage before trying again.");
      return false;
    }
    current.current = next;
    setTurns(next);
    return true;
  }, [storageKey]);
  const savedKey = JSON.stringify(savedRequestIds);
  useEffect(() => {
    const saved = new Set<string>(JSON.parse(savedKey));
    const remaining = current.current.filter((turn) => !saved.has(turn.clientRequestId));
    if (remaining.length !== current.current.length) update(remaining);
  }, [savedKey, update]);
  useEffect(() => {
    const first = current.current[0];
    if (!first || first.delivery === "unconfirmed" || inFlight.current) return;
    inFlight.current = true;
    update(current.current.map((turn) => turn.id === first.id ? { ...turn, delivery: "sending" } : turn));
    void transmitRef.current(first).catch(() => false).then((confirmed) => {
      inFlight.current = false;
      update(confirmed
        ? current.current.filter((turn) => turn.id !== first.id)
        : current.current.map((turn) => turn.id === first.id ? { ...turn, delivery: "unconfirmed" } : turn));
    });
  }, [turns, update]);
  return {
    turns,
    storageError,
    enqueue: (turn: Omit<PendingTurn, "delivery">) => update([...current.current, { ...turn, delivery: current.current.length ? "pending" : "sending" }]),
    retry: () => update(current.current.map((turn) => ({ ...turn, delivery: "pending" }))),
    remove: (id: string) => update(current.current.filter((turn) => turn.id !== id)),
  };
}
