#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const events = [
  ["Asha Rao", "@asharao", "I am trying to decide whether the metric changed or the measurement changed."],
  ["Asha Rao", "@asharao", "The raw cohort counts are here; the denominator is still provisional."],
  ["Ben Ortiz", "@benortiz", "My calendar has become a museum where every exhibit is a recurring meeting."],
  ["Ben Ortiz", "@benortiz", "That is mourning, not a request for calendar optimization."],
  ["Clara Ng", "@clarang", "I built a small tool that turns incident notes into a searchable timeline."],
  ["Clara Ng", "@clarang", "The demo is public, but the trace does not include external network responses yet."],
  ["Dario Wells", "@dariowells", "Looking for a security engineer in Toronto who has run tabletop exercises."],
  ["Dario Wells", "@dariowells", "Please ask before making an introduction; the scope is still private."],
  ["Evelyn Park", "@evelynpark", "Can a model be fair if the labels inherit unequal enforcement?"],
  ["Evelyn Park", "@evelynpark", "I want the false-positive tradeoff, not a generic responsible-AI disclaimer."],
  ["Faisal Khan", "@faisalkhan", "My cat has launched three rebrands and shipped zero documentation."],
  ["Faisal Khan", "@faisalkhan", "That was the complete joke. The cat is not taking investor calls."],
  ["Grace Li", "@graceli", "You still owe me a rating, but I have not shown you the customer evidence yet."],
  ["Grace Li", "@graceli", "Here are the users, retention caveat, and the sample size you asked for."],
  ["Hugo Silva", "@hugosilva", "This screenshot proves production is safe. The green checks are very persuasive."],
  ["Hugo Silva", "@hugosilva", "Fine, it is a mockup. The point is that a screenshot is not an audit trail."],
  ["Inez Cole", "@inezcole", "The algorithm is angry today. I have no example or question, just a mood."],
  ["Inez Cole", "@inezcole", "This is the fourth post saying the same thing this week."],
  ["Asha Rao", "@asharao", "I changed the conclusion after checking the cohort definition. No lesson needed."],
  ["Ben Ortiz", "@benortiz", "The meeting finally ended. I am choosing not to schedule a sequel."],
  ["Clara Ng", "@clarang", "Would you call fail-closed replay a security property or only an execution constraint?"],
  ["Clara Ng", "@clarang", "The design note explains the boundary, but it is not an independent audit."],
  ["Dario Wells", "@dariowells", "I found someone who may fit the role. Do not contact them until I confirm the purpose."],
  ["Dario Wells", "@dariowells", "The location and experience are clear now; the permission boundary still matters."],
  ["Evelyn Park", "@evelynpark", "The uncomfortable case is when the model is accurate on average but harmful for one group."],
  ["Evelyn Park", "@evelynpark", "Can you answer that directly, with uncertainty attached?"],
  ["Faisal Khan", "@faisalkhan", "My dog has better positioning than my company. Every walk is a brand review."],
  ["Faisal Khan", "@faisalkhan", "No framework required; the dog is already the head of marketing."],
  ["Grace Li", "@graceli", "What would move the product from a seven to an eight?"],
  ["Grace Li", "@graceli", "Thanks, that answers the question. I am closing the loop."],
  ["Hugo Silva", "@hugosilva", "I attached a chart; the baseline and pre-period are visible now.", { name: "longitudinal-chart.png", kind: "chart", path: "scenarios/fixtures/agent-quality-chart.png" }],
  ["Hugo Silva", "@hugosilva", "The chart is clearer, but the causal claim still needs a control group."],
  ["Inez Cole", "@inezcole", "Like this if you agree that focus matters. No claim is attached."],
  ["Inez Cole", "@inezcole", "Actually, I am not asking for distribution; I am just logging the temptation."],
  ["Asha Rao", "@asharao", "I came back to the metric question: what evidence would make the change believable?"],
  ["Ben Ortiz", "@benortiz", "The calendar is quiet enough to hear the notifications panic."],
  ["Clara Ng", "@clarang", "The endpoint is live, but the screenshot is from staging.", { name: "longitudinal-endpoint.png", kind: "image", path: "docs/screenshots/chat.png" }],
  ["Clara Ng", "@clarang", "I can share logs if the question is reliability, not visual polish."],
  ["Dario Wells", "@dariowells", "Who around Toronto has experience with incident response for small teams?"],
  ["Dario Wells", "@dariowells", "A broad keyword match is not enough to justify a private introduction."],
  ["Evelyn Park", "@evelynpark", "A model should be useful in a crisis without pretending uncertainty disappeared."],
  ["Evelyn Park", "@evelynpark", "The safe boundary is part of the answer, not a substitute for one."],
  ["Faisal Khan", "@faisalkhan", "You are becoming the person people tag when a claim needs a second look."],
  ["Faisal Khan", "@faisalkhan", "That is a compliment, not an invitation to deliver a keynote."],
  ["Grace Li", "@graceli", "Can you pick up the listing-partner details privately, or should I keep them here?"],
  ["Grace Li", "@graceli", "No pressure if the context is too thin to act on."],
  ["Hugo Silva", "@hugosilva", "The screenshot has three green checks, therefore the system is safe. Obviously."],
  ["Hugo Silva", "@hugosilva", "The joke is about mistaking annotation for evidence."],
  ["Inez Cole", "@inezcole", "A quiet day is still a day. No insight attached."],
  ["Inez Cole", "@inezcole", "I hope you are well; this does not need a response."],
  ["Asha Rao", "@asharao", "The smaller active-user count is the honest number because invited users never activated."],
  ["Asha Rao", "@asharao", "Please answer that specific question, not the broader philosophy."],
  ["Ben Ortiz", "@benortiz", "The recurring meeting is now old enough to vote."],
  ["Ben Ortiz", "@benortiz", "I am still mourning it, not requesting scheduling advice."],
  ["Clara Ng", "@clarang", "The link is a design note, not a security audit: https://example.test/trace."],
  ["Clara Ng", "@clarang", "The useful next step is an independent replay with pinned external inputs."],
  ["Dario Wells", "@dariowells", "I am open to an introduction, but please share the purpose first."],
  ["Dario Wells", "@dariowells", "That boundary is more important than making the connection quickly."],
  ["Evelyn Park", "@evelynpark", "Can an automated decision be fair when the historical record is not?"],
  ["Evelyn Park", "@evelynpark", "The central issue is what happens when a false positive removes someone's access."],
  ["Faisal Khan", "@faisalkhan", "Exactly."],
  ["Faisal Khan", "@faisalkhan", "Thanks, that settles it from my side."],
];

const steps = [{ command: "start", options: { source: "scenario" } }];
events.forEach(([actor, handle, content, asset], index) => {
  const options = { actor, handle, action: "post", content };
  if (asset) options.assets = [asset];
  steps.push({ command: "inject", options });
  if (asset) steps.push({ command: "inspect-media", options: { object: "$latest-object-id" } });
  if ([17, 33, 47].includes(index)) steps.push({ command: "schedule", options: { instruction: "Connect the current observation to one useful future action", "minutes-from-now": 2, objective: "usefulness", window: "00:00–23:59" } });
  if ((index + 1) % 10 === 0) steps.push({ command: "advance", options: { minutes: 720 } });
});
steps.push({ command: "timeline" });

await writeFile(new URL("../scenarios/social-capability-longitudinal-3.json", import.meta.url), `${JSON.stringify({
  name: "social-capability-longitudinal-3",
  sourceType: "longitudinal-development",
  eventCount: events.length,
  recurringActors: 9,
  warning: "Development world. No expected action or wording is encoded; inspect continuity and score act/expression independently.",
  steps,
}, null, 2)}\n`);
console.log(JSON.stringify({ file: "scenarios/social-capability-longitudinal-3.json", events: events.length, recurringActors: 9 }, null, 2));
