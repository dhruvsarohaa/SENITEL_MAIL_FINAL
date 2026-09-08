import type { RelayHop } from "../types.js";

const cache = new Map<string, Partial<RelayHop> | null>();
const CACHE_MAX_SIZE = 1000;

export async function enrichIp(ip: string): Promise<Partial<RelayHop> | null> {
  // Gracefully handle private, local, and reserved IPs
  if (!ip || ip === "—") return null;

  // Private / Reserved IP check
  const privateRegex =
    /^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|169\.254\.|::1|fe80:)/i;
  if (privateRegex.test(ip)) return null;

  if (cache.has(ip)) {
    return cache.get(ip) ?? null;
  }

  const token = process.env.IPINFO_TOKEN;
  if (!token) {
    console.warn("⚠️ IPINFO_TOKEN is not set. Skipping real IP intelligence.");
    // Cache null so we don't spam logs or slow down execution on missing token
    cache.set(ip, null);
    return null;
  }

  try {
    const res = await fetch(`https://api.ipinfo.io/lite/${ip}?token=${token}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      console.warn(`IPinfo API error for ${ip}: ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    if (data.error) {
      console.warn(`IPinfo error for ${ip}:`, data.error.message);
      return null;
    }

    const result: Partial<RelayHop> = {
      countryCode: data.country_code,
      country: data.country,
      asn: data.asn,
      organization: data.as_domain ? `${data.as_name} (${data.as_domain})` : data.as_name,
    };

    if (cache.size >= CACHE_MAX_SIZE) {
      // Enforce cache limit (evict oldest)
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }

    cache.set(ip, result);
    return result;
  } catch (error) {
    console.warn(`Failed to enrich IP ${ip}:`, error);
    return null;
  }
}
