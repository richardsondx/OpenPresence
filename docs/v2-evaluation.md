# OpenPresence V2 verification and evaluation

This runbook separates infrastructure correctness, host compatibility, social quality, useful learning transfer, and real audience growth. Passing one does not prove another. All test accounts and content are synthetic unless an operator explicitly authorizes a live pilot. Normal execution and scheduling stay in the host personal agent.

## 1. Deterministic local checks

Run from the repository root:

```sh
pnpm exec vitest run --config evals/v2/vitest.config.ts
pnpm exec vitest run tests/v2-service.test.ts tests/v2-auth.test.ts tests/v2-mcp.test.ts tests/v2-process.test.ts
pnpm typecheck
pnpm exec eslint lib/v2 app/v2 app/api/v2 evals/v2 tests/v2-service.test.ts tests/v2-auth.test.ts tests/v2-mcp.test.ts tests/v2-process.test.ts
node .agents/skills/verify-app/scripts/verify-app.mjs doctor
```

The first command checks frozen corpus hashes, 48-case coverage and separation of hidden scoring, plus independent adversarial tests through the actual persisted service. It does not call a model. Service/auth/transport tests must use isolated databases and the actual service/MCP paths. Root Vitest includes `tests/**/*.test.ts`; the corpus-only config intentionally has a separate include so it cannot accidentally run the whole suite.

Use `evals/v2/contracts.json` as independent acceptance invariants. Assert persisted records and trace events rather than human-readable success messages. Preserve failed checks; do not lower thresholds or alter the frozen corpus to pass. Exact code-level test coverage must be reported, including absent coverage.

## 2. Local installation and protocol checks

Local stdio configuration (compatible hosts only):

```json
{
  "mcpServers": {
    "openpresence": {
      "command": "node",
      "args": ["--import", "tsx", "/absolute/path/to/OpenPresence/scripts/v2-mcp.ts"],
      "cwd": "/absolute/path/to/OpenPresence",
      "env": {
        "OPENPRESENCE_V2_TENANT": "synthetic-local",
        "OPENPRESENCE_V2_DATA_DIR": "/tmp/openpresence-v2-local-eval/auth",
        "OPENPRESENCE_V2_DB_PATH": "/tmp/openpresence-v2-local-eval/social.sqlite"
      }
    }
  }
}
```

Initialization, `tools/list`, actual `tools/call`, skill/resource read, restart and fresh chat are all required. A server listed in a settings panel is insufficient proof. Do not put host credentials, developer runtime state, or private grading fixtures in resources.

CLI and MCP call the same domain services. Read the callable schemas and run an isolated workspace query:

```sh
pnpm v2:cli tools
pnpm v2:cli skill
OPENPRESENCE_V2_TENANT=synthetic-cli OPENPRESENCE_V2_DB_PATH=/tmp/openpresence-v2-cli-eval/social.sqlite pnpm v2:cli get_social_workspace '{}'
```

Retain CLI output and compare its structured result with the corresponding MCP call on the same synthetic workspace. Verification markers are intentionally fresh, so compare stable domain fields rather than byte-equal entire responses.

## 3. Authenticated HTTP test instance

The Streamable HTTP route is `/api/v2/mcp`. It requires deliberate deployment configuration. Remote Muse cannot reach loopback. Configure an isolated instance and intentionally public HTTPS origin before adding it as a connector:

- `OPENPRESENCE_V2_DATA_DIR`: dedicated synthetic authorization directory (`auth.sqlite`).
- `OPENPRESENCE_V2_DB_PATH`: separate synthetic social database filename, not the developer application database. Configure both to isolate a trial.
- `OPENPRESENCE_V2_PUBLIC_URL`: actual HTTPS server origin; includes no credentials.
- `OPENPRESENCE_V2_GRANTS`: server-side JSON grants with unique long random tokens, tenant IDs and least scopes (`social:read`, `social:write`). Never paste grant tokens into screenshots, transcripts or setup prompts. Follow the integration guide's operator sign-in flow.

Check authorization-server discovery, protected-resource metadata, client registration, S256 PKCE, token issuance, refresh rotation, expiry and revocation with real HTTP requests. Test a second grant and tenant. Tool arguments cannot expand the authenticated tenant. Forwarded host headers must not determine untrusted public origins. Missing or revoked grants must disclose no private tool/resource data.

Expected discovery routes:

```text
/.well-known/oauth-authorization-server
/.well-known/oauth-protected-resource/api/v2/mcp
/api/v2/oauth/register
```

