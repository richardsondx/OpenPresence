"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, CircleSlash2, Pencil, Plus, Users, X } from "lucide-react";
import { isCognitionEligibleMirrorObject } from "@/lib/social-context";
import { peopleForPresence, resolveCanonicalPerson } from "@/lib/network-memory";
import { readPeopleNote } from "@/lib/people-notes";
import { autobiographicalEventsForPerson } from "@/lib/autobiographical-memory";
import type { ChannelDefinition, ChannelId, OpenPresenceState, Presence, RelationshipInsight, RelationshipStudyMode, Watch } from "@/lib/types";

type Mutate = (operation: unknown, requestContext?: OpenPresenceState) => Promise<OpenPresenceState | null>;
type RelationshipPolicy = { learning: "off" | "selective"; engagement: "observe_only" | "when_worthwhile" | "maintain_relationship"; rhythm?: "light" | "regular" };
type RelationshipPlan = { goal: string; learning: string; action: string };
type ButtonComponent = (props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "danger-solid" }) => ReactNode;
type SectionEyebrowComponent = (props: { children: ReactNode }) => ReactNode;
type PageHeaderComponent = (props: { eyebrow: ReactNode; title: ReactNode; titleAdornment?: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string; actionsClassName?: string }) => ReactNode;
type ChannelAvatarComponent = (props: { avatarUrl?: string; name: string; className: string }) => ReactNode;
type PeopleViewProps = {
  state: OpenPresenceState;
  mutate: Mutate;
  Button: ButtonComponent;
  SectionEyebrow: SectionEyebrowComponent;
  PageHeader: PageHeaderComponent;
  ChannelAvatar: ChannelAvatarComponent;
  channelLabel: (channel: ChannelId, definitions?: ChannelDefinition[]) => string;
  formatTime: (value: string) => string;
  formatDateTime: (value: string) => string;
  watchRelationshipPolicy: (watch: Watch, state: OpenPresenceState) => RelationshipPolicy | undefined;
  watchPolicyFromPurpose: (purpose?: string) => RelationshipPolicy | undefined;
  watchPlanSummary: (watch: Watch, presence: Presence, policy?: RelationshipPolicy) => RelationshipPlan;
  initialFilterMode?: "all" | "following" | "watched" | "boundaries";
};

const PERSON_FACT_PAGE_SIZE = 8;
const REQUEST_TYPE_OPTIONS = [
  { id: "answer", label: "Answers" },
  { id: "research", label: "Research" },
  { id: "recommendation", label: "Recommendations" },
  { id: "introduction", label: "Introductions" },
] as const;

