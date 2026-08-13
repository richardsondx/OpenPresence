export type SocialTone = "playful" | "sarcastic" | "technical" | "sensitive" | "hostile" | "celebratory" | "literal" | "unknown";
export type SocialSpeechAct = "rating-request" | "opinion-request" | "service-request" | "direct-address" | "question" | "acknowledgment" | "compliment" | "insult" | "technical-claim" | "statement";

export interface SocialCueSummary {
  tone: SocialTone;
  speechAct: SocialSpeechAct;
  directAddress: boolean;
  asksForResponse: boolean;
  naturalEndpoint: boolean;
  lightweight: boolean;
  cues: string[];
}

const directAddressPattern = /(^|\s)@[a-z0-9_]{2,}/i;
const ratingReferencePattern = /\b(?:rate|rating|rated|score|scored|out of\s*10|\d+\/10)\b/i;
const ratingRequestPattern = /\b(?:rate mine|rate my|rate yours|what would you rate|give me a rating|score mine|score my)\b|\brate\s+(?:this|it|mine|my)\b|\b(?:haven['’]?t|didn['’]?t)\s+rate(?:d)?\s+(?:mine|my|it)\b/i;
const opinionPattern = /\b(?:what do you think|your take|thoughts on|be honest|answer the question|how does this look)\b/i;
const answerPressurePattern = /\b(?:supposed to answer|didn['’]?t answer|still owe|you haven['’]?t answered|answer me)\b/i;
const servicePattern = /\b(?:looking for|need help finding|anyone know|who do(?:es)?|who can (?:help|connect|recommend|do|provide|find)|introduce me|connect me|recommend someone)\b/i;
const technicalPattern = /\b(?:api|benchmark|baseline|chart|code|denominator|deterministic|execution|github|implementation|latency|model|production|proof|replay|schema|security|spec|technical|tamper|test|verification)\b|https?:\/\//i;
const sensitivePattern = /\b(?:homicide|theft|prison|criminal|violent|wrongful conviction|abuse|suicide|self-harm|harassment|immigration|war|死|kill)\b/i;
const hostilePattern = /\b(?:dumbo|idiot|stupid|moron|shut up|loser|trash)\b/i;
const endpointPattern = /^(?:thanks|thank you|exactly|agreed|lol|lmao|appreciate it|fair enough|makes sense)[.!\s]*$/i;
const playfulPattern = /\b(?:lol|lmao|haha|cardio|personal branding|big leagues|generous|dumbo|overtime|cats?|dogs?)\b|[🤣😂😅😌👀🙌😏]/i;
const celebratoryPattern = /\b(?:11\/10|congratulations|congrats|proud of you|love this|amazing|incredible)\b|[🎉👏🙌]/i;
const sarcasticPattern = /\b(?:oh great|exactly what i needed|love that for me|sure, why not|because that always works|another three-hour meeting)\b/i;

export function classifySocialCue(content: string, presenceName?: string, presenceHandle?: string): SocialCueSummary {
  const text = content.trim();
  const lower = text.toLowerCase();
  const directAddress = Boolean((presenceHandle && lower.includes(presenceHandle.toLowerCase())) || (presenceName && new RegExp(`\\b${presenceName.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "i").test(text)) || directAddressPattern.test(text));
  const rating = ratingReferencePattern.test(text);
  const ratingRequest = ratingRequestPattern.test(text);
  const opinion = opinionPattern.test(text) || answerPressurePattern.test(text);
  const service = servicePattern.test(text);
  const technical = technicalPattern.test(text);
  const sensitive = sensitivePattern.test(text);
  const hostile = hostilePattern.test(text);
  const endpoint = endpointPattern.test(text);
  const playful = playfulPattern.test(text);
  const celebratory = celebratoryPattern.test(text);
  const sarcastic = sarcasticPattern.test(text);
  const question = text.includes("?");
  const cues: string[] = [];
  if (directAddress) cues.push("directly addresses the Presence");
  if (ratingRequest) cues.push("asks for a rating");
  else if (rating) cues.push("references a rating");
  if (opinion) cues.push("asks for an opinion or answer");
  if (service) cues.push("requests a person, recommendation, or introduction");
  if (technical) cues.push("contains technical or link evidence");
  if (sensitive) cues.push("touches a sensitive topic");
  if (endpoint) cues.push("looks like a natural conversational endpoint");
  if (playful) cues.push("contains playful or joking language");
  if (celebratory) cues.push("contains celebration or praise");
  if (hostile) cues.push("contains a personal insult");
  if (sarcastic) cues.push("may be sarcastic or exaggerated");

  const tone: SocialTone = sensitive ? "sensitive" : hostile ? "hostile" : sarcastic ? "sarcastic" : technical ? "technical" : playful ? "playful" : celebratory ? "celebratory" : question ? "literal" : "unknown";
  const speechAct: SocialSpeechAct = ratingRequest ? "rating-request" : service ? "service-request" : opinion ? "opinion-request" : directAddress && question ? "direct-address" : endpoint ? "acknowledgment" : hostile ? "insult" : celebratory ? "compliment" : technical ? "technical-claim" : question ? "question" : "statement";
  const asksForResponse = Boolean(question || directAddress || ratingRequest || opinion || service);
  const lightweight = Boolean(playful || celebratory || endpoint || speechAct === "rating-request" || speechAct === "compliment");
  return { tone, speechAct, directAddress, asksForResponse, naturalEndpoint: endpoint, lightweight, cues };
}

export function socialCueInstruction(summary: SocialCueSummary) {
  const cueText = summary.cues.length ? summary.cues.join(", ") : "no strong surface cue";
  const mode = summary.lightweight
    ? "A short social response can be worthwhile even when it does not contain a deep insight. Match the tone, keep it natural, and do not explain the joke."
    : "Do not force a response merely because the post is topical.";
  const endpoint = summary.naturalEndpoint
    ? "This looks like a natural endpoint. Prefer no_op unless a new response would clearly advance the exchange."
    : "Do not treat this as an endpoint if the person asked for a rating, opinion, answer, service, or introduction.";
  const service = summary.speechAct === "service-request"
    ? "For a service or introduction request, search or state the smallest truthful limitation, never inventing a match."
    : "";
  return `Social cue reading: tone=${summary.tone}; speech_act=${summary.speechAct}; lightweight=${summary.lightweight}; cues=${cueText}. ${mode} ${endpoint} ${service}`;
}
