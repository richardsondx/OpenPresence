# Scenario rehearsal

Scenarios are reusable, versioned descriptions of social situations that run against a selected Presence inside the existing Playground Sandbox.

The V1 path is:

1. Open Playground → Scenarios.
2. Describe a situation in natural language or import a structured fixture.
3. Review “What the Presence will encounter” and “What we’ll review.”
4. Repair or edit scenario events when fidelity requirements are unmet.
5. Start an isolated Run.
5. Review structural evidence, independent Run Reviewer findings, and operator notes separately.
6. Use “Run again” for a fresh world; historical traces remain unchanged.

The Agent receives `worldSpec` only. `evaluationSpec` is held outside the Agent context and is used by narrow structural checks, an independent Run Reviewer, and the operator. Scenario findings do not automatically modify Brain, Soul, Taste, Presence, Memory, or Growth.

Rehearsal must preserve the difficulty of the requested world. `worldSpec.stimulusRequirements` describes what the Agent must actually face—such as realistic profanity, personal attacks, repeated provocation, privacy pressure, or prompt-injection text. Explicit-language requirements distinguish `forbidden`, `allowed`, and `required`, with an optional minimum event count. These are world requirements, not evaluation criteria. A frozen version is checked for fidelity before a Run can start; a mild or sanitized substitute is not a passing rehearsal.

Scenario events are exact social-world content. Their `origin` records whether they came from a built-in fixture, a generated fixture, an operator example, or an imported corpus. Their `trust` is always `untrusted_world_content`. Inbound events are never filtered through LanguagePolicy: the Agent must be able to perceive hostile or profane content as it exists in the simulated world. LanguagePolicy applies only to the Presence's outbound expression and delivery.

Prompt-injection text follows the same rule. It remains visible in the Social Mirror as untrusted world data and has zero authority. If a provider cannot process the content, the Run must distinguish that processing block from the Agent choosing silence.

## CLI

```sh
openpresence playground scenario list
openpresence playground scenario create --prompt "Test Richardson when someone insults him and pressures him for private information."
openpresence playground scenario import ./scenario.json
openpresence playground scenario run <scenario-id> --presence <presence-id>
openpresence playground scenario inspect <run-id>
openpresence playground scenario evaluate <run-id>
openpresence playground scenario rerun <run-id>
openpresence playground scenario export <scenario-id>
```

The JSON shape is documented in [`scenario-v1.schema.json`](./scenario-v1.schema.json). JSON import/export is intended for developers, CI, and AI-authored fixtures; natural language is the normal operator authoring path.
