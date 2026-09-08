import { promises as dns, type MxRecord } from "node:dns";
import type { DomainIntelligence } from "../types.js";

interface BootstrapData {
  services: [string[], string[]][];
}

const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const RDAP_TIMEOUT_MS = 2500;
const DNS_TIMEOUT_MS = 2000;

const domainCache = new Map<string, { data: DomainIntelligence; timestamp: number }>();
let bootstrapCache: { data: BootstrapData; timestamp: number } | null = null;

async function getIanaBootstrap(): Promise<BootstrapData | null> {
  const now = Date.now();
  if (bootstrapCache && now - bootstrapCache.timestamp < CACHE_TTL_MS) {
    return bootstrapCache.data;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch("https://data.iana.org/rdap/dns.json", { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = (await res.json()) as BootstrapData;
    bootstrapCache = { data, timestamp: now };
    return data;
  } catch (error) {
    console.error("Failed to fetch IANA RDAP bootstrap:", error);
    return null;
  }
}

function getTld(domain: string): string {
  const parts = domain.split(".");
  return parts[parts.length - 1] || "";
}

async function getRdapUrl(domain: string): Promise<string | null> {
  const tld = getTld(domain).toLowerCase();
  if (!tld) return null;

  const bootstrap = await getIanaBootstrap();
  if (!bootstrap) return null;

  for (const [tlds, urls] of bootstrap.services) {
    if (tlds.includes(tld)) {
      return `${urls[0]}domain/${domain}`;
    }
  }
  return null;
}

// Timeout wrapper for DNS
async function resolveWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutHandle = setTimeout(() => resolve(fallback), timeoutMs);
  });

  return Promise.race([
    promise
      .then((res) => {
        clearTimeout(timeoutHandle);
        return res;
      })
      .catch(() => {
        clearTimeout(timeoutHandle);
        return fallback;
      }),
    timeoutPromise,
  ]);
}

export async function enrichDomain(domainName: string): Promise<DomainIntelligence | undefined> {
  const domain = domainName.toLowerCase().trim();
  if (!domain || !domain.includes(".") || domain.length > 253) return undefined;

  const now = Date.now();
  const cached = domainCache.get(domain);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // 1. DNS lookups (run in parallel with timeouts)
  const [a_records, aaaa_records, mxData, ns_records] = await Promise.all([
    resolveWithTimeout(dns.resolve4(domain), DNS_TIMEOUT_MS, [] as string[]),
    resolveWithTimeout(dns.resolve6(domain), DNS_TIMEOUT_MS, [] as string[]),
    resolveWithTimeout(dns.resolveMx(domain), DNS_TIMEOUT_MS, [] as MxRecord[]),
    resolveWithTimeout(dns.resolveNs(domain), DNS_TIMEOUT_MS, [] as string[]),
  ]);

  const mx_records = mxData.sort((a, b) => a.priority - b.priority).map((mx) => mx.exchange);

  // 2. RDAP lookup
  let registrar: string | undefined;
  let creation_date: string | undefined;
  let expiration_date: string | undefined;
  let age_days: number | undefined;

  try {
    const rdapUrl = await getRdapUrl(domain);
    if (rdapUrl) {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), RDAP_TIMEOUT_MS);

      const res = await fetch(rdapUrl, {
        headers: { Accept: "application/rdap+json" },
        signal: controller.signal,
      });
      clearTimeout(timeoutHandle);

      if (res.ok) {
        const rdapData = (await res.json()) as any;

        // Extract registrar from entities
        if (Array.isArray(rdapData.entities)) {
          const registrarEntity = rdapData.entities.find(
            (e: any) => Array.isArray(e.roles) && e.roles.includes("registrar"),
          );
          if (
            registrarEntity &&
            Array.isArray(registrarEntity.vcardArray) &&
            registrarEntity.vcardArray.length > 1
          ) {
            const vcardProps = registrarEntity.vcardArray[1];
            const fnProp = vcardProps.find((p: any) => p[0] === "fn");
            if (fnProp) registrar = fnProp[3];
          }
        }

        // Extract dates from events
        if (Array.isArray(rdapData.events)) {
          const creationEvent = rdapData.events.find((e: any) => e.eventAction === "registration");
          if (creationEvent && creationEvent.eventDate) {
            creation_date = creationEvent.eventDate;
            const parsed = Date.parse(creation_date!);
            if (!Number.isNaN(parsed)) {
              age_days = Math.floor((now - parsed) / (1000 * 60 * 60 * 24));
            }
          }

          const expirationEvent = rdapData.events.find((e: any) => e.eventAction === "expiration");
          if (expirationEvent && expirationEvent.eventDate) {
            expiration_date = expirationEvent.eventDate;
          }
        }
      }
    }
  } catch (error) {
    // Ignore RDAP failures
  }

  const result: DomainIntelligence = {
    domain,
    a_records,
    aaaa_records,
    mx_records,
    ns_records,
    registrar,
    creation_date,
    expiration_date,
    age_days,
  };

  // Keep cache bounded
  if (domainCache.size > 1000) {
    const firstKey = domainCache.keys().next().value;
    if (firstKey) domainCache.delete(firstKey);
  }

  domainCache.set(domain, { data: result, timestamp: now });

  return result;
}
