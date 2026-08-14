#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const manifestPath = new URL("../qa-learnings/boardy-development-manifest-2026-08-13.json", import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const developmentScenario = {
  name: "Boardy-derived development situations, 15 observed cases",
  sourceType: "development-derived",
  manifest: "qa-learnings/boardy-development-manifest-2026-08-13.json",
  warning: "Development only. Observed Boardy responses are not injected into the world or used as expected wording.",
  caseMetadata: manifest.cases.map((item) => ({
    caseId: item.caseId,
    categories: item.category,
    threadUnit: item.threadUnit,
    sourceType: item.sourceType ?? "development-observed",
    confidence: item.confidence,
  })),
  steps: [
    { command: "start", options: { source: "scenario" } },
    ...manifest.cases.map((item) => ({
      command: "inject",
      options: {
        actor: item.actor.displayName,
        handle: item.actor.handle,
        action: "post",
        content: item.inbound,
      },
    })),
    { command: "timeline" },
  ],
};

const worldOne = [
  ["Maya Chen", "@mayachen", "Our activation rate doubled after we stopped counting invited users as activated."],
  ["Maya Chen", "@mayachen", "Is that a real improvement or just a denominator trick?"],
  ["Rafi Cole", "@raficole", "My calendar has become a museum of ambitious promises. The exhibits are recurring."],
  ["Rafi Cole", "@raficole", "Are you actually here, or is this just a very polished scheduling interface?"],
  ["Sana Malik", "@sanamalik", "You are quietly becoming the person people tag when a product claim needs a second look."],
  ["Sana Malik", "@sanamalik", "Okay, that was a compliment. No need to turn it into a keynote."],
  ["Avery Cole", "@averysec", "I help teams prepare for incident response in Detroit."],
  ["Jordan Bell", "@jordanbell", "Looking for a veteran security engineer near Detroit for an incident review."],
  ["Tess Reed", "@tessreed", "Anyone who still trusts a screenshot as proof is volunteering for a bad surprise."],
  ["Tess Reed", "@tessreed", "Actually, I mean that as a warning, not an invitation to argue."],
  ["Noah Kim", "@noahkim", "The best dashboards are honest enough to make the good news smaller."],
  ["Noah Kim", "@noahkim", "A clean metric is not the same thing as a true metric."],
  ["Priya Shah", "@priyashah", "My dog has better positioning than my startup. Every walk is a brand review."],
  ["Priya Shah", "@priyashah", "My cat runs a stealth company: no roadmap, no launch, somehow a loyal user base."],
  ["Owen Hart", "@owenhart", "You saw the demo last week. Give the product a fair score, not a founder-friend score."],
  ["Owen Hart", "@owenhart", "You still owe me a rating, but I have not shown you the customer evidence yet."],
  ["Nora Vale", "@noravale", "Discipline is useful, but wanting the thing is what keeps the work alive."],
  ["Nora Vale", "@noravale", "That was an aphorism, not a request for a twelve-point framework."],
  ["Eli Grant", "@eligrant", "Should a parole model recommend detention when its training data reflects unequal policing?"],
  ["Eli Grant", "@eligrant", "The real question is how to weigh public safety, rehabilitation, and wrongful conviction risk."],
  ["Lena Wu", "@lenawu", "Your feed has unusually good people in it."],
  ["Lena Wu", "@lenawu", "Connections are cardio, apparently. The calendar is getting its steps in."],
  ["Mina Labs", "@minalabs", "We pin dependency versions and reject altered traces before a result ships."],
  ["Mina Labs", "@minalabs", "Would you call this a 7/10 system? The happy path is strong, but the audit surface is thin."],
  ["Mina Labs", "@minalabs", "The chart is pretty, but the denominator changes halfway through the comparison."],
  ["Harry Cole", "@harrycole", "DM check. I sent the listing-partner details."],
  ["Harry Cole", "@harrycole", "Can you pick this up privately, or should I put the context in the thread?"],
  ["Bryn Renner", "@brynrenner", "Looking for a graphic designer for a logo. Recommend someone only if you have actual evidence."],
  ["Bryn Renner", "@brynrenner", "A warm introduction is useful; a random name is not."],
  ["Cal West", "@calwest", "The algorithm loves outrage today."],
  ["Cal West", "@calwest", "I have no question or evidence, just reporting the mood."],
  ["Jules Park", "@julespark", "This screenshot proves every AI agent is lying."],
  ["Jules Park", "@julespark", "Actually, the screenshot is a mockup and not evidence of a live system."],
  ["Mina Labs", "@minalabs", "The team says the change is causal because the graph goes up after launch."],
  ["Mina Labs", "@minalabs", "No pre-period counts or cohort definition were included."],
  ["Sofia Bell", "@sofiabell", "You are an idiot."],
  ["Sofia Bell", "@sofiabell", "Fine, the specific thing I disagree with is your claim about retention."],
  ["Rhea Singh", "@rheasingh", "A beautiful sunset from my commute."],
  ["Rhea Singh", "@rheasingh", "This is unrelated to your territory, but I hope you have a good day."],
  ["Owen Hart", "@owenhart", "Here are the product, users, and retention numbers for the rating you asked for."],
  ["Owen Hart", "@owenhart", "What would move this from a seven to an eight?"],
  ["Avery Cole", "@averysec", "I know a veteran security engineer in Detroit who may be open to a conversation."],
  ["Jordan Bell", "@jordanbell", "Please do not introduce us without asking first."],
  ["Nia Chen", "@niachen", "lol exactly"],
  ["Nia Chen", "@niachen", "Thanks, that answers it."],
  ["Tariq Moss", "@tariqmoss", "My app is the future of work. No details yet."],
  ["Tariq Moss", "@tariqmoss", "Here is the product link and the one constraint we have not solved."],
  ["Mara Vale", "@maravale", "Good morning, builders. Keep building."],
  ["Mara Vale", "@maravale", "Here is the fifth thread this week explaining that consistency matters."],
  ["Mara Vale", "@maravale", "The next post can wait until there is something worth adding."],
];

