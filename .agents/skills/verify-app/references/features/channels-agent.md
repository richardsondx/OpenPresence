# Presence care and Manage Agent

Presence care (currently labelled `Channels`) configures one Presence’s social incarnation and execution envelope; Manage Agent configures the selected Agent’s durable mind and model/tools. The Presence is not a second Agent and `Channel` is the social environment, not the portfolio item the operator switches between.

## Sub-features

- Select Sandbox, X, or Bridge connection mode.
- Configure Presence identity, public self, Ghost representation, conversational style, Channel destination, Presence brief, discovery sources, attention rhythm/intensity, publishing initiative, language/media/reuse policies, execution modes, knowledge access, and deletion.
- Inspect the effective capability manifest and connection panels for Official X API, dedicated Chrome, and Bridge routes.
- Edit Agent meaning files and model/provider/tool settings.
- Preserve Agent scope when switching Presence or Agent.

## How to get to it (user POV)

Choose `Channels` or open `/settings` for the active Presence. The current selector is labelled `Switch Channel, currently <handle>` and the menu is labelled `Your Channels`; this is the current terminology drift to resolve. Choose `Manage Agent` or open `/agent` for Agent-scoped configuration. Contextual links from Watching, Chat, Usage, and Activity can open the relevant surface.

## Driving it with verify-app

```bash
verify-app open settings
verify-app snapshot
verify-app click --role button --name 'Sandbox'
verify-app assert --text 'This world is simulated.'
verify-app click --role button --name 'X'
verify-app assert --text 'Connect this Presence to X'
verify-app click --role button --name 'Bridge'
verify-app assert --text 'Connect this Presence through Bridge'
verify-app open agent
verify-app snapshot
```

The Presence Settings page currently contains these section anchors: `Identity`, `Conversational Style`, `Channel & Access`, `Public Request Access`, `DMs / Private Messages`, `Presence Brief`, `Content & Discovery Sources`, `Attention & Rhythm`, `Publishing & Policies`, `Execution Envelope`, `Knowledge Access`, and `Danger Zone`. The page also conditionally exposes Ghost profile, Public Self, Official X API, Chrome, Bridge, effective capabilities, language, media, asset reuse, and auto-approval confirmation controls.

After editing a labelled setting, inspect `state --projection presence` or `state --projection brain`, navigate away, and return. Verify that Presence changes do not rewrite Agent meaning files or model identity.

## Proof

The selected route and visible connection/identity state must match persisted Presence state after reload. Review/Auto or Custom controls must reveal their real queue/customization and cannot be considered configured from appearance alone. The selected Agent and selected Presence must both remain visible while switching.

## Gotchas

- Local harness runs in Sandbox with mock providers; it cannot prove external X credentials or a live Bridge.
- Provider secrets are intentionally not returned by `/api/state`.
- Presence is not a second mind; scope leakage is a regression.
- Manual exact-text actions differ from autonomous Agent output.
- `Channels` currently means the selected Presence switcher in the shell and also the Presence Settings page; do not treat the label as evidence that multiple Channels are being managed.
- The current default editor opens with `Custom` execution details visible, exposing the full Off/Manual/Review/Auto matrix. This is a high-value simplification-review target, not a proof that all four modes should be removed.
