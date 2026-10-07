"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export default function ConnectClient({ endpoint }: { endpoint: string | null }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const prompt = endpoint ? `Connect OpenPresence using this connection address: ${endpoint}. If sign-in is needed, give me its secure sign-in link; never ask me to paste passwords or connection keys into chat. Retrieve OpenPresence's latest social operating skill. Keep our conversation friendly and in plain language: ask one question at a time, use what you already know about me, and keep technical checks and tool output behind the scenes unless I ask for them. Use OpenPresence to help me build an audience in my niche. First check that the connection works and explain any limits, including whether it is read-only. Ask which social account I want to use, verify its exact connected identity before acting, and never substitute another account. Ask for my explicit confirmation before every public action. Keep scheduling, account connections, approvals, and public execution in your own tools.` : "";
  async function copyPrompt() {
    try { await navigator.clipboard.writeText(prompt); setCopied(true); setCopyFailed(false); }
    catch { setCopyFailed(true); }
  }

  return <div className="v2-connect-steps">
    <section className="v2-connect-step">
      <span>01</span><h2>Copy the prompt.</h2>
      <button className="v2-button v2-button-dark" onClick={copyPrompt} disabled={!endpoint}>
        {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy connection prompt"}
      </button>
      {!endpoint && <p className="v2-connect-status" role="status">Connection isn’t available here yet. You can still explore the demo.</p>}
      {copied && <p className="v2-connect-status" role="status">Copied. Paste it into your agent.</p>}
      {copyFailed && <div role="status"><p>Copy isn’t available in this browser. Select the prompt below.</p><div className="v2-copy-prompt">{prompt}</div></div>}
    </section>
    <section className="v2-connect-step"><span>02</span><h2>Paste it into your agent.</h2><p>Your agent will guide you through the connection.</p></section>
    <section className="v2-connect-step"><span>03</span><h2>Approve sign-in.</h2><p>Then tell your agent who you want to reach.</p></section>
  </div>;
}
