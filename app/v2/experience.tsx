"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ChevronRight, Feather, MessageSquare, RotateCcw, Send, Sparkles } from "lucide-react";

type Message = { role: "user" | "agent"; text: string; post?: { caption: string; photo: boolean } };
type Demo = { step: number; audience: string; channel: string; voice: string; voiceHistory: string[]; photo: boolean; review: "pending" | "approved" | "skipped"; messages: Message[] };
const STORE = "openpresence.v2.conversation.v2";
const initial: Demo = { step: 0, audience: "", channel: "Instagram", voice: "Warm and practical", voiceHistory: [], photo: true, review: "pending", messages: [
  { role: "user", text: "Help me build an audience around easy weeknight cooking." },
  { role: "agent", text: "Let’s make your cooking account useful to a specific group of people. Who would you most like to reach?" },
] };
const caption = (voice: string) => voice === "Direct and simple" ? "A weeknight dinner worth repeating: warm white beans, tomatoes, basil, and toast. Keep the ingredients simple. Save this for a night when you don’t want to overthink dinner." : "Dinner doesn’t need a big plan. A bowl of warm white beans, tomatoes, and basil, with toast for the last little bit of olive oil. What’s your go-to dinner when the day gets away from you?";
const choices: Record<number, string[]> = {
  0: ["Busy home cooks", "People learning to cook"],
  1: ["Instagram", "X"],
  2: ["That sounds like me", "Make it more direct"],
  3: ["Keep the photo", "Make it text-only"],
  4: ["Approve this example post", "Keep it as a draft"],
  5: ["Twice a week", "Once a week"],
  6: ["Show me what we learned"],
  7: ["Try another dinner post", "What if the next one flops?"],
};
const prompts: Record<number, string> = { 0: "Or describe your audience…", 1: "Or tell me where you post…", 2: "Try “less polished” or “more direct”…", 3: "Tell me what to change…", 4: "Ask for a change, or keep it as a draft…", 5: "Tell me how much time you have…", 6: "Ask about the example results…", 7: "What would you try next?", 8: "Try “change my voice” or “pause”…" };

