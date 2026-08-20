# Autonomous Behavior Debugging Report Template

Use this format for the mandatory final report at the conclusion of every autonomous behavior debugging run.

---

```markdown
# Autonomous Behavior Debugging Report: [Target Behavior Name]

## 1. Target Behavior
- **Description**: [Concise description of the autonomous behavior under investigation, e.g., Autonomous Quote-Posting on high-signal ecosystem posts]
- **Operational Scope**: [e.g. Presence / Agent / Exploration Loop / Social Connector]

## 2. Reproduction
- **Reproduction Procedure**: [Step-by-step description of how the failure was reproduced]
- **Observed Failure Mode**: [What actually happened instead of expected behavior]

## 3. Behavior Chain & First Failing Transition
| Stage | Status | Evidence / Observation |
| :--- | :--- | :--- |
| 1. Opportunity | PASS / FAIL / UNKNOWN / NOT TESTED | [Evidence note] |
| 2. Discovery | PASS / FAIL / UNKNOWN / NOT TESTED | [Evidence note] |
| 3. Observation | PASS / FAIL / UNKNOWN / NOT TESTED | [Evidence note] |
| 4. Attention | PASS / FAIL / UNKNOWN / NOT TESTED | [Evidence note] |
| 5. Consideration | PASS / FAIL / UNKNOWN / NOT TESTED | [Evidence note] |
| 6. Decision | PASS / FAIL / UNKNOWN / NOT TESTED | [Evidence note] |
| 7. Intent | PASS / FAIL / UNKNOWN / NOT TESTED | [Evidence note] |
| 8. Scheduling / Selection | PASS / FAIL / UNKNOWN / NOT TESTED | [Evidence note] |
| 9. Tool Invocation | PASS / FAIL / UNKNOWN / NOT TESTED | [Evidence note] |
| 10. Execution | PASS / FAIL / UNKNOWN / NOT TESTED | [Evidence note] |
| 11. External API Result | PASS / FAIL / UNKNOWN / NOT TESTED | [Evidence note] |
| 12. State Update | PASS / FAIL / UNKNOWN / NOT TESTED | [Evidence note] |
| 13. Feedback to Agent | PASS / FAIL / UNKNOWN / NOT TESTED | [Evidence note] |
| 14. UI & Real-World | PASS / FAIL / UNKNOWN / NOT TESTED | [Evidence note] |

- **First Failing Transition**: [Stage Name & Number, e.g. Stage 5: Consideration]
- **Failure Character**: [e.g. Model prompt instructions omitted quote post tool from active consideration set due to restrictive threshold filter]

## 4. Root Cause Analysis
- **Root Cause**: [Detailed explanation of why the failure occurred, backed by concrete runtime/code evidence]
- **Supporting Evidence**: [Log snippets, database records, prompt dump, or network traces]

## 5. Changes Implemented
- **Architectural / Code Changes**:
  - `path/to/file.ts`: [Summary of change]
  - `path/to/prompt.md`: [Summary of change]
- **Obsolete Patches Cleaned**: [Any legacy or speculative fixes removed]

## 6. Verification Results
- **Controlled Test**: `PASS` / `FAIL`
  - *Evidence*: [Observed actions across candidate benchmark suite]
- **Autonomous Multi-Cycle Test**: `PASS` / `FAIL` / `NOT YET PROVEN`
  - *Evidence*: [Results across N unconstrained autonomous cycles]
- **UI Verification**: `PASS` / `FAIL` / `NOT AVAILABLE`
  - *Evidence*: [Verification in Live Feed / Activity Stream]
- **External Platform Verification**: `PASS` / `FAIL` / `NOT AVAILABLE`
  - *Evidence*: [External post URL / Mock connector state]
- **Regression Checks**: `PASS` / `FAIL`
  - *Evidence*: [Existing tests and neighboring autonomous behaviors verified]

## 7. Remaining Concerns & Confidence
- **Remaining Concerns**: [Any edge cases, external rate limits, or areas needing longer-term monitoring]
- **Confidence Level**: `HIGH` / `MEDIUM` / `LOW`
- **Rationale**: [Justification for the confidence rating]
```
