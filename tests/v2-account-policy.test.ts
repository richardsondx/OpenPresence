import { beforeEach, afterEach, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { callV2Tool, V2_TOOL_DEFINITIONS } from "../lib/v2/service";
let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "v2-account-policy-")); vi.stubEnv("OPENPRESENCE_V2_DB_PATH", path.join(dir, "test.db")); });
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(dir, { recursive: true, force: true }); });
it("keeps a requested separate handle draft-only until host identity is confirmed", async () => {
  await callV2Tool("test", "update_social_profile", { requestId: "account-selection", expectedRevision: 0, userConfirmed: true, provenance: "User selected separate X account", changes: { intendedAccounts: [{ channel: "x", handle: "@example_agent", userConfirmed: true }] } });
  const draft = await callV2Tool("test", "prepare_social_action", { channel: "x", situation: "Draft only" });
  expect(draft.accountPolicy).toMatchObject({ targetSelection: "no_account_selected", intendedAccounts: [{ handle: "@example_agent" }], managedAccounts: [], publicActionsRequireConfirmation: true });
  await callV2Tool("test", "update_social_profile", { requestId: "verified-account", expectedRevision: 1, userConfirmed: true, provenance: "Host reports exact account ID confirmed by user", changes: { managedAccounts: [{ channel: "x", handle: "@example_agent", hostAccountId: "synthetic-42", userConfirmed: true }] } });
  const connected = await callV2Tool("test", "get_social_workspace", { channel: "x" });
  expect(connected.accountPolicy).toMatchObject({ targetSelection: "user_confirmed_accounts_only", publicActionsRequireConfirmation: true });
  const linkedin = await callV2Tool("test", "get_social_workspace", { channel: "linkedin" });
  expect(linkedin.accountPolicy).toMatchObject({ managedAccounts: [], targetSelection: "no_account_selected" });
  expect(V2_TOOL_DEFINITIONS.some(tool => /^(publish|post|follow|like|send)_/.test(tool.name))).toBe(false);
});
it("rejects unconfirmed account IDs", async () => {
  await expect(callV2Tool("test", "update_social_profile", { requestId: "unconfirmed-account", expectedRevision: 0, userConfirmed: true, provenance: "User", changes: { managedAccounts: [{ channel: "x", handle: "@example_agent", hostAccountId: "test", userConfirmed: false }] } })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
});
