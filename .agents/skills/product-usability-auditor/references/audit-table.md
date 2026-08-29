# Product usability audit output schema

Use these tables to make findings comparable across features. Do not fill
columns with generic praise or unsupported scores. One row should describe one
actionable problem or one explicit product decision.

## Verdicts

| Verdict | Use when |
| --- | --- |
| `keep` | The feature has clear value and the tested path is usable enough; note remaining low-risk polish separately. |
| `repair` | The value is sound, but a functional, state, trust, or recovery defect blocks the promised outcome. |
| `simplify` | The value is sound, but the current presentation or workflow creates avoidable cognitive load, verbosity, or space waste. |
| `remove/defer` | The feature does not advance the product goal or adds more operational burden than user value. |
| `unverified` | The question cannot be answered without missing browser, runtime, history, or product evidence. |

## History/frustration table

Use one row per recurring cluster.

| Cluster | Explicit complaint count | Records reviewed / date window | Representative evidence | Broken expectation | Affected `FEATURES_MAP.md` features | Confidence | Prevention rule |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| Stuck or false-progress state |  |  |  |  |  |  |  |

Count explicit complaints, not every code change or test. If the source is a
project ledger synthesized from history, name that fact and do not present it
as a fresh exhaustive count.

## Feature finding table

| ID | Feature / scope | User goal and expected outcome | Evidence and location | Primary failure | Severity | Confidence | User impact | Smallest coherent fix | Verification / QA anchor | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UX-001 | Exact feature-map name; User/Agent/Presence/Channel/Runtime scope | What the user is trying to accomplish and what success means in the world | History, route/component, state/API, screenshot/browser state, or test | Value / usefulness / function / clarity / cognitive load / space / IA / recovery / coherence | P0–P3 | Low/Medium/High | Confusion, stuckness, distrust, overload, futility, or operator burden | One concrete change; include removal/hiding when that is better | Exact test, browser state, reload/failure check, and map QA anchor | keep / repair / simplify / remove/defer / unverified |

## Severity

- **P0 — blocking/trust-critical:** prevents the core outcome, risks duplicate or
  unauthorized action, lies about reality, or traps the user/operator.
- **P1 — high friction:** repeatedly prevents a meaningful journey, makes a
  feature appear broken, or exposes a recurring complaint cluster.
- **P2 — material usability debt:** creates avoidable confusion, overload,
  verbosity, space waste, or inconsistency but has a viable workaround.
- **P3 — polish:** local improvement with low user or product risk.

Severity is not a visual attractiveness score. A sparse but misleading state
is higher priority than an imperfect border radius.

## Evidence language

Use precise labels:

- **Observed:** directly seen in the running product or a supplied artifact.
- **Reproduced:** the same failure occurred through the user journey.
- **Corroborated:** supported by multiple independent history records,
  surfaces, or tests.
- **Inferred:** a reasoned conclusion not directly observed; state the basis.
- **Unverified:** tooling or evidence was unavailable.

## Recommended fix format

For P0/P1 rows, write the recommendation as:

> Remove/rename/reorder/merge/recover **X** so the user can **Y**; preserve
> **truth-critical or safety-critical context**; verify **Z** after
> reload/restart and in the relevant failure state.

This prevents “improve UX” from becoming a vague redesign request.
