# Regression rules

## Rule: Repeated finding actions must share a stable action column

**Defect class:** Inconsistent row alignment / cramped responsive action control

**General principle:** Repeated social findings should spend available horizontal space on readable evidence while keeping the operator action visually predictable. Action controls align to a stable column on desktop and become full-width below the evidence on narrow screens.

**Project enforcement:** `.exploration-finding` uses a content/action grid with a 200px desktop action column and a single-column mobile layout; the response button fills its assigned column.

**Executable protection:** Chrome QA measures all rendered finding buttons for the same desktop width/right edge, verifies full-width mobile buttons, and asserts no horizontal overflow.

**Apply when:** Changing Exploration finding cards, operator-directed response actions, repeated evidence lists, or responsive Watching layouts.

**Added:** 2026-08-16

## Rule: X Exploration success must prove query-backed discovery

**Defect class:** False discovery coverage / missing search provenance

**General principle:** A search strategy or connected badge is not evidence that a provider search ran. A successful Exploration must retain the compiled query, actual discovery source, considered-result count, triage count, and outcome; a degraded or Mirror-only run must say that no new external results were imported.

**Project enforcement:** Native Exploration sessions persist `searchQuery`, `discoverySource`, `artifactIds`, counts, status, and failure reason. The Watching run monitor exposes the query and pipeline only after the provider-backed run returns, while degraded runs retain their failure and distinguish existing Social Mirror evidence from new X results.

**Executable protection:** `tests/explorations.test.ts` covers the Exploration lifecycle and native assignment boundary; focused Chrome QA verifies the Watching success state, visible query, `X public search` source, `25 considered · 25 triaged · 5 worthwhile` pipeline, and zero browser errors.

**Apply when:** Changing Exploration planning, X public search, Mirror fallback, session persistence, run monitor copy, or provider error handling.

**Added:** 2026-08-16

## Rule: Feed scope must not narrow the Presence picker

**Defect class:** Cross-channel navigation scope regression

**General principle:** A Feed filter may narrow the records shown for the selected Presence, but it must not change the operator's ability to discover or select other Presences. Navigation scope and content scope are separate concerns.

**Project enforcement:** `PublicHistoryView` applies `publicHistoryMatchesPresence` to Feed records, while the Presence switcher renders the complete `state.presences` collection. `stateForContext` changes the active Presence without removing sibling Presences from the materialized Agent workspace.

**Executable protection:** `tests/runtime.test.ts` verifies cross-channel Presence retention through `stateForContext`; `tests/e2e/sidebar-hierarchy.spec.ts` verifies the picker shows both X and LinkedIn Presences after selecting the LinkedIn Presence.

**Apply when:** Changing Feed/history filters, Presence selection, Agent workspace materialization, sidebar/mobile navigation, or channel-scoped UI surfaces.

**Added:** 2026-08-16

## Rule: Conversation completion must be evidence-backed and marginal-value aware

**Defect class:** Reciprocal loop / false closure / runtime-context leakage

**General principle:** A received social object is not a reply obligation. Conversation interpretation must remain separate from Mirror evidence, Social Intent, Execution, Delivery, Outcome, and Assignment progress. Silence or reaction may complete an episode, but a requested closing reply is not closed until the public act is verified. Runtime envelopes, planner metadata, operator instructions, and untrusted social text must never become public expression.

**Project enforcement:** `ConversationEpisode` groups Presence-scoped branches from observed Mirror relationships and tracks `active`, `cooling`, `closing`, and `closed` separately from planner disposition. Deterministic pacing only gates rapid reciprocal volume; the Agent decides marginal social value. Cooling suppresses generic acknowledgments and permits substantive reopening. `CLOSE_WITH_REPLY` and `REACT_ONLY` remain closing until verified delivery, while failed delivery enters cooling. Social cognition receives public Mirror evidence through a privacy filter, and final candidate checks flag runtime-context markers for review. Activity exposes the episode state and an operator override that bypasses closure/cooldown without bypassing privacy, policy, or execution boundaries.

**Executable protection:** `tests/conversation-episodes.test.ts` covers branch grouping, closure verification, generic-ack suppression, substantive reopening, loop-risk gating, and disposition mapping. `tests/conversation-boundary.test.ts` covers disposition parsing and runtime-marker detection. Native X tests preserve bounded thread evidence and sandbox tests preserve execution lineage. Feature QA must verify Activity status and the Playground → Mirror → episode path without requiring a live connector.

**Apply when:** Changing social cognition, Mirror filtering, thread/episode grouping, pacing or reopen behavior, closure semantics, operator-directed replies, public-copy sanitization, or Assignment engagement accounting.

**Added:** 2026-08-15

## Rule: Live publication must cross a sealed Public Expression boundary

**Defect class:** Unauthorized live write / provenance bypass / mock-runtime side effect

**General principle:** Cognition may form a candidate, but only a sealed Public Expression with a short-lived, scoped execution permit may reach a native or Bridge writer. Test and mock runtimes must not retrieve live write credentials or contact an external writer.

**Project enforcement:** Native delivery seals and verifies the expression before invoking X; Bridge claim/acknowledgement requires the same permit; direct native completion is blocked without it; test/mock runtimes fail closed before credential retrieval or external write.

**Executable protection:** `tests/publication-security.test.ts` covers candidate sealing, payload mutation, expiry, replay, and runtime blocking. Native X tests assert cognition still records a blocked execution without calling the writer, while runtime Bridge tests preserve Sandbox outbox behavior and block live writes.

**Apply when:** Changing Public Expression formation, Execution completion, native X delivery, Bridge claim/acknowledgement, test/mock runtimes, credentials, or publication provenance.

**Added:** 2026-08-16

## Rule: Planner-shaped model output must never become public expression

**Defect class:** Internal planner metadata leakage / public-copy boundary failure

**General principle:** Structured disposition, action, reply, and rationale fields are internal planning evidence when they appear in a social-world object or model response. They must remain untrusted input or private decision data and must never be echoed as public prose.

**Project enforcement:** `publicExpressionLeakageReason` detects planner-shaped JSON; parser aliases are action-gated; Sandbox, native X, Bridge, sealing, and final delivery paths reject planner-shaped public text. Playground includes a frozen Security rehearsal with exact untrusted planner-like fixtures and a structural public-expression finding.

**Executable protection:** `tests/ai.test.ts`, `tests/publication-security.test.ts`, `tests/runtime.test.ts`, `tests/x-connection.test.ts`, and `tests/scenarios.test.ts` cover parser, intent, permit, delivery, and rehearsal boundaries.

**Apply when:** Changing social decision parsing, planner prompts, public-copy formation, Sandbox or live delivery, scenario fixtures, or any path that maps structured model output into public text.

**Added:** 2026-08-16

## Rule: A scheduled no-op must preserve its bounded rationale

**Defect class:** Silent judgment / opaque autonomy

**General principle:** Taste and silence are valid, but `NO_OP` without an inspectable reason turns Agent autonomy into an unreviewable black box. A rationale must explain the observable decision boundary without exposing hidden chain-of-thought or inventing certainty.

**Incident:** Live Calendar evaluation returned a bare `NO_OP`, and the runtime replaced it with the same generic “no worthwhile action” sentence for every scheduled intention. The operator could not tell whether the issue was timing, repetition, missing evidence, a sensitive boundary, or a runtime failure.

**Project enforcement:** `evaluateCalendarSlot` requests a structured `post|no_op` decision with a short rationale. `recordStandingIntentNoOp` persists that rationale on the skipped Action and includes it in the Activity event. A bare no-op is labeled as an unavailable explanation; it is never silently converted into a fabricated reason.

**Executable protection:** `tests/x-connection.test.ts` asserts that a Calendar no-op stores its model rationale and creates no execution; `tests/e2e/openpresence.spec.ts` verifies the Schedule → Evaluate → Activity surface exposes `Reason:` when silence is selected.

**Apply when:** Changing Calendar evaluation, standing intentions, no-op semantics, Activity decision traces, model decision schemas, or operator calibration surfaces.

**Added:** 2026-08-15

## Rule: Native X replies must remain replies in the Social Mirror and Feed

**Defect class:** Public provenance misclassification

**General principle:** X uses `x.post` as the external reference for both originals and replies. Reply status must therefore be preserved from the parent reference and successful `x.reply` execution lineage; it cannot be inferred from the external reference type alone.

**Project enforcement:** Native ingestion stores agent-authored replies as `objectType: "reply"`, leaves inbound standalone posts as `objectType: "post"`, and normalizes legacy live X mirrors when their parent and Presence/execution lineage prove they are replies.

**Executable protection:** `tests/x-connection.test.ts` verifies inbound posts remain posts, native replies derive as `reply` history, and legacy post classifications are repaired.

The Publishing Plan also rejects any public-history item with a parent reference from original-progress totals, providing a second guard if an old or external record is still typed incorrectly.

**Apply when:** Changing native X reconciliation, Social Mirror object typing, execution lineage, public-history derivation, or Feed filters/counts.

**Added:** 2026-08-15

## Rule: Internal post IDs must be durable but never become public copy

**Defect class:** Diagnostic marker leakage / opaque provenance UI

**General principle:** Every verified post must retain a stable internal ID for lineage and support work, but QA run markers and raw implementation identifiers must not be placed in Assignment titles, post text, or routine Feed copy. Operators should get provenance through a quiet, intentional affordance.

**Project enforcement:** `MirrorObject.id` is the internal post ID projected as `PublicHistoryItem.id`; user-facing Assignment summaries remove internal `QA-*` identifiers without changing the stored instruction, while the post details inspector offers `Copy ID` for the internal reference and does not print the raw ID in the normal proof label.

**Executable protection:** Runtime tests cover marker-safe Assignment display projection; Playground E2E verifies that a diagnostic marker is absent from the progress surface and Feed, and that post details expose the discreet `Copy internal post ID` action.

**Apply when:** Adding or changing post provenance, Assignment summaries, Feed/Activity copy, Sandbox QA fixtures, diagnostic identifiers, or operator support workflows.

**Added:** 2026-08-15

## Rule: Scheduled Consider intentions must distinguish silence from a missed run

**Defect class:** Schedule expectation mismatch / false scheduler diagnosis

**General principle:** A scheduled standing intent grants the Agent permission to consider an action; it does not require a public post. Runtime diagnosis must distinguish an evaluated `NO_OP` from an unevaluated slot, a blocked execution, and a connector delivery failure.

**Incident:** The Saturday 07:00 Genny intention appeared to produce no post. The Calendar slot had in fact been evaluated and persisted `no_op / skipped`; the operator reasonably interpreted scheduled autonomy as a posting obligation.

**Project enforcement:** `evaluateCalendarSlot` records `Calendar attention started`, marks the slot evaluated, and records `Standing intention held` for silence. Activity and Schedule copy retain the Consider-versus-Assign boundary, while native delivery records execution/outcome separately.

**Executable protection:** `tests/x-connection.test.ts` asserts that an evaluated Calendar intention can form and deliver a native X publication; live QA must also inspect the persisted `lastEvaluatedAt` plus the corresponding Calendar/Standing-intent event before classifying a missing post as a runtime defect.

**Apply when:** Changing Calendar/Standing Intent scheduling, autonomy language, native Pulse wake-up, execution delivery, or Activity diagnosis.

**Added:** 2026-08-15

## Rule: Mirror reconciliation must wake attention for unjudged inbound mentions

**Defect class:** Live observer/pulse boundary loss / reply target drift

**General principle:** In an autonomous social system, observing a new inbound mention is an attention trigger, not merely a storage update. Once cognition chooses to reply, delivery must target the focal object that mentioned the Presence; the parent is context, not the reply target.

**Incident:** Automatic `syncNativeX` persisted the exact X mention and its complete parent chain but stopped after “Social Mirror updated.” No Pulse or cognition followed. Separately, the live reply path used the focal post's parent ID as the delivery target, which could place a response on the wrong post in the thread.

**Project enforcement:** `syncNativeX` detects unjudged inbound native-X Mirror objects, records `New mention received`, and runs the shared native Pulse for live Presences. `runNativePulse` compiles the bounded thread context before cognition and passes the focal object's own external ID to `formXReplyIntent` and native delivery.

**Executable protection:** `tests/x-connection.test.ts` exercises automatic sync with a multi-turn parent chain, asserts the cognition request contains root/parent/focal text and `Thread context (complete)`, verifies the focal mention is judged, and asserts both the Social Intent target and X write target equal the focal post ID.

**Apply when:** Changing X observation scheduling, Social Mirror reconciliation, Pulse wake-up behavior, mention deduplication/judgment, reply targeting, or connector delivery envelopes.

**Added:** 2026-08-15

## Rule: Search evidence must not become a native reply target

**Defect class:** Live observer/reply eligibility confusion

**General principle:** A public object discovered through search or another observation path is not an inbound mention and does not grant permission to reply. Provider-confirmed inbound scope must be preserved through cognition and delivery.

**Incident:** Native Pulse selected an unrelated public post from the Social Mirror, formed a reply, and sent it to X. X rejected the action because the Presence was neither mentioned nor the author.

**Why QA missed it:** The existing native reply test covered a valid mention and the candidate selector treated every external Mirror post as inbound, so it did not exercise mixed Search/Mirror evidence alongside provider-confirmed mentions.

**Project enforcement:** `unjudgedNativeInbound` in `app/api/state/route.ts` may select only external X posts whose IDs are in the Presence's `context.publicFooting.recentInboundIds`; `runNativePulse` keeps the selected Social Intent and Execution linked to the `Pulse completed` event. Search/Exploration imports remain observation evidence and cannot enter native reply cognition.

**Executable protection:** `tests/x-connection.test.ts` covers an unrelated Social Mirror search object with zero eligible inbound candidates and zero executions, while the adjacent mention regression covers valid focal reply targeting.

**Apply when:** Changing X reconciliation, Exploration/search imports, Social Mirror candidate selection, native Pulse cognition, reply eligibility, or Activity lineage.

**Added:** 2026-08-16

## Rule: Social cognition must never receive an opaque parent ID instead of public context

**Defect class:** Connector/Social Mirror context loss / Live-Sandbox cognition divergence

**General principle:** If a social object depends on earlier public context for its meaning, observation must hydrate or truthfully mark that context before cognition. A parent identifier is provenance, not conversation evidence, and must never be treated as a substitute for the referenced object's content.

**Incident:** Sandbox walked the observed reply chain, while the Live X pulse passed the Agent only the new mention and an opaque parent post ID. Live and Sandbox therefore tested different social Agents, and the model could not reliably judge continuity, disagreement, humor, or relationship context.

**Project enforcement:** `lib/thread-context.ts` owns bounded ancestry/reference compilation and hydration traversal; `lib/native-x.ts` uses direct X post lookup eagerly during reconciliation and lazily before pulse cognition; `recordNativeMirror` persists conversation identity, parent/reference relationships, authors, and media as live Mirror evidence; Sandbox and Live use `compileSocialThreadContext` with Presence/session scope isolation. Missing context is exposed as `complete`, `partial`, or `unavailable` evidence.

**Executable protection:** `tests/thread-context.test.ts` covers 8-object bounded ancestry, multi-author ordering, quoted-object separation, cache-safe hydration, partial/unavailable context, and Sandbox session isolation. `tests/x-connection.test.ts` covers X field/expansion parsing, normalized Mirror persistence, and a Live pulse whose model request contains the actual ancestor text.

