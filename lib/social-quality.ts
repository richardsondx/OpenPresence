/**
 * Small deterministic checks for public social drafts.
 *
 * These checks are deliberately narrow. They do not rewrite model language or
 * decide whether a post deserves attention. They only catch a known failure
 * mode: a long, abstract consultant-style reply to a concrete announcement or
 * conversational moment. The expression editor gets one chance to repair it;
 * otherwise the safe result is silence.
 */
const ABSTRACT_SOCIAL_SIGNALS = [
  "benchmark",
  "reach",
  "attention",
  "right builders",
  "second conversation",
  "worth saying",
  "numbers wiggle",
  "the useful test",
  "the useful benchmark",
  "signal",
  "leverage",
  "meaningful",
];

const TEACHER_FRAMING_SIGNALS = [
  "the lesson",
  "what matters",
  "the real test",
  "the right metric",
  "the key is",
  "the point is",
  "this teaches",
  "what this means",
  "the takeaway",
  "here's why",
];

// These are common “thought-leadership” scaffolds. They sound decisive, but
// often replace the author's actual moment with a generic thesis.
const THESIS_FRAME_SIGNALS = [
  "this is the part people skip",
  "the part people skip",
  "not just",
  "the harder product",
  "the hard part is",
  "the real product is",
  "x is easy",
];

