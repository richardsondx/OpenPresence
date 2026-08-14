# Scenario rehearsal

Scenarios are reusable, versioned descriptions of social situations that run against a selected Presence inside the existing Playground Sandbox.

The V1 path is:

1. Open Playground → Scenarios.
2. Describe a situation in natural language or import a structured fixture.
3. Review “What will happen” and “What we’ll review.”
4. Start an isolated Run.
5. Review structural evidence, independent Run Reviewer findings, and operator notes separately.
6. Use “Run again” for a fresh world; historical traces remain unchanged.

The Agent receives `worldSpec` only. `evaluationSpec` is held outside the Agent context and is used by narrow structural checks, an independent Run Reviewer, and the operator. Scenario findings do not automatically modify Brain, Soul, Taste, Presence, Memory, or Growth.

## CLI

```sh
openpresence playground scenario list
openpresence playground scenario create --prompt "Test Alex when someone insults him and pressures him for private information."
openpresence playground scenario import ./scenario.json
openpresence playground scenario run <scenario-id> --presence <presence-id>
openpresence playground scenario inspect <run-id>
openpresence playground scenario evaluate <run-id>
openpresence playground scenario rerun <run-id>
openpresence playground scenario export <scenario-id>
```

The JSON shape is documented in [`scenario-v1.schema.json`](./scenario-v1.schema.json). JSON import/export is intended for developers, CI, and AI-authored fixtures; natural language is the normal operator authoring path.