**Apply when:** Changing connector observation, Social Mirror schemas, thread/reply context, native X reads, Bridge reconciliation, media/reference hydration, or prompts that assemble social-world evidence.

**Added:** 2026-08-15

## Rule: Visual necessity must not be confused with visual fit

**Defect class:** Optional-media semantic failure / misleading Assignment terminal state

**General principle:** A VisualBrief describes what a useful attachment would do; it does not decide whether the story requires one. `helpful`, `important`, and `required` visual needs must produce different fulfillment behavior, and zero discovery must never be described as candidate inspection.

**Project enforcement:** Bounded research derives visual importance, permits one model-guided query reformulation, records distinct discovery/fetch/inspection/editorial outcomes, and lets helpful or important stories survive as text-only when the Agent judges that honest. Required visuals remain blocked without verified evidence. Playground exposes the outcome and zero-candidate explanation in the research trail.

**Executable protection:** `tests/assignment-runtime.test.ts` covers optional fallback, required blocking, one reformulation, empty discovery, inspected rejection, and verified counting.

**Apply when:** Changing Assignment visual requirements, asset discovery, perception/editorial review, research continuation, or Playground outcome copy.

**Added:** 2026-08-15

## Rule: Long-running Assignments need durable run truth and fast reads

**Defect class:** Background Assignment lifecycle / stale progress UI / blocked retry reuse

**General principle:** Provider and model work must not occupy the state mutation request. Operators need a durable run with stage, lease, heartbeat, attempt, and terminal status, while ordinary state reads remain responsive. A retry must create a new bounded run and preserve prior negative evidence instead of repeating the same failed candidates.

**Incident:** Clicking an Assignment could leave the interface waiting on a slow asset/model call, show “Working…” after the bounded effort had already ended, or reuse an exhausted retry budget. The operator could not distinguish queued work, active research, and a terminal refusal.

**Project enforcement:** `workAssignment` queues an `AssignmentRun` and returns immediately. The worker persists `queued`, `researching`, `writing`, and terminal states with lease/heartbeat metadata; visual research retains candidate decisions and known URLs across continuations; retry queues a fresh run; Playground polls active runs and renders a compact live card, a collapsible evidence trail, and terminal `Try again`/blocked or published states.

**Executable protection:** `tests/assignment-runtime.test.ts` covers immediate queueing, provider failure, evidence-backed publication, candidate fallback, bounded exhaustion, fresh retry run IDs, and non-stranding clock sync. Browser QA verifies the main runtime remains readable while the worker runs and that terminal UI does not retain a working indicator.

**Apply when:** Changing Assignment workers, asset/provider calls, Playground progress, retry semantics, workspace revision handling, or background polling.

**Added:** 2026-08-15

## Rule: New Agents must start on the requested OpenAI runtime

**Defect class:** Default model/provider selection / legacy seed migration

**General principle:** A new Agent should begin with the product’s declared default runtime, and an old untouched seed should not silently keep selecting a different provider after the default changes. Explicitly configured model choices remain user-owned.

**Incident:** New Agents opened Brain with Anthropic selected, and Chat reported that Anthropic was selected but not connected even though OpenAI GPT 5.6 Luna was the intended default.

**Project enforcement:** `createAgent` seeds OpenAI `gpt-5.6-luna` with medium reasoning and an OpenAI connection. `normalizeState` migrates only the exact unconfigured legacy Anthropic seed (`claude`/high) and preserves configured Anthropic selections.

**Executable protection:** `tests/runtime.test.ts` asserts the new default and both sides of the narrow legacy migration; `tests/e2e/openpresence.spec.ts` verifies the default Brain selection after Agent creation.

**Apply when:** Changing model/provider defaults, onboarding, Brain runtime selection, provider access, or persisted Agent workspace normalization.

**Added:** 2026-08-14

## Rule: Sandbox Assignment drafts must not publish internal QA markers

**Defect class:** Internal test-context leakage / public-copy hygiene

**General principle:** Assignment instructions belong to the operator and runtime. A Presence may use them to decide what to do, but must not expose internal QA identifiers in a public Sandbox expression.

**Incident:** A diagnostic Assignment explicitly containing `QA-TEN-RUN-2026-08-14` produced historical Sandbox posts carrying that marker, making test output look like repetitive public content and obscuring whether the model or harness was speaking.

**Project enforcement:** Every text candidate passes through `cleanSandboxDraft` before editing, length checks, duplicate checks, and delivery. Internal `QA-*` markers are removed; a marker-only candidate becomes `no_op` instead of an empty publication.

**Executable protection:** `tests/runtime.test.ts` covers marker removal and preserves ordinary QA subject matter; `tests/e2e/playground-rehearsal.spec.ts` verifies the Assignment-to-Feed path never renders the diagnostic marker.

**Apply when:** Changing Assignment prompts, AI candidate editing, Sandbox delivery, Feed projection, or QA instructions that contain internal identifiers.

**Added:** 2026-08-14

## Rule: Sandbox style fixtures classify only public Assignment intent

**Defect class:** Presence-style contamination from private runtime context

**General principle:** A Sandbox fixture must be selected from the Agent/Presence profile and the operator's explicit Assignment, not from private execution-envelope or prompt-scaffolding text. Internal runtime language is not public style evidence.

**Incident:** A Genny-shaped workspace received Alex-style offer/sales candidates because the mock classifier scanned the complete private Assignment prompt. Runtime words such as `execution` could win over the selected Presence's builder territory.

**Project enforcement:** `assignmentMockCandidates` extracts the explicit Assignment instruction before profile matching and uses word-bounded, Presence-aware precedence. The full prompt remains available to cognition, but cannot steer the local style fixture.

**Executable protection:** `tests/ai.test.ts` covers the three configured fixture families and a Genny-shaped profile with private execution prose; the latter must remain builder-specific and must not select an offer candidate.

**Apply when:** Changing Assignment prompt construction, mock AI fixtures, Presence style selection, or private execution context passed to social cognition.

**Added:** 2026-08-14

## Rule: Playground removal must be item-scoped and Sandbox-only

**Defect class:** Playground feed curation / destructive action scope

**General principle:** A rehearsal feed needs a low-friction way to remove one noisy social object without resetting the whole experiment or implying that live channel content was deleted.

**Project enforcement:** Each Sandbox post, reply, and social event exposes an accessible `Remove … from Playground` control. The server accepts only a matching Sandbox session/object pair, removes the selected Mirror object and derived perception records, and leaves the rest of the rehearsal intact.

**Executable protection:** `tests/sandbox.test.ts` verifies one-object removal preserves the remaining object; `tests/e2e/openpresence.spec.ts` verifies removing a reply and then a post in Chromium and Pixel 5, including persistence after reload.

**Apply when:** Changing Playground cards, Social Mirror state, rehearsal reset/curation, or any UI that can remove simulated social-world context.

**Added:** 2026-08-14

## Rule: Presence Chat must answer as the selected public self

**Defect class:** Chat identity boundary / social-context fallback

**General principle:** A simulated feed post is social-world evidence. Chat responses must stay in the selected Presence's public voice and may not fall through to private Agent/Teach language or expose runtime mechanics.

**Incident:** In local/mock Chat, a normal post was stored correctly but the response fell through to the generic Agent reply fixture: `I understood ... This response came through the Agent runtime.` Prior rehearsal history could also make a later post receive an unrelated memory response.

**Project enforcement:** `generatePresenceChatReply` uses context-sensitive public-self fixtures for local rehearsal inputs and matches the current post before history-derived cues. Provider-backed Chat continues to receive the explicit social prompt, selected Presence, session history, and optional reply target.

**Executable protection:** `tests/ai.test.ts` rejects runtime wording and proves a current edge-case post is not overridden by prior memory context; `tests/e2e/openpresence.spec.ts` verifies a normal post and an explicit Reply in Chromium, including selected-thread context.

**Apply when:** Changing Presence Chat, social rehearsal prompts, mock/runtime fallbacks, or any route that translates simulated world posts into Presence replies.

**Added:** 2026-08-14

## Rule: Teach must require an explicit Presence-mode command

**Defect class:** Conversational command parsing / quoted social context

**General principle:** A word inside a social handle, quotation, example, or world-data description is not an operator command. State-changing conversational actions require an explicit imperative that names the target and requested transition.

**Incident:** Teach matched the substring `ghost` anywhere in the operator's message. Asking how to handle `@jenny_ghost write a post about SpaceX` therefore changed the Presence to Ghost and surfaced `Presence changed to Ghost`, even though the user asked for nuanced mention handling.

**Project enforcement:** `isExplicitGhostModeRequest` accepts explicit Presence-to-Ghost imperatives and rejects quoted handles or incidental mentions. The `sendMessage` operation uses that recognizer instead of a substring check.

**Executable protection:** `tests/runtime.test.ts` asserts the exact reported mention leaves the Presence Agent-owned and that the explicit mode phrase still changes it; `tests/e2e/openpresence.spec.ts` exercises the same Teach flow and checks the state route.

**Apply when:** Changing Teach command parsing, natural-language state mutations, Presence mode/identity controls, or handling of quoted social-world text.

**Added:** 2026-08-13

## Rule: Durable writing preferences must have real proposal provenance

**Defect class:** Teach preference acknowledgement / phantom proposal

**General principle:** If the Agent says a protected preference is a reviewable proposal, the proposal and its ChangeSet must exist in durable state. The acknowledgement must repeat the exact scope and distinguish immediate conversational behavior from authoritative meaning.

**Incident:** The one-sentence-per-line post-formatting preference was described as a proposal, but no proposal was actually created, leaving the operator unable to find or review what the Agent claimed to have added.

**Project enforcement:** Teach recognizes the post-only formatting request, appends the exact guidance to a pending `TASTE` proposal, creates its ChangeSet, and says that posts use blank-line-separated sentence paragraphs while replies remain normally formatted until approval.

**Executable protection:** `tests/runtime.test.ts` asserts the proposal body, exact interim behavior, and ChangeSet; `tests/e2e/openpresence.spec.ts` verifies the Teach response and persisted proposal.

**Apply when:** Changing Teach durable preferences, protected meaning proposals, writing-style instructions, or acknowledgement copy.

**Added:** 2026-08-13

## Rule: Assignment review must expose the delegated authority boundary

**Defect class:** Assignment review copy / operator-versus-Agent ownership

**General principle:** When an operator assigns an outcome, the review surface must distinguish the required deliverable from the Agent's freedom over the approach. A generic `Agent decides` label can make required work look optional or make the Agent appear to own the outcome.

**Incident:** The Assignment review card labeled the approach column `Jenny decides`, even though the operator had already assigned the expected deliverable. The supporting list was accurate but the authority boundary was ambiguous at the moment the operator approved the work.

**Project enforcement:** The review card labels the approach column `Agent decides how` and keeps the explicit list of topics, thesis, evidence, format, wording, and timing strategy. Deliverable and verified completion remain separate columns.

**Executable protection:** `tests/e2e/playground-rehearsal.spec.ts` reviews an Assignment and asserts the `Agent decides how` label, the approach list, and the absence of `Jenny decides` on Chromium and Pixel 5.

**Apply when:** Changing Assignment creation/review copy, delegated responsibility, Consider versus Assign controls, or any surface that explains Agent autonomy inside an operator instruction.

**Added:** 2026-08-13

## Rule: Teach must not turn symbol-only operator context into assistant onboarding

**Defect class:** Teach conversation identity / low-information operator input

**General principle:** Teach is a person-shaped conversation with the Agent's private mind. A punctuation or symbol-only operator turn may be meaningful context, but it is not a request for a help menu, topic invention, or generic onboarding response.