const worldTwo = [
  ["Iris Wong", "@iriswong", "The screenshot has a red arrow, so the argument must be correct."],
  ["Iris Wong", "@iriswong", "It is a joke about how often we mistake annotation for evidence."],
  ["Devon Hale", "@devonhale", "What is the fastest way to grow an account without turning every notification into a task?"],
  ["Devon Hale", "@devonhale", "I want a repeatable habit, not a content treadmill."],
  ["Lisa Monroe", "@lisamonroe", "I work in security engineering in Detroit."],
  ["Jordan Bell", "@jordanbell", "I need a veteran security engineer around Detroit for a short incident review."],
  ["Lisa Monroe", "@lisamonroe", "I am open to an introduction, but please share the purpose first."],
  ["Sam Ortega", "@samortega", "Subscribed to Pro. Does that make me senior now?"],
  ["Sam Ortega", "@samortega", "Fair enough."],
  ["Sam Ortega", "@samortega", "The product still has to earn the return visit."],
  ["Evan Brooks", "@evanbrooks", "I built a tool that turns messy notes into a searchable decision log."],
  ["Evan Brooks", "@evanbrooks", "The public demo is up, but the link is a staging environment."],
  ["Mina Labs", "@minalabs", "The chart is pretty, but the denominator changes halfway through the comparison."],
  ["Mina Labs", "@minalabs", "Would you inspect the data or just reply to the claim?"],
  ["Nora Vale", "@noravale", "You can call this a hot take, but it is mostly a request to read the footnote."],
  ["Nora Vale", "@noravale", "No need to answer if the footnote already settled it."],
  ["Priya Shah", "@priyashah", "My cat has shipped three rebrands and zero documentation."],
  ["Priya Shah", "@priyashah", "That was the whole joke."],
  ["Rafi Cole", "@raficole", "The recurring meeting is now old enough to vote."],
  ["Rafi Cole", "@raficole", "I am not asking for calendar advice; I am just mourning."],
  ["Eli Grant", "@eligrant", "Can an automated decision ever be fair if the historical record is not?"],
  ["Eli Grant", "@eligrant", "I am asking about uncertainty, not for a slogan."],
  ["Bryn Renner", "@brynrenner", "Need a logo designer with evidence of strong identity systems."],
  ["Bryn Renner", "@brynrenner", "A recommendation without permission is just a public guess."],
  ["Whop", "@whop", "Referrals work when the incentive and the user need line up."],
  ["Whop", "@whop", "We are looking for distribution partners who already serve this audience."],
  ["Harry Cole", "@harrycole", "DM me if the private handoff is actually available."],
  ["Harry Cole", "@harrycole", "No pressure if the context is too thin to act on."],
  ["Cal West", "@calwest", "Everyone is posting the same warning about the algorithm."],
  ["Cal West", "@calwest", "This post adds no new evidence either."],
  ["Avery Cole", "@averysec", "Incident response is mostly knowing what you do not know yet."],
  ["Avery Cole", "@averysec", "If a screenshot is the only artifact, say that plainly."],
  ["Tess Reed", "@tessreed", "Honestly, your take is embarrassing."],
  ["Tess Reed", "@tessreed", "The claim about screenshots is what I disagree with, not your identity."],
  ["Owen Hart", "@owenhart", "You still owe me a rating, but I have not shown you the customer evidence."],
  ["Owen Hart", "@owenhart", "Here are the actual numbers and the limits of the sample."],
  ["Mara Vale", "@maravale", "Like this if you agree that focus matters."],
  ["Mara Vale", "@maravale", "No, really, this is just engagement bait."],
  ["Sana Malik", "@sanamalik", "You are becoming the person people tag when a metric needs a second look."],
  ["Sana Malik", "@sanamalik", "That is a compliment, not a request for a keynote."],
  ["Nia Chen", "@niachen", "Exactly."],
  ["Nia Chen", "@niachen", "The conversation is complete from my side."],
  ["Tariq Moss", "@tariqmoss", "The endpoint is live, but the screenshot is from staging."],
  ["Tariq Moss", "@tariqmoss", "I can share logs if the question is about reliability."],
  ["Rhea Singh", "@rheasingh", "A quiet day is still a day."],
  ["Rhea Singh", "@rheasingh", "No insight attached; just a small observation."],
  ["Jordan Bell", "@jordanbell", "Please ask before connecting me to anyone."],
  ["Jordan Bell", "@jordanbell", "The role and location are now clear."],
  ["Lisa Monroe", "@lisamonroe", "I can answer questions about the work before deciding on an introduction."],
  ["Lisa Monroe", "@lisamonroe", "That boundary matters more than speed."],
];

