#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const scenarioPath = process.argv[2] ?? "scenarios/social-capability-holdout-60.json";
const sealPath = process.argv[3] ?? "qa-learnings/social-capability-holdout-60-seal.json";
const scenario = JSON.parse(await readFile(scenarioPath, "utf8"));
const seal = JSON.parse(await readFile(sealPath, "utf8"));
const recordedSeal = scenario.seal;
delete scenario.seal;
const caseCount = scenario.steps.filter((step) => step.command === "inject").length;
const canonicalHash = createHash("sha256").update(`${JSON.stringify(scenario, null, 2)}\n`).digest("hex");
const valid = canonicalHash === seal.sha256 && canonicalHash === recordedSeal?.sha256 && seal.caseCount === caseCount;
const result = { valid, scenarioPath, sealPath, caseCount, canonicalHash, recordedHash: seal.sha256, individualCaseInspection: seal.individualCaseInspection };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!valid) process.exitCode = 1;
