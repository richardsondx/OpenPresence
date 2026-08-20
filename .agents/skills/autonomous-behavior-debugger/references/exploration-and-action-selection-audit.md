# Exploration Lifecycle & Action-Selection Audit

This reference provides specialized diagnostic runbooks for two of the most complex failure modes in autonomous agents:
1. **The Exploration & Attention Black Hole** (findings produced but never consumed or acted upon).
2. **Action-Selection Suppression** (agent deliberates but systematically shuns specific actions like reposts or quote posts).

---

## Part 1: Exploration & Attention Lifecycle Audit

When a system displays indicators like *"Findings ready to consider"* or *"Exploration active"*, but no autonomous actions emerge, execute this checklist:

### 1. The 7 Lifecycle Questions
Trace every candidate finding through these questions:

1. **Who creates the finding?**
   - Is it created by a background watcher, a scheduled cron, an embedding search, or a user drop?
   - What metadata is attached? (source URL, raw text, author, engagement metrics, timestamp).
2. **What storage state is it in?**
   - Is it stored in a database table (`findings`, `leads`, `exploration_items`)?
   - What is its status enum (`PENDING`, `DISCOVERED`, `PROCESSING`, `CONSIDERED`, `DISMISSED`)?
3. **What wakes the deliberation process?**
   - Is deliberation event-driven (wake on new finding insert), or polling-based (cron every $N$ minutes)?
   - If polling-based, is the scheduler actually active in the process manager?
4. **Is exploration starved by higher-priority agenda items?**
   - Does the agent prioritize incoming chat messages, manual user tasks, or original post timers above exploration?
   - If priority queues are used, does the exploration queue ever reach the front?
5. **Does "balanced attention" have operational meaning?**
   - Is there a hard-coded or configured budget (e.g., minimum 20% of agent cycles allocated to exploration)?
   - Or does the agent loop continuously satisfy its loop condition with `NO_OP` without ever opening the exploration drawer?
6. **Are findings being dropped by silent filters?**
   - Are stale-state rules discarding findings older than 30 minutes?
   - Are similarity deduplication thresholds too strict (e.g., treating any tech news as a duplicate)?
   - Are author reputation filters silently excluding all candidate posts?
7. **Is exploration purely observational or wired to intent?**
   - Does the code pass findings into the LLM context solely as "background info" without providing an explicit action affordance (tool/schema) to act upon them?

### 2. Diagnostic Query Patterns for Finding Lifecycles
Check the distribution of finding states in the database:
```sql
-- Example SQL to inspect finding lifecycle health
SELECT status, count(*), min(created_at), max(created_at)
FROM exploration_findings
GROUP BY status;

-- Check for stranded findings
SELECT id, source, title, created_at, last_deliberated_at
FROM exploration_findings
WHERE status = 'READY'
ORDER BY created_at ASC
LIMIT 10;
```
If `status = 'READY'` has thousands of rows and `last_deliberated_at` is `NULL`, the deliberation consumer is disconnected or deadlocked.

---

## Part 2: Action-Selection & Cognitive Bias Audit

When an agent actively considers posts and generates replies or likes, but never or rarely chooses reposts or quote posts, inspect these five structural bias vectors:

### Vector 1: Prompt Framing & Phrasing
- **The "Over-Conservation" Trap**: Prompts that say *"Only quote post if you have groundbreaking insight"* or *"Rarely repost to avoid cluttering followers' feeds"*. This causes LLMs to mathematically set the probability of repost/quote to near zero.
- **The "Conversation-First" Bias**: Prompts that emphasize *"Engage with your community through active conversations"* bias the LLM toward replies over quotes.
- **Fix**: Align prompt guidance with authentic natural social judgment: *"Repost when the original post speaks for itself and aligns with your mission. Quote-post when you can add distinct perspective, context, or humor."*

### Vector 2: Tool Descriptions & Docstrings
- **Semantic Asymmetry**: If the `reply_to_post` tool is described as *"Standard response to an interesting post"*, but `create_quote_post` is described as *"Expert commentary on major announcements"*, the agent will route 99% of normal opportunities to replies.
- **Missing or Ambiguous Parameter Guidelines**: If `create_quote_post` requires complex fields (e.g. `quote_reason`, `target_author_id`, `category`) while `reply` only requires `body`, the model will favor the simpler schema.
- **Fix**: Normalize tool descriptions so each action is presented with equal clarity, natural utility, and minimal friction.

### Vector 3: Few-Shot Example Bias
- Inspect all few-shot examples in system prompts, persona files, and skill configurations.
- Count example types:
  - Total Reply examples: $N_{reply}$
  - Total Original Post examples: $N_{post}$
  - Total Quote Post examples: $N_{quote}$
  - Total Repost examples: $N_{repost}$
- If $N_{quote} = 0$ or $N_{repost} = 0$, the LLM is primed to ignore those branches.
- **Fix**: Ensure representative, high-quality few-shot examples for *every* supported action type.

### Vector 4: Scoring, Ranking & Threshold Penalties
- If the system uses a mathematical decision function (e.g. LLM outputs candidate scores $\in [0, 1]$ which are tested against thresholds):
  - Check thresholds: If `reply_threshold = 0.6` but `quote_threshold = 0.9` and `repost_threshold = 0.95`, amplification actions will almost never fire.
  - Check action costs/penalties: If quote posts incur higher simulated "token costs" or negative score penalties in optimization algorithms.
- **Fix**: Calibrate thresholds based on empirical testing with clear candidate benchmarks.

### Vector 5: Cooldowns, Rate Limits & Deduplication
- Are cooldown timers for reposts set to 24 hours while replies are set to 5 minutes?
- Does deduplication treat quote-posting a thread as "already interacted" if the agent liked the parent post 2 days ago?
- Does the execution engine enforce a hidden rule like "max 1 quote post per week"?
- **Fix**: Harmonize rate limits to mirror natural social behavior without creating artificial dead zones.
