"""Run the pinned upstream Jev Ultrafast agent as a bounded local probe.

The upstream agent owns action selection. This wrapper owns credential checks,
local-only policy, deterministic postcondition verification, and the bounded
evidence contract consumed by the OpenPresence verification packet.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from jev_ultrafast import Agent
from jev_ultrafast import model as jev_model
from jev_ultrafast.browser import Browser


UPSTREAM_COMMIT = "452c1ad2dd628008f1d5608f28158d76e49e6cc0"
MAX_TRACE_ITEMS = 24
MAX_TEXT = 900


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def bounded_text(value: object, limit: int = MAX_TEXT) -> str:
    return " ".join(str(value or "").split())[:limit]


def digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def require_local_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise RuntimeError("SAFETY_STOP: JEV-ultrafast probes are restricted to local HTTP origins")


def check_credentials() -> None:
    missing = [name for name in ("TYPESAFE_API_KEY", "TEXT_MODEL_API_KEY") if not os.environ.get(name)]
    if missing:
        raise RuntimeError(f"Missing required process environment variable(s): {', '.join(missing)}")


def postcondition(cdp_url: str, expected: str) -> dict[str, object]:
    script = r"""
const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.connectOverCDP(process.env.OPENPRESENCE_JEV_CDP_URL);
  try {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const expected = process.env.OPENPRESENCE_JEV_EXPECTED;
    const candidates = pages.filter((candidate) => candidate.url().includes('/chat')).reverse();
    if (!candidates.length) throw new Error('No local /chat page remained open for postcondition verification');
    let selected = null;
    let fallback = null;
    for (const candidate of candidates) {
      const field = candidate.getByRole('textbox', {name: /Agent name/i});
      if (await field.count() === 0) continue;
      const value = await field.inputValue();
      const visible = await field.isVisible();
      const result = {page: candidate, visible, value};
      fallback ??= result;
      if (visible && value === expected) { selected = result; break; }
    }
    const result = selected ?? fallback;
    if (!result) throw new Error('No Agent name textbox remained available for postcondition verification');
    console.log(JSON.stringify({ok: result.visible && result.value === expected, route: new URL(result.page.url()).pathname, visible: result.visible, value: result.value, expected}));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.log(JSON.stringify({ok: false, error: String(error)})); process.exitCode = 1; });
