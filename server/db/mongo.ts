import { MongoClient, type Db, type Collection } from "mongodb";
import { seedVendors, seedCases, seedCampaigns } from "./seed-data.js";
import type { Case, CaseSummary, VendorProfile, Campaign, AnalystAction } from "../types.js";

export let isMongoActive = false;
let client: MongoClient | null = null;
let db: Db | null = null;

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
}

let collections: MongoCollections | null = null;

export function getMongoDb(): Db | null {
  return db;
}

export function getCollections(): MongoCollections | null {
  return collections;
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
    ]);
  } catch (err) {
    console.warn("Non-fatal warning while creating MongoDB indexes:", err);
  }
}

/** Automatically seeds default vendors, cases, and campaigns if collections are empty. */
async function autoSeed() {
  if (!collections) return;

  try {
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
  if (client) {
    await client.close();
    client = null;
    db = null;
    collections = null;
    isMongoActive = false;
  }
}
