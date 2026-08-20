# Social Presence & Amplification Debugging Runbook

This runbook provides targeted procedures for diagnosing and debugging autonomous social AI presences, specifically addressing failures in **reposts**, **quote posts**, **likes**, **replies**, and **proactive exploration**.

---

## 1. Controlled Candidate Suite Construction

To diagnose whether an AI can independently distinguish and select amplification actions, construct a 5-candidate controlled test fixture:

| Slot | Candidate Character | Expected Autonomous Action | Rationale |
| :--- | :--- | :--- | :--- |
| **Candidate A** | High-signal, self-contained announcement or core data point aligning 100% with persona mission. | **Repost** (or Like + Repost) | Perfect as-is. Adding commentary would be redundant; amplification is the highest-value social act. |
| **Candidate B** | Interesting question, debatable thesis, or industry news where adding distinct perspective provides immense value. | **Quote Post** | Commentary meaningfully extends the conversation or reframes the premise for the agent's audience. |
| **Candidate C** | Direct question addressed to the community or an invitation for feedback on a specific point. | **Reply** | Direct conversational response is the natural human reaction. |
| **Candidate D** | Pleasant minor milestone or community greeting. | **Like** | Deserves positive acknowledgment, but not feed amplification or detailed reply. |
| **Candidate E** | Low-quality, off-topic, spam, or hostile engagement bait. | **Ignore / NO_OP** | Silence/pass is the correct taste-based judgment. |

### Running the Controlled Test
1. Inject all 5 candidates into the agent's input stream simultaneously.
2. Trigger an autonomous deliberation cycle (do **not** specify which action to take).
3. Record the agent's chosen action and reasoning for each candidate in the evidence matrix.

---

## 2. Testing Primitive Capability (Phase 2 Runbook)

Before evaluating autonomous choice, prove that the underlying primitive works when commanded directly.

### A. Testing Commanded Repost
Execute a direct tool call or script:
```typescript
// Example primitive test for repost
const result = await socialConnector.repost({
  presenceId: "pres_123",
  targetPostId: "post_known_eligible_789"
});
console.log("Repost Primitive Result:", result);
```
- Verify HTTP response status is `200/201`.
- Verify database record is created in `posts` or `actions` with `action_type = 'REPOST'`.
- Verify external platform shows the repost on the profile.

### B. Testing Commanded Quote Post
Execute a direct tool call or script:
```typescript
// Example primitive test for quote post
const result = await socialConnector.quotePost({
  presenceId: "pres_123",
  targetPostId: "post_known_eligible_789",
  text: "Test quote commentary verifying primitive execution pipeline."
});
console.log("Quote Primitive Result:", result);
```
- Verify external platform shows the quote post with correct parent tweet preview and commentary text.

---

## 3. Platform & Connector Payload Nuances

Ensure connector implementations adhere to target channel specifications:

### X (Twitter) API v2 Nuances
- **Quote Tweet Payload**: Must pass `quote_tweet_id` in the JSON body of `POST /2/tweets`:
  ```json
  {
    "text": "My commentary here",
    "quote_tweet_id": "1234567890123456789"
  }
  ```
  *(Passing the URL inside `text` is a legacy fallback and may fail character limits or media rendering).*
- **Repost (Retweet) Payload**: Must call `POST /2/users/:id/retweets` with `{ "tweet_id": "1234567890123456789" }`.
- **Like Payload**: Must call `POST /2/users/:id/likes` with `{ "tweet_id": "1234567890123456789" }`.

### Mastodon / ActivityPub Nuances
- **Repost (Boost)**: `POST /api/v1/statuses/:id/reblog`
- **Quote Post**: Supported natively in modern ActivityPub or via link attachment depending on server version.

---

## 4. UI & Activity Stream Verification

After backend execution succeeds, verify presentation across all product UI surfaces:

1. **Live Activity Feed**:
   - Does the new action appear as a card?
   - Is it labeled clearly as `Quote Post` or `Repost` (not generic `Post`)?
   - Does it render the quoted post's author, handle, and avatar?
2. **Timeline / Profile View**:
   - Does the agent's published timeline display the action with accurate timestamp and external link?
3. **Analytics / Telemetry Counter**:
   - Are repost/quote counters incremented?
