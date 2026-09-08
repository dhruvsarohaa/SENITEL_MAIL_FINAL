import crypto from "node:crypto";
import pool, { isPostgresActive } from "../db/connection.js";
import { getCollections, isMongoActive } from "../db/mongo.js";

export const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

/**
 * In-memory tenant store fallback when running in zero-dependency MemoryStore mode.
 */
export const memOrgs = new Map([
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

export const memUsers = new Map([
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

export const memApiKeys = new Map();

/** Hash an API key for safe constant-time storage & lookup. */
export function hashKey(rawKey) {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

/** Generate a new cryptographically secure API key. */
export async function generateApiKey(orgId, name, role = "admin") {
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

  if (isPostgresActive) {
    await pool.query(
      "INSERT INTO api_keys (id, org_id, name, prefix, key_hash, role) VALUES ($1, $2, $3, $4, $5, $6)",
      [record.id, record.org_id, record.name, record.prefix, record.key_hash, record.role],
    );
    return { rawKey, ...record };
  }

  const mongoCols = isMongoActive ? getCollections() : null;
  if (mongoCols?.api_keys) {
    await mongoCols.api_keys.insertOne({
      _id: record.id,
      ...record,
    });
    return { rawKey, ...record };
  }

  console.warn(
    "⚠️  [MemoryStore] API key saved to ephemeral in-memory map. Will NOT persist across restarts.",
  );
  memApiKeys.set(keyHash, record);
  return { rawKey, ...record };
}

/** Seed default dev/testing API key only in non-production environments. */
const isDev =
  !process.env.NODE_ENV ||
  process.env.NODE_ENV === "development" ||
  process.env.NODE_ENV === "test";
if (isDev) {
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
  console.warn(
    "⚠️  [DEV ONLY] Default admin API key (sm_live_default_sentinel_corp_key_12345) seeded in memory. NEVER use in production!",
  );
}

/** Retrieve organization by ID or slug. */
export async function getOrganization(orgIdOrSlug) {
  if (isPostgresActive) {
    const res = await pool.query(
      "SELECT id, name, slug, plan, settings, created_at FROM organizations WHERE id::text = $1 OR slug = $1",
      [orgIdOrSlug],
    );
    return res.rows && res.rows[0] ? res.rows[0] : null;
  }

  const mongoCols = isMongoActive ? getCollections() : null;
  if (mongoCols?.organizations) {
    const org = await mongoCols.organizations.findOne({
      $or: [{ id: orgIdOrSlug }, { slug: orgIdOrSlug }, { _id: orgIdOrSlug }],
    });
    return org || null;
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

  if (isPostgresActive) {
    await pool.query(
      "INSERT INTO organizations (id, name, slug, plan, settings) VALUES ($1, $2, $3, $4, $5)",
      [org.id, org.name, org.slug, org.plan, JSON.stringify(org.settings)],
    );
    return org;
  }

  const mongoCols = isMongoActive ? getCollections() : null;
  if (mongoCols?.organizations) {
    await mongoCols.organizations.insertOne({
      _id: org.id,
      ...org,
    });
    return org;
  }

  console.warn(
    "⚠️  [MemoryStore] Organization saved to ephemeral in-memory map. Will NOT persist across restarts.",
  );
  memOrgs.set(id, org);
  return org;
}

/** Validate an API key and return associated tenant context. */
export async function validateApiKey(rawKey) {
  if (!rawKey || !rawKey.startsWith("sm_live_")) return null;
  const keyHash = hashKey(rawKey);

  if (isPostgresActive) {
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
  }

  const mongoCols = isMongoActive ? getCollections() : null;
  if (mongoCols?.api_keys) {
    const key = await mongoCols.api_keys.findOne({ key_hash: keyHash });
    if (key) {
      const org = await mongoCols.organizations.findOne({
        $or: [{ id: key.org_id }, { _id: key.org_id }],
      });
      return {
        keyId: key.id,
        orgId: key.org_id,
        orgName: org?.name ?? "Unknown Org",
        orgSlug: org?.slug ?? "unknown",
        role: key.role,
      };
    }
  }

  // Check ephemeral in-memory map (development or MemoryStore mode)
  const inMem = memApiKeys.get(keyHash);
  if (inMem) {
    const org = memOrgs.get(inMem.org_id);
    return {
      keyId: inMem.id,
      orgId: inMem.org_id,
      orgName: org?.name ?? "Sentinel Corporation",
      orgSlug: org?.slug ?? "sentinel-corp",
      role: inMem.role,
    };
  }
  return null;
}

/** List API keys for an organization. */
export async function listApiKeys(orgId) {
  if (isPostgresActive) {
    const res = await pool.query(
      "SELECT id, org_id, name, prefix, role, created_at, last_used FROM api_keys WHERE org_id = $1",
      [orgId],
    );
    return res.rows ?? [];
  }

  const mongoCols = isMongoActive ? getCollections() : null;
  if (mongoCols?.api_keys) {
    const keys = await mongoCols.api_keys
      .find({ org_id: orgId })
      .project({ key_hash: 0, _id: 0 })
      .toArray();
    return keys;
  }

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

  if (isPostgresActive) {
    await pool.query(
      "INSERT INTO users (id, org_id, email, name, role) VALUES ($1, $2, $3, $4, $5)",
      [user.id, user.org_id, user.email, user.name, user.role],
    );
    return user;
  }

  const mongoCols = isMongoActive ? getCollections() : null;
  if (mongoCols?.users) {
    await mongoCols.users.insertOne({
      _id: user.id,
      ...user,
    });
    return user;
  }

  console.warn(
    "⚠️  [MemoryStore] User saved to ephemeral in-memory map. Will NOT persist across restarts.",
  );
  memUsers.set(id, user);
  return user;
}

/** List users in an organization. */
export async function listOrganizationUsers(orgId) {
  if (isPostgresActive) {
    const res = await pool.query(
      "SELECT id, org_id, email, name, role, created_at FROM users WHERE org_id = $1",
      [orgId],
    );
    return res.rows ?? [];
  }

  const mongoCols = isMongoActive ? getCollections() : null;
  if (mongoCols?.users) {
    const users = await mongoCols.users.find({ org_id: orgId }).project({ _id: 0 }).toArray();
    return users;
  }

  return Array.from(memUsers.values()).filter((u) => u.org_id === orgId);
}

/** Resolve a user and their organization context by email across any active backend. */
export async function resolveUserByEmail(email) {
  if (!email) return null;
  const normalized = email.toLowerCase().trim();

  if (isPostgresActive) {
    try {
      const res = await pool.query(
        `SELECT
           u.id,
           u.org_id,
           u.email,
           u.name,
           u.role,
           o.name AS org_name,
           o.slug AS org_slug,
           o.plan AS org_plan
         FROM users u
         JOIN organizations o ON o.id = u.org_id
         WHERE LOWER(u.email) = $1
         LIMIT 1`,
        [normalized],
      );
      if (res.rows?.[0]) return res.rows[0];
    } catch {
      // ignore
    }
  }

  const mongoCols = isMongoActive ? getCollections() : null;
  if (mongoCols?.users) {
    try {
      const user = await mongoCols.users.findOne({ email: normalized });
      if (user) {
        const org = await mongoCols.organizations.findOne({
          $or: [{ id: user.org_id }, { _id: user.org_id }],
        });
        return {
          id: user.id,
          org_id: user.org_id,
          email: user.email,
          name: user.name,
          role: user.role,
          org_name: org?.name ?? "Sentinel Corporation",
          org_slug: org?.slug ?? "sentinel-corp",
          org_plan: org?.plan ?? "enterprise",
        };
      }
    } catch {
      // ignore
    }
  }

  for (const user of memUsers.values()) {
    if (user.email.toLowerCase() === normalized) {
      const org = memOrgs.get(user.org_id);
      return {
        id: user.id,
        org_id: user.org_id,
        email: user.email,
        name: user.name,
        role: user.role,
        org_name: org?.name ?? "Sentinel Corporation",
        org_slug: org?.slug ?? "sentinel-corp",
        org_plan: org?.plan ?? "enterprise",
      };
    }
  }

  return null;
}
