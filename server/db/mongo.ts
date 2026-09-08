import { MongoClient, type Db, type Collection } from "mongodb";
import { seedVendors, seedCases, seedCampaigns } from "./seed-data.js";
import type { Case, CaseSummary, VendorProfile, Campaign, AnalystAction } from "../types.js";

export let isMongoActive = false;
let client: MongoClient | null = null;
let db: Db | null = null;

export interface OrganizationDoc {
  _id?: string;
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings?: any;
  created_at: string;
}

export interface UserDoc {
  _id?: string;
  id: string;
  org_id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

export interface ApiKeyDoc {
  _id?: string;
  id: string;
  org_id: string;
  name: string;
  prefix: string;
  key_hash: string;
  role: string;
  created_at: string;
  last_used?: string | null;
}

export interface MailboxConnectorDoc {
  _id?: string;
  id: string;
  org_id: string;
  provider: string;
  name: string;
  mailbox: string;
  status: string;
  config: any;
  messages_synced: number;
  last_sync_at?: string;
  created_at: string;
}

export interface MongoCollections {
  cases: Collection<
    Case & {
      _id: string;
      vendor_id?: string;
      vendor_name?: string;
      raw_eml?: Buffer;
      eml_sha256?: string;
    }
  >;
  vendors: Collection<VendorProfile & { _id: string }>;
  campaigns: Collection<Campaign & { _id: string }>;
  indicators: Collection<{
    _id?: any;
    case_id: string;
    type: string;
    value: string;
    created_at: Date;
  }>;
  actions: Collection<{
    _id?: any;
    case_id: string;
    type: string;
    note?: string;
    analyst?: string;
    created_at: Date;
  }>;
  counters: Collection<{ _id: string; seq: number }>;
  organizations: Collection<OrganizationDoc>;
  users: Collection<UserDoc>;
  api_keys: Collection<ApiKeyDoc>;
  mailbox_connectors: Collection<MailboxConnectorDoc>;
}

let collections: MongoCollections | null = null;

export function getMongoDb(): Db | null {
  return db;
}

export function getCollections(): MongoCollections | null {
  return collections;
}

let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

function scheduleReconnect(uri: string, dbName: string) {
  if (reconnectTimer || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
  reconnectAttempts++;
  console.log(
    `[MongoDB] Scheduling reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms...`,
  );
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      const reconnected = await initMongoDb();
      if (reconnected) {
        reconnectAttempts = 0;
        console.log("[MongoDB] Reconnection successful.");
      }
    } catch (err) {
      console.warn("[MongoDB] Reconnection attempt failed:", err);
      scheduleReconnect(uri, dbName);
    }
  }, delay);
}

function registerMongoEvents(mongoClient: MongoClient, uri: string, dbName: string) {
  mongoClient.on("close", () => {
    console.warn("⚠️ [MongoDB] Connection closed.");
    isMongoActive = false;
    scheduleReconnect(uri, dbName);
  });

  mongoClient.on("error", (err) => {
    console.error("⚠️ [MongoDB] Connection error:", err);
    isMongoActive = false;
  });

  mongoClient.on("timeout", () => {
    console.warn("⚠️ [MongoDB] Connection timed out.");
    isMongoActive = false;
  });
}

/**
 * Initialize connection to MongoDB.
 * Reads MONGODB_URI (or MONGODB_URL).
 * If configured and connected, ensures indexes and seeds initial vendor baselines.
 */
export async function initMongoDb(): Promise<boolean> {
  const uri = process.env["MONGODB_URI"] || process.env["MONGODB_URL"];
  if (!uri) {
    return false;
  }

  const dbName = process.env["MONGODB_DB_NAME"] || "sentinelmail";

  try {
    const mongoClient = new MongoClient(uri, {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 4000,
    });

    registerMongoEvents(mongoClient, uri, dbName);

    await mongoClient.connect();
    client = mongoClient;
    db = client.db(dbName);

    collections = {
      cases: db.collection("cases"),
      vendors: db.collection("vendors"),
      campaigns: db.collection("campaigns"),
      indicators: db.collection("indicators"),
      actions: db.collection("actions"),
      counters: db.collection("counters"),
      organizations: db.collection("organizations"),
      users: db.collection("users"),
      api_keys: db.collection("api_keys"),
      mailbox_connectors: db.collection("mailbox_connectors"),
    };

    isMongoActive = true;
    console.log(`✅ Connected to MongoDB database: "${dbName}"`);

    // Ensure indexes
    await ensureIndexes();

    // Auto-seed if database is empty
    await autoSeed();

    return true;
  } catch (err) {
    console.warn(
      `⚠️  MongoDB is not reachable at ${uri.replace(/:[^:@]+@/, ":***@")} (${err instanceof Error ? err.message : String(err)})`,
    );
    isMongoActive = false;
    client = null;
    db = null;
    collections = null;
    return false;
  }
}

