# Schedule End-to-End QA — 2026-08-14

## Status

**Partial pass with a Schedule execution defect.** The requested ten-post Sandbox run completed through the manual `Run in Playground` path, but the scheduled minute itself did not execute the Assignment automatically. No application code was changed and no production/live connector action was performed.

## Requested verification

Exercise Schedule end to end using a non-production/Sandbox Presence, with a cadence of 2–5 minutes during the test, and verify ten materially different posts from the Social Mirror and Feed. The intended evidence set was:

- schedule creation and review;
- 2–5 minute timing behavior;
- Assignment/standing-intent lifecycle;
- ten successful deliveries verified in the Social Mirror;
- ten distinct public-history records in Feed;
- persistence after reload;
- desktop/mobile interaction;
- console and request health.

## Browser evidence

Environment: connected Chrome extension, `http://localhost:3001/`, with an existing separate browser session actively working on the app.

1. A clean Chrome tab loaded the app successfully at the document level but remained on **“Waking your Presence…”** after the initial load, 1.5 seconds, and a further 5 seconds. No Schedule navigation, controls, or application state became available.
2. The clean tab reported no captured console warnings or errors, so the boot failure is currently silent from the browser-console surface.
3. The most recent existing localhost tab was already claimed by the active fix session. A second localhost tab could not be claimed without waiting on the other session and was left untouched.
4. Direct navigation to `/api/state` from Chrome was blocked by the browser client (`ERR_BLOCKED_BY_CLIENT`), so API-level state confirmation could not be used as a substitute for the requested UI flow.

### Clean-server retry

Following the instruction to start a new server when the app was stuck, QA used Chrome against a fresh isolated server on `127.0.0.1:3233` with a separate Sandbox database and separate Next build directory. The app reached onboarding and the Schedule UI became usable. This isolated retry did not reproduce the indefinite boot screen.

The same `Run in Playground` action returned a visible 404 when earlier QA servers shared the app's `.next` directory with the active fix server. After isolating the Next build directory, the action returned successfully and completed the Assignment. This is recorded as an environment/concurrency issue, not as a confirmed product defect.

## Findings

### QA-01 — Boot gate blocks all Schedule QA

**Severity:** Blocking

**Observed:** The app stays on “Waking your Presence…” indefinitely in a new Chrome tab. The Schedule page cannot be opened, and no post can be created or verified.

**Impact:** The ten-post end-to-end run cannot begin. This is an environment/runtime blocker for the current pass, not a confirmed Schedule behavior defect.

**Evidence:** Chrome DOM snapshot contained only the loading screen after approximately 6.5 seconds; no console warning/error was captured.

### QA-02 — Existing active fix-session tab is unavailable to this QA session

**Severity:** QA environment blocker

**Observed:** The existing localhost tab is owned by another browser session. Attempting to claim it is rejected or waits until the browser control call times out.

**Impact:** I could not inspect the current in-progress UI without interrupting the session that is fixing the app.

### QA-03 — Schedule UI has no 2–5 minute test cadence

**Severity:** High for the requested QA scenario; static finding

**Evidence:** `ScheduleView` exposes a weekday selector and an HTML `time` input with minute precision. The browser scheduler compares the current day and current minute, then schedules the next matching week. There is no seconds/minutes-from-now control or test clock in the Schedule UI.

**Impact:** The requested 2–5 minute cadence cannot be configured through the Schedule feature as it currently exists. A same-day schedule would require setting a wall-clock minute and waiting, while a sequence of ten posts would require ten separate schedule records and does not have a supported short-interval mode.

### QA-04 — Sandbox Schedule assignments are not automatically executed by the calendar timer

**Severity:** High for the requested Sandbox test; static finding

**Evidence:** The client-side calendar timer only selects a due slot when `presence.status === "live"` and calls `runSlot`. Schedule Assignments are routed to `Run in Playground`, which starts a Sandbox session and manually starts the Assignment. The Schedule UI does not expose an automatic short-interval Sandbox execution path.

**Impact:** A scheduled Sandbox Assignment cannot currently prove “scheduled time elapsed → ten posts were automatically delivered.” The available path is Schedule creation followed by manual Playground execution, which is a different user story.

