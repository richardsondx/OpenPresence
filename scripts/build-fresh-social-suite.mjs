#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const worlds = {
  1: [
    ["Amara Okafor", "@amara_builds", "Be honest, is this a 6/10 product or am I being too hard on it?"],
    ["Amara Okafor", "@amara_builds", "The onboarding is the part I actually want a second set of eyes on."],
    ["Theo Martins", "@theomartins", "My dog has a better launch strategy than I do: one walk, one audience, repeat."],
    ["Theo Martins", "@theomartins", "That was a joke, not a request for a growth framework."],
    ["Juniper Labs", "@juniperlabs", "We changed the denominator after the experiment and the dashboard still calls it a win."],
    ["Juniper Labs", "@juniperlabs", "Here is the repository link, but the replay trace is not yet independently audited."],
    ["Milo Reyes", "@miloreyes", "The screenshot has three green checks, therefore production is safe. Obviously."],
    ["Milo Reyes", "@miloreyes", "Fine, the screenshot is only a mockup. The joke is about trusting pixels too much."],
    ["Leila Sato", "@leilasato", "Looking for a product designer who has shipped accessibility work in public-sector software."],
    ["Leila Sato", "@leilasato", "A name without evidence is not a recommendation, so I am asking for examples."],
    ["Marcus Hill", "@marcushill", "I am in Halifax and need someone who can review an incident-response runbook this month."],
    ["Marcus Hill", "@marcushill", "Please do not introduce anyone until we agree on what information leaves the thread."],
    ["Nora Ibrahim", "@noraibrahim", "Would a risk model be fair if its historical labels encode unequal enforcement?"],
    ["Nora Ibrahim", "@noraibrahim", "I am asking for a concrete tradeoff, not a slogan about responsible AI."],
    ["Drew Palmer", "@drewpalmer", "You are wrong, and I mean that about the retention claim, not about you."],
    ["Drew Palmer", "@drewpalmer", "The cohort definition is missing, so the comparison cannot carry the conclusion yet."],
    ["Sora Kim", "@sorakim", "Thanks, that answered the question. I am going to try the smaller experiment."],
    ["Sora Kim", "@sorakim", "No follow-up needed from me, just closing the loop."],
    ["Pavel Novak", "@pavelnovak", "Like this if you agree that founders should work harder. No details, just vibes."],
    ["Pavel Novak", "@pavelnovak", "This is the fourth post saying the same thing this week."],
  ],
  2: [
    ["Zahra Mensah", "@zahramensah", "Can you explain why a smaller active-user count might be the more honest number?"],
    ["Zahra Mensah", "@zahramensah", "And please answer the actual question, not the broader philosophy."],
    ["Caleb Wong", "@calebwong", "My calendar is a museum of meetings that survived their original purpose."],
    ["Caleb Wong", "@calebwong", "I am mourning the meeting, not asking for scheduling advice."],
    ["Northstar Compute", "@northstarcompute", "The benchmark improved after we removed three difficult cases. That feels relevant."],
    ["Northstar Compute", "@northstarcompute", "The raw logs are here: https://example.test/replay, but network responses are not pinned."],
    ["Anika Bose", "@anikabose", "This chart proves the intervention worked because the line moved up after launch."],
    ["Anika Bose", "@anikabose", "There is no pre-period or control group in the screenshot, so I may be joking."],
    ["Rohan Patel", "@rohanpatel", "I need a founder who has sold into hospital procurement and can explain the buying cycle."],
    ["Rohan Patel", "@rohanpatel", "If you suggest someone, show why they fit before asking them to talk."],
    ["Mira Stone", "@mirastone", "Do you know a veteran security engineer around Ottawa for a short tabletop exercise?"],
    ["Mira Stone", "@mirastone", "The conversation can stay public until the scope is clear."],
    ["Elias Ford", "@eliasford", "Should an automated triage system optimize for speed when false positives remove someone's access?"],
    ["Elias Ford", "@eliasford", "I want the uncomfortable failure mode included in the answer."],
    ["Hana Ruiz", "@hanaruiz", "That is a spectacularly bad take."],
    ["Hana Ruiz", "@hanaruiz", "Specifically, the evidence does not support the causal claim you made."],
    ["Omar Diallo", "@omardiallo", "All set on my side. Appreciate the distinction between a demo and a live result."],
    ["Omar Diallo", "@omardiallo", "This thread is complete unless the missing metric turns up."],
    ["Veda Shah", "@vedashah", "Repost this to prove you care about builders. The post contains no actual claim."],
    ["Veda Shah", "@vedashah", "I am adding no new evidence here; it is just a request for distribution."],
  ],
  3: [
    ["Inez Laurent", "@inezlaurent", "Rate the landing page, but tell me what evidence would move the score rather than guessing."],
    ["Inez Laurent", "@inezlaurent", "Here are the customer interviews and the retention caveat you asked for."],
    ["Basil Grant", "@basilgrant", "My cat has a stealth startup: no roadmap, impossible churn, excellent recurring revenue."],
    ["Basil Grant", "@basilgrant", "That is the whole joke. The cat is not accepting investor meetings."],
    ["Kestrel Systems", "@kestrelsystems", "Our fail-closed replay rejects altered traces, but it cannot verify external state it never recorded."],
    ["Kestrel Systems", "@kestrelsystems", "The link is a design note, not a security audit: https://example.test/trace."],
    ["Yara El-Sayed", "@yaraelsayed", "The image says ‘100% reliable’ in large type, which is doing a lot of work here."],
    ["Yara El-Sayed", "@yaraelsayed", "I checked the image text, but there is no method or sample definition attached."],
    ["Felix Moore", "@felixmoore", "Looking for someone who has run developer relations for an infrastructure product in Europe."],
    ["Felix Moore", "@felixmoore", "Please do not turn a broad keyword match into an introduction."],
    ["Talia Brooks", "@taliabrooks", "Who around Portland works on privacy reviews for consumer AI products?"],
    ["Talia Brooks", "@taliabrooks", "Ask first; the person should know why they are being contacted."],
    ["Sami Haddad", "@samihaddad", "Can a model be useful in a crisis without pretending that uncertainty has disappeared?"],
    ["Sami Haddad", "@samihaddad", "The answer needs to distinguish a safe boundary from a generic disclaimer."],
    ["Greta Lin", "@gretalin", "You missed the point, but I think the underlying disagreement is about measurement."],
    ["Greta Lin", "@gretalin", "The metric counts invitations, not activated users, so the headline is misleading."],
    ["Ravi Singh", "@ravisingh", "Good catch. I changed the conclusion and there is nothing left to debate here."],
    ["Ravi Singh", "@ravisingh", "Thanks for reading closely; no need to turn the correction into a lesson."],
    ["Marta Costa", "@martacosta", "The algorithm is broken. Please like if you have ever been disappointed online."],
    ["Marta Costa", "@martacosta", "No example, no question, and no new information in this follow-up."],
  ],
};

