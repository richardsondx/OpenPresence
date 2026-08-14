# Dan Klone experiment log

Date: 2026-08-13  
Scope: OpenPresence app UI, in-app Browser, and X Playground sandbox only  
Status: IN_PROGRESS

## Objective

Create a separate Agent named **Dan Klone**, give it a distinct creator-educator voice informed by high-level observations of Dan Koe's public X presence, and run a Playground rehearsal without publishing to live X.

The reference was used for craft characteristics only. The Agent was explicitly instructed not to claim to be Dan Koe, copy phrases or personal history, or reproduce exact posts.

## Feature contract

| Requirement | Observable check | Result |
|---|---|---|
| Separate persistent Agent exists | Agent switcher shows Dan Klone as its own workspace | PASS |
| Sandbox X Presence exists | Playground shows `@dan_klone`, Agent-owned, Sandbox | PASS |
| Style guidance is bounded | Teach prompt names traits and identity boundary | PARTIAL: response succeeded, but no durable change proposal was created |
| Quiet-world judgment is allowed | Original-post rehearsal records silence with rationale | PASS |
| Simulated inbound event can be added | Maya Chen post appears in the simulated feed | PASS after fresh-session recovery |
| No live publication occurs | Playground labels remain Simulated X / Sandbox | PASS |

## What went well

- The requested public X profile opened in the in-app Browser. The visible profile exposed useful high-level signals: concise declarative claims, creator education, strategic-thinking topics, plain language, and strong contrast-driven framing.
- Creating Dan Klone through the app produced a separate persistent mind rather than renaming or contaminating Jenny. The new Agent has its own workspace, handle, Sandbox Presence, and model settings.
- The app's default meaning context already protects judgment, silence, channel limits, and non-impersonation. The setup aligned with the OpenPresence hierarchy of User → Agent → Presence.
- Provider setup stayed inside the app. Anthropic was initially selected but unconnected; the local Ollama connection was configured through the Provider access UI.
- Qwen3 VL returned an empty response, but switching to Qwen 2.5 through the app recovered the Teach flow. The Agent produced a concise, constructive, contrarian-leaning response.
- In a quiet Playground world, both original-post rehearsals chose silence and recorded why. This matches the philosophy that a schedule or rehearsal grants permission to consider acting, not an obligation to publish.
- After returning to a fresh Dan Klone Playground session, Maya Chen's simulated post was persisted, shown in the simulated feed, and judged. Dan Klone recorded a perception pass and chose a truthful no-op because the post did not supply enough concrete evidence for a specific contribution.
- No live X post, like, reply, or external message was sent.

## What went wrong

1. The exact shared tab handle in the prompt was unavailable in the current Browser session. The same public URL had to be opened in a fresh in-app Browser tab.
2. The new Agent defaulted to Anthropic without a connection. The first Teach submission failed with a clear provider-not-connected response and did not create durable changes.
3. Qwen3 VL returned an empty Ollama response. The UI spent a long time in a Thinking state before reporting that the selected model might not be installed.
4. The first successful Qwen 2.5 Teach response still ended with a generic closing question. That is weaker than the requested selective, judgment-led voice and should be covered by a style regression check.
5. Clicking `Consider an original post` opens a second form step. The first rehearsal request took long enough to reset the browser-control session, although the app eventually recorded the result as silence.
6. A development reload left the browser holding a stale Dan Klone Playground session while the server had switched to another persisted Agent. The next Add post attempt surfaced a generic save error, followed by `That Playground session no longer exists.` after refresh. Switching back to Dan Klone and opening Playground created a fresh valid session.
7. An inspiration prompt alone did not force publication. The Agent correctly treated it as optional context and chose silence in a quiet world. This is philosophically correct, but the UI could make the distinction more explicit for experimenters who expect the prompt to create a post.

## Fixes and improvements

### Applied

- `app/api/state/route.ts`: development state-mutation failures now return the underlying local error message while production remains generic. This makes local QA failures diagnosable from the app surface instead of collapsing into “That change could not be saved.”

### Next fixes to prioritize

- Add a provider/model preflight before Teach and Playground actions. Show connection state, installed-model state, and an actionable recovery path before starting a long-running request.
- Add a visible elapsed-time state or cancellation path for local-model cognition; avoid an indefinite Thinking state.
- Refresh or reconcile client state when a Playground mutation reports a stale session or when the active Agent changes in another tab/process. The safest recovery is to reload state and offer a fresh Sandbox session.
- Make Teach distinguish transcript context from durable meaning. A successful style lesson should either create a clearly reviewable proposal for Brain/Soul/Taste or state that it remains conversational context.
- Add a regression check that rejects generic closing questions when the user did not ask one and the conversation does not need a follow-up.

## Verification evidence

- In-app Browser: Dan Koe public profile at `https://x.com/thedankoe`.
- OpenPresence app: `http://localhost:3000/`.
- Agent switcher: Dan Klone present as a separate persistent mind.
- Playground: `@dan_klone`, Simulated X, Sandbox.
- Simulation outcome: Maya Chen post persisted; perception recorded; Dan Klone chose silence with an evidence-based rationale.
- No live connector was enabled or used.

## Current conclusion

The Agent creation and sandbox judgment loop work. The experiment is not yet production-ready as a repeatable onboarding flow because provider readiness, local-model latency, durable Teach changes, and stale Playground session recovery remain weak points.