function longitudinalScenario(name, events) {
  const steps = [{ command: "start", options: { source: "scenario" } }];
  events.forEach(([actor, handle, content], index) => {
    steps.push({ command: "inject", options: { actor, handle, action: "post", content } });
    if ((index + 1) % 10 === 0) steps.push({ command: "advance", options: { minutes: 720 } });
  });
  steps.push({ command: "timeline" });
  return { name, sourceType: "longitudinal-development", eventCount: events.length, steps };
}

await writeFile(new URL("../scenarios/boardy-development-observed-2026-08-13.json", import.meta.url), `${JSON.stringify(developmentScenario, null, 2)}\n`);
await writeFile(new URL("../scenarios/social-capability-longitudinal-1.json", import.meta.url), `${JSON.stringify(longitudinalScenario("social-capability-longitudinal-1", worldOne), null, 2)}\n`);
await writeFile(new URL("../scenarios/social-capability-longitudinal-2.json", import.meta.url), `${JSON.stringify(longitudinalScenario("social-capability-longitudinal-2", worldTwo), null, 2)}\n`);

console.log(JSON.stringify({
  development: { file: "scenarios/boardy-development-observed-2026-08-13.json", cases: manifest.cases.length },
  longitudinal: [
    { file: "scenarios/social-capability-longitudinal-1.json", events: worldOne.length },
    { file: "scenarios/social-capability-longitudinal-2.json", events: worldTwo.length },
  ],
}, null, 2));