/** Ensure performance and uniqueness indexes exist. */
async function ensureIndexes() {
  if (!collections) return;
  try {
    await Promise.all([
      collections.cases.createIndex({ case_number: 1 }, { unique: true }),
      collections.cases.createIndex({ created_at: -1 }),
      collections.cases.createIndex({ vendor_id: 1 }),
      collections.cases.createIndex({ campaign_id: 1 }),
      collections.cases.createIndex({ threat_class: 1 }),
      collections.cases.createIndex({ severity: 1 }),

      collections.vendors.createIndex({ id: 1 }, { unique: true }),
      collections.vendors.createIndex({ trusted_domains: 1 }),
      collections.vendors.createIndex({ name: 1 }),

      collections.campaigns.createIndex({ id: 1 }, { unique: true }),
      collections.campaigns.createIndex({ last_seen: -1 }),

      collections.indicators.createIndex({ case_id: 1 }),
      collections.indicators.createIndex({ type: 1, value: 1 }),

      collections.actions.createIndex({ case_id: 1 }),
      collections.actions.createIndex({ created_at: 1 }),

      collections.organizations.createIndex({ id: 1 }, { unique: true }),
      collections.organizations.createIndex({ slug: 1 }, { unique: true }),
      collections.users.createIndex({ id: 1 }, { unique: true }),
      collections.users.createIndex({ email: 1 }, { unique: true }),
      collections.users.createIndex({ org_id: 1 }),
      collections.api_keys.createIndex({ id: 1 }, { unique: true }),
      collections.api_keys.createIndex({ key_hash: 1 }, { unique: true }),
      collections.api_keys.createIndex({ org_id: 1 }),
      collections.mailbox_connectors.createIndex({ id: 1 }, { unique: true }),
      collections.mailbox_connectors.createIndex({ org_id: 1 }),
    ]);
  } catch (err) {
    console.warn("Non-fatal warning while creating MongoDB indexes:", err);
  }
}

/** Automatically seeds default vendors, cases, and campaigns if collections are empty. */
async function autoSeed() {
  if (!collections) return;

  try {
    const orgCount = await collections.organizations.countDocuments();
    if (orgCount === 0) {
      await collections.organizations.insertOne({
        _id: "00000000-0000-0000-0000-000000000001",
        id: "00000000-0000-0000-0000-000000000001",
        name: "Sentinel Corporation",
        slug: "sentinel-corp",
        plan: "enterprise",
        settings: { auto_hold_threshold: 80, containment_channels: ["slack", "webhook"] },
        created_at: new Date().toISOString(),
      });
      console.log("🌱 Seeded default organization into MongoDB.");
    }

    const userCount = await collections.users.countDocuments();
    if (userCount === 0) {
      await collections.users.insertOne({
        _id: "00000000-0000-0000-0000-000000000002",
        id: "00000000-0000-0000-0000-000000000002",
        org_id: "00000000-0000-0000-0000-000000000001",
        email: "security-admin@sentinelmail.io",
        name: "Security Admin",
        role: "admin",
        created_at: new Date().toISOString(),
      });
      console.log("🌱 Seeded default admin user into MongoDB.");
    }

    const vendorCount = await collections.vendors.countDocuments();
    if (vendorCount === 0) {
      const vendorDocs = seedVendors.map((v) => ({ ...v, _id: v.id }));
      await collections.vendors.insertMany(vendorDocs as any);
      console.log(`🌱 Seeded ${vendorDocs.length} initial vendor baselines into MongoDB.`);
    }

    const caseCount = await collections.cases.countDocuments();
    if (caseCount === 0) {
      const caseDocs = seedCases.map((c) => ({
        ...c,
        _id: c.id,
        vendor_name: c.vendor,
        vendor_id:
          c.vendor === "Supply Co Industrial"
            ? "v-1"
            : c.vendor === "Apex Global Cloud"
              ? "v-2"
              : "v-3",
      }));
      await collections.cases.insertMany(caseDocs as any);
      console.log(`🌱 Seeded ${caseDocs.length} initial demonstration cases into MongoDB.`);
    }

    const campaignCount = await collections.campaigns.countDocuments();
    if (campaignCount === 0) {
      const campaignDocs = seedCampaigns.map((camp) => ({ ...camp, _id: camp.id }));
      await collections.campaigns.insertMany(campaignDocs as any);
      console.log(`🌱 Seeded ${campaignDocs.length} initial campaign clusters into MongoDB.`);
    }

    // Initialize sequence counter if not set
    await collections.counters.updateOne(
      { _id: "case_number" },
      { $setOnInsert: { seq: 1043 } },
      { upsert: true },
    );
  } catch (seedErr) {
    console.warn("Notice: MongoDB auto-seeding encountered:", seedErr);
  }
}

/**
 * Get next atomic case number from MongoDB counters collection.
 * Example: returns "1043", "1044", etc.
 */
export async function getNextCaseNumberMongo(): Promise<string> {
  if (!collections) {
    return String(Math.floor(1043 + Math.random() * 9000));
  }
  const result = await collections.counters.findOneAndUpdate(
    { _id: "case_number" },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  return String(result?.seq ?? 1043);
}

/** Close connection when shutting down. */
export async function closeMongo(): Promise<void> {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  if (client) {
    await client.close();
    client = null;
    db = null;
    collections = null;
    isMongoActive = false;
  }
}
