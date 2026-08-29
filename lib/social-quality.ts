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

const WARM_SOCIAL_SIGNALS = [
  "congrats",
  "congratulations",
  "excited",
  "proud",
  "love this",
  "beautiful",
  "fun",
  "can't wait",
  "on it",
  "you've got this",
  "cheering",
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

/** Return a user-facing reason when a reply should be re-expressed or dropped. */
export function socialReplyQualityIssue(targetText: string, draft: string): string | undefined {
  const target = targetText.trim();
  const text = draft.trim();
  if (!target || !text) return undefined;

  const lowerDraft = text.toLowerCase();
  const abstractSignalCount = ABSTRACT_SOCIAL_SIGNALS.filter((signal) => lowerDraft.includes(signal)).length;
  const teacherFramingCount = TEACHER_FRAMING_SIGNALS.filter((signal) => lowerDraft.includes(signal)).length;
  const thesisFrameCount = THESIS_FRAME_SIGNALS.filter((signal) => lowerDraft.includes(signal)).length;
  const hasTargetAnchor = targetAnchors(target).some((anchor) => lowerDraft.includes(anchor.toLowerCase()));
  const isAnnouncement = /\b(?:launch(?:ed)?|live|excited|proud|announce|announcement|built|shipping|released|capable)\b/i.test(target)
    || /let(?:'|’)s see what you(?:'|’)re capable/i.test(target);
  const isWarm = WARM_SOCIAL_SIGNALS.some((signal) => lowerDraft.includes(signal));

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