**Incident:** The operator sent \`.\` and \`?\`; Teach answered with “Share a question, idea, or half-formed thought” and “What’s on your mind?” The transcript looked like a generic assistant instead of an Agent being shaped by its operator.

**Project enforcement:** \`isLowInformationCue\` records the operator turn without adding a canned Agent reply, the state route skips the model call for that cue, and the operator prompt explicitly prohibits generic AI-assistant onboarding.

**Executable protection:** \`tests/runtime.test.ts\` asserts symbol-only Teach turns contain only the operator message; \`tests/e2e/openpresence.spec.ts\` verifies a fresh \`?\` turn has no onboarding response; \`tests/ai.test.ts\` asserts the Teach prompt is person-shaped.

**Apply when:** Changing Teach, operator conversation routing, Brain prompt construction, low-information handling, or Chat/Teach surface boundaries.

**Added:** 2026-08-13

## Rule: Delegated Assignments need visible cancellation

**Defect class:** Assignment lifecycle / action completeness

**General principle:** Any delegated workflow that can remain drafted or active must expose a clear cancellation action, preserve its history, and prevent cancelled work from restarting.

**Project-specific risk:** Assignments had a `cancelled` status in the data model but the calendar did not provide a clear review-and-cancel interaction, leaving operators unable to stop or dismiss a scheduled draft without hunting through a separate list.

**Project enforcement:** Scheduled Assignments are distinct cards in the Week calendar. Opening a card reveals timing, verified progress, Sandbox run/retry, and `Cancel Assignment` for non-terminal work; `cancelAssignment` marks the record cancelled and records a decision event; completed and cancelled Assignments cannot be restarted or cancelled again.

**Executable protection:** `tests/runtime.test.ts` covers draft and active cancellation plus restart prevention. `tests/e2e/playground-rehearsal.spec.ts` covers opening the Assignment detail surface, confirming cancellation, exact-time calendar placement, and cancelled-history state on Chromium and Pixel 5.

**Apply when:** Adding or changing delegated workflows, Assignment statuses, Schedule rows, background work, or terminal lifecycle actions.

**Added:** 2026-08-13

## Rule: UI forms must enforce runtime contracts before submission

**Defect class:** Form validation / API contract mismatch

**General principle:** Client forms should constrain values to the same limits as the write API and provide an actionable validation path before submission.

**Project-specific risk:** The Manage Agent skill form allowed prompts longer than the API's 500-character limit, producing only a generic save failure.

**Learned from:** OpenPresence Playground experiment on 2026-08-13.

**Why QA missed it:** The form had required fields but no visible length constraint, and existing coverage did not exercise a near-boundary skill prompt.

**Project enforcement:** `app/page.tsx` applies `maxLength={100}` to skill names and `maxLength={500}` to skill prompts; `tests/e2e/openpresence.spec.ts` asserts both attributes and completes a successful skill creation.

**Executable protection:** `tests/e2e/openpresence.spec.ts` — `Skill creation keeps the instruction within the API contract`.

**Apply when:** Adding or editing any form backed by a stricter Zod/API length, enum, format, or cardinality constraint.

**Added:** 2026-08-13

## Rule: Provider switching must choose an available runtime model

**Defect class:** Runtime selection / environment capability mismatch

**General principle:** A provider selector must choose from currently available capabilities, not a hard-coded default that may not exist in the target environment.

**Project-specific risk:** Switching an Agent to Ollama selected `llama3.2` even though the local runtime only exposed `qwen3-vl:8b`, `qwen2.5:7b-instruct`, and other installed models; Playground then failed before cognition.

**Learned from:** Alex Klonemozi Playground experiment on 2026-08-13.

**Why QA missed it:** Provider UI coverage checked the selected provider label but not that the selected model was installed and executable.

**Project enforcement:** `app/page.tsx` selects the first discovered Ollama model when changing providers; Brain's model grid remains the source of truth for explicit model selection.

**Executable protection:** `tests/e2e/openpresence.spec.ts` — recommended follow-up: mock `/api/ollama/models` with an installed-model fixture and assert provider switching selects that model; currently missing in the existing suite.

**Apply when:** Changing provider access, model discovery, Agent runtime selection, or AI-backed Playground/Chat flows.

**Added:** 2026-08-13

## Rule: Low-information social cues must be judged in context

**Defect class:** Social cognition / minimal or ambiguous inbound content

**General principle:** A short fragment, punctuation mark, emoji, brief acknowledgment, or casual greeting is neither an automatic question nor an automatic reply obligation. Use thread and relationship evidence to decide whether it opens a real exchange. If it does, choose the smallest natural response; otherwise preserve `no_op`. Never turn low-information content into assistant onboarding, invented context, or a canned public line.

**Incident:** A human may answer a minimal cue with `??`, `Yes?`, `👀`, a tiny acknowledgment, or silence depending on the room. Treating every cue as a request produces performative activity; treating every cue as meaningless can miss a genuine conversational opening.

**Project enforcement:** `promptFor` includes the model-facing rule for current and future Agents, and `fileContent("BRAIN")` includes the durable default Brain rule. No phrase-specific branch selects a public action.

**Executable protection:** `tests/ai.test.ts` asserts that social cognition receives the low-information-cue guidance and that newly created Agents carry the Brain rule. The isolated Chrome Playground experiment is the current behavioral evidence; recommended follow-up is a small real-model eval fixture covering fresh and established relationships without asserting exact wording.

**Apply when:** Changing Brain defaults, social cognition prompts, low-content social handling, clarification guidance, or Playground decision evaluation.

**Added:** 2026-08-13

## Rule: Social evaluation failures must not masquerade as intentional silence

**Defect class:** Original Post Rehearsal / structured AI decision handling

**General principle:** A no-op is a valid Agent judgment only when cognition returned a valid social decision. A malformed or unavailable model response must be surfaced as an evaluation failure, while deterministic test mode must provide structured social fixtures so the publication lifecycle is actually exercised.

**Incident:** Original Post Rehearsal received the generic chat mock sentence instead of structured social-decision JSON. The parser correctly refused to publish, but the workflow recorded the result as `NO_OP` and told the operator the Presence chose silence, making an evaluation failure look like a deliberate identity judgment.

**Project enforcement:** `generateAgentSocialDecision` returns a structured Sandbox-only fixture under `OPENPRESENCE_AI_MOCK=1`; `runSandboxAgentCycle` records `Sandbox evaluation unavailable` for the invalid structured-response rationale; the rehearsal completion copy names deliberate silence as “Silence” and explains that no post was formed.

**Executable protection:** `tests/ai.test.ts` verifies structured mock decisions, `tests/sandbox.test.ts` preserves valid no-op calibration and its plain-language outcome, and `tests/e2e/openpresence.spec.ts` verifies Original Post Rehearsal publishes a Sandbox post, preserves private inspiration, records `fits` evidence, and passes on Chromium and Pixel 5.

**Apply when:** Changing Original Post Rehearsal, social decision parsing, AI mock/replay behavior, Sandbox publication lifecycle, or no-op/error copy.

**Added:** 2026-08-13

## Rule: List-like Presence Brief fields must not rewrite text while typing

**Defect class:** Controlled textarea input loss / comma-separated Brief editing

**General principle:** Preserve the operator’s raw draft text during editing. Parse and normalize list-like values at an explicit commit boundary so punctuation, separators, and partial entries remain editable.

**Incident:** Primary territory, Adjacent territory, and Keep out split the textarea value and filtered empty items on every keystroke. Typing a comma created an empty trailing item, which was immediately removed and made the comma disappear.

**Project enforcement:** `PresenceView` stores raw territory strings separately from the persisted `PresenceBrief` arrays; `territoryValues` is applied only by Save brief. Cancel and reopening the editor rehydrate from persisted Presence state.

**Executable protection:** `tests/e2e/openpresence.spec.ts` fills trailing commas in Adjacent territory and Keep out, asserts the comma remains before completion, saves internal comma-separated values, reopens the editor, and verifies persistence on Chromium and mobile.

**Apply when:** Changing Presence Brief, territory, boundaries, comma-separated settings inputs, or controlled list-like textareas.

**Added:** 2026-08-13

## Rule: Schedule timing should explain relevance, not execution mechanics

**Defect class:** Standing Intent timing abstraction / progressive disclosure

**General principle:** A scheduled intention grants the Agent a future moment to reconsider the world; it is not a guaranteed delivery slot. The default form should make that boundary legible without requiring operators to understand the persisted execution-window representation.

**Incident:** Schedule exposed every intent with the same raw `Execution window` field, making a meaningful attention choice look like an arbitrary delivery setting and making all updates appear equivalent.

**Project enforcement:** `ScheduleView` keeps the internal window for runtime compatibility, but defaults to a collapsed `Timing options` control with Flexible, Exact time, and Custom relevance choices. List and Week surfaces describe consideration rather than an execution window.

**Executable protection:** `tests/e2e/openpresence.spec.ts` asserts the raw field is absent by default, the timing panel is collapsed, the recommended explanation appears when expanded, and custom start/end values persist as consideration copy on Chromium and mobile.

**Apply when:** Changing Schedule, standing intents, future attention, timing controls, calendar geometry, or execution-envelope copy.

**Added:** 2026-08-13

## Rule: Conversational surfaces must render the submitted turn before model completion

**Defect class:** Chat/Teach loading-state omission / duplicate transcript

**General principle:** A conversational submission is a visible user turn immediately. While the Agent is judging or composing, the surface must show a truthful in-flight state, then reconcile that temporary state with exactly one authoritative response.

**Incident:** Chat and Teach waited for the model request to finish before rendering anything, then displayed the user message and Agent response together. A delayed submission could also be invoked twice before React committed the loading flag.

**Project enforcement:** Teach and Presence Chat keep an optimistic local user turn, render a shared accessible `Thinking` status, reconcile against the returned persisted state, and guard the submission with a ref-level in-flight lock. The status communicates cognition without exposing hidden reasoning or infrastructure.

**Executable protection:** `tests/e2e/openpresence.spec.ts` delays both API operations and asserts the immediate user turn, visible thinking state, eventual single response, and exact persisted role sequence on Chromium and mobile.

**Apply when:** Changing Chat, Teach, Presence Chat, message submission, model loading states, transcript hydration, or response reconciliation.

**Added:** 2026-08-13

## Rule: Activity decisions must expose provenance and exclude configuration churn

**Defect class:** Activity decision ambiguity / system-event leakage

**General principle:** An operational feed called “What [Presence] decided” must distinguish observed evidence, Agent judgment, selected Social Intent, and delivery state. Configuration acknowledgements and other infrastructure updates are not decisions and must not masquerade as them.

**Incident:** Repeated `Presence settings updated` rows all used the same generic copy, so the Activity feed looked like a sequence of identical decisions and did not explain how any decision was reached.

**Project enforcement:** `isActivityDecisionEvent` excludes generic settings churn from the decision feed. Eligible rows render a compact `Observed`, `Judgment`, and `Delivery` path, with truthful fallbacks when no linked intent, execution, or outcome exists. The empty state names the absence of decisions and directs configuration changes to Settings.

**Executable protection:** `tests/runtime.test.ts` covers the event boundary; `tests/e2e/openpresence.spec.ts` asserts configuration changes do not appear as Presence decisions and the empty state explains the feed.

**Apply when:** Changing Activity event projections, system-event titles, Social Intent/execution lineage, decision summaries, or Presence Settings mutations.

**Added:** 2026-08-13

## Rule: Public Self must explain the zero-disclosure state

**Defect class:** Presence settings / disclosure-state ambiguity

**General principle:** A permissions checklist must explain its default behavior when no option is selected; otherwise operators cannot predict what the Agent will say.

**Incident:** Approved disclosure details were shown as four unchecked controls without explaining the typical response when none were approved.

**Project enforcement:** `PresenceView` renders `.public-facts-default` while `approvedTechnicalFacts` is empty, explaining that the Presence answers naturally, does not volunteer technical details, and still follows the selected Identity posture for direct questions.

**Executable protection:** `tests/e2e/openpresence.spec.ts` asserts the default-state explanation in the Presence Public Self settings flow.

**Apply when:** Changing Public Self, disclosure facts, Identity posture, Ghost boundaries, or Presence settings copy.

**Added:** 2026-08-13

## Rule: Enabling Auto must explicitly approve the pending review queue

**Defect class:** Execution-policy transition / implicit approval

**General principle:** Changing a capability from Review to Auto is an operator decision with an execution consequence. If pending work is waiting at that checkpoint, the UI must show the exact count and require confirmation before changing the policy or processing the work.

**Project-specific risk:** A settings click could silently remove the operator checkpoint while leaving already-formed reply executions in an ambiguous state, or could process only part of the pending queue.

**Project enforcement:** `confirmAutoMode` validates the Presence, capability affordances, and complete pending execution ID set before atomically enabling Auto, approving the matching executions, and handing them to the correct connector delivery path. The Settings dialog keeps Review unchanged when dismissed.

**Executable protection:** `tests/sandbox.test.ts` covers stale-queue rejection and one-request Sandbox delivery; `tests/e2e/openpresence.spec.ts` asserts exact pending-count copy, cancel preservation, confirmed Auto state, and completed reply delivery on Chromium + Pixel 5.

**Apply when:** Changing execution modes, approval queues, Settings capability controls, or connector delivery transitions.

**Added:** 2026-08-13

## Rule: Operator approval must be an unmistakable primary action

**Defect class:** Activity CTA hierarchy / review discoverability

**General principle:** When delivery is waiting for operator approval, the approval action must be visually dominant, keyboard-visible, and readable at a glance without changing the underlying execution boundary.

**Project-specific risk:** The `Approve execution` control inherited the quiet secondary-button treatment and looked like a low-priority utility action despite being the operator's next required decision.

**Project enforcement:** `.review-cta` uses high-contrast accent color, a larger hit area, centered icon/label, hover elevation, and a dedicated focus ring; approval still calls the existing `approveExecution` mutation.

**Executable protection:** `tests/e2e/openpresence.spec.ts` asserts the review CTA class, enabled contrast colors, 48px minimum height, keyboard focus, and successful review/manual execution lifecycle on Chromium + Pixel 5.

**Apply when:** Changing Activity review cards, approval actions, execution lifecycle controls, or CTA hierarchy.

**Added:** 2026-08-13

## Rule: Playground threads and Activity scopes must preserve social context

**Defect class:** Social thread presentation / channel-environment leakage

**General principle:** A social reply must render with its parent, and operational Activity must be scoped to the selected Presence's channel and embodiment; projections must not flatten thread context or mix Sandbox and live records.

**Project-specific risk:** A flat Playground object list made Jenny replies look unrelated; Activity filtered by Presence only and mixed Sandbox with live-route records; causal copy exposed implementation-shaped context.

**Project enforcement:** `PlaygroundThreadFeed` groups objects by `parentExternalRef`; `LiveView`, `MirrorPanel`, `ExecutionLedger`, and `deriveActivitySummary` filter the selected Presence/channel/environment/session; `ActivityEventDetail` and `.event-context-preview` use the `Playground` tag and `↳`.

**Executable protection:** `tests/e2e/openpresence.spec.ts` covers reply stacking and Sandbox/live Activity isolation on Chromium + Pixel 5; `tests/runtime.test.ts` covers Activity environment scoping.

**Apply when:** Changing Playground, MirrorObject lineage, Activity, Presence routing, channel selection, event context, or review execution projections.

**Added:** 2026-08-13

## Rule: Playground worlds must be Presence-scoped

**Defect class:** Cross-Presence rehearsal leakage

**General principle:** Selecting a Presence changes the entire simulated social room. Agent-level meaning remains shared, but channel, Sandbox environment, actors, Social Mirror objects, rehearsal history, assignments, and calibration evidence must remain isolated to the selected Presence/session.

**Project enforcement:** Playground selects only an active session whose `presenceId` matches the selected Presence, automatically opens that Presence's session when switching in-place, and never falls back to another Presence's first session. The navigation and “Presence rehearsal” scope marker make the current embodiment explicit.

**Executable protection:** `tests/sandbox.test.ts` verifies distinct Presence/session/environment/channel roots and shared Agent mind; `tests/e2e/playground-rehearsal.spec.ts` verifies an X-only marker is absent from a LinkedIn world and returns when switching back on Chromium and Pixel 5.

**Apply when:** Changing Playground state projection, Presence switching, Sandbox sessions/environments, Social Mirror history, actor simulation, rehearsal calibration, or Agent-vs-Presence boundaries.

**Added:** 2026-08-14

## Rule: Chat must contain intentional conversation turns only

**Defect class:** Chat transcript provenance / cross-surface state leakage

**General principle:** A conversational transcript must contain only turns caused by an intentional participant message or an explicitly requested conversational action. Configuration, presence, and background runtime changes belong in their operational surface and must not appear as unsolicited agent replies.

**Incident:** Changing Presence identity, Ghost profile, rhythm, or other settings appended repeated “I noticed the Presence settings changed” messages to Chat even though the operator had not sent a chat message.

**Project enforcement:** The `/api/state` `setPresence` mutation persists the Presence change and its existing system event, but never appends an agent message to the active conversation. Chat remains in its blank state until `sendMessage` is used; live Presence state is still included in the Agent's next intentional chat context.

**Executable protection:** `tests/x-connection.test.ts` asserts repeated `setPresence` calls leave `messages` empty while a subsequent chat request receives the authoritative live Presence state. `tests/e2e/openpresence.spec.ts` asserts Settings changes do not create unsolicited Chat messages and the blank conversation state remains visible.

**Apply when:** Changing Presence Settings, runtime/background events, Chat transcript persistence, conversation hydration, or cross-surface state synchronization.

**Added:** 2026-08-13

## Rule: Rhythm settings must explain attention, expose real controls, and be reachable from Activity

**Defect class:** Presence configuration discoverability / cadence UX

**General principle:** A summary value is not a configuration surface. When a product shows cadence, it must explain what is being paced, distinguish it from capability permissions, expose every displayed setting, and provide a direct path to change it.

**Incident:** Activity showed “Attention · On demand” and Presence settings showed “Rhythm · Pacing is infrastructure” with opaque Recommended/Gentle/Custom options, while Quiet hours was displayed as “Not configured” without any setup path.

**Project enforcement:** Activity explains that Rhythm controls when a Presence checks its connected channel, links to Presence settings, and the settings surface defines Recommended (5 minutes), Gentle (15 minutes), and Custom (5–120 minutes). Quiet hours is Presence-scoped, persists as an overnight-safe window, and pauses automatic observation without blocking explicit Check now or Calendar runs.

**Executable protection:** `tests/runtime.test.ts` covers persisted custom rhythm and overnight quiet-hour scheduling; `tests/e2e/openpresence.spec.ts` covers Activity → Settings navigation, option explanations, quiet-hours persistence, Chromium + Pixel 5 responsive geometry, console errors, and failed requests.

**Apply when:** Changing Activity rhythm summaries, Presence settings, native observation cadence, quiet hours, scheduling, or execution-envelope language.

**Added:** 2026-08-13

## Rule: Full-viewport modal backdrops must center their dialog in the viewport

**Defect class:** Modal geometry / responsive overlay

**General principle:** A modal backdrop must cover the complete viewport and its dialog must be centered against that same viewport; centering against an underlying shell creates a visibly off-center popup and leaves parts of the page outside the scrim.

**Project-specific risk:** The Add a Presence backdrop inherited the workspace sidebar offset, so the overlay excluded the sidebar and the dialog was centered only in the remaining workspace.

**Project enforcement:** `.add-presence-modal-backdrop` uses full fixed insets and centers the Presence dialog independently of the sidebar layout.

**Executable protection:** `tests/e2e/presence-modal.spec.ts` checks backdrop bounds and dialog center at the active desktop/mobile viewport sizes.

**Apply when:** Changing Add Presence, Create Agent, dialog shell, sidebar offsets, or responsive modal layout.

**Added:** 2026-08-13

## Rule: Custom media controls must not leak native input chrome

**Defect class:** Playground media input / responsive UI

**General principle:** A custom upload control must own its visual presentation while preserving an accessible native file-selection path.

**Incident:** The Playground's form-wide input styling overrode the file input's `hidden` attribute, exposing the browser's “Choose File / No file chosen” control inside the custom Add media card and splitting one affordance into two competing controls.

**Project enforcement:** The file input uses a dedicated visually-hidden class inside the labeled Add media control; the control has explicit flex alignment and focus-visible treatment, while the link field remains a separate channel-native action.

**Executable protection:** `tests/e2e/openpresence.spec.ts` asserts the custom Add media control is visible, the file input is attached with the visually-hidden geometry, and the existing file-selection flow still persists a media-bearing simulated post on Chromium and Pixel 5.

**Apply when:** Changing Playground media entry, Sandbox event forms, upload controls, or shared form-input styling.

**Added:** 2026-08-13

## Rule: Activity must read as a Presence, a channel, and an operator queue

**Defect class:** Activity information architecture / social-feed readability

**General principle:** An operational Presence page should answer one question at a time: what needs the operator, what did the Agent observe, what did it decide, and what happened. World objects should use the visual grammar of their channel; execution proof must stay adjacent without becoming a duplicate status rail.

**Project-specific risk:** The former Activity surface presented Social Mirror posts as loose text, used the misleading “The day in motion” heading, repeated Now/Next/Review in separate areas, and placed the execution ledger away from the activity it explained. Operators had to reconstruct the social story from implementation-shaped fragments.

**Project enforcement:** `LiveView` uses a Presence-specific “right now” header, an actionable review banner, channel-native `.mirror-post` cards, a single `.activity-status-panel`, a single `.execution-ledger`, and a chronological `.activity-log`. Context-bearing events and actions expose `.event-context-preview`, `.status-context-button`, or `.action-context-card` so the source post is one click away. The UI keeps observed context, Agent decisions, executions, and outcomes separately labeled.

**Executable protection:** `tests/e2e/openpresence.spec.ts` covers Activity lifecycle, review/manual execution, and Presence-name scoping. Rendered desktop and Pixel 5 QA checks assert no horizontal overflow and no browser console errors; a dedicated visual regression assertion is recommended if screenshot testing is added to the project.

**Apply when:** Changing Activity/Live composition, Social Mirror presentation, review queues, execution proof, or Presence operational copy.

**Added:** 2026-08-13

## Rule: Calendar Week must reserve space for late-day card content

**Defect class:** Responsive layout / clipped evidence

**General principle:** A time-grid item that begins near the final visible row must retain enough surface area for its complete content and footer; the operator should never have to infer that more content exists below a clipped boundary.

**Project-specific risk:** Week view positioned a 23:08 publication inside a fixed 24-hour body with hidden overflow, cutting off the card's proof footer at the bottom of the calendar.

**Project enforcement:** The Week timeline reserves a bottom buffer after the 24 hourly rows, while narrow screens keep the existing horizontal timeline scroll.

**Executable protection:** `tests/e2e/calendar-history.spec.ts` asserts that the publication card and its proof footer remain within the Week surface on Chromium and mobile.

**Apply when:** Changing Calendar Week positioning, timeline height, card density, or responsive overflow behavior.

**Added:** 2026-08-13

## Rule: Dense Calendar selections need an alternate browse path

**Defect class:** Interaction discoverability / stacked-card selection

**General principle:** When time-grid items overlap, the operator needs a reliable sequential navigation path; clicking exposed pixels cannot be the only way to reach an item.

**Project-specific risk:** Calendar Week positioned multiple publications at the same time, stacking buttons so only the top card was reliably selectable.

**Project enforcement:** PublicCalendarView passes the current filtered history to PublicHistoryInspector; the inspector exposes Previous/Next controls and a position indicator while preserving the selected item’s details.

**Executable protection:** `tests/e2e/calendar-history.spec.ts` asserts that the navigation controls update the displayed post and position.

**Apply when:** Changing Calendar history cards, inspector selection, filters, or Week overlap handling.

**Added:** 2026-08-13

## Rule: Verified external publications must expose an actionable destination

**Defect class:** Evidence usability / channel provenance

**General principle:** A verified public record should let the operator reach the canonical external object when the channel provides a stable URL; evidence that cannot be opened must say why.

**Project-specific risk:** Calendar proved that an expression existed but exposed only an opaque X object ID, forcing the operator to leave OpenPresence and search manually. Sandbox rehearsals must never masquerade as live X publications.

**Project enforcement:** `derivePublicHistory` derives an `externalUrl` only for verified, non-Sandbox X references using the selected Presence's native X account handle. `PublicHistoryInspector` renders `Open on X` for that URL and a truthful no-live-URL note for Sandbox history.

**Executable protection:** `tests/runtime.test.ts` asserts the canonical X URL for a verified publication and asserts that Sandbox history has no external URL. The Calendar E2E and browser review protect the inspector's visible action and responsive layout.

**Apply when:** Changing public-history projections, execution evidence, native X identity, Sandbox presentation, or the Calendar inspector.

**Added:** 2026-08-13

## Rule: Presence destination selection must be singular and state-truthful

**Defect class:** Information architecture / environment boundary / misleading status

**General principle:** A Presence has one active destination at a time. Sandbox, native X, and Bridge are explicit route choices; the UI must show only the selected route's controls, and connection language must describe the actual connection state.

**Incident:** Presence Settings rendered X and Bridge as parallel settings, made Sandbox difficult to discover, showed live-channel copy before a connection existed, and left “Agent-wide” in Chat chrome where it was not actionable context.

**Project enforcement:** `connectionMode` persists the selected route, connector routing honors it, Sandbox is a first-class destination, inactive connector panels are hidden, unconnected live routes say they are not active, and Chat's top-right status area is absent outside Presence Settings.

**Executable protection:** `tests/sandbox.test.ts` verifies route exclusivity and environment persistence. `tests/e2e/openpresence.spec.ts` verifies Sandbox/X/Bridge switching, persistence, truthful connection copy, Chat chrome, Playground copy, and desktop/mobile behavior. `tests/e2e/x-connection.spec.ts` verifies native X configuration within the selected X route.

**Apply when:** Changing Presence Settings, channel selection, Sandbox/Playground, native connectors, Bridges, connection status copy, or Chat top-bar context.

**Added:** 2026-08-13

## Rule: Perception must remain evidence, not truth

**Defect class:** Multimodal cognition / Sandbox isolation / truthful uncertainty

**General principle:** Raw social assets, derived perception, and Taste-led action are separate layers. A text-only runtime must not invent media understanding, and Sandbox corrections must not update Agent-wide Memory, Growth, or Taste.

**Project-specific risk:** An image-bearing Social Mirror object could be reduced to text, causing the Agent to reply as though it had seen the image, or a simulated correction could leak into durable Agent meaning.

**Project enforcement:** `Asset` stores raw evidence separately from versioned `AssetPerception`; unsupported or uninspected media is explicitly `insufficient`; media-dependent Sandbox intents require usable inspect-level perception and Presence policy; Reset removes session-scoped assets and perceptions only.

**Executable protection:** `tests/sandbox.test.ts` verifies raw asset references, provenance, insufficient perception, blocked media-dependent intent formation, Presence uncertainty policy, and session reset. `tests/e2e/openpresence.spec.ts` verifies image input, “What Jenny sees,” “Media needs inspection,” and reset behavior on Chromium and Pixel 5.

**Apply when:** Adding media inputs, perception providers, Social Mirror object types, action gating, Sandbox corrections, or durable Agent learning from social evidence.

**Added:** 2026-08-13

## Rule: Sandbox UI must be channel-native, not a generic social-event editor

**Defect class:** Social Mirror semantics / Playground UX

**General principle:** Sandbox is infrastructure; the user should experience the selected Social Mirror. Event actions, labels, relationships, and starting-world copy must come from the channel definition.

**Project-specific risk:** A generic `Mention` action and always-present `Conversation` selector implied one universal social grammar and made X-specific rehearsal misleading for other channels.

**Project enforcement:** `simulationForChannel` supplies the world label and action grammar; `SandboxEventForm` renders conditional relationship targets and reusable actors; Settings names the selected route with its simulated channel.

**Executable protection:** `tests/sandbox.test.ts` verifies X reply targets and actor reuse; `tests/e2e/openpresence.spec.ts` verifies conditional fields, `Simulated X` labeling, live-route rehearsal, and desktop/mobile rendering.

**Apply when:** Adding a Social Mirror, changing Playground controls, introducing a channel capability, or changing Sandbox copy.

**Added:** 2026-08-13

## Rule: Repeated context outputs require collision-proof React keys

**Defect class:** Rendering integrity / repeated collection identity

**General principle:** Context and Activity collections can contain repeated labels and details. Render keys must remain unique when two records describe the same kind of output.

**Incident:** Two `x.post` outputs with `Publication draft` details produced the React duplicate-key warning `x.post-Publication draft` and made rendering behavior unsupported.

**Project enforcement:** Context output rows use a stable per-render fallback index in addition to their semantic label and detail, so repeated outputs remain independently renderable.

**Executable protection:** The Chat E2E flow captures browser console errors, and the affected output projection is covered by the focused Chat/browser pass.

**Apply when:** Adding or changing repeated Context, Activity, execution, publication, or output lists.

**Added:** 2026-08-13

## Rule: Activity context must be explicit and rapid duplicates must collapse

**Defect class:** Activity provenance / repeated event presentation

**General principle:** An activity record may show source context only when its lineage identifies that source or target. A concise operator timeline should collapse rapid identical records instead of presenting the same decision as several independent explanations.

**Incident:** Activity used the latest observed post as a fallback for events without lineage, so several separate rows displayed the same “Because of” post. Rapid repeated silence events also appeared as duplicate rows in the visible timeline.

**Why QA missed it:** Earlier Activity QA verified that a context preview appeared for one event, but did not exercise missing lineage or repeated event records in the same populated stream.

**Project enforcement:** `LiveView` resolves context only from `sourceObjectId`, Social Intent/Execution/Outcome targets, or explicit target-object lineage. `addSandboxEvent` and `formSandboxIntent` persist Sandbox source IDs. Activity retains the newest event when identical records occur within ten seconds.

**Executable protection:** `tests/sandbox.test.ts` asserts Sandbox source lineage; `tests/e2e/openpresence.spec.ts` removes lineage and injects a duplicate event through a browser response fixture, then verifies no guessed preview and one visible row on Chromium and Pixel 5.

**Apply when:** Changing Activity, Social Mirror context previews, event lineage, Sandbox decisions, or repeated event projections.

**Added:** 2026-08-13

## Rule: Sandbox rehearsal must never escape into live delivery

**Defect class:** Environment isolation / simulated delivery boundary

**General principle:** Playground is a real Agent rehearsal in a simulated world. Social Mirror objects, sessions, clocks, intents, executions, outcomes, and publications must remain scoped to the selected Sandbox session, and no Sandbox operation may call a native connector.

**Project enforcement:** Sandbox references use `sandbox://`-compatible simulated identifiers and `sandbox:` connector IDs. Delivery checks the environment, connector kind, bridge prefix, and session before creating a simulated Mirror object. Reset removes only the selected session's world and execution records while preserving Agent meaning files.