"""
    env = {**os.environ, "OPENPRESENCE_JEV_CDP_URL": cdp_url, "OPENPRESENCE_JEV_EXPECTED": expected}
    result = subprocess.run(["node", "-e", script], capture_output=True, text=True, env=env, check=False)
    lines = [line for line in result.stdout.splitlines() if line.strip()]
    if not lines:
        return {"ok": False, "error": bounded_text(result.stderr or "Playwright postcondition emitted no result")}
    try:
        value = json.loads(lines[-1])
    except json.JSONDecodeError:
        return {"ok": False, "error": "Playwright postcondition returned invalid JSON"}
    if result.returncode != 0 and value.get("ok") is not True:
        value["error"] = bounded_text(value.get("error") or result.stderr)
    return value


def wait_for_local_controls(agent: Agent, timeout_seconds: float = 5.0) -> int:
    """Let the real app hydrate before the first model decision.

    Browser Use's first snapshot is intentionally immediate. OpenPresence's
    local Next client can briefly expose only its loading shell, so this
    wrapper performs a bounded read-only readiness wait. It never mutates the
    page or decides whether the claim passes.
    """
    started = time.perf_counter()
    deadline = started + timeout_seconds
    while time.perf_counter() < deadline:
        text = str(agent.browser.evaluate("document.body?.innerText || ''"))
        has_control = bool(agent.browser.evaluate("Boolean(document.querySelector('input, textarea, [role=\\\"textbox\\\"]'))"))
        if has_control and "waking your presence" not in text.lower():
            return round((time.perf_counter() - started) * 1000)
        time.sleep(0.05)
    return round((time.perf_counter() - started) * 1000)


def run(args: argparse.Namespace) -> dict[str, object]:
    require_local_url(args.url)
    check_credentials()
    record_dir = Path(args.record_dir).resolve()
    record_dir.mkdir(parents=True, exist_ok=True)
    started_at = now()
    started = time.perf_counter()
    protocol_calls = 0
    protocol_methods: dict[str, int] = {}
    provider_calls: list[dict[str, object]] = []
    original_post = jev_model.CLIENT.post
    original_browser_call = Browser.call

    def counted_post(*post_args, **post_kwargs):
        call_started = time.perf_counter()
        response = original_post(*post_args, **post_kwargs)
        url = str(post_args[0]) if post_args else ""
        parsed = urlparse(url)
        headers = {key: value for key, value in response.headers.items() if "request-id" in key.lower() or key.lower() in {"x-typesafe-request-id", "content-type"}}
        provider_calls.append({
            "provider": parsed.netloc,
            "status": response.status_code,
            "requestId": headers.get("x-typesafe-request-id") or headers.get("x-request-id"),
            "latencyMs": round((time.perf_counter() - call_started) * 1000),
        })
        return response

    def counted_browser_call(browser, method, **params):
        nonlocal protocol_calls
        protocol_calls += 1
        protocol_methods[method] = protocol_methods.get(method, 0) + 1
        return original_browser_call(browser, method, **params)

    jev_model.CLIENT.post = counted_post
    Browser.call = counted_browser_call
    final_state: dict[str, object] | None = None
    all_history: list[dict[str, object]] = []
    all_decisions: list[dict[str, object]] = []
    all_text_calls: list[dict[str, object]] = []
    attempts = 0
    hydration_wait_ms = 0
    error: str | None = None
    postcondition_result: dict[str, object] = {"ok": False, "error": "not executed"}
    try:
        for attempt in range(3):
            attempts = attempt + 1
            with Agent(args.url, args.goal, record_dir=record_dir, screenshots=False) as agent:
                hydration_wait_ms += wait_for_local_controls(agent)
                attempt_state = None
                for state in agent.run():
                    attempt_state = state
                if attempt_state:
                    final_state = attempt_state
                    all_history.extend(item for item in attempt_state.get("history", []) if isinstance(item, dict))
                    all_decisions.extend(item for item in attempt_state.get("decisions", []) if isinstance(item, dict))
                    all_text_calls.extend(item for item in attempt_state.get("text_calls", []) if isinstance(item, dict))
                page = attempt_state.get("page", {}) if isinstance(attempt_state, dict) else {}
                actions = page.get("actions") if isinstance(page, dict) and isinstance(page.get("actions"), list) else []
                still_hydrating = (
                    attempt_state
                    and attempt_state.get("status") == "blocked"
                    and not attempt_state.get("history")
                    and all(isinstance(action, dict) and action.get("kind") == "wait" for action in actions)
                    and "waking" in str(page.get("text", "")).lower()
                )
                if attempt_state and attempt_state.get("status") == "done":
                    postcondition_result = postcondition(args.cdp_url, args.expected)
                    break
            if not still_hydrating:
                break
            time.sleep(0.5)
    except Exception as cause:  # the probe is evidence, not authority
        error = bounded_text(cause)
    finally:
        jev_model.CLIENT.post = original_post
        Browser.call = original_browser_call

    final_state = final_state or {}
    status = str(final_state.get("status") or "")
    if error and error.startswith("SAFETY_STOP"):
        probe_state = "SAFETY_STOP"
    elif status == "blocked":
        probe_state = "BLOCKED"
    elif status == "done" and postcondition_result.get("ok") is True:
        probe_state = "PROBE_OK"
    elif status == "done":
        probe_state = "PROBE_FOUND_ANOMALY"
    else:
        probe_state = "INDETERMINATE"

    history = all_history
    decisions = all_decisions
    trace = [
        {
            "step": item.get("step"),
            "operation": item.get("operation"),
            "kind": item.get("kind"),
            "selectedTargetLabel": item.get("action"),
            "text": item.get("text"),
            "elapsedMs": item.get("elapsed_ms"),
            "latencyMs": item.get("latency_ms"),
            "pageChanged": item.get("page_changed"),
        }
        for item in history[-MAX_TRACE_ITEMS:]
        if isinstance(item, dict)
    ]
    decision_meta = [
        {"operation": item.get("operation"), "choice": item.get("choice"), "latencyMs": item.get("latency_ms"), "model": item.get("model"), "usage": item.get("usage")}
        for item in decisions[-MAX_TRACE_ITEMS:]
        if isinstance(item, dict)
    ]
    text_calls = all_text_calls
    end_at = now()
    evidence = {
        "schemaVersion": "openpresence-jev-ultrafast-evidence.v1",
        "claimId": args.claim_id,
        "verificationNodeId": args.node_id,
        "goal": bounded_text(args.goal, 500),
        "executor": "browser-use/jev-ultrafast",
        "runtimeCommit": UPSTREAM_COMMIT,
        "startedAt": started_at,
        "completedAt": end_at,
        "durationMs": round((time.perf_counter() - started) * 1000),
        "attemptCount": attempts,
        "hydrationWaitMs": hydration_wait_ms,
        "actionCount": len(trace),
        "browserProtocolCallCount": protocol_calls,
        "browserProtocolMethods": protocol_methods,
        "executedOperations": trace,
        "selectedTargetLabels": [item.get("selectedTargetLabel") for item in trace],
        "finalProbeState": probe_state,
        "deterministicPostcondition": postcondition_result,
        "screenshotRefs": sorted(str(p.relative_to(record_dir)) for p in record_dir.glob("*.jpg"))[:MAX_TRACE_ITEMS],
        "traceRef": str((record_dir / "trace.json").name),
        "inputFingerprint": digest({"url": args.url, "goal": args.goal, "expected": args.expected}),
        "environmentFingerprint": digest({"python": sys.version.split()[0], "platform": platform.platform(), "runtimeCommit": UPSTREAM_COMMIT, "textModel": os.environ.get("TEXT_MODEL", "inception/mercury-2.5")}),
        "replayRef": {"runner": "verification/jev-ultrafast/run_probe.py", "url": args.url, "goal": args.goal, "expected": args.expected},
        "freshVsCached": "fresh",
        "requestMetadata": provider_calls,
        "decisionMetadata": decision_meta,
        "textHelperMetadata": [{"model": call.get("model"), "latencyMs": call.get("latency_ms"), "usage": call.get("usage")} for call in text_calls if isinstance(call, dict)],
        "observedFinalText": bounded_text((final_state.get("page") or {}).get("text"), 1200) if isinstance(final_state.get("page"), dict) else "",
        "error": error,
    }
    (record_dir / "trace.json").write_text(json.dumps({"evidence": evidence, "actions": trace}, indent=2) + "\n")
    (record_dir / "evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
    return evidence


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--goal", required=True)
    parser.add_argument("--expected", required=True)
    parser.add_argument("--cdp-url", required=True)
    parser.add_argument("--record-dir", required=True)
    parser.add_argument("--claim-id", default="claim:chat-surface-projection")
    parser.add_argument("--node-id", default="jev-ultrafast:chat-name-input")
    args = parser.parse_args()
    try:
        evidence = run(args)
    except Exception as cause:
        evidence = {"schemaVersion": "openpresence-jev-ultrafast-evidence.v1", "claimId": args.claim_id, "verificationNodeId": args.node_id, "executor": "browser-use/jev-ultrafast", "finalProbeState": "SAFETY_STOP" if str(cause).startswith("SAFETY_STOP") else "INDETERMINATE", "error": bounded_text(cause)}
    print(json.dumps(evidence, separators=(",", ":")))
    return 0 if evidence.get("finalProbeState") in {"PROBE_OK", "PROBE_FOUND_ANOMALY", "BLOCKED", "INDETERMINATE", "SAFETY_STOP"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
