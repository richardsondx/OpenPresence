# Agent settings and connected channel

Agent settings is one home for the selected Agent’s durable mind plus the connected social incarnation and execution envelope. The Presence is not a second Agent, and the channel is contextual to that Agent rather than a portfolio item the operator switches between.

## Sub-features

- Select Sandbox, X, or Bridge connection mode for the Agent’s connected channel.
- Configure Presence identity, public self, Ghost representation, conversational style, Channel destination, Presence brief, discovery sources, attention rhythm/intensity, publishing initiative, language/media/reuse policies, execution modes, knowledge access, and deletion.
- Inspect the effective capability manifest and connection panels for Official X API, dedicated Chrome, and Bridge routes.
- Edit Agent meaning files and model/provider/tool settings.
- Choose a simple Agent-owned ghost avatar and signature color that carries across Chat, settings, and every Presence.
- See the connected channel at a glance through its branded badge overlaid on the Agent avatar; the Agent row shows the handle without repeating the channel name.
- Preserve Agent scope when switching Agent settings sections; the active channel remains contextual to the selected Agent.

## How to get to it (user POV)

Choose `Agent settings` or open `/agent` (or the legacy `/settings` alias). The page has `Identity & Brain` and `Presence & Autonomy` sections. Select the durable mind from the left Agent rail; the main topbar does not duplicate that selector or show a second active-channel block. Duplicate Agent and `Change avatar` are available in Identity & Brain. Contextual links from Watching, Chat, Usage, and Activity open the same unified settings home.

## Driving it with verify-app

```bash
verify-app open agent
verify-app snapshot
verify-app click --role button --name 'Sandbox'
verify-app assert --text 'This world is simulated.'
verify-app click --role button --name 'X'
verify-app assert --text 'Connect this Presence to X'
verify-app click --role button --name 'Bridge'
verify-app assert --text 'Connect this Presence through Bridge'
verify-app click --role tab --name 'Presence & Autonomy'
verify-app snapshot
```

To change an Agent avatar, open `/agent`, stay on `Identity & Brain`, and choose `Change Jenny avatar`. In the `Edit Jenny's avatar` dialog, select one of the curated ghost buttons (for example `Comet ghost avatar`), optionally choose a signature color, and save with `Save avatar`.

The `Presence & Autonomy` section currently contains these section anchors: `Identity`, `Conversational Style`, `Channel & Access`, `Public Request Access`, `DMs / Private Messages`, `Presence Brief`, `Content & Discovery Sources`, `Attention & Rhythm`, `Publishing & Policies`, `Execution Envelope`, `Knowledge Access`, and `Danger Zone`. The page also conditionally exposes Ghost profile, Public Self, Official X API, Chrome, Bridge, effective capabilities, language, media, asset reuse, and auto-approval confirmation controls.

After editing a labelled setting, inspect `state --projection presence` or `state --projection brain`, navigate away, and return. Verify that Presence changes do not rewrite Agent meaning files or model identity.

## Proof

The selected route and visible connection/identity state must match persisted Presence state after reload. Review/Auto or Custom controls must reveal their real queue/customization and cannot be considered configured from appearance alone. The selected Agent and selected Presence must both remain visible while switching. Avatar proof requires selecting a curated ghost, saving it, observing the updated Agent mark in settings and Chat, then navigating away or reloading and confirming the choice remains. Channel identity proof requires the Agent rail to show the branded channel badge (for example, the X mark) and the handle without a redundant `X ·` prefix.

For portfolio switching, use the expanded or collapsed rail's `button.portfolio-agent-select` controls. The clicked row must receive `aria-current="page"`, the route must become `/chat?agentId=<target>`, and the target Chat projection must load without speculative reads from hover, pointer-down, or focus. Rapid clicks are single-flight and settle on the latest requested Agent; `tests/e2e/agent-switching.spec.ts` covers the click, request, and reload path.

## Gotchas

- Local harness runs in Sandbox with mock providers; it cannot prove external X credentials or a live Bridge.
- Provider secrets are intentionally not returned by `/api/state`.
- Presence is not a second mind; scope leakage is a regression.
- Manual exact-text actions differ from autonomous Agent output.
- The selected channel is displayed as Agent context; there is no user-facing `Add another channel` control in the unified settings home.
- Agent avatars are simple, Agent-owned marks shared across Presences. Legacy Presence look values may remain in persisted state, but settings and Presence creation no longer offer costume/look pickers.
- Avatar editing lives in Agent settings → Identity & Brain. The curated mark and signature color are persisted on the Agent; a verified external platform avatar may still appear in Public history because it represents the observed actor there.
- The expanded Agent rail exposes presence-scoped `Awake`/`Asleep` controls; use the row's separate Agent select button to change context, and the status control to pause or wake without selecting another Agent.
- The current default editor opens with `Custom` execution details visible, exposing the full Off/Manual/Review/Auto matrix. This is a high-value simplification-review target, not a proof that all four modes should be removed.