**Executable protection:** `tests/sandbox.test.ts` verifies environment creation, Social Mirror normalization, simulated delivery, review gating, virtual time, and session reset. `tests/e2e/openpresence.spec.ts` verifies start, wake, audience event, virtual time, reset, and mobile/desktop flow.

**Apply when:** Changing Playground, Sandbox state, Social Mirror normalization, simulated connectors, Agent rehearsal, or live connector routing.

**Added:** 2026-08-13

## Rule: Agent CLI output must remain machine-readable and sandbox-scoped

**Defect class:** Agent tooling / output contract / environment isolation

**General principle:** AI agents should be able to drive Playground without parsing UI copy or receiving unrelated application state. Every CLI command must return structured JSON by default, identify the selected sandbox session, preserve the observation → decision → execution → outcome chain, and never enable live delivery.

**Project enforcement:** `openpresence playground`, `openpresence schedule`, and `openpresence watching` target `/api/state` only with sandbox-safe operations, project Presence/session-scoped records, and require `--human` for non-machine output. Playground supports deterministic virtual time, Assignments, original-post calibration, and JSON scenarios; Schedule preserves Consider versus Assign semantics and blocks non-Sandbox evaluation; Watching preserves automatic/manual source status without inventing observations. Documentation uses `pnpm --silent` so package-manager banners cannot corrupt JSON streams.

**Executable protection:** `tests/playground-cli.test.ts` verifies projection redaction, operation translation for Playground/Schedule/Watching, and structured server errors. Local smoke verification covers `start`, `inspect`, `inject`, `advance`, `timeline`, Assignments, rehearsal feedback, Schedule mutation/evaluation, Watch lifecycle, and live-scope blocking against the production-shaped app.

**Apply when:** Changing the Playground CLI, scenario format, agent-facing state projections, sandbox commands, or command output formatting.

**Added:** 2026-08-13; expanded 2026-08-14

## Rule: Presence marks must stay legible and channel-scoped

**Defect class:** Visual identity / compact navigation overflow

**General principle:** A Presence's channel identity must remain recognizable in compact controls even when its human-readable name is long. Use a channel-native mark, a verified domain favicon, or an explicit predefined fallback icon; keep the full name available through accessible naming and detail views rather than forcing it into the badge.

**Incident:** The Founder Community screenshot rendered the long Social Mirror name as the badge, causing the compact Presence control to lose its visual hierarchy and fit. The requested correction is especially important for community names such as “Founder Community” and for the actual X mark.

**Project enforcement:** `PresenceLogo` resolves X's brand mark, a custom channel's optional domain favicon, or a predefined icon. `PresenceSwitcher` uses the mark in compact controls while retaining the full Presence name in the accessible label and menu. Add Presence supports optional domain input and fallback-icon selection; Presence Settings uses the same mark in the overview.