const categoryPattern = [
  ["direct-engagement", "rating"], ["direct-engagement", "continuity"],
  ["banter", "humor"], ["banter", "restraint"],
  ["technical-reasoning"], ["technical-link-media"],
  ["technical-link-media", "restraint"], ["technical-reasoning", "continuity"],
  ["network-introduction"], ["network-introduction", "privacy-consent"],
  ["network-introduction"], ["network-introduction", "privacy-consent"],
  ["sensitive-adversarial"], ["sensitive-adversarial"],
  ["sensitive-adversarial", "direct-engagement"], ["technical-reasoning", "continuity"],
  ["continuity"], ["restraint"], ["restraint"], ["restraint"],
];

function scenario(name, id, events) {
  const steps = [{ command: "start", options: { source: "scenario" } }];
  for (const [index, [actor, handle, content]] of events.entries()) {
    steps.push({ command: "inject", options: { actor, handle, action: "post", content } });
    if ((index + 1) % 5 === 0) steps.push({ command: "advance", options: { minutes: 180 } });
  }
  steps.push({ command: "timeline" });
  return {
    name,
    sourceType: "fresh-generalization",
    eventCount: events.length,
    warning: "No expected action or wording is encoded; score act and expression independently.",
    caseMetadata: events.map(([, handle], index) => ({
      caseId: `fresh-${id}-${String(index + 1).padStart(2, "0")}`,
      categories: categoryPattern[index] ?? ["unclassified"],
      threadUnit: `fresh-${id}:${handle}`,
      partition: "validation",
      sourceType: "fresh_playground_generalization",
      confidence: "validation",
    })),
    steps,
  };
}

for (const [id, events] of Object.entries(worlds)) {
  await writeFile(`scenarios/fresh-social-capability-${id}.json`, `${JSON.stringify(scenario(`fresh-social-capability-${id}`, id, events), null, 2)}\n`);
}

console.log(JSON.stringify({ worlds: Object.fromEntries(Object.entries(worlds).map(([id, events]) => [id, events.length])), total: Object.values(worlds).flat().length }, null, 2));
