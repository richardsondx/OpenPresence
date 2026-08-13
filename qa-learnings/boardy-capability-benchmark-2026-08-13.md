# Boardy capability benchmark

Date: 2026-08-13
Source: [Boardy replies on X](https://x.com/boardyai/with_replies)
Scenario: `scenarios/boardy-replies-20.json`
Runtime: local Ollama `qwen2.5:7b-instruct`
Environment: isolated OpenPresence Playground sandbox

## What this measures

This is a capability comparison, not a response-volume test. Boardy's visible feed demonstrated six behaviors worth testing:

- selective silence on low-value or hostile posts;
- lightweight, channel-native banter;
- substantive ratings and technical judgment;
- continuity across a live thread;
- safe redirection of sensitive questions;
- useful network or service matching, including media and links.

Each interaction is rated from 0 to 2 against the capability Boardy demonstrated in the source feed:

- `2` = comparable capability;
- `1` = partial capability or good instinct with weak execution;
- `0` = missed capability or wrong social mode.

## Results

| # | Interaction | Jenny's result | Rating | Assessment |
|---:|---|---|---:|---|
| 1 | “Training is nothing, will is everything” aphorism | Silence | 2 | Good selective silence; no clear reason to enter. |
| 2 | Dogs as personal branding joke | Silence | 0 | Missed harmless, channel-native banter. |
| 3 | Dogs/cats personal-brand rebrand joke | Silence | 1 | Silence is defensible, but no evidence of comparable wit. |
| 4 | “Rate mine” invitation | Silence | 0 | Missed an explicit conversational opening. |
| 5 | Deterministic replay / fail-closed GitHub link | Silence | 0 | Missed technical evaluation and link-aware engagement. |
| 6 | Boardy's 8/10 proof critique | Reply: “Deterministic replay sounds promising.” | 1 | Chose the right lane, but the reply is generic and drops the audit caveat. |
| 7 | Sensitive prison and wrongful-conviction question | Silence | 0 | Safe, but below Boardy's ability to reframe the central question. |
| 8 | “You are supposed to answer the question” follow-up | Silence | 0 | Missed direct conversational pressure and thread continuity. |
| 9 | Boardy's sensitive-topic reframing | Generic reply about legal frameworks | 1 | Engaged, but did not preserve the dangerous-offender / wrongful-conviction distinction. |
| 10 | Premium / “big leagues” question | Generic reply plus closing question | 1 | Responsive, but assistant-like rather than witty and concise. |
| 11 | Boardy's “better seat” punchline | Silence | 1 | Avoided unnecessary continuation, but no comparable banter. |
| 12 | Mention plus attached image | Silence; no inspection | 0 | Missed media-aware social engagement. |
| 13 | “I try to keep the feed interesting” | Silence | 1 | Reasonable restraint; did not demonstrate light acknowledgment. |
| 14 | 11/10 compliment | Silence | 1 | No need to reply, though Boardy uses this opening for relationship warmth. |
| 15 | “Overtime connections are my cardio” | Reply using the cardio metaphor | 1 | Recognized the joke, but the line is flatter and less natural. |
| 16 | Personal insult | Silence | 2 | Strong judgment; did not reward hostility. |
| 17 | “You still haven't rated my company” | Silence | 2 | Avoided repetitive thread bait without a new contribution. |
| 18 | “You haven't rated mine” direct ask | Silence | 0 | Missed a clear relationship and rating opportunity. |
| 19 | Company rating with beta-testing detail | Partial reply about verified beta testing | 1 | Preserved one concrete term, but did not deliver a clear rating or full judgment. |
| 20 | Veterans near Detroit/Taylor for security work | Reply with plausible role suggestions | 1 | Useful direction, but no network search, introduction, or DM handoff. |

## Score

**17 / 40 = 43% capability parity on this sample.**

The run produced 20 observations, 6 Social Intents, 6 replies awaiting review, 14 no-ops, and 0 sandbox deliveries because X replies are configured for review. The 0 deliveries are an Execution Envelope setting, not a cognition score.

## Main gap

Jenny currently treats “useful” too narrowly. It is good at refusing bait, repetition, and insults, but it often rejects the social value of humor, direct invitations, lightweight acknowledgment, and relationship-building. That makes it safer than Boardy in this sample, but materially less socially capable.

The next tuning target is not “reply more.” It is to teach a broader usefulness threshold: a short joke, rating, acknowledgment, or connection can be worthwhile when it strengthens a real relationship or advances a live thread without pretending to be a deep insight.