**Executable protection:** `tests/e2e/openpresence.spec.ts` verifies X and custom favicon/icon behavior, name persistence, and mobile overflow; `tests/e2e/sidebar-hierarchy.spec.ts` verifies the compact logo geometry; `tests/runtime.test.ts` verifies custom channel metadata persistence.

**Apply when:** Changing Presence/channel identity UI, Social Mirror configuration, compact navigation, Presence Settings, or responsive layout.

**Added:** 2026-08-13

## Rule: Calendar grants permission to consider, not a prewritten publication

**Defect class:** Schedule-to-cognition boundary / false external action

**General principle:** A Calendar standing intent is permission for Jenny to pay attention at a time, not a stored post or an obligation to publish. Every evaluation must pass through Agent cognition, allow `NO_OP`, and only then form Social Intent, Execution, and Delivery.

**Project enforcement:** Calendar `Run now` and the open-app scheduler call the Agent runtime with the standing instruction and current Presence context. A `NO_OP` records a truthful decision and no execution. A candidate is linked to its `standingIntentId`, passes through the Presence execution envelope, and native X delivery is counted only with an external reference. Due scheduled evaluations are idempotent per Calendar day.

**Executable protection:** `tests/x-connection.test.ts` covers Calendar cognition → standing Social Intent → native X delivery with external evidence; `tests/runtime.test.ts` covers truthful Calendar no-op Activity state; `tests/e2e/openpresence.spec.ts` covers Calendar creation, edit, time persistence, and evaluation.

**Apply when:** Changing Calendar, Standing Intent, scheduler behavior, Agent evaluation, Social Intent formation, or external delivery.

**Added:** 2026-08-13

## Rule: Provider connection identity is not user-editable

**Defect class:** Configuration integrity / provider identity

**General principle:** A connection name that identifies an external provider should be derived from the provider type, not treated as user-owned metadata that can be renamed in a credential form.

**Project-specific risk:** Brain → Provider access previously exposed a writable “Connection name” field, and `configureProvider` accepted that label, allowing an OpenAI/Ollama connection to be presented under an arbitrary name and making provider selection less trustworthy.

**Learned from:** Human-found UI defect in the provider setup flow.

**Why QA missed it:** Earlier provider setup QA verified that a connection could be saved, but did not test identity immutability or compare the browser form with the runtime’s provider enum.

**Project enforcement:** `BrainView` renders provider-owned names for OpenAI, OpenRouter, and Ollama and omits the connection-name input; `applyOperation`’s `configureProvider` branch canonicalizes stored labels through `providerName`.

**Executable protection:** `tests/runtime.test.ts` rejects attempted OpenRouter renames, `tests/provider-connections.test.ts` verifies the OpenRouter endpoint, and `tests/e2e/openpresence.spec.ts` asserts the connection-name field is absent while completing OpenRouter and existing Ollama/OpenAI setup.

**Apply when:** Adding providers, changing Brain provider access, editing credential forms, or changing `configureProvider` persistence.

**Added:** 2026-08-13

## Rule: Live X tests must never mutate the operator account

**Defect class:** Test contamination / account-boundary violation

**General principle:** A live Agent-to-Presence experiment must keep external stimulus, Agent delivery, and operator activity attributable. Browser automation must not post, reply, like, follow, or otherwise mutate a human/operator account while testing the Agent's public behavior.

**Incident:** During the 2026-08-13 X experiment, the browser session was switched to the operator's `@RichardsonDx` account and a substantive reply was posted there. The post was authored by the test operator path, not Jenny's native X connector. The screenshot made the account identity visible, but the test was not stopped at the account boundary.

**Project enforcement:** Live X delivery is verified only through the Presence-scoped native connector shown in `state.nativeConnections[].account`; for this Presence that account is `@hourandcode`. A second-account reply must be authored by the operator or another explicitly authorized tester. If that input is needed and no separately authorized test account is available, stop and wait. Never switch a browser session to an operator account to manufacture it.

**Executable protection:** ⚠️ Missing — the product test suite can verify native delivery account provenance, but it cannot police external browser actions performed by a test operator. The live-test checklist must include an explicit account check before every external action and a hard stop when the active account is not the configured Presence account.

**Apply when:** Running live X experiments, using Chrome with multiple signed-in X accounts, creating inbound test stimuli, or verifying external artifacts.

**Added:** 2026-08-13

## Rule: Explicit Chat publication requests must enter the real execution ledger

**Defect class:** Agent action boundary / false completion

**General principle:** A Chat request that explicitly asks a Presence to publish is a Social Intent, not merely a conversational drafting exercise. Cognition, execution, and delivery must remain separately visible, and the Agent must never imply delivery without a native outcome.

**Project-specific risk:** Chat returned a generic draft for an explicit X introduction request while Activity still showed no intent, execution, or observation. The operator could not tell whether Jenny had acted, and the real feed remained unchanged.

**Project enforcement:** The exact explicit X publication request is converted into a Social Intent and native execution. Auto Posts are delivered through the native connector and recorded with the external reference; connector failures persist as failed executions and truthful Activity events. Review and manual modes remain gated by the Presence envelope.

**Executable protection:** `tests/runtime.test.ts` verifies an explicit Chat publication request forms a native queued execution without prematurely creating an outcome. Narrow live QA must verify the real X post before any inbound reply test begins.

**Apply when:** Connecting Chat cognition to Social Intent formation, adding channel tools, changing auto/review/manual execution, or reporting external delivery.

**Added:** 2026-08-12

## Rule: First wake must use real Presence footing and native observation

**Defect class:** Agent autonomy / cognition-to-world boundary

**General principle:** Waking a Presence starts a real attention cycle. It must observe the connected channel, make a first-move judgment from Mission, Taste, Soul, and live public footing, then pass any Social Intent through the normal execution and delivery path. A canned introduction, fabricated mirror event, or successful local execution is not an acceptable substitute.

**Project-specific enforcement:** A connected native X wake reads the Presence's recent posts and mentions, persists the observed public footing in Presence context, invokes the selected Agent runtime for launch judgment, and creates a native `x.post` or `x.reply` execution only when the Agent chooses to act. Inbound mentions become native Mirror records before cognition. Missing mention-read scope is reported as partial observation without blocking a first launch when own-history observation succeeds.

**Failure enforcement:** A connector rejection persists a failed Execution and failed Outcome without an external reference, preserves the provider's actionable error, marks the native connection as needing attention, and surfaces the failure in Activity. “Connected” authentication is not treated as proof that X accepted a write.

**Executable protection:** `tests/x-connection.test.ts` covers first wake → public footing → Agent launch → native delivery, and a real-write rejection with no invented external artifact. `tests/runtime.test.ts` covers Presence-scoped footing and reply targets. Live QA must still provide a real X post ID/URL before it can pass.

**Apply when:** Changing wake/pulse behavior, native channel reads, launch cognition, social observation, reply continuity, connector health, or external delivery reporting.

**Added:** 2026-08-13

## Rule: Stable IDs are required for repeated state acknowledgements

**Defect class:** Persistence integrity / rapid mutation collision

**General principle:** User-visible state changes may happen back-to-back and must remain independently persistable. Timestamp-only IDs are not safe identifiers for rapid operations.

**Project-specific enforcement:** State acknowledgment messages use UUID-backed IDs, so rapid Ghost/Agent or Presence setting changes cannot collide in SQLite's `messages` primary key.

**Executable protection:** The provider connection test repeatedly applies immediate Presence changes before reading the authoritative live state.

**Added:** 2026-08-13

## Rule: Agent tools must be discoverable at Agent scope

**Defect class:** Information architecture / capability provenance

**General principle:** A capability count is not useful unless the operator can see what is bound, why it exists, and which layer controls its authorization.

**Project-specific risk:** Chat exposed “Tools available: 4” without naming the four capabilities or identifying where they were configured. This made Agent-owned mechanics look like hidden Presence settings and blurred the difference between a bound tool and an authorized channel action.

**Project enforcement:** Manage Agent lists the named tool bindings with descriptions and scope. Chat uses “Tools bound” for the summary count. Presence settings remain the place for channel execution modes such as off, manual, review, and auto.

**Executable protection:** `tests/runtime.test.ts` verifies the four seeded bindings are Agent-owned. `tests/e2e/openpresence.spec.ts` verifies all four are visible in Manage Agent and that Chat no longer says “Tools available”.

**Apply when:** Adding or changing tools, skills, runtime capabilities, Chat provenance summaries, or Presence execution permissions.

**Added:** 2026-08-12

## Rule: Activity must expose current work, next attention, and rhythm

**Defect class:** Operational visibility / false scheduler implication

**General principle:** Live is an operational social stream, not analytics. The operator must be able to tell what the Presence is doing now, what will happen next, and what needs review; idle and paused states must be explicit.

**Project-specific risk:** The former Live page showed historical events and aggregate counters but did not explain whether Jenny was currently doing anything, when she would look again, or whether a review item was waiting. That made a connected Presence appear inert and encouraged the UI to imply background cognition that the local runtime did not provide.

**Project enforcement:** Activity derives a current state from Presence status, pulses, intents, and executions; shows the next standing intent or explicitly says attention is on demand; separates attention cadence from publishing/reply modes; and labels the native X mirror as connected but not yet observed when no observation loop has run.

**Executable protection:** `tests/runtime.test.ts` covers idle, pulse, paused, and standing-intent summaries. `tests/e2e/openpresence.spec.ts` verifies the visible Now/Next/rhythm summary and a completed pulse. The implementation must not invent automatic scan times without a real scheduler source.

**Apply when:** Changing Activity/Live, pulse behavior, schedules, execution review, channel observation, or Presence rhythm settings.

**Added:** 2026-08-12

## Rule: Ghost identity must be Presence-scoped, explicit, and reviewable

**Defect class:** Agent identity boundary / AI grounding / operator control

**General principle:** A Ghost should extend an operator or organization through context the operator explicitly provides and can inspect. The Agent must not fill missing operator preferences from its own identity, stale transcript, or private implementation context.

**Project-specific risk:** Selecting “Me / my organization” previously changed only a mode flag. The UI gave the operator no place to define what the Ghost represented and no way to review the interpretation that would shape its replies.

**Project enforcement:** Ghost profiles live on the individual Presence, are shown and edited in Presence settings, and are compiled into cognition only while that Presence is in Ghost mode. Empty fields remain explicitly unknown; Agent-wide meaning files are not rewritten.

**Executable protection:** `tests/runtime.test.ts` verifies Presence-scoped storage, empty-field behavior, mode isolation, and protected Soul preservation. `tests/e2e/openpresence.spec.ts` verifies editing, review status, reload persistence, and Chat acknowledgment. A live browser cognition check verifies the selected Ghost profile is reflected in the next response.

**Why QA missed it:** The previous Ghost implementation treated identity as a binary mode without an operator-owned representation profile or an inspectable cognition boundary.

**Apply when:** Adding or changing Ghost mode, operator/organization identity, profile/preferences context, Agent prompt assembly, or identity review UI.

**Added:** 2026-08-12

## Rule: Navigation labels must distinguish destinations from state controls

**Defect class:** Information architecture / state semantics

**General principle:** A navigation label should describe the destination’s purpose, while buttons should describe the state transition they perform. Avoid using the same word for a page and an action/status concept when it creates ambiguity.

**Project-specific risk:** “Live” was both the sidebar destination and a state label, while Settings exposed “Resume Presence”; users could not tell whether these were duplicate controls or different views.

**Learned from:** Human-reported Presence settings and Live screenshots on 2026-08-12.

**Project enforcement:** The `live` view is presented as “Activity” in navigation and the topbar; the Activity page retains “live/paused” as Presence state, and Settings retains Pause/Resume as the state-changing control.

**Executable protection:** `tests/e2e/openpresence.spec.ts`, `tests/e2e/x-connection.spec.ts`, and `tests/e2e/small-desktop.spec.ts` navigate through the Activity label and verify the state lifecycle.

**Apply when:** Renaming navigation, changing page purpose, adding state controls, or revising status language.

## Rule: Workspace content must fill the usable app column

**Defect class:** Responsive layout / flex sizing

**General principle:** A flex child with auto margins must declare its intended width; otherwise the browser may shrink it to its content size and create unexplained whitespace around the primary task.

**Project-specific risk:** The main OpenPresence pages rendered as a narrow centered column even on wide desktop screens, leaving the left and right sides of the workspace unused.

**Learned from:** Human-reported desktop screenshots showing excessive whitespace around Live, Calendar, Settings, Chat, and Manage Agent on 2026-08-12.

**Project enforcement:** `.workspace-content` uses an explicit responsive width, bounded maximum, and border-box sizing so page layouts receive the full usable workspace column; mobile retains its existing 20px gutters.

**Executable protection:** `tests/e2e/small-desktop.spec.ts` verifies every primary page aligns the content frame with the workspace edges without horizontal overflow.

**Apply when:** Changing shell sizing, page gutters, responsive breakpoints, or any flex/grid layout that owns the primary workspace.

## Rule: Only Chat owns a locked viewport

**Defect class:** Responsive layout / scroll ownership

**General principle:** A fixed composer or internal transcript scroll must not impose `overflow: hidden` on unrelated pages. Scroll ownership should be scoped to the surface that needs it; long settings and planning pages must retain normal document scrolling.

**Project-specific risk:** The shell’s Chat viewport rule was applied to every page, clipping the lower Presence settings capability rows and preventing page scrolling.

**Learned from:** Human-reported Presence settings screenshots where vertical scrolling was unavailable on 2026-08-12.

**Project enforcement:** `workspace-chat` receives the locked viewport and internal Chat history scroll; non-Chat `.workspace` and `.workspace-content` retain visible overflow and natural document height.

**Executable protection:** `tests/e2e/small-desktop.spec.ts` verifies Settings creates document scroll and visible workspace overflow; existing Chat tests verify transcript-only scrolling and no document overflow.

**Apply when:** Changing the shell, Chat composer, page scrolling, responsive viewport sizing, or adding long settings/planning content.

## Rule: Native channel credentials must be Presence-scoped and usable

**Defect class:** Integration architecture / secret handling / dead-end configuration

**General principle:** A channel connection is different from an Agent model provider. Official channel credentials belong to the specific Presence, must be encrypted at rest, must be tested before activation, and must produce a real connector path for the capabilities the credential grants.

**Project-specific enforcement:** X uses the Official X API section in Presence settings, stores raw credentials only in the encrypted `channel_credentials` table, exposes read-only versus read-write access from the tested account context, and routes native post delivery through `/api/state` and the execution ledger. Bridges remain a separate fallback connector.

**Executable protection:** `tests/x-connection.test.ts` verifies encrypted storage, no raw secret in API state, read-only/read-write detection, OAuth 1.0a signing, disconnect cleanup, provider-vault storage, and native delivery. `tests/e2e/x-connection.spec.ts` verifies desktop/mobile test → save → reload persistence and a native X publication without creating a Bridge.

**Why QA missed it:** The previous implementation presented provider configuration as if it stored usable credentials and treated a generic Bridge as the only live channel path; no test exercised a real channel credential lifecycle.

**Apply when:** Adding or changing channel connectors, OAuth/API credential forms, secret storage, provider access, or external execution paths.

**Added:** 2026-08-12