export function PeopleView({ state, mutate, Button, SectionEyebrow, PageHeader, ChannelAvatar, channelLabel, formatTime, formatDateTime, watchRelationshipPolicy, watchPolicyFromPurpose, watchPlanSummary, initialFilterMode }: PeopleViewProps) {
  const presence = state.presence ?? state.presences[0];
  const agentName = state.agent?.name ?? "the Agent";
  const [query, setQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "following" | "watched" | "boundaries">(initialFilterMode ?? "all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [remembering, setRemembering] = useState(false);
  const [rememberName, setRememberName] = useState("");
  const [rememberHandle, setRememberHandle] = useState("");
  const [rememberExternalId, setRememberExternalId] = useState("");
  const [correction, setCorrection] = useState("");
  const [delegationBusy, setDelegationBusy] = useState(false);
  const [factPage, setFactPage] = useState(1);
  const [studyMode, setStudyMode] = useState<RelationshipStudyMode>("recent_history");
  const [studyOpen, setStudyOpen] = useState(false);
  const [studyBusy, setStudyBusy] = useState(false);
  const [studyError, setStudyError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  if (!presence) return null;

  const visiblePeople = peopleForPresence(state, presence).filter((person) => {
    if (presence.environment !== "sandbox" && presence.channel === "x") {
      const identity = state.personIdentities.find((item) => item.personId === person.id && item.sourcePresenceId === presence.id && (item.sourceEnvironment ?? "live") === "live");
      const hasRealXId = Boolean(identity && /^\d+$/.test(identity.externalActorId));
      const hasXAvatar = Boolean(identity?.avatarUrl);
      const hasObservedXAuthor = Boolean(identity && state.mirrorObjects.some((object) => object.presenceId === presence.id && (object.environment ?? "live") === "live" && object.author?.externalRef?.id === identity.externalActorId));
      if (!hasRealXId && !hasXAvatar && !hasObservedXAuthor) return false;
    }
    return true;
  });
  const isPersonFollowed = (personId: string) => {
    const identity = state.personIdentities.find((item) => item.personId === personId && item.sourcePresenceId === presence.id && (item.sourceEnvironment ?? "live") === (presence.environment ?? "live"));
    if (!identity) return false;
    if (identity.contactability?.status === "blocked_by_person") return false;
    const hasFollowExecution = state.executions.some((e) => e.presenceId === presence.id && e.affordance === "x.follow" && e.target?.id === identity.externalActorId && e.status === "succeeded");
    const hasFollowOutcome = state.outcomes.some((o) => o.presenceId === presence.id && o.status === "succeeded" && state.socialIntents.some((i) => i.id === o.socialIntentId && i.affordance === "x.follow" && i.target?.id === identity.externalActorId));
    return Boolean(hasFollowExecution || hasFollowOutcome);
  };
  const isPersonWatched = (personId: string) => {
    const identity = state.personIdentities.find((item) => item.personId === personId && item.sourcePresenceId === presence.id && (item.sourceEnvironment ?? "live") === (presence.environment ?? "live"));
    return state.watches.some((w) => w.presenceId === presence.id && (Boolean(identity?.handle && w.query.includes(identity.handle)) || Boolean(identity?.externalActorId && w.query.includes(identity.externalActorId))));
  };

  const people = visiblePeople
    .filter((person) => filterMode === "all"
      ? true
      : filterMode === "following"
        ? isPersonFollowed(person.id)
        : filterMode === "watched"
          ? isPersonWatched(person.id)
          : state.personIdentities.some((identity) => identity.personId === person.id && identity.sourcePresenceId === presence.id && identity.contactability?.status === "blocked_by_person"))
    .filter((person) => {
      if (!query.trim()) return true;
      const display = resolveCanonicalPerson(state, person.id, presence.id);
      return `${display.displayName} ${display.rawHandle ?? ""} ${display.handleLabel}`.toLowerCase().includes(query.trim().toLowerCase());
    });
  // Keep People focused on the relationship cards. Details are an intentional
  // second step rather than opening the first record as a default inspector.
  const selected = selectedId ? people.find((person) => person.id === selectedId) : undefined;
  const selectedNote = selected ? readPeopleNote(state, presence.id, selected.id) : undefined;
  const selectedIdentity = selected ? state.personIdentities.find((identity) => identity.personId === selected.id && identity.sourcePresenceId === presence.id && (identity.sourceEnvironment ?? "live") === (presence.environment ?? "live")) : undefined;
  const selectedIsBlocked = selectedIdentity?.contactability?.status === "blocked_by_person";
  const selectedIsFollowed = selected ? isPersonFollowed(selected.id) : false;
  const selectedIsWatched = selected ? isPersonWatched(selected.id) : false;
  const selectedWatch = selected ? state.watches.find((watch) => watch.presenceId === presence.id && watch.target?.personId === selected.id) : undefined;
  const selectedDisplayInfo = selected ? resolveCanonicalPerson(state, selected.id, presence.id) : { displayName: "Unknown account", handleLabel: "Profile details pending", rawHandle: undefined, avatarUrl: undefined, hydrationState: "unhydrated" as const, isPlaceholder: true };
  const selectedDelegationGrant = selected ? state.delegationGrants.find((item) => item.presenceId === presence.id && item.personId === selected.id && item.enabled && !item.revokedAt) : undefined;
  const selectedStudies = selected ? (state.relationshipStudies ?? []).filter((item) => item.presenceId === presence.id && item.personId === selected.id).sort((left, right) => right.createdAt.localeCompare(left.createdAt)) : [];
  const latestStudy = selectedStudies.find((item) => item.status === "completed");
  const latestInsights = latestStudy?.insightSetId ? (state.relationshipInsightSets ?? []).find((item) => item.id === latestStudy.insightSetId) : undefined;
  const studyEvidenceIds = selectedIdentity ? state.mirrorObjects.filter((item) => item.presenceId === presence.id && (item.environment ?? "live") === (presence.environment ?? "live") && item.author?.externalRef?.id === selectedIdentity.externalActorId && !item.archived && Boolean(item.content?.text?.trim())).map((item) => item.id) : [];
  const studyEvidenceCount = studyEvidenceIds.length;
  const latestStudyCoverage = latestStudy ? new Set([...(latestStudy.evidenceRefs.filter((ref) => ref.kind === "mirror_object").map((ref) => ref.id)), ...(latestStudy.refresh ? (selectedStudies.find((item) => item.id !== latestStudy.id && item.status === "completed")?.evidenceRefs.filter((ref) => ref.kind === "mirror_object").map((ref) => ref.id) ?? []) : [])]) : new Set<string>();
  const newStudyEvidenceCount = latestStudy ? studyEvidenceIds.filter((id) => !latestStudyCoverage.has(id)).length : studyEvidenceCount;

  const relationship = selected ? state.relationships.find((item) => item.personId === selected.id) : undefined;
  const selectedRelationshipPolicy = selectedWatch ? watchRelationshipPolicy(selectedWatch, state) ?? watchPolicyFromPurpose(selectedWatch.purpose) : undefined;
  const selectedRelationshipPlan = selectedWatch ? watchPlanSummary(selectedWatch, presence, selectedRelationshipPolicy) : undefined;
  const facts = relationship ? state.relationshipFacts.filter((fact) => fact.relationshipId === relationship.id && !fact.validTo && !state.relationshipFacts.some((newer) => newer.supersedesFactId === fact.id)) : [];
  const factPageCount = Math.max(1, Math.ceil(facts.length / PERSON_FACT_PAGE_SIZE));
  const visibleFactPage = Math.min(factPage, factPageCount);
  const visibleFacts = facts.slice(
    (visibleFactPage - 1) * PERSON_FACT_PAGE_SIZE,
    visibleFactPage * PERSON_FACT_PAGE_SIZE,
  );
  const loops = relationship ? state.relationshipOpenLoops.filter((loop) => loop.relationshipId === relationship.id && loop.status === "open") : [];
  const recentHistory = selectedIdentity ? state.mirrorObjects.filter((item) => item.presenceId === presence.id && (item.environment ?? "live") === (presence.environment ?? "live") && item.author?.externalRef?.id === selectedIdentity.externalActorId && isCognitionEligibleMirrorObject(item, presence.language)).sort((left, right) => (right.occurredAt ?? right.observedAt).localeCompare(left.occurredAt ?? left.observedAt)).slice(0, 8) : [];
  const selectedAutobiographicalEvents = selected ? autobiographicalEventsForPerson(state, presence.id, selected.id) : [];

  // Find contemporaneous follow decision reason if available
  const followDecision = selectedIdentity ? state.socialDecisions.find((d) => d.presenceId === presence.id && d.acts?.some((a) => a.decision === "follow") && (d.focalMirrorObjectIds.some((mId) => state.mirrorObjects.find((m) => m.id === mId)?.author?.externalRef?.id === selectedIdentity.externalActorId))) : undefined;
  const followDecisionSummary = followDecision?.acts?.find((a) => a.decision === "follow")?.rationale || followDecision?.summary;

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
  const toggleSelectedDelegation = async () => {
    if (!selected || !selectedIdentity || delegationBusy) return;
    setDelegationBusy(true);
    try {
      if (selectedDelegationGrant) await mutate({ type: "revokeDelegationGrant", id: selectedDelegationGrant.id });
      else await mutate({ type: "createDelegationGrant", presenceId: presence.id, personId: selected.id, externalActorId: selectedIdentity.externalActorId, channel: presence.channel, allowedRequestTypes: REQUEST_TYPE_OPTIONS.map((item) => item.id), acceptance: "operator_review", impactLimit: "low" });
    } finally {
      setDelegationBusy(false);
    }
  };
  const openStudy = (mode: RelationshipStudyMode = latestStudy ? "existing_evidence" : "recent_history") => {
    setStudyMode(mode);
    setStudyError(null);
    setStudyOpen(true);
  };
  const runStudy = async () => {
    if (!selected || studyBusy) return;
    setStudyBusy(true);
    setStudyError(null);
    try {
      await mutate({ type: "studyRelationship", presenceId: presence.id, personId: selected.id, mode: studyMode, refresh: studyMode === "existing_evidence" && Boolean(latestStudy) });
      setStudyOpen(false);
    } catch (error) {
      setStudyError(error instanceof Error ? error.message : "The relationship study could not be completed.");
    } finally {
      setStudyBusy(false);
    }
  };
  const savePeopleNote = async () => {
    if (!selected || noteBusy) return;
    setNoteBusy(true);
    try { await mutate({ type: "updatePeopleNote", presenceId: presence.id, personId: selected.id, markdown: noteDraft, source: "operator", reason: "Edited in People inspector" }); }
    finally { setNoteBusy(false); }
  };
  const insightEvidence = (insight: RelationshipInsight) => insight.evidenceRefs.map((ref) => {
    const mirror = ref.kind === "mirror_object" ? state.mirrorObjects.find((item) => item.id === ref.id) : undefined;
    return <details className="relationship-insight-evidence" key={`${insight.id}:${ref.id}`}><summary>Why does {agentName} think this?</summary><p>{mirror?.content?.text ?? "This evidence is recorded in the relationship study receipt."}</p><small>{mirror ? formatTime(mirror.occurredAt ?? mirror.observedAt) : ref.kind.replaceAll("_", " ")}</small></details>;
  });

  return <div className="people-page">
    <PageHeader
      className="people-header"
      eyebrow="Presence relationships"
      title="People"
      description={<>Who {presence.name} remembers and follows. Seeing someone in the world does not automatically create a relationship.</>}
      actionsClassName="heading-actions"
      actions={<Button variant="primary" onClick={() => setRemembering((value) => !value)}><Plus size={14} /> Remember a person</Button>}
    />
    {remembering && <section className="people-composer" aria-label="Remember a person">
      <div><SectionEyebrow>Explicit memory</SectionEyebrow><h2>Who should {presence.name} remember?</h2><p>This creates identity context without inventing prior interaction history.</p></div>
      <div className="people-form-grid"><label>Name<input aria-label="Person name" value={rememberName} onChange={(event) => setRememberName(event.target.value)} placeholder="Maya Chen" /></label><label>Handle <span className="optional-label">Optional</span><input aria-label="Person handle" value={rememberHandle} onChange={(event) => setRememberHandle(event.target.value)} placeholder="@maya" /></label><label>Channel actor ID<input aria-label="Channel actor ID" value={rememberExternalId} onChange={(event) => setRememberExternalId(event.target.value)} placeholder="maya" /></label></div>
      <div className="people-form-actions"><Button variant="ghost" onClick={() => setRemembering(false)}>Cancel</Button><Button variant="primary" disabled={!rememberName.trim() || !rememberExternalId.trim()} onClick={() => void remember()}>Remember</Button></div>
    </section>}
    <div className="people-toolbar" style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: "4px" }}>
        <button type="button" className={`button button-small ${filterMode === "all" ? "button-secondary" : "button-ghost"}`} onClick={() => setFilterMode("all")}>All Remembered</button>
        <button type="button" className={`button button-small ${filterMode === "following" ? "button-secondary" : "button-ghost"}`} onClick={() => setFilterMode("following")}>Following · Verified</button>
        <button type="button" className={`button button-small ${filterMode === "watched" ? "button-secondary" : "button-ghost"}`} onClick={() => setFilterMode("watched")}>Watched</button>
        <button type="button" className={`button button-small ${filterMode === "boundaries" ? "button-secondary" : "button-ghost"}`} onClick={() => setFilterMode("boundaries")}>Boundaries</button>
      </div>
      <label className="people-search" style={{ flex: 1 }}><span>Search people</span><input aria-label="Search people" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or handle" /></label>
      <span className="people-count">{people.length} {filterMode === "following" ? "following" : filterMode === "watched" ? "watched" : filterMode === "boundaries" ? "boundaries" : "remembered"}</span>
    </div>
    {!people.length ? <section className="people-empty"><div className="watch-empty-mark"><Users size={23} /></div><SectionEyebrow>People</SectionEyebrow><h2>{filterMode === "following" ? "Not following anyone yet." : filterMode === "boundaries" ? "No relationship boundaries recorded." : "No one remembered yet."}</h2><p>People appear as meaningful relationships develop and {agentName} chooses to maintain ongoing awareness.</p></section> : <div className={`people-layout ${selected ? "has-selection" : ""}`}><section className="people-list" aria-label="Remembered people">{people.map((person) => {
      const identity = state.personIdentities.find((item) => item.personId === person.id && item.sourcePresenceId === presence.id && (item.sourceEnvironment ?? "live") === (presence.environment ?? "live"));
      const rel = state.relationships.find((item) => item.personId === person.id);
      const followed = isPersonFollowed(person.id);
      const blocked = identity?.contactability?.status === "blocked_by_person";
      const displayInfo = resolveCanonicalPerson(state, person.id, presence.id);
      const avatarUrl = displayInfo.avatarUrl ?? identity?.avatarUrl ?? state.mirrorObjects.find((item) => item.presenceId === presence.id && (item.environment ?? "live") === (presence.environment ?? "live") && item.author?.externalRef?.id === identity?.externalActorId)?.author?.avatarUrl;

      return <button type="button" className={`people-row ${blocked ? "people-row-blocked" : ""} ${selected?.id === person.id ? "active" : ""}`} key={person.id} onClick={() => { const closing = selected?.id === person.id; setSelectedId(closing ? null : person.id); setNoteDraft(closing ? "" : readPeopleNote(state, presence.id, person.id)?.markdown ?? ""); setFactPage(1); }}>
        <ChannelAvatar className="people-avatar" avatarUrl={avatarUrl} name={displayInfo.displayName} />
        <span className="people-row-copy">
          <strong>{displayInfo.displayName}</strong>
          <small>
            {displayInfo.handleLabel}
            {" · "}
            {rel?.lastMeaningfulInteractionAt ? `Last interacted ${formatTime(rel.lastMeaningfulInteractionAt)}` : "Remembered explicitly"}
            {blocked ? " · Blocked this Presence" : followed ? " · Following · Verified" : ""}
          </small>
          <span>{blocked ? "Automatic follow and interaction attempts are suppressed." : followed ? "Following to stay aware of their contributions." : rel?.lastMeaningfulInteractionAt ? "Relationship context available." : "Remembered explicitly."}</span>
        </span>
        <span className="people-row-trailing">
          {blocked && <span className="people-boundary-badge" aria-label="No contact: this person blocked this Presence"><CircleSlash2 size={11} /> No contact</span>}
          <ChevronRight size={16} />
        </span>
      </button>;
    })}</section>
    {selected && <section className="person-inspector" aria-label={`${selectedDisplayInfo.displayName} relationship`}>
      <div className="person-inspector-heading">
        <div>
          <SectionEyebrow>Person</SectionEyebrow>
          <h2>{selectedDisplayInfo.displayName}</h2>
          <p>
            {selectedDisplayInfo.handleLabel}
            {" · "}
            {channelLabel(presence.channel, state.channelDefinitions)}
          </p>
        </div>
        <div className="person-inspector-heading-actions">
          <span className={`people-status ${selectedIsBlocked ? "people-status-blocked" : ""}`} style={{ background: selectedIsFollowed ? "var(--accent-subtle, #fef3eb)" : undefined, color: selectedIsFollowed ? "var(--accent, #d68754)" : undefined, fontWeight: selectedIsFollowed ? 600 : undefined }}>
            {selectedIsBlocked ? "Blocked this Presence" : selectedIsFollowed ? "Following · Verified" : selectedIsWatched ? "Watched" : relationship?.lastMeaningfulInteractionAt ? "Remembered relationship" : "Remembered identity"}
          </span>
          <button type="button" className="person-inspector-close" aria-label={`Close ${selectedDisplayInfo.displayName} details`} onClick={() => { setSelectedId(null); setNoteDraft(""); }}><X size={14} /> Close</button>
        </div>
      </div>

      <details className="person-reason">
        <summary><span>Why this person is remembered</span><ChevronRight size={14} /></summary>
        <p>
          {selectedIsBlocked
            ? `X reported that this person blocked ${presence.name}. That verified boundary is remembered without inferring why.`
            : selectedIsFollowed
            ? `${presence.name} chose to follow this person to stay aware of their contributions.`
            : relationship?.lastMeaningfulInteractionAt
              ? `${presence.name} interacted with this person on ${channelLabel(presence.channel, state.channelDefinitions)}. Prior evidence remains linked below.`
              : "The operator explicitly asked the Agent to remember this person. No prior interaction is being implied."}
        </p>
      </details>

      <div className="person-inspector-section">
        <SectionEyebrow>Current relationship</SectionEyebrow>
        <div style={{ display: "grid", gap: "6px", fontSize: "13px", marginTop: "6px" }}>
          <div><strong>Status:</strong> {selectedIsBlocked ? "Blocked this Presence on X" : selectedIsFollowed ? "Following · Verified on X" : "Not followed"}</div>
          {selectedIsBlocked && <div className="people-contactability-note"><strong>Automation:</strong> No reply, like, repost, quote, or follow candidates will be created for this person. An explicit operator-requested action can check again; a verified success updates this status.</div>}
          {selectedIsBlocked && selectedIdentity?.contactability?.observedAt && <div><strong>Observed:</strong> {formatTime(selectedIdentity.contactability.observedAt)}</div>}
          {selectedIsWatched && <div><strong>Watch:</strong> Active watchlist target</div>}
          <div><strong>Interactions:</strong> {recentHistory.length} recorded interaction{recentHistory.length === 1 ? "" : "s"}</div>
          {relationship?.lastMeaningfulInteractionAt && <div><strong>Last interaction:</strong> {formatTime(relationship.lastMeaningfulInteractionAt)}</div>}
          {followDecisionSummary && <details className="person-reason person-follow-reason">
            <summary><span>Why {presence.name} followed</span><ChevronRight size={14} /></summary>
            <p>{followDecisionSummary}</p>
          </details>}
        </div>
      </div>

      {selectedAutobiographicalEvents.length > 0 && <div className="person-inspector-section relationship-biography" aria-label="Relationship history">
        <SectionEyebrow>Relationship history</SectionEyebrow>
        <div className="relationship-biography-list">{selectedAutobiographicalEvents.map((event) => {
          const boundary = event.facts.boundary;
          const blocked = event.kind === "relationship_boundary" && boundary === "blocked";
          const available = event.kind === "relationship_boundary" && boundary === "available";
          return <article key={event.id}>
            <span className={`relationship-biography-mark ${blocked ? "blocked" : available ? "available" : ""}`} aria-hidden="true" />
            <div><small>{formatDateTime(event.occurredAt)}</small><strong>{blocked ? "Relationship boundary established" : available ? "Contactability verified again" : event.kind.replaceAll("_", " ")}</strong><p>{blocked ? `X verified that this person blocked ${presence.name}. Interaction stopped; no reason was inferred.` : available ? "A later channel action succeeded. The prior boundary remains part of the relationship history, but interaction is no longer technically blocked." : "A verified event in this relationship was added to this Presence's history."}</p></div>
          </article>;
        })}</div>
      </div>}

      {selectedRelationshipPlan && !selectedIsBlocked && <div className="person-inspector-section person-plan-section">
        <SectionEyebrow>How {presence.name} will approach this relationship</SectionEyebrow>
        <p>{selectedRelationshipPlan.goal}</p>
        <div className="person-plan-facts"><span><strong>Learning</strong>{selectedRelationshipPlan.learning}</span><span><strong>Action threshold</strong>{selectedRelationshipPlan.action}</span></div>
        <small className="person-plan-boundary">This is a flexible approach, not a scheduled obligation or a reply quota. {presence.name} can stay quiet when there is no worthwhile opening.</small>
      </div>}

      <div className="person-inspector-section relationship-study-section">
        <div className="relationship-study-heading"><div><SectionEyebrow>Relationship understanding</SectionEyebrow><h3>{latestStudy ? `Last studied ${formatTime(latestStudy.completedAt ?? latestStudy.createdAt)}` : `${agentName} hasn't studied ${selectedDisplayInfo.displayName} yet`}</h3></div><span className="relationship-study-status">{latestInsights ? "Evidence-backed" : "Basic context"}</span></div>
        <p>{latestStudy ? `${latestStudy.evidenceRefs.length} evidence item${latestStudy.evidenceRefs.length === 1 ? "" : "s"} reviewed${newStudyEvidenceCount ? ` · ${newStudyEvidenceCount} new since then` : ""}.` : "Watching collects evidence cheaply. Learn this person is an explicit research action and does not happen automatically."}</p>
        {latestInsights && <div className="relationship-briefing"><div><strong>Current approach</strong><p>{selectedIsBlocked ? "Observe the verified boundary. Do not interact with, target, or research this person for engagement." : latestInsights.currentApproach.statement}</p>{!selectedIsBlocked && insightEvidence(latestInsights.currentApproach)}</div>{[...latestInsights.interests, ...latestInsights.currentFocus, ...latestInsights.publicInteractionPatterns, ...latestInsights.directRelationshipPatterns].slice(0, 6).map((insight) => <div key={insight.id}><strong>{insight.category.replaceAll("_", " ")}</strong><p>{insight.statement}</p><small className="relationship-insight-confidence">{insight.confidence}</small>{insightEvidence(insight)}</div>)}</div>}
        {latestStudy && <small className="relationship-study-receipt">Receipt · {latestStudy.resourceUsage.channelReads} X reads · {latestStudy.resourceUsage.hydrations} hydrations · {latestStudy.resourceUsage.modelCalls} model calls · {latestStudy.resourceUsage.visionCalls} vision calls</small>}
        <div className="relationship-study-actions"><Button variant="secondary" onClick={() => openStudy()} disabled={!selectedIdentity || studyBusy || selectedIsBlocked}>{selectedIsBlocked ? "Paused by boundary" : latestStudy ? "Study again" : "Learn this person"}</Button>{latestStudy && newStudyEvidenceCount > 0 && !selectedIsBlocked && <Button variant="ghost" onClick={() => openStudy("existing_evidence")} disabled={studyBusy}>Refresh new evidence</Button>}</div>
      </div>

      <div className="person-inspector-section">
        <SectionEyebrow>What {presence.name} remembers</SectionEyebrow>
        {facts.length ? <><div className="person-facts-summary"><span>{facts.length} remembered fact{facts.length === 1 ? "" : "s"}</span><span>Showing {(visibleFactPage - 1) * PERSON_FACT_PAGE_SIZE + 1}–{Math.min(visibleFactPage * PERSON_FACT_PAGE_SIZE, facts.length)}</span></div><ul>{visibleFacts.map((fact) => <li key={fact.id}><span>{fact.statement}</span><small>{fact.epistemicKind.replaceAll("_", " ")} · {fact.provenanceRefs.map((ref) => ref.kind).join(", ")}</small></li>)}</ul>{factPageCount > 1 && <nav className="person-facts-pagination" aria-label={`${selected.displayName} remembered facts pages`}><button type="button" onClick={() => setFactPage((current) => Math.max(1, current - 1))} disabled={visibleFactPage <= 1}><ChevronLeft size={13} /> Newer</button><span aria-live="polite">Page {visibleFactPage} of {factPageCount}</span><button type="button" onClick={() => setFactPage((current) => Math.min(factPageCount, current + 1))} disabled={visibleFactPage >= factPageCount}>Older <ChevronRight size={13} /></button></nav>}</> : <p>No curated facts yet.</p>}
      </div>
      <div className="person-inspector-section" aria-label="Presence People Note">
        <SectionEyebrow>Presence note</SectionEyebrow>
        <p>Private Markdown context for {presence.name} and this person. It stays scoped to this Presence and is only supplied when judging their request.</p>
        <textarea aria-label={`Presence note for ${selectedDisplayInfo.displayName}`} value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} rows={5} placeholder="A small note that may help this Presence understand future requests…" />
        <Button variant="secondary" disabled={noteBusy} onClick={() => void savePeopleNote()}>{noteBusy ? "Saving…" : "Save Presence note"}</Button>
        {selectedNote && <small>Revision {selectedNote.revision} · updated {formatTime(selectedNote.updatedAt)}</small>}
      </div>
      <div className="person-inspector-section"><SectionEyebrow>Open threads</SectionEyebrow>{loops.length ? <ul>{loops.map((loop) => <li key={loop.id}>{loop.description}</li>)}</ul> : <p>No open loops.</p>}</div>
      <div className="person-inspector-section"><SectionEyebrow>Recent interactions</SectionEyebrow>{recentHistory.length ? <div className="person-history">{recentHistory.map((item) => <article key={item.id}><small>{formatTime(item.occurredAt ?? item.observedAt)}</small><p>{item.content?.text ?? "[no text]"}</p></article>)}</div> : <p>No Mirror-backed interactions yet.</p>}</div>
      <div className="person-inspector-section person-request-access-section"><SectionEyebrow>Public request access</SectionEyebrow><p>{selectedDelegationGrant ? "This person has an explicit delegation grant for the allowed request types." : "Watching and remembering this person does not allow them to ask the Presence to do work."}</p><Button variant="secondary" onClick={() => void toggleSelectedDelegation()} disabled={!selectedIdentity || delegationBusy}>{selectedDelegationGrant ? "Revoke request access" : "Allow this person to submit requests"}</Button><small>The grant is only considered when the Presence policy is set to People I allow. Requests still enter operator review.</small></div>
      <div className="person-inspector-actions"><Button variant="ghost" onClick={() => void mutate({ type: "forgetRelationship", relationshipId: relationship?.id })} disabled={!relationship}>Forget relationship</Button><Button variant="ghost" disabled={selectedIsBlocked} onClick={() => void mutate({ type: "createWatch", presenceId: presence.id, query: selectedIdentity?.handle ?? selected.displayName, purpose: "Keep this person in attention without treating Watching as relationship memory." })}>{selectedIsBlocked ? "Watch paused by boundary" : "Watch"}</Button></div>
      {relationship && <div className="person-correction"><label>Correct memory<textarea aria-label="Correct relationship memory" value={correction} onChange={(event) => setCorrection(event.target.value)} placeholder="What should the Agent remember instead?" rows={3} /></label><Button variant="secondary" disabled={!correction.trim()} onClick={() => void correct()}><Pencil size={14} /> Save correction</Button></div>}
    </section>}</div>}
    {studyOpen && selected && <div className="modal-backdrop relationship-study-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !studyBusy) setStudyOpen(false); }}><section className="relationship-study-modal" role="dialog" aria-modal="true" aria-labelledby="relationship-study-title"><div className="dialog-header"><div><SectionEyebrow>Explicit relationship research</SectionEyebrow><h2 id="relationship-study-title">Learn {selectedDisplayInfo.displayName}</h2></div><button type="button" className="icon-button" aria-label="Close relationship study" onClick={() => { if (!studyBusy) setStudyOpen(false); }}><X size={17} /></button></div><p>{agentName} will study public evidence to understand interests, observed conversation patterns, and what has worked between you. This is separate from Watching and never creates a public action.</p><div className="relationship-study-available"><span>Already available</span><strong>{studyEvidenceCount} evidence item{studyEvidenceCount === 1 ? "" : "s"}</strong><small>{selectedIdentity ? "From the Social Mirror and prior relationship history." : "A channel identity is required before research can run."}</small></div><div className="relationship-study-options" role="group" aria-label="Study depth">{([ ["existing_evidence", "Quick", "Use what OpenPresence already knows.", "Low usage"], ["recent_history", "Standard · Recommended", "Review recent public activity and selected evidence.", "Up to 30 posts · moderate usage"], ["deep_history", "Deep", "Review a broader recent window for stronger pattern confidence.", "Up to 100 posts · higher usage"] ] as Array<[RelationshipStudyMode, string, string, string]>).map(([mode, label, description, estimate]) => <button type="button" key={mode} className={studyMode === mode ? "selected" : ""} aria-pressed={studyMode === mode} onClick={() => setStudyMode(mode)}><strong>{label}</strong><span>{description}</span><small>{mode === "existing_evidence" ? `${estimate} · ${studyEvidenceCount} existing items` : estimate}</small></button>)}</div>{studyError && <div className="relationship-study-error" role="alert">{studyError}</div>}<div className="dialog-actions"><Button variant="ghost" onClick={() => setStudyOpen(false)} disabled={studyBusy}>Cancel</Button><Button variant="primary" onClick={() => void runStudy()} disabled={studyBusy || !selectedIdentity}>{studyBusy ? "Studying…" : latestStudy && studyMode === "existing_evidence" ? "Refresh insights" : "Start study"}</Button></div></section></div>}
  </div>;
}
