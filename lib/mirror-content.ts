import type { ChannelId, MirrorObject } from "./types";

type MirrorAuthor = MirrorObject["author"];

const xTime = "(?:just now|\\d+\\s*(?:s|m|h|d|w)|\\d+\\s+(?:seconds?|minutes?|hours?|days?|weeks?)\\s+ago)";
const xDate = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\s+\\d{1,2}(?:,\\s*\\d{4})?";
const xRenderedHeader = new RegExp(`^(.+?)\\s+@([A-Za-z0-9_]{1,30})\\s+·\\s+(?:${xTime}|${xDate})\\s+`, "i");
const xMetric = "(?:\\d[\\d,.]*|\\d+(?:\\.\\d+)?[KMB])";
const xMetricSuffix = new RegExp(`(?:\\s+${xMetric}){1,5}$`, "i");
const xRenderedFooter = new RegExp(`\\s+\\d{1,2}:\\d{2}\\s*(?:AM|PM)\\s+·\\s+${xDate}\\s+·\\s+${xMetric}\\s+Views?$`, "i");

/**
 * Normalize adapter whitespace without changing the author's paragraph
 * structure. X's browser surface exposes paragraph breaks through
 * `innerText`, and those breaks are part of the public expression.
 */
function normalizeMirrorWhitespace(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
}

export function parseRenderedXHeader(text: string | undefined) {
  if (!text) return undefined;
  const normalized = normalizeMirrorWhitespace(text);
  const match = normalized.match(xRenderedHeader);
  if (!match) return undefined;
  return { displayName: match[1].trim(), handle: match[2], bodyStart: match[0].length };
}

/**
 * Adapters should send only the social object's body. This fallback repairs
 * older browser observations that captured X's rendered card chrome too.
 */
export function cleanMirrorText(channelId: ChannelId, text: string | undefined) {
  if (!text) return text;
  const normalized = normalizeMirrorWhitespace(text);
  if (channelId !== "x") return normalized;
  const header = parseRenderedXHeader(normalized);
  const body = header ? normalized.slice(header.bodyStart).trim() : normalized;
  const withoutRenderedFooter = body.replace(xRenderedFooter, "").trim();
  const cleaned = header ? withoutRenderedFooter.replace(xMetricSuffix, "").trim() : withoutRenderedFooter;
  return cleaned || body;
}

export function normalizeMirrorAuthor(channelId: ChannelId, text: string | undefined, author: MirrorAuthor): MirrorAuthor {
  if (channelId !== "x" || !author) return author;
  const header = parseRenderedXHeader(text);
  if (!header) return author;
  const displayName = author.displayName.trim();
  const handle = author.handle?.replace(/^@/, "").trim();
  const looksLikeScrapedMetadata = displayName.startsWith("@") || !handle || displayName.replace(/^@/, "").toLowerCase() === handle.toLowerCase();
  return looksLikeScrapedMetadata ? { ...author, displayName: header.displayName, handle: header.handle } : author;
}

export function normalizeMirrorObject(object: MirrorObject): MirrorObject {
  const text = object.content?.text;
  const cleanText = cleanMirrorText(object.channelId, text);
  const author = normalizeMirrorAuthor(object.channelId, text, object.author);
  if (cleanText === text && author === object.author) return object;
  return {
    ...object,
    author,
    content: object.content ? { ...object.content, text: cleanText } : object.content,
  };
}