## Rule: Revoked Bridge credentials must be identifiable and removable

**Defect class:** Credential lifecycle / stale connector record

**General principle:** Revocation must invalidate the secret while leaving enough redacted metadata for an operator to identify the affected credential; a disconnected connector should not become an undeletable tombstone.

**Project-specific enforcement:** Bridge settings show only the credential prefix and revocation time when that audit record exists, explicitly state that the secret value is not recoverable, and offer Remove Bridge only after disconnection. Removal deletes the credential-vault row and Bridge/sync projection, preserves mirror history, records a removal event, and does not restore authentication. Legacy rows without a surviving credential record are labeled honestly as metadata-unavailable.

**Executable protection:** `tests/runtime.test.ts` covers metadata hydration, secret non-recovery, vault deletion, and audit state; `tests/e2e/openpresence.spec.ts` covers the visible prefix, removal action, and post-removal UI.

**Apply when:** Changing Bridge revocation, credential rotation, connector cleanup, audit events, or external adapter onboarding.

**Added:** 2026-08-12

## Rule: External credential failures must explain the next action

**Defect class:** Third-party integration error handling / misleading toast

**General principle:** External API failures should preserve the provider’s meaning while translating it into a safe, actionable product message; expected provider rejection should not look like an unhandled application crash.

**Project-specific enforcement:** `lib/x.ts` maps exhausted credits, invalid credentials, permissions, and rate limits to user-facing guidance; `/api/x/manage` logs expected rejections without a stack trace. The X form links directly to the Developer Console and explains where Access Token and Secret come from.

**Executable protection:** `tests/x-connection.test.ts` stubs a 402 `credits depleted` response and asserts the returned message names the X credit balance and next action. `tests/e2e/x-connection.spec.ts` asserts the normalized credential fields have equal rendered widths on desktop and mobile.

**Why QA missed it:** The previous QA path only used the local X mock, so it covered success but not a real provider rejection or the resulting visual form state.

**Apply when:** Handling OAuth/API failures, billing/rate limits, permission errors, or adding credential forms for external providers.

**Added:** 2026-08-12

## Rule: Dialogs must center within their intended interaction surface

**Defect class:** Modal layout / visual alignment

**General principle:** A dialog should center within the interaction surface it belongs to. Full-viewport flows must center against the viewport and cover it completely; dialogs intentionally constrained to a page workspace may center within that workspace.

**Project-specific risk:** Add Presence was previously offset by the workspace sidebar, leaving the navigation outside the scrim and making the popup appear off-center in the full application window.

**Project enforcement:** Add Presence uses the scoped `.add-presence-modal-backdrop` class with full fixed insets and viewport centering at every responsive breakpoint.

**Executable protection:** `tests/e2e/presence-modal.spec.ts` measures the backdrop against the viewport and the dialog against the viewport center at desktop and mobile sizes.

**Why QA missed it:** Existing Add Presence coverage compared the dialog to the workspace surface, so it did not protect the intended full-viewport scrim contract.

**Apply when:** Adding or changing dialogs, modal backdrops, shell navigation widths, or responsive layout rules.

**Added:** 2026-08-12
**Updated:** 2026-08-13

## Rule: Wake and pulse actions must follow Presence lifecycle state

**Defect class:** State / UX contradiction

**General principle:** Lifecycle controls should match the operator's mental model: waking a Presence starts its operation and first attention cycle; checking now is only an on-demand cycle for an already-live Presence.

**Project-specific risk:** Live previously said “Jenny is live” while the Presence was paused, and `Resume Presence` sat beside a disabled `Run one pulse`, requiring the operator to understand two runtime primitives before Jenny would do anything.

**Learned from:** Production Chrome exploratory review on 2026-08-12.

**Why QA missed it:** The first walkthrough verified pause controls and the paused badge but did not exercise the complete paused → wake → first attention cycle or inspect the duplicate action language across Activity and Presence settings.

**Project enforcement:** Paused Activity and Presence settings expose `Wake up Jenny`, which applies the `wakePresence` operation and immediately evaluates one cycle; live Activity exposes `Check now` and `Pause`. Paused copy says “asleep” and no longer exposes `Resume Presence` or `Run one pulse`.

**Executable protection:** `tests/runtime.test.ts` verifies paused pulses remain inert and `wakePresence` restores live state plus a no-op attention cycle. `tests/e2e/openpresence.spec.ts` verifies asleep copy, action de-duplication, wake transition, wake event, pulse completion, and live settings controls.

**Apply when:** Adding or changing lifecycle states or control-plane actions.

**Added:** 2026-08-12

## Rule: Enabled skills must remain editable instruction prompts

**Defect class:** Configuration discoverability / AI behavior authoring

**General principle:** A reusable AI behavior is only useful when its operator can revisit both its name and the instruction prompt that defines it; status text alone is not an actionable control.

**Project enforcement:** Brain exposes an Edit action for every installed skill, labels the description as an instruction prompt, and persists edits without replacing the AgentSkill binding or enabled state.

**Executable protection:** `tests/e2e/openpresence.spec.ts` creates a skill, opens Edit, verifies the prompt value, saves a revised prompt, and verifies the updated copy; `tests/runtime.test.ts` verifies the skill binding remains enabled after `editSkill`.

**Why QA missed it:** The first Brain acceptance test verified skill creation and the Enabled summary but never attempted to revisit or change the behavior prompt.

**Added:** 2026-08-12

## Rule: Calendar needs both an editing surface and a visual rhythm surface

**Defect class:** Planning visibility / missing representation

**General principle:** Scheduled work should be understandable as both editable records and spatial time-based rhythm; the visual view must represent schedule timing without inventing downstream content.

**Project enforcement:** Calendar keeps List as the intent editor and exposes Week as a Monday–Sunday hourly grid. Week cards derive only from `CalendarSlot.day`, `time`, `executionWindow`, `objective`, and Presence scope; clicking a card reuses the existing edit flow.

**Executable protection:** `tests/e2e/calendar-week.spec.ts` creates a standing intent, switches to Week, verifies the timed intent card and non-publishing copy, then returns to List.

**Why QA missed it:** Calendar was tested as a CRUD list and execution trigger, but not as a planning visualization; the user had to mentally reconstruct the weekly rhythm from rows.

**Added:** 2026-08-12

## Rule: Sidebar hierarchy must make Agent and Presence scopes explicit

**Defect class:** Information architecture / scope selection

**General principle:** Profile-like workspaces belong in an account-style switcher, while the current workspace’s channels belong in a dedicated selector; repeating every record inline creates ambiguous hierarchy and weakens scanability.

**Project enforcement:** `AgentSwitcher` renders only in `.sidebar-footer`; `PresenceSwitcher` is the only desktop Presence control in the sidebar and selects through `selectPresence`; the mobile topbar keeps compact access because the desktop footer is hidden at the mobile breakpoint.

**Executable protection:** `tests/e2e/sidebar-hierarchy.spec.ts` verifies the Presence dropdown selection flow, absence of the old inline Presence tree, and Agent dropdown placement in the sidebar footer.

**Selector readability:** The active Presence card shows the channel label once, keeps the Presence identity and ownership mode on single lines, and truncates long custom channel names instead of expanding the sidebar.

**Why QA missed it:** Earlier browser checks verified that Agent and Presence records existed, but not that the two selectors communicated the User → Agent → Presence hierarchy or that Agent switching felt account-like.

**Added:** 2026-08-12

## Rule: Small desktop must prioritize the current task above page chrome

**Defect class:** Responsive visual hierarchy / information density

**General principle:** A desktop application in a constrained window is not mobile; preserve desktop navigation while reducing header chrome, gutters, and secondary panel width so the primary task remains visible above the fold.

**Project-specific risk:** Generous page headers and fixed side panels caused Chat, Calendar, Brain, and Presence settings to spend the first viewport on context instead of the action the returning operator came to perform.

**Project enforcement:** The small-desktop media contract applies only from 681px upward; `tests/e2e/small-desktop.spec.ts` runs the primary pages at 1024×720, asserts no horizontal overflow, asserts compact header geometry, and verifies Calendar/Chat primary actions remain visible.

**Why QA missed it:** The previous responsive matrix covered mobile and a wide desktop viewport, but not a narrow desktop window where the desktop grid becomes content-starved.

**Added:** 2026-08-12

## Rule: Navigation and local runtime status are persistent shell concerns

**Defect class:** Layout / workflow reachability

**General principle:** The shell must keep primary navigation and runtime identity available while page content scrolls.

**Project-specific risk:** A scrolling sidebar hid the Local runtime indicator and made long pages feel disconnected from the control plane.

**Project enforcement:** The desktop sidebar uses sticky positioning and the topbar repeats `Local runtime · SQLite`; the desktop E2E test asserts both.

**Added:** 2026-08-12

## Rule: Standing Intents must contain executable instructions

**Defect class:** Data integrity / ambiguous control

**General principle:** A schedule label is not an instruction. Every Run action must be explainable from persisted intent data.

**Project enforcement:** Calendar persists `instruction`, `objective`, and `executionWindow`; runtime tests assert the instruction and expiration metadata, and Playwright runs the intent through Live.

**Added:** 2026-08-12

## Rule: Presence settings are generated from channel-native capabilities

**Defect class:** Architecture / misleading configuration

**General principle:** One agent can have multiple Presences, and each channel owns its capability vocabulary.

**Project enforcement:** `CHANNEL_CAPABILITIES` drives the settings UI and runtime execution map; the unit suite verifies LinkedIn does not inherit X-only capabilities.

**Added:** 2026-08-12

## Rule: Chat is one persistent Agent conversation

**Defect class:** Information architecture / misplaced state

**General principle:** Chat is the single persistent conversation for shaping an Agent; conversation history, New conversation, and model selection do not compete with that surface.

**Project enforcement:** The active Chat surface renders no conversation list, New conversation control, or model selector, while the transcript persists across reloads.

**Added:** 2026-08-12

## Rule: Chat context and changes use a real right sidebar

**Defect class:** Information architecture / misplaced state

**General principle:** Conversation configuration should remain inspectable without competing with the transcript; blank-state prompts belong in the canvas, Agent runtime choice in Brain, and context/changes on the right.

**Project enforcement:** `ContextChatView` renders a persistent `Context & Changes sidebar` with Scope, Context, Changes, Outputs, and Advanced sections. Its toggle exposes `Hide context sidebar` / `Show context sidebar`, while the legacy floating `Try saying` panel is not rendered by the active Chat surface.

**Executable protection:** Playwright asserts the right sidebar, its sections, collapse toggle, absence of the conversation list/model/New conversation controls, and absence of the old `Try saying` panel.

**Learned from:** Human-reported Chat screenshot issue, 2026-08-12.

## Rule: Agent switching is a real workspace boundary

**Defect class:** Information architecture / state isolation

**General principle:** A profile-like identity switcher must enumerate the available records, and switching must atomically change every record owned by that workspace rather than only changing the visible name.

**Project-specific risk:** Agent, Brain, conversations, Presences, planning, activity, and runtime settings must move together when the operator changes Agent.

**Project enforcement:** `OpenPresenceState.agents`, `activeAgentId`, and `agentWorkspaces` back `AgentSwitcher`; `createAdditionalAgent` and `selectAgent` snapshot and restore complete Agent-owned workspaces.

**Executable protection:** `tests/runtime.test.ts` verifies isolated messages and Presences; `tests/e2e/openpresence.spec.ts` creates Atlas, switches Jenny → Atlas → Jenny, and checks Brain/model state.

**Why QA missed it:** The previous audit verified a current-Agent control but did not create a second Agent and revisit the first workspace.

**Added:** 2026-08-12

## Rule: Agent configuration belongs in Brain, not Chat

**Defect class:** Information architecture / misplaced control

**General principle:** Agent-owned model/runtime choices belong with the Agent’s Brain; Chat should remain one persistent conversation surface.

**Project enforcement:** Brain owns provider-grouped model runtime choices and Chat exposes neither model selection nor conversation creation/history controls.

**Executable protection:** Playwright asserts model persistence in Brain and absence of the old Chat controls; the runtime suite verifies provider and quality selection.

**Added:** 2026-08-12

## Rule: Calendar scope comes from the sidebar and intents remain editable

**Defect class:** Information architecture / missing affordance

**General principle:** A Presence is selected once in the sidebar; Calendar must use that scope and expose direct edit actions for every standing intent.

**Project enforcement:** Calendar filters by `activePresenceId`, does not render a second Presence selector, writes new intents to the selected Presence, and offers Edit → Save changes for existing intents.

**Executable protection:** Playwright asserts both Calendar Presence controls are absent, creates an intent, edits it, and verifies the edited instruction persists; runtime tests verify the schedule and Presence remain aligned.

**Why QA missed it:** The earlier Calendar test only covered add and run, so a user could create an intent but had no way to correct it or understand which sidebar Presence owned it.

**Added:** 2026-08-12

## Rule: Summary counts must lead to an executable configuration path

**Defect class:** Product dead end / missing CTA

**General principle:** Brain summaries such as installed skills and provider setup state are only trustworthy when the operator can complete the next action from the same surface.

**Project enforcement:** Brain exposes Create skill, Set up OpenAI, and Set up Ollama actions; creation binds the skill to the current Agent, and provider setup records readiness without persisting a secret.

**Executable protection:** Playwright creates a skill and configures OpenAI; runtime tests verify enabled skill binding and local Ollama connection state.

**Why QA missed it:** The previous check asserted only summary copy (`installed`, `Needs setup`) and never followed the operator path to completion.

**Added:** 2026-08-12

## Rule: Scope must follow the Agent → Presence object model

**Defect class:** Information architecture / cross-Presence leakage

**General principle:** Agent-level cognition and conversations must remain stable while daily execution and activity stay scoped to the selected Presence. Agent management is an infrequent Agent-level task; Live and Calendar are daily Presence work.

**Project-specific risk:** The shell made Brain, Chat, Live, and Calendar appear to share one ambiguous scope; Chat history was a temporary right drawer; Calendar silently inherited the active Presence; and Live defaulted to an Agent-wide stream with a second Presence filter.

**Project enforcement:** Manage Agent owns Brain, runtime, skills, and provider settings; Chat remains one Agent-wide conversation; Calendar and Live follow the sidebar-selected Presence; Live does not expose an All Presences filter; Presence settings is reached from the Presence dropdown.

**Executable protection:** `tests/e2e/openpresence.spec.ts` and `tests/e2e/small-desktop.spec.ts` verify the revised navigation, explicit Calendar Presence selection, Brain file list, and constrained desktop shell.

**Why QA missed it:** Previous checks verified that Presence switching worked, but not that agent-level surfaces remained conceptually and visually stable after switching.

**Added:** 2026-08-12

## Rule: Product language must not expose implementation scaffolding

**Defect class:** Trust / product polish

**General principle:** Simulation, raw IDs, fake precision, and architecture terms belong in developer diagnostics, not the everyday operator workflow.

**Project-specific risk:** The UI showed “simulated locally,” external object IDs, “Outcome observed,” universal account-health percentages, and permanent architecture notes.

**Project enforcement:** Add Presence uses channel names without simulation labels; Live uses Healthy/Elevated state language; Mirror cards render social objects without raw IDs; execution copy uses user-facing outcomes; runtime status is not persistent page chrome.

