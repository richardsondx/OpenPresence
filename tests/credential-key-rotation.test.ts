import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = path.resolve("scripts/rotate-credential-key.mjs");
const temporaryRoots: string[] = [];

function createWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpresence-key-rotation-"));
  temporaryRoots.push(root);
  const dbPath = path.join(root, "workspace.db");
  const keyPath = path.join(root, ".secret-key");
  const backupPath = path.join(root, "private-backup");
  const oldKey = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, oldKey, { mode: 0o600 });
  const db = new Database(dbPath);
  db.exec("CREATE TABLE channel_credentials (connection_id TEXT PRIMARY KEY, ciphertext TEXT NOT NULL, iv TEXT NOT NULL, auth_tag TEXT NOT NULL)");
  db.exec("CREATE TABLE provider_credentials (connection_id TEXT PRIMARY KEY, ciphertext TEXT NOT NULL, iv TEXT NOT NULL, auth_tag TEXT NOT NULL)");
  const insertChannel = db.prepare("INSERT INTO channel_credentials VALUES (?, ?, ?, ?)");
  const insertProvider = db.prepare("INSERT INTO provider_credentials VALUES (?, ?, ?, ?)");
  const insert = (statement: typeof insertChannel, id: string, value: object) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", oldKey, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    statement.run(id, ciphertext.toString("base64url"), iv.toString("base64url"), cipher.getAuthTag().toString("base64url"));
  };
  insert(insertChannel, "channel-one", { apiKey: "synthetic-channel-key" });
  insert(insertProvider, "provider-one", { secret: "synthetic-provider-key" });
  db.close();
  return { root, dbPath, keyPath, backupPath, oldKey };
}

function run(args: string[]) {
  return execFileSync(process.execPath, [scriptPath, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, OPENPRESENCE_SECRET_KEY: "" } });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("credential-key rotation", () => {
  it("checks, backs up, rotates, and recovers stored credentials without exposing their values", () => {
    const workspace = createWorkspace();
    const common = ["--db", workspace.dbPath, "--key-file", workspace.keyPath];

    expect(run(common)).toContain("Dry run passed: decrypted 2 credential records");
    expect(fs.readFileSync(workspace.keyPath).equals(workspace.oldKey)).toBe(true);

    expect(run([...common, "--apply", "--backup-dir", workspace.backupPath])).toContain("Rotation complete: 2 records re-encrypted");
    const newKey = fs.readFileSync(workspace.keyPath);
    expect(newKey).toHaveLength(32);
    expect(newKey.equals(workspace.oldKey)).toBe(false);
    expect(fs.statSync(workspace.backupPath).mode & 0o777).toBe(0o700);
    expect(fs.readFileSync(path.join(workspace.backupPath, "secret-key-before-rotation.bin")).equals(workspace.oldKey)).toBe(true);

    const rotated = new Database(workspace.dbPath, { readonly: true });
    for (const table of ["channel_credentials", "provider_credentials"]) {
      for (const row of rotated.prepare(`SELECT ciphertext, iv, auth_tag FROM ${table}`).all() as Array<{ ciphertext: string; iv: string; auth_tag: string }>) {
        const decipher = crypto.createDecipheriv("aes-256-gcm", newKey, Buffer.from(row.iv, "base64url"));
        decipher.setAuthTag(Buffer.from(row.auth_tag, "base64url"));
        expect(Buffer.concat([decipher.update(Buffer.from(row.ciphertext, "base64url")), decipher.final()]).toString()).toContain("synthetic-");
      }
    }
    rotated.close();

    fs.writeFileSync(`${workspace.dbPath}.credential-key-rotation.json`, JSON.stringify({
      dbPath: workspace.dbPath,
      keyPath: workspace.keyPath,
      databaseBackup: path.join(workspace.backupPath, "database-before-rotation.sqlite"),
      keyBackup: path.join(workspace.backupPath, "secret-key-before-rotation.bin"),
    }), { mode: 0o600 });
    expect(run(["--recover", ...common])).toContain("Restored the pre-rotation database and key");
    expect(fs.readFileSync(workspace.keyPath).equals(workspace.oldKey)).toBe(true);
  });

  it("refuses to rotate while a server lock belongs to a live process", () => {
    const workspace = createWorkspace();
    fs.writeFileSync(`${workspace.dbPath}.server-lock`, JSON.stringify({ pid: process.pid, port: 3015 }), { mode: 0o600 });
    expect(() => run(["--apply", "--backup-dir", workspace.backupPath, "--db", workspace.dbPath, "--key-file", workspace.keyPath])).toThrow(/in use by process/);
    expect(fs.readFileSync(workspace.keyPath).equals(workspace.oldKey)).toBe(true);
  });

  it("blocks server startup when an interrupted rotation needs recovery", () => {
    const workspace = createWorkspace();
    const marker = `${workspace.dbPath}.credential-key-rotation.json`;
    fs.writeFileSync(marker, "{}", { mode: 0o600 });
    expect(() => execFileSync(process.execPath, ["scripts/openpresence-server.mjs", "dev"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OPENPRESENCE_DB_PATH: workspace.dbPath, OPENPRESENCE_PORT: "39991" },
    })).toThrow(/Credential-key rotation is incomplete/);
  });
});
