# Skool Bridge browser QA — 2026-08-14

## Scope

Use the real OpenPresence interface and main SQLite database to create a new Agent and Skool Presence, configure a Bridge named `Skool`, verify Post/Comment/Like capability setup, and inspect whether the requested image/GIF workflow is available without an external Skool mutation.

## Completed customer flow

- Created Agent: `Skool Community Agent`.
- Created custom Channel: `Skool Community` (`skool`) with `https://www.skool.com/` as its domain.
- Created Presence: `Skool Community Agent` (`@skool_community`).
- Selected the Bridge route.
- Configured the Bridge name as `Skool`.
- Created the local Bridge credential after explicit action-time confirmation.
- Changed the default capability envelope to supervised review, so Post, Comment, and Like are all enabled without autonomous delivery.
- Reopened the main workspace in a second browser tab and verified the connection persisted.
- Chrome warnings/errors: none observed.

No Skool credentials were entered. No Skool account was connected. No external post, comment, like, upload, or scraping action occurred.

## UX observations

### Worked well

- The custom Presence flow correctly separates the Agent from the new Presence.
- Choosing Bridge immediately exposes a custom Channel blueprint.
- After creation, the settings surface is understandable: `Skool Community` → `Bridge` → `Skool` → `Can perform · post, comment, like`.
- The one-time adapter key, Events endpoint, and Execution endpoint are visible in one place and the key is not redisplayed after reopening.
- The supervised preset is the right safe default for a new community Presence.

### Bottlenecks / improvements

- The initial onboarding creates an X Presence first; Skool requires discovering `Add a Presence` from the Presence switcher.
- Existing X Presences can switch to Bridge, but that does not change their Channel. This initially produced an X-through-Bridge configuration and was easy to misunderstand.
- The custom Channel form exposes raw Channel ID and comma-separated affordance configuration. A Skool setup should present “Community capabilities” as selectable Post, Comment, Like, and Media options.
- The form has no media-capability control. It creates only a text format, does not set `supportedAssetKinds`, and Bridge creation sends `formats: []`.

## Implementation gap

The UI records Post/Comment/Like, but the Bridge protocol currently does not accept `assetRefs` in `mirrorObjectInput`. Claimed `Execution` records contain a `Publication` with `assetIds`, but the Bridge claim response does not provide uploadable asset data or an asset retrieval route. Therefore the requested image/GIF upload path is not end-to-end supported.

## Safety / platform boundary

Skool's public platform policy prohibits bots, scraping, and automated posting/commenting. This QA therefore stopped at the local OpenPresence Bridge configuration and did not connect or operate a live Skool adapter.

## Result

The main-database text/action Bridge setup is persisted and browser-verified. The workflow is not production-ready for the requested image/GIF delivery or live Skool automation until the media protocol and platform-permission boundary are resolved.