// These frames create the familiar polished-but-empty social cadence: reject
// one formulation, announce the "real" one, and leave the reader with a
// verdict instead of a conversation. They are especially common in short
// quote-posts, where length alone cannot catch the problem.
const FORMULAIC_CONTRAST_PATTERNS = [
  /\b(?:the\s+)?(?:interesting|useful|important|real|hard|less\s+glamorous)\s+(?:bit|part|footnote|thing|test|question)\b/i,
  /\b(?:isn['’]t|is not|aren['’]t|are not|wasn['’]t|was not|weren['’]t|were not)\b[^.!?;]{1,100}(?:[;,]|\.\s+)\s*(?:it['’]s|it is|they['’]re|they are|the\b)/i,
  /\bnot just\b[^.!?;]{1,100}(?:[;,]|\.\s+)\s*(?:but\b|it['’]s|it is|the\b|proving\b|showing\b|building\b)/i,
  /\botherwise\s+(?:you['’]ve|you have|we['’]ve|we have|they['’]ve|they have)\b/i,
  /\bdoing\s+(?:astonishingly\s+)?(?:heavy|heroic)\s+lifting\b/i,
];

const GENERIC_AI_OPENING_PATTERNS = [
  /^(?:the|this)\s+(?:demo|launch|update|project|product|post|thing)\s+(?:is|shows|means)\s+(?:an?|the)\s+(?:interesting|useful|important|real|meaningful|powerful|compelling|thoughtful|promising|strong|exciting|transformative|effective|valuable)\b/i,
  /^(?:at\s+the\s+end\s+of\s+the\s+day|what\s+it\s+really\s+comes\s+down\s+to|it['’]s\s+important\s+to\s+note|it['’]s\s+worth\s+mentioning|arguably|to\s+some\s+extent)\b/i,
];

const CANNED_EMPATHY_PATTERNS = [
  /\bi\s+hear\s+you\b/i,
  /\b(?:that|this)\s+sounds\s+(?:hard|difficult|tough|painful|challenging)\b/i,
  /\bi['’]?m\s+sorry\s+(?:you['’]?re|that\s+you['’]?re|you\s+are)\b/i,
  /\bsending\s+(?:you\s+)?(?:love|light|strength)\b/i,
  /\byou['’]?ve\s+got\s+this\b/i,
  /\beverything\s+will\s+be\s+okay\b/i,
  /\bthinking\s+of\s+you\b/i,
];

const CORPORATE_PHRASE_PATTERNS = [
  /\b(?:moving|going)\s+forward\b/i,
  /\bcircle\s+back\b/i,
  /\btouch\s+base\b/i,
  /\balign\s+on\b/i,
  /\b(?:leverage|unlock|operationali[sz]e)\b/i,
  /\baction\s+items?\b/i,
  /\bstakeholders?\b/i,
  /\bnorth\s+star\b/i,
  /\blow[- ]hanging\s+fruit\b/i,
  /\bvalue[- ]add\b/i,
  /\bbest[- ]in[- ]class\b/i,
  /\bseamless(?:ly)?\b/i,
  /\bdrive\s+impact\b/i,
];

const WARM_SOCIAL_SIGNALS = [
  "congrats",
  "congratulations",
  "excited",
  "proud",
  "love this",
  "beautiful",
  "fun",
  "on it",
  "thanks",
];

const GENERIC_TARGET_WORDS = new Set([
  "about", "after", "around", "because", "being", "could", "from", "have", "into", "just",
  "like", "more", "one", "post", "really", "something", "that", "their", "there", "this",
  "through", "what", "when", "which", "with", "your", "you", "agent", "agents", "great", "opportunity",
  "task", "tasks", "work", "workflow", "workflows", "people", "participate", "product",
]);

function targetAnchors(targetText: string) {
  const mentions = targetText.match(/@[a-z0-9_]{2,}/gi) ?? [];
  const words = targetText.match(/[a-z][a-z0-9_-]{4,}/gi) ?? [];
  return [...new Set([...mentions, ...words.map((word) => word.toLowerCase())])]
    .filter((word) => !GENERIC_TARGET_WORDS.has(word.replace(/^@/, "")));
}

function identityAnchors(value?: string) {
  if (!value?.trim()) return [];
  return targetAnchors(value).filter((anchor) => !GENERIC_TARGET_WORDS.has(anchor.replace(/^@/, "")));
}

/**
 * Detect promotion-source material leaking into a reply to another author.
 * The source may guide candidate selection, but it is not the subject of a
 * reply unless the target post names it or is the source itself.
 */
export function socialReplyAttributionIssue(
  targetText: string,
  draft: string,
  options?: { sourceText?: string; sourceAuthor?: string; targetAuthor?: string; allowSourceReference?: boolean },
): string | undefined {
  const sourceText = options?.sourceText?.trim();
  const text = draft.trim();
  if (!sourceText || !text || options?.allowSourceReference) return undefined;

  const lowerDraft = text.toLowerCase();
  const targetLower = targetText.toLowerCase();
  const sourceIdentity = identityAnchors(options?.sourceAuthor);
  const sourceIdentityLeak = sourceIdentity.find((anchor) => lowerDraft.includes(anchor.toLowerCase()) && !targetLower.includes(anchor.toLowerCase()));
  if (sourceIdentityLeak) {
    return "The reply brings the promotion source or its author into a conversation with another person. Answer the selected target post only, or choose a non-text action.";
  }

  const targetSet = new Set(identityAnchors(targetText).map((anchor) => anchor.toLowerCase()));
  const sourceSpecificAnchors = identityAnchors(sourceText)
    .filter((anchor) => anchor.length >= 6)
    .filter((anchor) => !targetSet.has(anchor.toLowerCase()))
    .filter((anchor) => !sourceIdentity.some((identity) => identity.toLowerCase() === anchor.toLowerCase()));
  const leakedAnchors = sourceSpecificAnchors.filter((anchor) => lowerDraft.includes(anchor.toLowerCase()));
  if (leakedAnchors.length >= 2) {
    return "The reply uses multiple details from the promotion source instead of the selected target post. Keep the source and the target separate; choose silence or a non-text action when the connection is not explicit.";
  }
  return undefined;
}

/** Return a user-facing reason when a reply should be re-expressed or dropped. */
export function socialReplyQualityIssue(targetText: string, draft: string): string | undefined {
  const target = targetText.trim();
  const text = draft.trim();
  if (!target || !text) return undefined;

  const lowerDraft = text.toLowerCase();
  const abstractSignalCount = ABSTRACT_SOCIAL_SIGNALS.filter((signal) => lowerDraft.includes(signal)).length;
  const teacherFramingCount = TEACHER_FRAMING_SIGNALS.filter((signal) => lowerDraft.includes(signal)).length;
  const thesisFrameCount = THESIS_FRAME_SIGNALS.filter((signal) => lowerDraft.includes(signal)).length;
  const formulaicContrast = FORMULAIC_CONTRAST_PATTERNS.find((pattern) => pattern.test(text));
  const genericAiOpening = GENERIC_AI_OPENING_PATTERNS.find((pattern) => pattern.test(text));
  const cannedEmpathy = CANNED_EMPATHY_PATTERNS.find((pattern) => pattern.test(text));
  const corporatePhrase = CORPORATE_PHRASE_PATTERNS.find((pattern) => pattern.test(text));
  const hasTargetAnchor = targetAnchors(target).some((anchor) => lowerDraft.includes(anchor.toLowerCase()));
  const isAnnouncement = /\b(?:launch(?:ed)?|live|excited|proud|announce|announcement|built|shipping|released|capable)\b/i.test(target)
    || /let(?:'|’)s see what you(?:'|’)re capable/i.test(target);
  const isWarm = WARM_SOCIAL_SIGNALS.some((signal) => lowerDraft.includes(signal));

  if (formulaicContrast) {
    return "The draft uses a stock contrast or vague thought-leadership frame. State the concrete point directly, with a human reaction or a constructive next step.";
  }
  if (genericAiOpening) {
    return "The draft opens with generic AI-style framing. Start with the concrete person, fact, or moment that matters.";
  }
  if (cannedEmpathy) {
    return "The draft uses a canned expression of empathy. Notice this person's specific situation in plain language, or leave the turn quiet.";
  }
  if (corporatePhrase) {
    return "The draft uses workplace jargon. Replace it with the ordinary words a person would use in a direct conversation.";
  }

  if (text.length >= 150 && abstractSignalCount >= 2 && !hasTargetAnchor) {
    return "The draft is a long abstract commentary without a concrete anchor in the author's post. Reconnect with the author's actual moment or stay silent.";
  }
  if (text.length >= 140 && thesisFrameCount >= 1 && !hasTargetAnchor) {
    return "The draft uses a canned contrarian thesis instead of responding to the author's actual point. Reconnect with the author's words, or stay silent.";
  }
  if (text.length >= 180 && teacherFramingCount >= 2 && !hasTargetAnchor && !/\?/.test(target)) {
    return "The draft takes a teacher-like stance and explains a takeaway the author did not ask for. Respond as a peer, or stay silent.";
  }
  if (isAnnouncement && text.length >= 120 && !hasTargetAnchor && !isWarm) {
    return "The author is announcing or celebrating something, but the draft does not acknowledge that moment. Do not turn an announcement into a generic lesson or benchmark.";
  }
  return undefined;
}
