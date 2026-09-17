"use client";

import { socialPlaybookForPresence } from "@/lib/social-strategy";
import { useState } from "react";
import type { OpenPresenceState, View } from "@/lib/types";
import "./social-playbook.css";

type Props = { state: OpenPresenceState; presenceId: string; mutate: (operation: unknown) => Promise<OpenPresenceState | null>; setView: (view: View) => void };

export function SocialPlaybook({ state, presenceId, mutate, setView }: Props) {
  const presence = state.presences.find(item => item.id === presenceId) ?? state.presence;
  const lessons = socialPlaybookForPresence(state, presenceId).filter(item => item.status !== "retired").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [when, setWhen] = useState("");
  const [visualGuidance, setVisualGuidance] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [draftBodies, setDraftBodies] = useState<Record<string, string>>({});
  const run = async (operation: unknown, success: string, after?: () => void) => {
    setBusy(true); setFeedback("");
    try { const saved = await mutate(operation); if (!saved) throw new Error("The change was not saved. Try again."); setFeedback(success); after?.(); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "The change was not saved."); }
    finally { setBusy(false); }
  };
  return <section className="social-playbook" aria-label="Playbook">
    <div className="social-playbook-heading"><div><span className="eyebrow">Templates · {presence?.name}</span><h2>Reusable templates</h2><p>Formats and learned approaches, with source evidence and measured results.</p></div><button type="button" className="button button-secondary" onClick={() => setCreating(!creating)}>Create template</button></div>
    {creating && <form className="social-template-form" onSubmit={event => { event.preventDefault(); void run({ type: "saveSocialTemplate", presenceId, title, body, whenToUse: when, visualGuidance }, "Template saved. It is ready to try, not yet proven.", () => { setCreating(false); setTitle(""); setBody(""); setWhen(""); setVisualGuidance(""); }); }}>
      <label>Template name<input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label>Template<textarea required maxLength={4000} rows={5} placeholder={'I’m [role], building [project].\nLooking to connect with [audience].'} value={body} onChange={event => setBody(event.target.value)} /></label>
      <label>When to use it<input maxLength={1000} value={when} onChange={event => setWhen(event.target.value)} placeholder="Audience, purpose, and what would make this useful" /></label>
      <label>Visual asset guidance<textarea maxLength={800} rows={3} value={visualGuidance} onChange={event => setVisualGuidance(event.target.value)} placeholder="When should the Agent attach a relevant image, screenshot, chart, or other asset?" /></label>
      <small>Use placeholders for facts that must be supplied. Saving a template does not schedule a post.</small>
      <div className="social-template-actions"><button type="submit" className="button button-primary" disabled={busy}>Save template</button><button type="button" className="button button-ghost" onClick={() => setCreating(false)}>Cancel</button></div>
    </form>}
    {feedback && <p className="social-playbook-feedback" role="status">{feedback}</p>}
    {!lessons.length && !creating && <p className="social-playbook-empty">Save a format you want to try, or ask {presence?.name} to turn an observed post into a template. As results arrive, the useful lessons stay here.</p>}
    <div className="social-playbook-list">{lessons.map(lesson => {
      const template = lesson.template;
      const evidence = [...new Set([...lesson.supportingEvidenceIds, ...lesson.contradictingEvidenceIds])].flatMap(id => state.growthEvidenceRecords?.find(item => item.id === id) ?? []);
      const label = lesson.status === "supported" ? "Supported by evidence" : lesson.status === "disfavored" ? "Not recommended" : lesson.status === "weakened" ? "Mixed evidence" : "Ready to test";
      const sourceLabel = template?.source === "bundled" ? "Starter format" : template?.source === "observed_post" ? "Observed public sources" : template?.source === "operator" ? "Created by you" : "Saved format";
      const templateBody = template ? draftBodies[lesson.id] ?? template.body : "";
      const templateDirty = Boolean(template && templateBody !== template.body);
      return <details className="social-template-card" key={lesson.id}>
        <summary><strong>{template?.title ?? lesson.statement}</strong><span className={`social-template-status is-${lesson.status}`}>{label}</span></summary>
        <div className="social-template-detail">
          {template && <section className="social-template-layout" aria-label="Editable template layout"><div className="social-template-layout-heading"><span className="social-template-section-label">Template layout</span><small>Edit the structure directly; bracketed placeholders become fill-in fields.</small></div><textarea aria-label={`Editable template layout for ${template.title}`} rows={Math.max(5, Math.min(12, templateBody.split("\n").length + 2))} value={templateBody} onChange={event => setDraftBodies(current => ({ ...current, [lesson.id]: event.target.value }))} /><div className="social-template-editor-actions">{templateDirty && <><button type="button" className="button button-primary" disabled={busy} onClick={() => void run({ type: "updateSocialTemplate", presenceId, hypothesisId: lesson.id, body: templateBody }, "Template layout updated.", () => setDraftBodies(current => { const next = { ...current }; delete next[lesson.id]; return next; }))}>Save layout</button><button type="button" className="button button-ghost" disabled={busy} onClick={() => setDraftBodies(current => { const next = { ...current }; delete next[lesson.id]; return next; })}>Reset</button></>}</div></section>}
          <section className="social-template-guide" aria-label="Template guide"><span className="social-template-section-label">Guide</span><p>{template?.whenToUse ?? lesson.statement}</p>{template?.audienceFit && <><span className="social-template-section-label">Audience fit</span><p>{template.audienceFit}</p></>}{template?.visualGuidance && <><span className="social-template-section-label">Visual asset guidance</span><p>{template.visualGuidance}</p></>}{template && <small className="social-template-source">{sourceLabel}{template.sourceCount ? ` · abstracted from ${template.sourceCount} posts` : ""} · unproven until verified results are recorded.</small>}</section>
          {template?.variables?.length ? <small>Fill in: {template.variables.join(", ")}. Use known facts; leave unknown details out.</small> : null}
          <p className="social-template-results">{lesson.usageCount} scheduled task{lesson.usageCount === 1 ? "" : "s"} · {lesson.verifiedUses} verified post{lesson.verifiedUses === 1 ? "" : "s"}{lesson.measuredPosts ? ` · ${lesson.measuredPosts} measured` : " · no measured results yet"}</p>
          {lesson.measuredPosts > 0 && <p>{Object.entries(lesson.performance).filter(([, value]) => value !== undefined).map(([key, value]) => `${value} ${key}`).join(" · ")}. Latest available measurements; this does not establish causation.</p>}
          <div className="social-template-evidence"><strong>What we know</strong>{evidence.length ? <ul>{evidence.map(item => <li key={item.id}>{item.statement}<small>{item.kind === "WORLD_OUTCOME" ? "Observed outcome" : item.kind === "OPERATOR_REVIEW" ? "Your preference" : "Observed format"} · {new Date(item.createdAt).toLocaleDateString()}</small></li>)}</ul> : <p>No measured results yet.</p>}</div>
          {template?.sourceMirrorObjectIds?.map(id => { const post = state.mirrorObjects.find(item => item.id === id); const url = post?.channelId === "x" && /^\d+$/.test(post.externalRef.id) ? `https://x.com/i/status/${post.externalRef.id}` : undefined; return url && /^https?:\/\//.test(url) ? <p key={id}><a href={url} target="_blank" rel="noreferrer">View source post</a></p> : null; })}
          {template?.sourceUrls?.map(url => /^https?:\/\//.test(url) ? <p key={url}><a href={url} target="_blank" rel="noreferrer">View study source</a></p> : null)}
          <div className="social-template-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={() => void run({ type: "sendPresenceNudge", presenceId, content: `Use playbook item ${lesson.id} (${template?.title ?? lesson.statement}) to prepare three distinct content ideas and private drafts. Retrieve its source evidence and current results. Preserve our identity and existing constraints; do not invent missing personal details. Do not publish or schedule anything.`, clientRequestId: `playbook-draft:${lesson.id}:${crypto.randomUUID()}` }, "Draft request sent.", () => setView("chat"))}>Draft ideas</button>
          </div>
        </div>
      </details>;
    })}</div>
  </section>;
}
