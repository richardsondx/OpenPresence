/** Client-safe X URL parsing shared by runtime projections and server adapters. */
export function xPostIdFromUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname.toLowerCase())) return undefined;
    const match = url.pathname.match(/^\/[^/]+\/(?:status|statuses)\/(\d+)/i) ?? url.pathname.match(/^\/i\/status\/(\d+)/i);
    return match?.[1];
  } catch {
    return undefined;
  }
}
