# Anti-Patterns, Legacy Patch Cleanup & Verification Standards

This reference details the 8 fatal anti-patterns in autonomous agent development, how to audit and clean up accumulated speculative fixes, and the mandatory verification standard required before declaring an autonomous behavior solved.

---

## The 8 Autonomous Debugging Anti-Patterns

### 1. Implementation-Existence Fallacy
- **Fallacy**: *"The `repost()` function is written and registered in tools, so reposting works."*
- **Reality**: A function can exist while being unreachable by the LLM, blocked by permissions, filtered by schemas, or ignored by schedulers.
- **Rule**: Code existence is zero evidence of behavior. Only observed execution and verified results count.

### 2. Prompt-Only Debugging
- **Fallacy**: *"The agent isn't quoting posts, so I will add 'PLEASE QUOTE POSTS FREQUENTLY' to the system prompt."*
- **Reality**: If the candidate context is never delivered to the model, or the tool parameter schema is corrupted, no amount of prompt shouting will fix it.
- **Rule**: Verify observation (context) and execution (tools) before modifying prompt heuristics.

### 3. First-Fix Stopping
- **Fallacy**: *"I fixed a typo in the database query, so the bug is solved."*
- **Reality**: Autonomous behavior has 14 interconnected transitions. Fixing transition 2 may just unblock transition 3, which might still be broken.
- **Rule**: Re-run the full end-to-end verification loop from opportunity to UI display after every code change.

### 4. Unit-Test Substitution
- **Fallacy**: *"The unit test `test_quote_decision()` mocked the LLM and passed, so the feature is verified."*
- **Reality**: Mocked unit tests test your mock assumptions, not real autonomous cognition, prompt token limits, or live API payload formats.
- **Rule**: Unit tests prevent regressions; live or integration rehearsal tests prove autonomy.

### 5. Forced-Success Testing
- **Fallacy**: *"I prompted the agent 'Quote tweet 123 with text Hello' and it executed, therefore quote-posting autonomy is working."*
- **Reality**: That proves Level 1 (Capability). It proves zero about Level 4 (Initiative) or Level 3 (Consideration).
- **Rule**: Always follow commanded capability tests with unconstrained controlled scenario tests.

### 6. Quota Gaming
- **Fallacy**: *"I added a counter `if (cycle % 3 == 0) force_repost()` to ensure reposts happen."*
- **Reality**: This converts an intelligent autonomous agent into a rigid, robotic script.
- **Rule**: True autonomy requires authentic decision-making based on candidate quality and taste, not hardcoded quotas.

### 7. Log-Only Success
- **Fallacy**: *"The backend log printed `HTTP 200 OK` for the repost endpoint, so the task is complete."*
- **Reality**: The frontend feed might be failing to parse the new record, or the target platform might have rejected the tweet asynchronously due to rate limits.
- **Rule**: Verify the user-facing UI and live external state.

### 8. Endless Analysis
- **Fallacy**: *"I wrote a 20-page architecture document analyzing why the agent might not be exploring."*
- **Reality**: Diagnosing without executing tests, adding instrumentation, or applying repairs does not move the product forward.
- **Rule**: Form the smallest testable hypothesis, test it immediately, apply the fix, and verify.

---

## Handling & Cleaning Up Previous Attempted Fixes

When investigating an autonomous codebase that has undergone multiple previous repair attempts:

1. **Audit Git History & Comments**:
   - Look for commits touching prompt files, schedulers, or tool schemas with messages like "fix reposting", "encourage quotes", "tweak exploration weights".
2. **Inspect for Speculative Kludges**:
   - Look for hardcoded threshold overrides (e.g. `const minScore = 0.001; // fix quote posts`).
   - Look for redundant prompt sentences tacked on to system prompts.
   - Look for duplicated tool definitions or wrapper functions.
3. **Evaluate and Remove**:
   - If a previous patch did not fix the root cause and added unnecessary complexity, **delete it cleanly** before implementing the architecturally sound solution.
   - Do not preserve broken band-aids out of caution.

---

## Verification Standard

To certify that an autonomous behavior is production-ready, it must pass all 4 verification gates:

### Gate 1: Commanded Primitive Verification
- Explicit command produces 100% successful execution, state update, and external representation.

### Gate 2: Controlled Scenario Verification
- In a 5-candidate suite (repost, quote, reply, like, ignore), the agent independently selects the appropriate action for each candidate without explicit hints.

### Gate 3: Autonomous Multi-Cycle Endurance Verification
- The agent runs over at least 5-10 autonomous cycles in its normal operational environment:
  - Background exploration runs consistently.
  - Action distribution is balanced and authentic to persona.
  - No infinite loops, duplicate actions, or zombie queue states.

### Gate 4: UI & External State Verification
- Rendered correctly in product feeds, notifications, and live platforms.
