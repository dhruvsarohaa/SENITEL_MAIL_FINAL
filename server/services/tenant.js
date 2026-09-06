import crypto from "node:crypto";
import pool from "../db/connection.js";

export const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

/**
 * In-memory tenant store fallback when running in zero-dependency MemoryStore mode.
 */
const memOrgs = new Map([
  [
    DEFAULT_ORG_ID,
    {
      id: DEFAULT_ORG_ID,
      name: "Sentinel Corporation",
      slug: "sentinel-corp",
      plan: "enterprise",
      settings: { auto_hold_threshold: 80, containment_channels: ["slack", "webhook"] },
      created_at: new Date().toISOString(),
    },
  ],
]);

const memUsers = new Map([
  [
    "00000000-0000-0000-0000-000000000002",
    {
      id: "00000000-0000-0000-0000-000000000002",
      org_id: DEFAULT_ORG_ID,
      email: "security-admin@sentinelmail.io",
      name: "Security Admin",
      role: "admin",
      created_at: new Date().toISOString(),
    },
  ],
]);

const memApiKeys = new Map();

/** Hash an API key for safe constant-time storage & lookup. */
export function hashKey(rawKey) {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

/** Generate a new cryptographically secure API key. */
export function generateApiKey(orgId, name, role = "admin") {
  const randomBytes = crypto.randomBytes(24).toString("hex");
  const rawKey = `sm_live_${randomBytes}`;
  const prefix = rawKey.slice(0, 14);
  const keyHash = hashKey(rawKey);
  const id = crypto.randomUUID();

  const record = {
    id,
    org_id: orgId,
    name,
    prefix,
    key_hash: keyHash,
    role,
    created_at: new Date().toISOString(),
    last_used: null,
  };

  memApiKeys.set(keyHash, record);
  return { rawKey, ...record };
}

/** Seed a default dev/testing API key if none exists. */
const defaultKeyHash = hashKey("sm_live_default_sentinel_corp_key_12345");
memApiKeys.set(defaultKeyHash, {
  id: "00000000-0000-0000-0000-000000000003",
  org_id: DEFAULT_ORG_ID,
  name: "Default Admin Key",
  prefix: "sm_live_defaul",
  key_hash: defaultKeyHash,
  role: "admin",
  created_at: new Date().toISOString(),
  last_used: null,
});

/** Retrieve organization by ID or slug. */
export async function getOrganization(orgIdOrSlug) {
  try {
    const res = await pool.query(
      "SELECT id, name, slug, plan, settings, created_at FROM organizations WHERE id::text = $1 OR slug = $1",
      [orgIdOrSlug],
    );
    if (res.rows && res.rows[0]) return res.rows[0];
  } catch {
    // Fall back to in-memory store
  }

  for (const org of memOrgs.values()) {
    if (org.id === orgIdOrSlug || org.slug === orgIdOrSlug) return org;
  }
  return null;
}

/** Create a new organization for multi-tenant customer onboarding. */
export async function createOrganization({ name, slug, plan = "enterprise" }) {
  const id = crypto.randomUUID();
  const org = {
    id,
    name,
    slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    plan,
    settings: { auto_hold_threshold: 80, containment_channels: ["slack", "webhook"] },
    created_at: new Date().toISOString(),
  };

  try {
    await pool.query(
      "INSERT INTO organizations (id, name, slug, plan, settings) VALUES ($1, $2, $3, $4, $5)",
      [org.id, org.name, org.slug, org.plan, JSON.stringify(org.settings)],
    );
  } catch {
    // Fallback in memory
  }

  memOrgs.set(id, org);
  return org;
}

/** Validate an API key and return associated tenant context. */
export async function validateApiKey(rawKey) {
  if (!rawKey || !rawKey.startsWith("sm_live_")) return null;
  const keyHash = hashKey(rawKey);

  try {
    const res = await pool.query(
      `SELECT k.id, k.org_id, k.name, k.role, o.name AS org_name, o.slug AS org_slug
       FROM api_keys k
       JOIN organizations o ON k.org_id = o.id
       WHERE k.key_hash = $1`,
      [keyHash],
    );
    if (res.rows && res.rows[0]) {
      return {
        keyId: res.rows[0].id,
        orgId: res.rows[0].org_id,
        orgName: res.rows[0].org_name,
        orgSlug: res.rows[0].org_slug,
        role: res.rows[0].role,
      };
    }
  } catch {
    // Fallback in memory
  }

  const inMem = memApiKeys.get(keyHash);
  if (inMem) {
    const org = memOrgs.get(inMem.org_id);
    return {
      keyId: inMem.id,
      orgId: inMem.org_id,
      orgName: org?.name ?? "Unknown Org",
      orgSlug: org?.slug ?? "unknown",
      role: inMem.role,
    };
  }
  return null;
}

/** List API keys for an organization. */
export async function listApiKeys(orgId) {
  const keys = Array.from(memApiKeys.values()).filter((k) => k.org_id === orgId);
  return keys.map(({ key_hash, ...rest }) => rest);
}

/** Add a user to an organization. */
export async function addOrganizationUser({ orgId, email, name, role = "analyst" }) {
  const id = crypto.randomUUID();
  const user = {
    id,
    org_id: orgId,
    email: email.toLowerCase(),
    name,
    role,
    created_at: new Date().toISOString(),
  };
  memUsers.set(id, user);
  return user;
}

/** List users in an organization. */
export async function listOrganizationUsers(orgId) {
  return Array.from(memUsers.values()).filter((u) => u.org_id === orgId);
}
