# Presence-scoped Chrome sessions

This document records the multi-account browser boundary for OpenPresence.

## Decision

Use one persistent real-Chrome `user-data-dir` per Presence. Keep the existing MV3 extension and Bridge execution path unchanged.

```text
Presence A → Chrome identity A → cookies/storage A → @accountA
Presence B → Chrome identity B → cookies/storage B → @accountB
```

Do not switch accounts by editing cookies inside one shared Chrome profile. A browser identity includes more than cookies: local storage, IndexedDB, extension storage, session state, and the browser's login state all need to remain scoped together.

## What the extension does today

The extension is the browser-side embodiment. Its background service worker keeps a Presence-scoped session map, connects to the local Bridge, opens the controlled social tab, groups the tab, serializes execution for that Presence, and reports observation, execution, identity, and verification results. The social site is still driven through the visible DOM in a normal browser.

The new launcher only adds this outer layer:

```text
Presence Settings
  → POST /api/browser/launch
  → real Chrome --user-data-dir=<Presence directory>
  → Presence-scoped OpenPresence Settings URL
  → existing extension app bridge
  → existing controlled social tab and account verification
```

The extension is not asked to implement account switching. In local development it still needs to be loaded once in each dedicated profile, and the operator signs into the expected account through the normal website UI.

## Profiles, incognito, and dedicated user-data directories

| Option | Persistent account state | Good fit | Limitation |
| --- | --- | --- | --- |
| Chrome profile picker | Yes | Manual operator workflows | Awkward to launch and bind deterministically from the app; the UI-selected profile is easy to mis-bind. |
| Incognito window | No, by design | Temporary inspection or one-off authentication | Session disappears, extension/storage behavior is less suitable for a durable Presence, and it is not a persistent account boundary. |
| Dedicated `user-data-dir` | Yes | Programmatic, Presence-scoped local sessions | Requires one-time extension installation/sign-in per directory and consumes a separate Chrome process/session. |

The implementation chooses the third option. There is no product-level “two account” ceiling. The practical ceiling is the host's CPU, memory, disk, Chrome process limits, site rate limits, and the number of concurrent browser actions the Agent is allowed to claim. Each Presence remains serialized at the extension execution boundary, while separate Presences can have separate browser bodies.

## Safety and truthfulness rules

1. The selected Presence, expected handle, browser body, and browser profile must stay correlated.
2. Before a public write, the existing extension must positively verify the visible signed-in account against the expected Presence handle.
3. An unknown or mismatched account blocks the write and must not be acknowledged as successful.
4. Browser liveness and account identity are separate facts: a healthy Bridge does not by itself prove the right social account is signed in.
5. A browser process may be reused by Chrome for an already-open directory, but a different Presence must never be pointed at that directory.
6. No public post or other live social action is valid QA evidence for this feature.

## Cloud deployment boundary

The local launcher cannot be moved directly into a serverless request handler. A cloud app needs a browser runtime for every Presence that uses browser-only work.

The recommended shape is:

```text
Shared Agent cognition
  → Presence execution envelope
  → BrowserBody / session lease
  → one isolated browser container or VM
  → one persistent encrypted profile volume
  → existing extension + Bridge
  → social website
```

The Agent does not need a separate “brain” per account. It does need a separate browser body and privacy boundary per Presence. If the Agent also runs arbitrary code, that code requires a separate code-execution sandbox; browser isolation is not a substitute for a general-purpose code sandbox.

For a cloud version:

- provision one browser worker/container/VM per active Presence, or use a managed browser service that guarantees equivalent persistent context isolation;
- mount one durable encrypted volume per Presence and never share it across Presences;
- install and version the extension in the browser image, rather than asking every request to install it;
- keep the browser headed or headed-equivalent if the social workflow depends on normal Chrome behavior;
- connect the cloud worker to OpenPresence with a short-lived, Presence-scoped Bridge token and heartbeat;
- keep DevTools/CDP private to the worker network; never expose a debugging port publicly;
- route setup/authentication through a one-time enrollment URL so the operator signs in inside the intended browser body;
- record expected identity, observed identity, extension version, browser state, profile volume, and last heartbeat as BrowserBody metadata;
- stop, hibernate, or destroy workers through an explicit lifecycle API, with volume retention controlled separately from process lifetime.

A Cloudflare Worker or ordinary serverless function can coordinate these objects, queue work, and expose the control plane, but it should not be responsible for hosting the long-lived Chrome process itself. A stateful worker/actor, container service, VM, or managed remote-browser runtime is the appropriate execution layer.

## What remains to build for cloud

- remote BrowserBody provisioning and lifecycle state machine;
- encrypted profile-volume management and backup/restore policy;
- extension packaging, version rollout, and compatibility checks;
- secure enrollment and re-authentication UX;
- browser worker health/heartbeat and stuck-session recovery;
- per-Presence network, retention, audit, and deletion policies;
- concurrency/resource quotas and a four-Presence soak test;
- explicit user-visible status for `starting`, `needs_auth`, `healthy`, `degraded`, and `stopped`.

The local implementation intentionally stops before those deployment concerns. It establishes the identity-isolation seam without replacing the working extension interaction layer.
