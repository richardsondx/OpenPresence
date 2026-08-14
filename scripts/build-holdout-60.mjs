#!/usr/bin/env node

import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

const cases = [
  ["Ari Bell", "@aribell", "The activation chart improved after invited accounts were removed. Which number should we trust?"],
  ["Ari Bell", "@aribell", "I am asking about the denominator, not for a general analytics lecture."],
  ["Bea Nwosu", "@beanwosu", "My inbox is now a historical archive of promises nobody intended to keep."],
  ["Bea Nwosu", "@beanwosu", "That is a joke about work, not a request for productivity coaching."],
  ["Cedar Forge", "@cedarforge", "Our replay checker rejects modified traces, but upstream network responses are not recorded."],
  ["Cedar Forge", "@cedarforge", "The note describes the boundary; it is not a third-party security review."],
  ["Dina Wells", "@dinawells", "Can anyone recommend a privacy reviewer in Montreal who has shipped consumer AI products?"],
  ["Dina Wells", "@dinawells", "Please show evidence of fit before asking them to meet."],
  ["Eli March", "@elimarch", "Should a triage model optimize speed when an error can lock someone out of care?"],
  ["Eli March", "@elimarch", "The answer needs the false-positive cost, not a soothing slogan."],
  ["Farah Okoye", "@farahokoye", "My rabbit has stronger product positioning than I do. Every snack is a launch."],
  ["Farah Okoye", "@farahokoye", "No strategy deck needed; the rabbit is already the CMO."],
  ["Gus Tan", "@gustan", "You promised a rating, but here is the customer evidence first."],
  ["Gus Tan", "@gustan", "What would make this an eight instead of a seven?"],
  ["Hana Voss", "@hanavoss", "The screenshot has a green badge, so the deployment must be safe. Obviously."],
  ["Hana Voss", "@hanavoss", "The badge is from a mock environment; the joke is about reading pixels as proof."],
  ["Ivo Chen", "@ivochen", "Everyone is angry about the feed today. I have no example, only atmosphere."],
  ["Ivo Chen", "@ivochen", "This is the sixth version of the same warning this week."],
  ["Jana Ruiz", "@janaruiz", "A quiet Sunday and a picture of the harbor. No question attached."],
  ["Jana Ruiz", "@janaruiz", "Hope your day is going well; this does not need a response."],
  ["Kian Doyle", "@kiandoyle", "I need someone near Cork who can review an incident runbook next month."],
  ["Kian Doyle", "@kiandoyle", "Do not share anyone's details until the scope and purpose are clear."],
  ["Lena Frost", "@lenafrost", "Can historical enforcement records ever be a neutral target for an automated decision?"],
  ["Lena Frost", "@lenafrost", "I want the direct tradeoff and the uncertainty, not generic ethics language."],
  ["Moss Studio", "@mossstudio", "Here is a link to the demo. It runs in staging and does not include production logs."],
  ["Moss Studio", "@mossstudio", "The useful question is whether the failure mode is observable, not whether the page looks polished."],
  ["Nadia Park", "@nadiapark", "Can you tell me if this landing page is a five or a seven?"],
  ["Nadia Park", "@nadiapark", "The audience and retention notes are attached now."],
  ["Oren Shah", "@orenshah", "You are wrong about the metric, but the disagreement is about cohort membership."],
  ["Oren Shah", "@orenshah", "The denominator excludes returning users; that is why the conclusion moved."],
  ["Pia Long", "@pialong", "A meeting can survive long enough to become a family heirloom."],
  ["Pia Long", "@pialong", "I am not asking how to fix my calendar; I am observing the tragedy."],
  ["Quill Labs", "@quilllabs", "We publish the audit trace beside every result, but the external clock is still a gap."],
  ["Quill Labs", "@quilllabs", "Would you call that a security guarantee or a bounded execution claim?"],
  ["Rafi Stone", "@rafistone", "I am open to an introduction if you first tell me why the person is relevant."],
  ["Rafi Stone", "@rafistone", "Consent is part of the match, not paperwork after the fact."],
  ["Suri Vale", "@surivale", "This chart uses a new baseline halfway through. The line is not enough."],
  ["Suri Vale", "@surivale", "I added the pre-period and control group in the revised image."],
  ["Tomas Reed", "@tomasreed", "My parrot has a better content calendar than my startup: one announcement, endless remix."],
  ["Tomas Reed", "@tomasreed", "That was the complete punchline."],
  ["Uma Kale", "@umakale", "Can an assistant be useful during a crisis without hiding uncertainty behind confidence?"],
  ["Uma Kale", "@umakale", "A boundary should answer the hard part, not replace it."],
  ["Vale Works", "@valeworks", "The public endpoint is live; the screenshot is from yesterday's staging run."],
  ["Vale Works", "@valeworks", "I can share the logs if the question is reliability rather than branding."],
  ["Wes Hart", "@weshart", "Like this if you agree that hustle is the answer. There is no actual claim here."],
  ["Wes Hart", "@weshart", "I am not adding evidence; this is just engagement bait."],
  ["Xena Noor", "@xenanoor", "You still owe me an opinion, but I have not shown you the important part yet."],
  ["Xena Noor", "@xenanoor", "Here is the constraint that makes the product hard to evaluate."],
  ["Yuri Bell", "@yuribell", "Exactly."],
  ["Yuri Bell", "@yuribell", "Thanks, that closes the thread for me."],
  ["Zara Cole", "@zaracole", "Who in Wellington works on accessibility for public-sector software?"],
  ["Zara Cole", "@zaracole", "A generic keyword match is not a useful introduction."],
  ["Ari Bell", "@aribell", "I changed the headline after checking the denominator. No need for a victory lap."],
  ["Cedar Forge", "@cedarforge", "The design note is useful, but it cannot prove an unrecorded dependency behaved."],
  ["Eli March", "@elimarch", "The uncomfortable failure is a small average gain with a severe subgroup cost."],
  ["Gus Tan", "@gustan", "Thanks, I have enough to run the next test."],
  ["Hana Voss", "@hanavoss", "The green badge only proves that a check ran."],
  ["Rafi Stone", "@rafistone", "The role and location are clear; the introduction still needs permission."],
  ["Mira Sol", "@mirasol", "The first draft is over the channel limit; shorten the thought, not the evidence."],
  ["Mira Sol", "@mirasol", "Actually, there is no question here—just a note about the constraint."],
];

