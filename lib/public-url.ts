import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function privateAddress(address: string) {
  if (address === "::1" || address === "0.0.0.0" || address.startsWith("fe80:") || address.startsWith("fc") || address.startsWith("fd")) return true;
  const parts = address.split(".").map(Number);
  if (parts.length !== 4) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || parts[0] === 169 && parts[1] === 254 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31 || parts[0] === 192 && parts[1] === 168;
}

export async function publicUrl(raw: string) {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Unsupported link.");
  if (["localhost", "localhost.localdomain"].includes(url.hostname.toLowerCase()) || isIP(url.hostname) && privateAddress(url.hostname)) throw new Error("Private links cannot be previewed.");
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((item) => privateAddress(item.address))) throw new Error("Private links cannot be previewed.");
  return url;
}

/** Fetch a public resource while validating every redirect target. */
export async function fetchPublicUrl(raw: string, init: RequestInit = {}) {
  let url = await publicUrl(raw);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const response = await fetch(url, { ...init, redirect: "manual" });
    if (response.status < 300 || response.status > 399) return { response, url };
    const location = response.headers.get("location");
    if (!location) throw new Error("The public link redirected without a destination.");
    url = await publicUrl(new URL(location, url).toString());
  }
  throw new Error("The public link redirected too many times.");
}