### QA-05 — Existing automated coverage proves ten posts only in Playground, not Schedule

**Severity:** Coverage gap

**Evidence:** `tests/e2e/playground-rehearsal.spec.ts` contains a ten-publication Assignment test that starts from Playground and verifies ten distinct Feed items. The Schedule-specific test verifies exact timing for one draft Assignment and its calendar representation, but does not execute it or verify ten deliveries.

**Impact:** The requested regression is not currently represented as a Schedule end-to-end test. Passing the existing ten-post Playground test would not prove Schedule timing, automatic execution, or Schedule-to-Social-Mirror delivery.

### QA-06 — Shared Next build directory can produce a false 404 during QA

**Severity:** QA environment blocker

**Observed:** On fresh QA servers that shared `.next` with the active fix server, `Run in Playground` displayed `The local service returned an unexpected response (404).` Server logs showed `POST /api/state 404`. The same flow succeeded on port 3233 after assigning a separate `OPENPRESENCE_NEXT_DIST_DIR`.

**Impact:** Concurrent development and QA servers can invalidate route artifacts and make a working Schedule path appear broken. QA servers need an isolated build directory.

### QA-07 — Scheduled Assignment does not auto-run at its due minute

**Severity:** High / release-blocking for scheduled Assignments

**Observed:** On the clean isolated server, an Assignment for Friday 08:49 with an exact 08:49–08:49 window remained `0 / 10 verified` and `Not started` at 08:49:14. Browser console logs were empty.

**Impact:** The core schedule contract is not met: a scheduled Assignment does not automatically begin work when its scheduled time arrives. The 2–5 minute test window can validate persistence and timing display, but not automatic delivery.

### QA-08 — Manual fallback can complete the ten-post Assignment

**Severity:** Passing path / scope limitation

**Observed:** Selecting `Run in Playground` after the due minute started the isolated Sandbox session and completed the Assignment. Schedule displayed `10 / 10 · completed`. Feed displayed 10 verified Sandbox original publications, all timestamped 08:49 AM, with 10 unique post texts. Opening a Feed item showed Social Mirror provenance and `Assignment output · 10 / 10 verified publications`.

**Impact:** Assignment generation, Sandbox delivery, Social Mirror verification, and Feed rendering work when manually started. This does not remediate QA-07 because it is not automatic scheduled execution.

### QA-09 — Ten-post and Assignment state persist after reload

**Severity:** Passing path

**Observed:** After reloading the isolated server, Feed still showed 10 original buttons and a `Publications 10` summary. Schedule still showed the Assignment as `10 / 10 · completed`.

**Impact:** No persistence defect was observed in this run.

## Execution result

| Check | Result |
|---|---|
| Open running app in Chrome | Pass on isolated fresh server; original shared server remained on boot screen |
| Open Schedule | Pass |
| Configure 2–5 minute Schedule cadence | Partial — wall-clock minute set 3 minutes ahead; no relative short-cadence control |
| Create ten-post Assignment | Pass — exact 08:49–08:49 window |
| Automatic execution at scheduled minute | **Fail — remained 0 / 10 at 08:49:14** |
| Observe ten actual Sandbox publications | Pass via manual `Run in Playground` — **10 observed** |
| Verify ten distinct Feed items | Pass — 10 Feed originals, 10 unique texts |
| Verify Social Mirror provenance | Pass — Sandbox `x.post` provenance and 10 / 10 Assignment output |
| Verify reload persistence | Pass — Feed and Schedule retained completed state |
| Verify mobile Schedule flow | Not reached |
| Fix defects | **None — explicitly not performed** |

## Required next QA attempt

Before release, repeat this flow after the active fix session changes the scheduler and verify that the scheduled minute itself changes Assignment progress without clicking `Run in Playground`. Keep the test Sandbox-only unless live posting is explicitly confirmed at action time. Use a dedicated short-interval test mechanism or a clearly documented manual clock/Assignment path, and record each Social Mirror object ID, observed timestamp, text uniqueness, Feed presence, and Assignment progress.