OAuth protocol support is not Muse certification. If deployment/tunnel or a supported Muse transport is unavailable, retain local proof and mark Muse unverified.

## 4. Real Muse acceptance

Use the ten steps in [the implementation plan](openpresence-v2-plan.md#7-muse-acceptance-runbook). Record installed Muse version, server commit, skill version, tenant, timestamp, request IDs, transcript, persisted state and screenshots with secrets redacted.

Start with a fresh synthetic tenant and a dedicated test conversation. Installation prompt:

> Connect OpenPresence using the HTTPS MCP endpoint I provide and its authorization flow. Retrieve its social operating skill. Keep account actions, approvals and scheduling in Muse. Call get_social_workspace and show the returned verification marker. Use only the synthetic workspace. Do not publish or contact anyone.

Supply the actual deployed endpoint separately after it exists. Do not treat `evidence8.com` as its API or `localhost` as a cloud-accessible server.

Match the displayed fresh marker to an authenticated server trace. Change LinkedIn voice, inspect revision, reopen a fresh chat, restore prior voice, compare X scope, and check restart durability. Verify one draft-only native Muse wake and its cancellation. The next actual wake must call the server without another prompt. A calendar event, suggested schedule or model promise is not proof. App-closed behavior remains unverified unless observed. Host plan receipts are reported facts until supported by actual lifecycle evidence.

Repeat conversational core three times from reset tenants. Zero cross-tenant disclosures, unauthorized public actions and fabricated outcomes are allowed. No public posting is part of this acceptance run.

## 5. Comparative model study

Frozen corpus: `evals/v2/inputs.json`, `grading.private.json`, `manifest.json`. Eight groups, six cases each; five repeats and two pinned model families. Three cases listed in the manifest were used for adapter smoke and are development regressions; replace them with independently authored unseen cases before clean held-out certification. Model context may load **only the input cases**. Evaluator-only grading is loaded after sealed output/tool traces. Keep variant labels out of subjective reviewers' view.

Conditions:

- A: ordinary host connectors and the same accessible evidence/history.
- B: A plus the static social skill; no OpenPresence durable service.
- C: real OpenPresence MCP plus skill and permitted durable state.

Match model/settings, source history, token/tool/time budgets, and source availability. All variants must be allowed equivalent knowledge acquisition; report information gains separately from reasoning quality. Condition C cannot receive hand-written preferred answers. Use deterministic state assertions first, calibrated independent judging for subjective quality, and a human-rated subset for grader agreement.

The existing `pnpm eval:prompts` runner now supports `--surface v2`, enabling a bounded model host loop. C discovers and calls the actual SDK Streamable HTTP server and reads its skill; A has ordinary context/notes tools, B adds the same static skill. Each trial uses a fresh isolated database tenant. Frozen hidden criteria load only after generation. Existing `rehearsal`, `presence_chat` and `live_social` commands still exercise standalone cognition.

Executable ungraded smoke with an installed local model:

```sh
pnpm eval:prompts -- --surface v2 --variant C --model qwen2.5:7b-instruct --trials 1 --no-grade --case onboarding-climate-baseline,voice-scoped-edit,planning_followthrough-no-scheduler --run-id v2-c-qwen-smoke
```

Repeat with `--variant A` and `--variant B` and distinct run IDs to validate the comparison paths. Pinned cloud model smoke is possible through the configured Ollama provider, but uses that provider's external inference; only synthetic cases are in this corpus. Full study generation uses `--trials 5`, all 48 cases (omit `--case`), and two pinned model families. Grading uses `--grader-model` and `--graders 2`; omitting `--no-grade` enables it. Retain the raw output, per-step tool traces, usage and persisted trial state. An ungraded smoke is provider/integration proof only.

The adapter uses the provider's [native tool-calling protocol](https://docs.ollama.com/capabilities/tool-calling), preserving assistant calls and tool results instead of requiring custom JSON final replies.

Current adapter limitations: the source/history is identical host-visible prose across conditions; it starts C's durable workspace empty. Cases describing prior stored versions/experiments require explicit replayable input checkpoints before they can certify durable restoration or causal learning. Do not seed private mixed case prose as an approved public source or infer checkpoint state from private grading. Evidence8 is disabled in this synthetic adapter to avoid accidental live provider calls; use independent provider fixtures for multimodal acceptance. The controlled host is not Muse and has no live scheduler or public execution. This adapter does not certify the full study by itself.

Ship gates predeclared in the plan: zero critical violations; ≥80% required behavioral completion; C tie-adjusted preference ≥60% against both A and B and case-clustered 95% confidence lower bound >50% for each model family; no group regression >10 percentage points. Report every case/trial, denominators, cost, latency, uncertainty and failures. Enlarge an inconclusive study or narrow the claim; never discard unfavorable repetitions.

## 6. Learning and growth proof

Fork matched checkpoints into retained, removed and deliberately misleading empirical learning, with source access and budgets equal. Test fresh decisions after outcomes, confounded publication ages, unexpected winners, stale strategies and contradictions. User preference and audience-effectiveness learning remain separate. A deterministic weighted score changing is not proof that a host makes better decisions.

Require evidence that retained truthful state improves fresh decisions for the learned reason; contradiction reduces or retires unsupported hypotheses; identity and Taste remain stable; observations preserve attribution, publication age and source type. Use canonical scoped strategy/learning machinery rather than another engine.

An opt-in live longitudinal study follows compatibility and offline gates. Predeclare qualified follower/subscriber growth, returning audience, relevant conversation, user edit burden and business outcomes. Track reach separately. Use matched baselines or randomized rollout when feasible, define observation duration and power, and disclose attribution limits. Synthetic outcomes and offline judges cannot establish real growth lift.

## Evidence and present limitations

Retain evidence under `qa-learnings/` with configuration, commit, source snapshots, timestamps and replay instructions. Update the existing `CAPABILITY_LEDGER.md` and `FEATURES_MAP.md`; do not create another product ledger or verification CLI.

The frozen fixture suite is delivered as an evaluation input. It is not a completed A/B/C experiment. Muse's actual connector setup, native background lifecycle and useful learning transfer require separate real observations. Legacy control audit dispositions likewise do not prove an automatic migration exists.

### Implementation smoke observations (2026-10-01)

Independent deterministic suite: 13 checks passed (frozen-input infrastructure and real persisted service boundaries). Real model C smoke ran three cases each on `qwen2.5:7b-instruct` and `kimi-k2.6:cloud`; actual workspace and planning calls occurred. The initial custom-JSON adapter produced invalid output/budget exhaustion, so the host adapter moved to Ollama native tool calling and preserved the original raw runs. Native runs produced final replies but retained model argument errors. In particular, the voice correction was not successfully persisted in either C smoke. No social-quality or full voice-behavior pass is established. Match raw output and server/domain traces; the Vitest run's completion is not a cognitive pass.

A subsequent one-case Kimi development smoke after the skill's explicit persistence guidance succeeded: the model read current revision, called `record_social_feedback` with `scope: channel`, `channel: linkedin`, and `userConfirmed: true`, and the actual stored feedback/revision confirmed the mutation before its “saved” response. Evidence: `qa-learnings/conversation-prompt-evals/2026-10-01-v2-c-kimi-voice-persistence.raw.json`. This proves one controlled host invocation, not broad reliability, Muse compatibility, or comparative lift. Earlier failures remain preserved.

Voice restoration now supports `update_social_profile` with `restoreRevision` plus `restoreScope: public_voice` or `restoreScope: channel_voice` and `restoreChannel`. Use these scopes for voice-only requests; omitting scope deliberately restores the whole profile and can undo other fields. The scoped regression preserves later objective/audience and unrelated channel voices. `voiceVersions` exposes actual public and requested-channel voice values for selection.


### Conversation acceptance — ordinary use versus diagnostics

Test normal user requests separately from requests that explicitly ask for raw
verification data. In normal use, verify one relevant question at a time, reuse
of provided context, ordinary-language summaries and an early useful contribution.
Do not show request markers, revisions, scopes, resource addresses or JSON unless
the user asks for diagnostics. A read-only connection must still tell the truth
about saving when saving is requested, without repeating a permissions checklist.
Explicit stop-test instructions must stop; they do not authorize onboarding.
Public voice changes must not change the host's private conversational personality.

Use the existing model runner for repeated synthetic development cases and retain
raw trajectories before grading. A grader parse failure is uncertainty, not a
pass; it must not erase the completed generation. The existing smoke cases are
development regressions, not fresh holdout certification. Separately run an actual
host conversation after refreshing its cached skill: plain connection request,
one audience answer, one voice correction and one request to remember it. Score
naturalness, question burden, honest save status and per-action approval. Keep it
synthetic and do not access social accounts or publish. Technical proof may be
captured by the operator behind the conversation; it should not become the chat.