**Executable protection:** Browser QA scans visible route text for simulation labels and percentage health output while exercising Add Presence, Live, and Presence settings.

**Added:** 2026-08-12

## Rule: Social Mirror onboarding must explain scope and connection use

**Defect class:** Integration onboarding / unclear state

**General principle:** A read-only integration surface must say what data it provides, which object owns it, and how an operator connects or disconnects it; a credential without its endpoint and lifecycle is not usable onboarding.

**Project-specific enforcement:** Live labels Social Mirror as inbound, read-only context for a connected Presence. Built-in simulated channels explain that no Bridge is required for local activity; custom channels explain that a Bridge is required. Bridge setup shows the Events and Execution endpoints, the Bearer-key usage, and that the key belongs to an external adapter rather than an Agent model. Disconnect revokes the credential, renders the Bridge as Disconnected, removes the Disconnect action, and rejects further authenticated requests.

**Executable protection:** `tests/e2e/openpresence.spec.ts` verifies the Bridge setup explanation and endpoints, ingests a Mirror event, disconnects the Bridge, verifies the disconnected UI, and asserts the revoked key receives HTTP 401.

**Why QA missed it:** The previous Bridge test verified that a key could authenticate API requests, but not that an operator understood what the key was for, where to send requests, or what a post-disconnect state looked like.

**Added:** 2026-08-12

## Rule: Cognition must not receive embodiment state

**Defect class:** Architecture / trust boundary

**General principle:** Operator-owned queues, approvals, retries, rate limits, and provider transport details must remain below the agent cognition boundary.

**Project enforcement:** `compilePresenceContext()` is the only Presence projection passed to cognition; `tests/runtime.test.ts` serializes it and rejects infrastructure-shaped fields.

**Executable protection:** `tests/runtime.test.ts` — “keeps operator embodiment out of the cognition-safe PresenceContext”.

**Apply when:** Adding model/runtime context, tools, provider bindings, or Presence settings.

**Added:** 2026-08-12

## Rule: Social Intent, Execution, and Outcome have separate lifecycles

**Defect class:** Data integrity / attribution

**General principle:** A social decision can exist without an execution, and an execution can be pending or expired without rewriting the decision.

**Project enforcement:** `lib/runtime.ts` creates separate records and `tests/runtime.test.ts` covers review approval plus expired-intent refusal.

**Executable protection:** `tests/runtime.test.ts` — review execution remains separate until approval; expired Social Intent cannot execute.

**Apply when:** Changing Calendar, Live, queue, review, simulated channel, or Growth attribution behavior.

**Added:** 2026-08-12

## Rule: Runtime status and decision summaries must be backed by state

**Defect class:** Fake UI / misleading runtime truth

**General principle:** A visible status, score, or decision summary must derive from the authoritative runtime record or be clearly labeled as an unavailable/illustrative state; polished sample copy is not product behavior.

**Project-specific risk:** Live previously rendered a fixed decision score and sample reply even when the selected Presence had no activity, and the Chat sidebar called installed/available bindings “used.”

**Learned from:** End-to-end functional reality audit on 2026-08-12.

**Why QA missed it:** Existing checks asserted that Live rendered and that the sidebar sections existed, but did not compare the rendered values against a blank persisted state.

**Project enforcement:** `LiveView` derives the Decision stream from selected-Presence `LiveEvent` records; `ContextSidebar` labels counts as available until invocation provenance exists.

**Executable protection:** `tests/e2e/openpresence.spec.ts` asserts a fresh/run Calendar flow contains the real event and no fixed `0.94` or sample reply; runtime/browser audit checks blank Live state.

**Apply when:** Adding metrics, summaries, status badges, empty states, or sidebar provenance.

**Added:** 2026-08-12

## Rule: Operator execution modes require a reachable lifecycle

**Defect class:** Workflow completeness / execution control

**General principle:** A configuration mode is not functional until the operator can observe its resulting state and complete the supported lifecycle from the operational surface.

**Project-specific risk:** Review and Manual existed in the runtime union, but the Presence matrix omitted Manual and Live exposed no execute-approved or mark-posted path.

**Learned from:** End-to-end functional reality audit on 2026-08-12.

**Why QA missed it:** Settings coverage verified mode changes only by inspecting the matrix and did not run a mode through Live to its completion state.

**Project enforcement:** Presence Settings renders Off/Manual/Review/Auto; `ExecutionLedger` handles approval, approved execution, and manual external-reference completion; runtime keeps Social Intent, Execution, and Outcome separate.

**Executable protection:** `tests/e2e/openpresence.spec.ts` runs review and manual lifecycles on Chromium and mobile; `tests/runtime.test.ts` covers review separation and Bridge completion.

**Apply when:** Changing execution envelopes, review queues, manual relay, Bridge delivery, or Live activity.

**Added:** 2026-08-12

## Rule: Chat must reveal the newest exchange after state changes

**Defect class:** Chat UX / scroll state

**General principle:** A conversational surface should open at the latest exchange and keep the latest user/Agent response visible after new content arrives. The composer remains outside the transcript’s scroll container.

**Project-specific risk:** The transcript began at its historical top, leaving new Ollama responses below the fold despite the composer being visible.

**Learned from:** Human-reported ChatGPT-style scrolling request on 2026-08-12.

**Project enforcement:** `ContextChatView` scrolls a bottom sentinel into view whenever the active conversation or message count changes; `.chat-history` remains the sole scroll owner.

**Executable protection:** `tests/e2e/openpresence.spec.ts` asserts the transcript scroll gap, composer placement, and no page-level overflow for desktop and mobile.

**Apply when:** Changing conversation rendering, streaming/response updates, composer placement, or viewport sizing.

## Rule: Provider model choices must come from the provider’s capabilities

**Defect class:** AI runtime configuration / false availability

**General principle:** A model picker must represent what the configured provider can actually run. Friendly labels may be used for discovery, but the persisted runtime value must be the provider’s exact identifier; unsupported capability classes must not be presented as valid choices.

**Project-specific risk:** Brain exposed only three hard-coded Ollama names and omitted installed models. It also offered an image-only model to a text Chat surface.

**Learned from:** Human-reported Ollama model catalog screenshot on 2026-08-12.

**Project enforcement:** `/api/ollama/models` reads the connected Ollama catalog; Brain displays completion-capable models and persists their exact tags; Chat resolves friendly base names against that catalog before inference.

**Executable protection:** `tests/x-connection.test.ts` verifies catalog filtering and tag resolution; `tests/e2e/openpresence.spec.ts` verifies model discovery through the visible Brain workflow.

**Apply when:** Adding provider/model selectors, supporting new Ollama capabilities, or changing runtime dispatch.

## Rule: Local model selectors must resolve against the installed model catalog

**Defect class:** Local AI runtime / responsive interaction

**General principle:** A friendly model selector may use a stable base name, but the runtime must resolve it against the provider’s actual installed identifiers before inference. Provider-specific errors must identify the missing model and available next actions.

**Project-specific risk:** The selector sent `qwen2.5` while Ollama had `qwen2.5:7b-instruct`, producing repeated 404 responses. Chat also allowed the page itself to grow instead of reserving the viewport for the composer.

**Learned from:** Human-reported Ollama error and Chat layout screenshots on 2026-08-12.

**Project enforcement:** `lib/ai.ts` reads `/api/tags`, resolves exact or base-tag matches, and reports the installed catalog when no match exists. The Chat viewport uses a bounded workspace and gives scroll ownership to `.chat-history`.

**Executable protection:** `tests/x-connection.test.ts` verifies tag resolution; `tests/e2e/openpresence.spec.ts` verifies transcript-only scrolling, composer placement, and no document overflow at desktop and mobile sizes.

**Apply when:** Changing Ollama integration, model selectors, chat viewport sizing, or composer placement.

## Rule: Agent chat must use the configured runtime or explain why it cannot

**Defect class:** AI integration / false-success UX

**General principle:** A conversational surface must not return a canned success response when no model request occurred. The selected provider and model must be invoked server-side, while missing credentials or unreachable local runtimes must produce actionable guidance.

**Project-specific risk:** Chat displayed the selected Brain model but `sendMessage` returned a deterministic placeholder, making the app appear AI-enabled without using AI.

**Learned from:** Human-reported chat screenshot on 2026-08-12.

**Project enforcement:** `app/api/state/route.ts` sends `sendMessage` through `lib/ai.ts`; provider secrets are read only from the encrypted vault, and failures are written as explicit setup/runtime guidance.

**Executable protection:** `tests/x-connection.test.ts` asserts the provider request, authorization boundary, model mapping, generated reply, and missing-provider behavior; `tests/e2e/openpresence.spec.ts` asserts a browser-visible runtime reply.

**Apply when:** Changing Chat, Brain model selection, provider connections, or AI request adapters.

## Rule: Live Presence state must override stale conversation history

**Defect class:** Agent cognition / state synchronization

**General principle:** Changes made in Presence settings are durable runtime state, not merely UI state. The next Agent response must use the live snapshot at request time even if an older message says something different.

**Project-specific risk:** An Agent-owned Presence still answered that it was in Ghost mode because the transcript contained stale Ghost replies and the AI prompt did not define a precedence rule.

**Learned from:** Human-reported Ghost → Agent-owned change not being recognized in Chat on 2026-08-12.

**Project enforcement:** `app/api/state/route.ts` writes a visible acknowledgment for Presence setting changes, and `lib/ai.ts` includes an authoritative live Presence snapshot that explicitly overrides contradictory transcript history.

**Executable protection:** `tests/x-connection.test.ts` verifies both the visible mode-change acknowledgment and the authoritative mode sent to the provider.

**Apply when:** Changing Presence settings, Chat context construction, runtime prompt assembly, or persisted conversation state.

## Rule: Bridge mirror deletion and acknowledgement identity must be explicit

**Defect class:** Integration data integrity

**General principle:** External deletion events must archive the durable mirror object, and idempotent acknowledgements must compare the complete external identity, not just a convenient identifier.

**Project-specific risk:** Deleted Mirror objects were rewritten as active, and a conflicting ACK with the same external ID but a different type could be accepted.

**Learned from:** End-to-end functional reality audit on 2026-08-12.

**Project enforcement:** `ingestEvents` passes deletion state into `upsertObject`; `acknowledgeExecution` compares `externalRef.type` and `externalRef.id`.

**Executable protection:** `tests/runtime.test.ts` verifies archive behavior and rejects a conflicting type on a repeated acknowledgement.

**Apply when:** Changing Mirror ingestion, reconciliation, external references, or Bridge delivery acknowledgements.

**Added:** 2026-08-12

## Rule: API clients must validate response shape before parsing JSON

**Defect class:** Error handling / malformed response

**General principle:** A client must turn an unexpected content type or error payload into an actionable application error rather than leaking parser internals such as `Unexpected token '<'`.

**Project-specific risk:** The state and Bridge mutation helpers call `readJsonResponse` before reading payload fields; non-JSON responses now produce a bounded local-service error.

**Learned from:** Human-reported Settings/dropdown bug on 2026-08-12.

**Why QA missed it:** The happy path only exercised JSON API responses and did not force an HTML/error response.

**Project enforcement:** `app/page.tsx` uses `readJsonResponse` for state and Bridge mutations; route errors remain JSON responses with actionable error messages.

**Executable protection:** `tests/e2e/openpresence.spec.ts` exercises state and Bridge failure paths through the visible error surface; malformed API-response injection remains a recommended browser network test.

**Apply when:** Adding fetch calls, API routes, navigation fallbacks, or error/loading handling.

**Added:** 2026-08-12

## Rule: Social Mirror status must describe observed social reality, not connector readiness

**Defect class:** Social Mirror architecture / truthful state

**General principle:** A connected channel and an observed Mirror are different facts. After a successful reconciliation, the UI must show `Up to date` even when the observed world is empty; it must never leave the user at “waiting for observations” as if the Mirror were an on-demand input buffer.

**Project-specific risk:** Native X credentials could be connected while no Mirror objects, freshness, counts, or next observation were persisted. Activity and the Mirror panel therefore implied that nothing had been observed until an operator ran a Pulse.

**Learned from:** Human-reported Social Mirror review on 2026-08-13 and the attached OpenPresence architecture guidance.

**Project enforcement:** Native X reconciliation runs when credentials are saved and through the local connector observer. It persists Mirror objects, public footing, observation health, freshness, counts, and the next observation time without invoking cognition. Pulse consumes that Mirror; it does not own channel reads.

**Executable protection:** `tests/x-connection.test.ts` covers the native connection path and mock reconciliation; `tests/e2e/x-connection.spec.ts` asserts the connected empty Mirror is presented as up to date and that the old waiting copy is absent.

**Apply when:** Changing native X reads, Bridge reconciliation, Mirror panels, Activity status, connector health, or Pulse behavior.

**Added:** 2026-08-13

## Rule: Presence Settings must introduce identity before destination

**Defect class:** Settings information hierarchy / responsive layout

**General principle:** Users should establish who the Presence is before deciding where it appears. Product hierarchy should reflect `User → Agent → Presence`, then channel and execution configuration.

**Project-specific risk:** Showing Channel & environment before Identity made the user choose a route before understanding the Presence identity and pushed the editable name and Agent-owned/Ghost choice below the fold.

**Project enforcement:** `.presence-settings-page` orders Identity and Ghost profile before `.channel-settings-card`, with the execution envelope after both.

**Executable protection:** `tests/e2e/openpresence.spec.ts` compares the rendered bounding boxes of `.identity-card` and `.channel-settings-card` on Chromium and Pixel 5, then exercises the route controls.

**Apply when:** Reordering Presence Settings, adding Presence identity fields, or changing the channel/environment configuration surface.

**Added:** 2026-08-13

## Rule: Presence surfaces must not borrow Agent identity or handles

**Defect class:** Product hierarchy / Presence naming

**General principle:** A Presence feature should speak about the selected social incarnation, while Agent identity belongs in Agent workspace surfaces. Handles are channel/account identity, not the default label for Presence operations.

**Project-specific risk:** Activity and Calendar mixed `Jenny`, `Genny`, and `@jenny_ai`, making it unclear which identity the user was configuring and exposing a handle without a clear edit path.

**Project enforcement:** Live Activity and Calendar derive copy from the selected Presence name; Activity omits the Agent management link; channel connection screens retain handles only where X authentication requires account identity.

**Executable protection:** `tests/e2e/openpresence.spec.ts` renames the Presence to Genny and verifies Activity/Calendar copy, absence of `@jenny_ai`, and absence of “Manage Jenny” on Chromium and Pixel 5. X connection suites protect the separate connector identity flow.

**Apply when:** Changing Activity, Calendar, Social Mirror summaries, Presence navigation, or channel connection identity copy.

**Added:** 2026-08-13

## Rule: Public Self must remain separate from Agent identity and implementation

**Defect class:** Identity boundary / privacy / social cognition

**General principle:** The Agent is the private mind, the Presence Public Self is who speaks here, and implementation is not social identity.

**Project-specific risk:** A Ghost could answer as the private Agent or volunteer provider, model, prompt, credential, or infrastructure details simply because the runtime knew them.

**Project enforcement:** `Presence.publicSelf` stores Presence-scoped posture and approved facts; `PRESENCE.md` and the AI context describe that boundary; Ghost publication drafts are held for review when they cross it.