export default function V2Experience() {
  const [state, setState] = useState<Demo>(initial);
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const section = useRef<HTMLElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(STORE) || "null");
        if (saved && Number.isInteger(saved.step) && saved.step >= 0 && saved.step <= 8 && Array.isArray(saved.messages) && saved.messages.every((m: Message) => ["agent", "user"].includes(m.role) && typeof m.text === "string") && typeof saved.voice === "string" && typeof saved.photo === "boolean") setState({ ...initial, ...saved, voiceHistory: Array.isArray(saved.voiceHistory) ? saved.voiceHistory : [] });
      } catch { /* Start fresh if browser storage is unavailable. */ }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { queueMicrotask(() => setStorageNotice("This conversation won’t be saved on this device.")); }
  }, [state, ready]);
  useEffect(() => { transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: "smooth" }); }, [state.messages]);
  const start = () => section.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  function respond(value: string) {
    const text = value.trim();
    if (!text) return;
    setState(current => {
      const lower = text.toLowerCase();
      const next = { ...current };
      let reply: Message;
      if (/pause|busy this week/.test(lower)) {
        reply = { role: "agent", text: "We can pause here and pick up when you’re ready. In your agent, I’d also check that any planned reminders were paused." };
      } else if (/undo|restore/.test(lower)) {
        next.voice = current.voiceHistory.at(-1) || "Warm and practical"; next.voiceHistory = current.voiceHistory.slice(0, -1); next.review = "pending"; next.step = 3;
        reply = { role: "agent", text: `Restored your previous ${next.voice.toLowerCase()} voice. Here’s the revised draft; it needs a fresh review.`, post: { caption: caption(next.voice), photo: next.photo } };
      } else if (current.step > 2 && /voice|less polished|more direct/.test(lower)) {
        next.voice = /warm|friendly/.test(lower) ? "Warm and practical" : "Direct and simple"; next.voiceHistory = [...current.voiceHistory, current.voice]; next.review = "pending";
        next.step = 3;
        reply = { role: "agent", text: "I’ll use that direction for your public posts. Here’s a new draft. Would you keep the photo?", post: { caption: caption(next.voice), photo: next.photo } };
      } else if (current.step === 0) {
        next.audience = text; next.step = 1;
        reply = { role: "agent", text: `${text}—great. We’ll focus on ideas they can use on an ordinary evening. Where would you like to start?` };
      } else if (current.step === 1) {
        next.channel = /\bx\b|twitter/.test(lower) ? "X" : /instagram/.test(lower) ? "Instagram" : text; next.step = 2;
        reply = { role: "agent", text: `Let’s start on ${next.channel}. I’d keep your voice warm and practical:\n\n“Dinner doesn’t need a big plan. Sometimes a bowl of beans, tomatoes, and good toast is enough.”\n\nDoes that sound like you?` };
      } else if (current.step === 2) {
        next.voice = /direct|less|simple/.test(lower) ? "Direct and simple" : "Warm and practical"; next.voiceHistory = [...current.voiceHistory, current.voice]; next.step = 3;
        reply = { role: "agent", text: "Got it. Here’s a first post for your cooking account. I’d use a simple dinner photo rather than a polished recipe graphic. Would you keep the photo?", post: { caption: caption(next.voice), photo: true } };
      } else if (current.step === 3) {
        next.photo = !/text.only|without|remove|no photo/.test(lower); next.step = 4; next.review = "pending";
        reply = { role: "agent", text: !next.photo && next.channel === "Instagram" ? "Here’s the caption on its own. An Instagram feed post still needs a photo or video. Shall we keep this as a caption draft?" : `Ready for your review. This example is for your cooking account on ${next.channel}, with ${next.photo ? "the dinner photo" : "text only"}. Shall we approve this one post?`, post: { caption: caption(next.voice), photo: next.photo } };
      } else if (current.step === 4) {
        const approved = /^approve/i.test(text) && (current.photo || current.channel !== "Instagram");
        next.review = approved ? "approved" : "skipped"; next.step = 5;
        reply = { role: "agent", text: `${approved ? "Approved in the demo. Nothing was published." : "Kept as a draft. Nothing was published."}\n\nLet’s find a rhythm you can keep. How often would you like to work on a post?` };
      } else if (current.step === 5) {
        next.step = 6;
        reply = { role: "agent", text: `${/twice|two|2/.test(lower) ? "Twice a week" : /once|one|1/.test(lower) ? "Once a week" : text} sounds like a starting point. I’d help you prepare something useful, then bring each post to you for review.\n\nYour agent can arrange reminders when you ask. No reminder has been created in this demo.` };
      } else if (current.step === 6) {
        next.step = 7;
        reply = { role: "agent", text: "A week later, imagine we have these results: the simple dinner post brought four questions from home cooks; a polished recipe post brought one.\n\nThat’s a reason to try another everyday dinner—not proof that the format always works. Shall we test it again?" };
      } else if (current.step === 7) {
        next.step = 8;
        reply = { role: "agent", text: /flop|fail|didn.t/.test(lower) ? "Then we revise the idea. I’d compare another pair of posts before deciding this format is worth repeating. One good post doesn’t settle it—and your voice stays yours." : "I’d try a different dinner with the same useful, everyday feel. We’ll look for more questions from the people you want to reach, and change course if the pattern doesn’t hold." };
      } else {
        reply = { role: "agent", text: "This is an example conversation. In your own agent, we’d use your posts and feedback to choose the next move. You can try changing your voice here, or reset to start again." };
      }
      next.messages = [...current.messages, { role: "user", text }, reply];
      return next;
    });
    setInput("");
  }
  return <>
    <header className="v2-header"><Link href="/v2" className="v2-brand"><span className="v2-mark"><Feather size={18} /></span>OpenPresence<span className="v2-brand-version">V2</span></Link><nav aria-label="Main"><button onClick={start}>Try the experience</button><Link href="/v2/connect" className="v2-button v2-button-dark">Connect your agent <ArrowRight size={14} /></Link></nav></header>
    <main>
      <section className="v2-hero">
        <div className="v2-hero-copy"><span className="v2-kicker"><span /> SOCIAL EXPERTISE FOR YOUR AI AGENT</span><h1>Your agent.<br />Your voice.<br /><em>Your audience.</em></h1><p>Give your AI agent the social expertise to build an audience in your niche.</p><p className="v2-hero-sub">Find the right ideas. Show up consistently. Learn what brings the right people back. All through the conversation you already use.</p><div className="v2-hero-actions"><button className="v2-button v2-button-dark" onClick={start}>See how it works <ArrowDown size={15} /></button><Link href="/v2/connect" className="v2-text-link">Connect OpenPresence <ChevronRight size={15} /></Link></div><div className="v2-works-with">For your personal AI agent<span>Muse · Grok · Codex · and more</span><small>Connection support varies by agent.</small></div></div>
        <div className="v2-hero-scene" aria-label="Example agent conversation"><div className="v2-scene-top"><MessageSquare size={14} /><span>Your usual conversation</span><span className="v2-sample">Example</span></div><div className="v2-scene-user">Help me grow my cooking account.</div><div className="v2-scene-agent"><span className="v2-agent-orb"><Sparkles size={16} /></span><div><p>Let’s start with busy home cooks. Here’s a dinner post in your voice.</p></div></div><div className="v2-hero-post"><Image src="/v2/weeknight-dinner.png" alt="Example photo of white beans, tomatoes, basil and toast on a kitchen table" width={1024} height={1024} /><p>Dinner doesn’t need a big plan.</p><span>Example draft · ready for your review</span></div></div>
      </section>
      <section className="v2-principles" aria-label="What OpenPresence adds"><div><span>01 / UNDERSTAND</span><h2>Reach the right people.</h2><p>Ideas that fit your niche and the people you want to reach.</p></div><div><span>02 / EXPRESS</span><h2>Sound like yourself.</h2><p>Shape your public voice in the conversation. Change it whenever you need.</p></div><div><span>03 / LEARN</span><h2>Make the next move better.</h2><p>Learn from the response and choose what deserves another try.</p></div></section>
      <section className="v2-demo-section" ref={section} id="experience"><div className="v2-section-heading"><div><span className="v2-kicker">THE EXPERIENCE</span><h2>One goal. An ongoing conversation.</h2><p>Try a conversation about growing a cooking account.</p></div><span className="v2-demo-label"><span /> Interactive example</span></div>
        <div className="v2-conversation"><div className="v2-chat-header"><div><span className="v2-agent-orb small"><Sparkles size={15} /></span><div><strong>Your agent</strong><span>With OpenPresence</span></div></div><button className="v2-icon-button" aria-label="Reset demo" onClick={() => { setState(initial); setInput(""); }}><RotateCcw size={16} /></button></div>
          <div className="v2-chat-transcript" ref={transcript} role="log" aria-label="Example conversation">{state.messages.map((message, index) => message.role === "user" ? <div className="v2-chat-user" key={index}>{message.text}</div> : <div className="v2-chat-agent" key={index}><span className="v2-agent-orb small"><Sparkles size={14} /></span><div className="v2-agent-content"><p className="v2-message-text">{message.text}</p>{message.post && <article className="v2-social-post" aria-label="Example post"><div className="v2-post-owner"><span className="v2-cooking-avatar">M</span><div><strong>Your cooking account</strong><span>Example {state.channel} draft</span></div></div>{message.post.photo && <Image src="/v2/weeknight-dinner.png" alt="Illustrative weeknight meal: white beans with tomatoes and basil, with toast" width={1024} height={1024} />}<p>{message.post.caption}</p><span className="v2-post-status">Example only · not published</span></article>}</div></div>)}{state.step < 8 && <div className="v2-reply-options" aria-label="Suggested replies">{(state.step === 4 && !state.photo && state.channel === "Instagram" ? ["Keep the caption as a draft"] : choices[state.step])?.map(choice => <button key={choice} onClick={() => respond(choice)}>{choice}</button>)}</div>}{state.step === 8 && <Link href="/v2/connect" className="v2-button v2-button-dark v2-conversation-connect">Try it with your own agent <ArrowRight size={14} /></Link>}</div>
          <form className="v2-composer" onSubmit={event => { event.preventDefault(); respond(input); }}><label className="v2-sr-only" htmlFor="v2-message">Message the demo</label><input id="v2-message" value={input} onChange={event => setInput(event.target.value)} placeholder={prompts[state.step]} /><button aria-label="Send demo message" disabled={!input.trim()}><Send size={16} /></button></form><p className="v2-conversation-note">Scripted example. No accounts connected, posts published, or reminders created.{storageNotice && ` ${storageNotice}`}</p>
        </div>
      </section>
      <section className="v2-closing"><span className="v2-kicker">YOUR NEXT CHAPTER</span><h2>Your audience grows.<br /><em>Your understanding compounds.</em></h2><p>Your voice, relationships, and learning belong to you.<br />Bring them to the agent—and the channels—you choose.</p><Link href="/v2/connect" className="v2-button v2-button-dark">Connect OpenPresence <ArrowRight size={15} /></Link></section>
    </main><footer className="v2-footer"><Link href="/v2" className="v2-brand"><Feather size={16} /> OpenPresence</Link><span>Social expertise. Wherever your agent works.</span><Link href="/">Existing workspace <ArrowRight size={12} /></Link></footer>
  </>;
}