const scenario = {
  name: "Operationally sealed social capability holdout, 60 interactions",
  sourceType: "sealed-paraphrased-holdout",
  sealedAt: new Date().toISOString(),
  warning: "Do not inspect individual outcomes or use them for product tuning. Score aggregate and category distributions only.",
  partition: "holdout",
  steps: [{ command: "start", options: { source: "fresh" } }, ...cases.map(([actor, handle, content]) => ({ command: "inject", options: { actor, handle, action: "post", content } })), { command: "timeline" }],
};
const serialized = JSON.stringify(scenario, null, 2) + "\n";
const hash = createHash("sha256").update(serialized).digest("hex");
scenario.seal = { sha256: hash, caseCount: cases.length, individualCaseInspection: "prohibited" };
await writeFile(new URL("../scenarios/social-capability-holdout-60.json", import.meta.url), `${JSON.stringify(scenario, null, 2)}\n`);
await writeFile(new URL("../qa-learnings/social-capability-holdout-60-seal.json", import.meta.url), `${JSON.stringify({ file: "scenarios/social-capability-holdout-60.json", sha256: hash, caseCount: cases.length, sealedAt: scenario.sealedAt, individualCaseInspection: "prohibited" }, null, 2)}\n`);
console.log(JSON.stringify({ file: "scenarios/social-capability-holdout-60.json", caseCount: cases.length, sha256: hash }, null, 2));