**Executable protection:** `tests/identity-boundary.test.ts` covers default postures, persistence, approved facts, and Ghost review gating. `tests/e2e/openpresence.spec.ts` covers settings persistence on Chromium and Pixel 5.

**Apply when:** Changing Presence identity, Ghost behavior, public disclosure, provider/model context, social prompts, or publication review.

**Added:** 2026-08-13

## Rule: Calendar is verified public history; Schedule is future permission

**Defect class:** Product-model ambiguity / false historical record

**General principle:** A historical calendar must describe what entered the public world, not what an Agent intended, considered, drafted, or was asked to consider later. Future Standing Intents belong on a separately named Schedule surface.

**Project-specific risk:** The old Calendar mixed future permission with public history, making drafts and planned activity look like publications and forcing the operator to infer behavioral rhythm from an intent list.

**Project enforcement:** `derivePublicHistory` admits only public Mirror objects authored by the selected Presence or successful Executions with an external reference. `app/page.tsx` renders that projection in Calendar with Week/Month/Day views and filters; the former `CalendarView` is now `ScheduleView`, and all Standing Intent CRUD/evaluation remains there.

**Executable protection:** `tests/runtime.test.ts` verifies pending/private records are excluded while a successful externally evidenced publication is included. `tests/e2e/calendar-history.spec.ts` verifies the fresh Calendar empty state, Week/Month/Day browsing, and the separate Schedule surface; `tests/e2e/calendar-week.spec.ts` and `tests/e2e/openpresence.spec.ts` exercise Schedule intent creation, editing, and evaluation.

**Apply when:** Changing Calendar, Schedule, Standing Intent, publication history, Social Mirror projections, outcome metrics, or Presence navigation.

**Added:** 2026-08-13
## Rule: Browser QA must verify the active local build and origin

**Defect class:** Stale browser bundle / multiple local development servers

**General principle:** A user-facing browser feature is not verified by API success or a headless run alone. The test must exercise the same browser surface the user is using, confirm the active origin and current client bundle, and prove the user journey from navigation to persisted result.

**Incident:** Chrome was pointed at an older local app tab on `localhost:3001`, which still rendered the pre-Watching navigation while the current implementation was available on another local server. The current API accepted the Watch mutation, but the stale browser could not expose the feature.

**Project enforcement:** Watching QA starts one known local server, opens a fresh Chrome tab, confirms the `Watching` navigation item, and completes create → reload → remove. When multiple local servers exist, record the exact origin under test and do not treat a different port as equivalent evidence.

**Executable protection:** `tests/e2e/watching.spec.ts` covers the complete creator persistence/removal journey and topic/opportunity boundary on Chromium and Pixel 5; Chrome acceptance was independently rerun on `localhost:3103` with no console errors and 200 responses through load, create, and delete.

**Apply when:** Adding or changing user-facing navigation, local dev-server routing, browser bundles, cache-sensitive UI, or any feature reported as missing or broken in a real browser.

**Added:** 2026-08-13

## Rule: Watch activation and observation readiness must use separate language

**Defect class:** Watch lifecycle copy / implementation-state leakage

**General principle:** A configured capability and the data it has produced are different states. User-facing status must say whether the capability is active, what evidence is currently available, what it is waiting for, and whether the operator needs to act; never expose an internal “not started” metric as if it were a pending user action.

**Incident:** A green `Watching` pill appeared beside `Performance baseline · Not started`, making an already-started Watch look both active and inactive. “Performance baseline” also implied a metric workflow that the operator could not start or understand.

**Project enforcement:** `WatchingView` renders `Active watch` plus `Waiting for first observation` for automatic creator Watches, and `Manual source` plus `Waiting for source material` for topic/opportunity Watches. The page explains that starting saves the attention instruction and observations appear only when a source supplies evidence; the internal baseline field is not exposed.

**Executable protection:** `tests/e2e/watching.spec.ts` asserts both lifecycle messages and asserts that `Performance baseline`/`Not started` are absent on Chromium and Pixel 5.

**Apply when:** Changing Watching, observation status, source readiness, baselines, metrics, connected-source language, or any UI that combines activation state with collected evidence.

**Added:** 2026-08-14

## Rule: Ghost identity protection must allow public subject matter

**Defect class:** Ghost identity boundary / false-positive content rejection

**General principle:** Identity disclosure protection must block private runtime details without treating ordinary public subject matter as implementation leakage.

**Incident:** An Assignment about building the best AI model repeatedly generated valid posts, but the Ghost filter treated the generic word `model` as forbidden, rewrote every candidate to `no_op`, and left the Assignment at 0/4 with no execution.

**Project enforcement:** `identityLeakageReason` blocks specific provider, exact-model, and runtime-detail phrases, while allowing ordinary discussion of an AI model as the public topic. Assignment candidates must still reach `formSandboxIntent` and verified Sandbox delivery.

**Executable protection:** `tests/runtime.test.ts` covers both permitted public subject matter and blocked private runtime disclosure; the Assignment rehearsal E2E coverage verifies the delegated flow remains usable.

**Apply when:** Changing Ghost boundaries, Assignment candidate QA, public subject-matter posts, or model/provider disclosure rules.

**Added:** 2026-08-13

## Assignment schedule metadata must survive the review handoff

**Incident:** The Schedule Assignment form accepted a day, time, and exact/flexible timing choice, but the `createAssignment` operation discarded those fields. The resulting row falsely collapsed a near-term Assignment to `Once`, leaving the operator unable to verify when it was intended to run.

**Product boundary:** Assignment timing is an operator-provided execution window, not a command to publish regardless of context. The Agent still owns how it fulfills the outcome, and Sandbox verification remains the only source of progress.

**Executable protection:** `Assignment.schedule` is carried through the typed operation, runtime compiler, state route, and Schedule row; the runtime test asserts that exact timing remains attached to the created Assignment.

## Rule: Assignment candidates must be distinct and delivery must be idempotent

**Defect class:** Repeated publication / duplicate execution

**General principle:** An outcome Assignment is not complete when the system has emitted the same draft repeatedly. Candidate quality must reject already-verified text, and retrying a succeeded execution must not create another public object or count progress twice.

**Project enforcement:** Sandbox Assignment cycles compare normalized drafts against that Assignment's verified Mirror publications; `deliverSandboxExecution` returns the existing state for a succeeded execution and refuses statuses that are not ready for delivery.

**Executable protection:** `tests/ai.test.ts` covers structured decision parsing; `tests/sandbox.test.ts` covers exactly-once delivery and asset lineage; `tests/e2e/playground-rehearsal.spec.ts` asserts five distinct delivered posts.

**Apply when:** Changing Assignment generation, retries, execution claiming, delivery, progress counters, or deterministic AI fixtures.

## Rule: Scheduled Assignments belong on the Week calendar with Standing Intents

**Defect class:** Schedule visibility / operator discoverability

**General principle:** A scheduled Assignment is a delegated outcome with a time window. It should be visible in the same weekly planning surface as Standing Intents, while remaining visually distinct because a schedule grants attention and does not guarantee publication.

**Project enforcement:** The Week calendar projects scheduled Assignments, includes the full 00:00–23:00 local-time range, labels them as Assignments, and provides a direct Run/Retry in Playground action. The list remains the detail and cancellation surface.

**Executable protection:** `tests/e2e/playground-rehearsal.spec.ts` asserts a 23:35 Assignment appears as a calendar card and retains its status/timing.

**Apply when:** Changing Schedule, Assignment timing, calendar projection, late-night schedules, or operator actions for draft/blocked work.

## Rule: Sandbox media must survive decision → publication → Mirror → Feed

**Defect class:** Multimodal rehearsal false positive

**General principle:** An asset claim is only useful when the simulated publication stores its asset provenance and the Feed renders the resulting image, chart, GIF, video, or link instead of dropping it at an intermediate layer.

**Project enforcement:** Social decisions carry supported asset metadata; local mock rehearsals use deterministic Sandbox fixtures; publication asset IDs become Mirror asset references; Feed renders local and source URLs without changing the live connector boundary.

**Executable protection:** `tests/sandbox.test.ts` verifies asset lineage; `tests/e2e/playground-rehearsal.spec.ts` verifies the requested five-media set in Feed.

**Apply when:** Changing social decision schemas, asset uploads, Sandbox fixtures, publication storage, Social Mirror projection, or Feed rendering.

## Rule: Assignment quantity must equal Feed quantity, and replies must use current inbound context

**Defect class:** Partial Assignment completion / stale social context

**General principle:** An Assignment that asks for N original publications must either deliver N distinct verified publications or remain visibly incomplete; a reply decision must be grounded in the newest inbound object, not whichever matching phrase appeared earlier in the thread.

**Project enforcement:** Sandbox Assignment work derives a bounded attempt budget from remaining quantity and rejects only verified duplicate drafts. Deterministic reply rehearsal extracts the newest inbound object before selecting a context fixture. Feed is the acceptance surface for successful original publications and includes each verified Sandbox publication exactly once.

**Executable protection:** `tests/e2e/playground-rehearsal.spec.ts` asserts 10/10 delivered and exactly 10 Feed items; `tests/ai.test.ts` asserts distinct context-specific reply decisions; Chrome QA verifies 10 unique replies in the rendered rehearsal.

**Apply when:** Changing Assignment quantity parsing, candidate retry budgets, deterministic AI fixtures, Social Mirror context assembly, or Feed projections.

## Rule: Assignment quantities must ignore incidental numbers

**Defect class:** Quantity parsing / destructive overproduction

**General principle:** Natural-language quantity extraction must prioritize explicit quantity phrases or numbers attached to the requested deliverable, and must not interpret dates, years, URLs, or QA markers as the requested count.

**Project enforcement:** `assignmentQuantity` prioritizes modifiers such as `exactly 1`, then recognizes numbers followed by a bounded deliverable phrase such as `10 original X posts`; review must show the same quantity before rehearsal starts.

**Executable protection:** `tests/runtime.test.ts` asserts that `QA-ONE-2026-08-14 ... exactly 1 ...` and `QA-TEN-2026-08-14 ... exactly 10 ...` compile to 1 and 10 respectively.

**Apply when:** Changing Assignment instruction parsing, review-card quantities, schedule Assignment compilation, or QA-marker/test instructions.

## Rule: Publishing responsibility must remain a visible Agent plan

**Defect class:** Hidden intention / quota-to-post confusion

**General principle:** A non-scheduled Publishing Initiative is an operator-owned expectation that the Agent must turn into a reviewable, Presence-scoped working plan. It is not a list of prewritten posts, a forced quota, or an execution bypass.

**Project enforcement:** Publishing plans persist by Presence and environment, use bounded flexible research/origination/reassessment windows, derive verified progress only from Social Mirror history, and supersede prior revisions on explicit replanning. Schedule and Activity render the same projection; turning the initiative off supersedes the plan.

**Executable protection:** `tests/publishing-plan.test.ts` covers persistence, scoping, revision supersession, and the absence of publications/executions. Browser acceptance verifies Settings activation, Schedule windows, Activity projection, and explicit replanning in an isolated Sandbox database.

**Apply when:** Changing Publishing Initiative settings, plan generation/replanning, Schedule or Activity projections, publication pacing, or any path that could imply a plan guarantees public expression.

## Rule: Publishing Plan progress requires original Social Mirror lineage

**Defect class:** False end-to-end verification / reply counted as original

**General principle:** A visible Publishing Plan window is durable permission to consider original expression, not a post. Progress is valid only after an original Social Intent with Publishing Initiative origin crosses the Execution Envelope, succeeds in the authorized environment, and is verified as an original object by the Social Mirror. Replies, NO_OP, review-waiting, failed delivery, and candidate rejection must remain separately inspectable.

**Project enforcement:** Sandbox virtual-time advancement wakes due plan windows, records bounded work stages, carries `{ planId, planRevision, planWindowId }` through Social Intent, Publication, and Public History provenance, and increments `verifiedOriginals` only from Social Mirror-backed `post` history. Plan diagnostics expose the latest structured outcome and next consideration without exposing hidden model reasoning.

**Executable protection:** `tests/publishing-plan.test.ts` proves the full 9-stage publish path, truthful NO_OP with a later consideration, inbound reply exclusion, and review without progress. `tests/e2e/playground-rehearsal.spec.ts` verifies the operator-facing “Why no original yet?” and next-consideration diagnostics. The isolated E2E database can be selected with `OPENPRESENCE_E2E_DB_PATH` to avoid parallel-session contamination.

**Apply when:** Changing Publishing Plan wake logic, virtual-time workers, Social Intent/Publication provenance, Mirror-to-Feed projection, progress counters, review states, or deterministic Sandbox fixtures.

## Rule: Browser verification must prove the resolved database and pre-reset WAL state

**Defect class:** Parallel-runtime database drift / incomplete recovery

**General principle:** A populated database file is not evidence that the browser is reading it. Every user-facing data verification must prove the server-resolved `OPENPRESENCE_DB_PATH`, the agent/presence scope, and the relevant records through the running API and UI. SQLite recovery must replay the WAL through the last committed pre-reset frame; inspecting only the main file can omit the newest People, Watchlist, Mirror, and publication records.

**Incident:** The Genny UI on port 3006 was reading `data/three-agents-experiment-v4.db` while the recovered People and X history belonged to `data/openpresence.db`. The default database had then been reset to an empty state. The main-file snapshot recovered most history, but the exact final X exchange—including “A backup flounder credential…”—was only present in the pre-reset WAL commit.

**Project enforcement:** Recovery and QA now compare the running API against the intended database path, preserve the original database and WAL, reconstruct the last pre-reset commit into a separate copy, and verify People, Watching, Activity, Feed, and relationship evidence in the browser. Restored inspection runs in test/mock mode so background observation cannot mutate the recovery copy while it is being reviewed.

**Executable protection:** ⚠️ Missing — recommended: add a startup/health assertion that exposes the resolved database identity only in development, plus an isolated Chromium regression that seeds a known Person, Watch, Mirror thread, and publication and asserts those records through the running UI.

**Apply when:** Changing database selection, Next.js startup scripts, parallel dev servers, SQLite WAL handling, recovery tooling, state hydration, or browser acceptance fixtures.

**Added:** 2026-08-15

## Rule: Feed items must display a concise channel tag

**Defect class:** Mixed-channel or mixed-environment provenance ambiguity

**General principle:** A Feed must never merge channel or environment histories. The active Presence selects the only channel/environment that may appear; each visible item also identifies its source surface concisely so a user can verify the boundary.

**Project enforcement:** Feed and calendar projections match both the active Presence channel and environment. Timeline and calendar history cards render `X.com` for live X history and `Sandbox` for sandbox history from the item’s persisted provenance. The UI does not use the ambiguous `Live` label.

**Executable protection:** `tests/runtime.test.ts` asserts that live and Sandbox Presence projections exclude the other environment. Browser verification asserts that restored Genny’s X Feed contains only `X.com` tags, with no Sandbox records. Recommended follow-up: add an isolated E2E fixture that switches the active Presence to Sandbox and asserts only Sandbox history appears.

**Apply when:** Changing Feed/history projections, Presence/channel selection, Social Mirror environment metadata, or any UI that presents public history across environments.

**Added:** 2026-08-15
