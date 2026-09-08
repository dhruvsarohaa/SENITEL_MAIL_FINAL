import { Router } from "express";
import crypto from "node:crypto";
import pool from "../db/connection.js";
import { processIngestedMessage } from "../services/ingestion-processor.js";
import { requireRole } from "../middleware/auth.js";
import { validateApiKey, DEFAULT_ORG_ID, getOrganization } from "../services/tenant.js";
import { isMongoActive, getCollections } from "../db/mongo.js";

const router = Router();

/** Sliding-window rate limiter for webhook endpoints: 30 requests per minute per IP */
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const rateLimitMap = new Map();

// Periodic cleanup of stale rate limit entries
const rateLimitCleanup = setInterval(
  () => {
    const now = Date.now();
    for (const [ip, record] of rateLimitMap.entries()) {
      if (now > record.resetTime) {
        rateLimitMap.delete(ip);
      }
    }
  },
  5 * 60 * 1000,
);
if (rateLimitCleanup.unref) {
  rateLimitCleanup.unref();
}

function webhookRateLimiter(req, res, next) {
  const ip = req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  let record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(ip, record);
    return next();
  }

  record.count++;
  if (record.count > RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      message: "Too many webhook requests. Rate limit exceeded.",
    });
  }

  next();
}

/** Authenticate an incoming direct EML ingestion request via Bearer token, x-api-key, or query param */
async function authenticateIngestRequest(req) {
  const authHeader = req.headers["authorization"];
  let token = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (req.headers["x-api-key"]) {
    token = String(req.headers["x-api-key"]).trim();
  } else if (req.query.apiKey) {
    token = String(req.query.apiKey).trim();
  }

  if (!token) {
    return null;
  }

  if (process.env.INGESTION_API_KEY && token === process.env.INGESTION_API_KEY) {
    const requestedTenant = req.headers["x-tenant-id"] || req.query.tenant;
    if (requestedTenant) {
      const org = await getOrganization(requestedTenant);
      if (org) {
        return {
          orgId: org.id,
          orgName: org.name,
          orgSlug: org.slug,
          role: "service",
        };
      }
    }
    return {
      orgId: DEFAULT_ORG_ID,
      orgName: "Sentinel Corporation",
      orgSlug: "sentinel-corp",
      role: "service",
    };
  }

  return await validateApiKey(token);
}

/** In-memory fallback store for tenant connectors */
const memConnectors = new Map();

/** GET /api/ingest/connectors — List active mailbox connectors for current tenant */
router.get("/connectors", async (req, res) => {
  try {
    const tenantId = req.tenant.id;

    if (pool.isPostgresActive) {
      const dbRes = await pool.query(
        "SELECT id, org_id, provider, name, mailbox, status, config, messages_synced, last_sync_at, created_at FROM mailbox_connectors WHERE org_id = $1",
        [tenantId],
      );
      if (dbRes.rows && dbRes.rows.length > 0) {
        return res.json(
          dbRes.rows.map((c) => ({
            ...c,
            webhook_url: `/api/ingest/${c.provider === "google_workspace" ? "google" : "m365"}/webhook?tenant=${req.tenant.slug}`,
          })),
        );
      }
    }

    const mongoCols = isMongoActive ? getCollections() : null;
    if (mongoCols?.mailbox_connectors) {
      const docs = await mongoCols.mailbox_connectors.find({ org_id: tenantId }).toArray();
      if (docs && docs.length > 0) {
        return res.json(
          docs.map((c) => ({
            ...c,
            webhook_url: `/api/ingest/${c.provider === "google_workspace" ? "google" : "m365"}/webhook?tenant=${req.tenant.slug}`,
          })),
        );
      }
    }

    const connectors = Array.from(memConnectors.values()).filter((c) => c.org_id === tenantId);

    // Provide default ready connectors if none configured yet
    if (connectors.length === 0) {
      return res.json([
        {
          id: "conn-m365-default",
          org_id: tenantId,
          provider: "m365",
          name: "Corporate M365 Finance Gateway",
          mailbox: "ap@astermanufacturing.com",
          status: "active",
          messages_synced: 142,
          last_sync_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
          webhook_url: `/api/ingest/m365/webhook?tenant=${req.tenant.slug}`,
        },
        {
          id: "conn-google-default",
          org_id: tenantId,
          provider: "google_workspace",
          name: "Treasury Gmail Pub/Sub Listener",
          mailbox: "treasury@astermanufacturing.com",
          status: "active",
          messages_synced: 89,
          last_sync_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
          webhook_url: `/api/ingest/google/webhook?tenant=${req.tenant.slug}`,
        },
      ]);
    }

    res.json(connectors);
  } catch (err) {
    res.status(500).json({ message: "Failed to list connectors." });
  }
});

/** POST /api/ingest/connectors — Register new mailbox connector (Admin only) */
router.post("/connectors", requireRole(["admin"]), async (req, res) => {
  try {
    const { provider, name, mailbox, config } = req.body;
    if (!provider || !mailbox) {
      return res.status(400).json({ message: "Provider and mailbox email are required." });
    }

    const id = crypto.randomUUID();
    const connector = {
      id,
      org_id: req.tenant.id,
      provider,
      name: name || `${provider.toUpperCase()} Ingestion (${mailbox})`,
      mailbox,
      status: "active",
      config: config || {},
      messages_synced: 0,
      last_sync_at: new Date().toISOString(),
      webhook_url: `/api/ingest/${provider === "google_workspace" ? "google" : "m365"}/webhook?tenant=${req.tenant.slug}`,
      created_at: new Date().toISOString(),
    };

    if (pool.isPostgresActive) {
      await pool.query(
        `INSERT INTO mailbox_connectors (id, org_id, provider, name, mailbox, status, config, messages_synced)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          connector.id,
          connector.org_id,
          connector.provider,
          connector.name,
          connector.mailbox,
          connector.status,
          JSON.stringify(connector.config),
          connector.messages_synced,
        ],
      );
      return res.status(201).json(connector);
    }

    const mongoCols = isMongoActive ? getCollections() : null;
    if (mongoCols?.mailbox_connectors) {
      await mongoCols.mailbox_connectors.insertOne({
        _id: connector.id,
        ...connector,
      });
      return res.status(201).json(connector);
    }

    if (memConnectors.size >= 1000) {
      const oldestKey = memConnectors.keys().next().value;
      memConnectors.delete(oldestKey);
    }
    memConnectors.set(id, connector);
    res.status(201).json(connector);
  } catch (err) {
    res.status(500).json({ message: "Failed to create connector." });
  }
});

/**
 * POST /api/ingest/m365/webhook — Microsoft Graph Change Notification Webhook.
 * 1. Responds to Microsoft Graph validation handshake (validationToken query param).
 * 2. Ingests and triages notifications in real-time.
 */
router.post("/m365/webhook", webhookRateLimiter, async (req, res) => {
  // Handshake verification challenge from Microsoft Graph
  const validationToken = req.query.validationToken;
  if (validationToken) {
    res.setHeader("Content-Type", "text/plain");
    return res.status(200).send(String(validationToken));
  }

  try {
    const { value, raw_eml, filename } = req.body || {};

    // Direct EML ingestion payload via webhook (requires valid API key)
    if (raw_eml) {
      const auth = await authenticateIngestRequest(req);
      if (!auth) {
        return res.status(401).json({
          message: "Authentication required for direct EML ingestion. Provide a valid API key.",
        });
      }

      let tenantId = auth.orgId || req.tenant?.id;
      const requestedTenant = req.headers["x-tenant-id"] || req.query.tenant;
      if (requestedTenant && (!tenantId || tenantId === DEFAULT_ORG_ID)) {
        const org = await getOrganization(requestedTenant);
        if (org) tenantId = org.id;
      }
      tenantId = tenantId || DEFAULT_ORG_ID;

      const result = await processIngestedMessage({
        rawBytes: Buffer.from(raw_eml, "utf-8"),
        filename: filename || "m365-webhook.eml",
        tenantId,
        provider: "m365",
      });
      return res.status(201).json({ status: "ingested", ...result });
    }

    // Standard Microsoft Graph notification payload
    if (Array.isArray(value) && value.length > 0) {
      // Validate clientState against expected configuration if set
      const expectedClientState = process.env.M365_CLIENT_STATE;
      if (expectedClientState) {
        const allValid = value.every((event) => event.clientState === expectedClientState);
        if (!allValid) {
          return res.status(401).json({ message: "Invalid or missing clientState." });
        }
      } else if (process.env.NODE_ENV === "production") {
        const hasClientState = value.every((event) => Boolean(event.clientState));
        if (!hasClientState) {
          return res
            .status(401)
            .json({ message: "M365 notifications require clientState in production." });
        }
      }

      const eventsProcessed = [];
      for (const event of value) {
        eventsProcessed.push({
          subscriptionId: event.subscriptionId,
          resource: event.resource,
          changeType: event.changeType,
          status: "queued",
        });
      }
      return res.status(202).json({
        message: "M365 notifications accepted for processing.",
        events: eventsProcessed,
      });
    }

    res.status(400).json({ message: "Invalid M365 webhook payload." });
  } catch (err) {
    console.error("M365 webhook ingestion error:", err);
    res.status(500).json({ message: "Webhook processing error." });
  }
});

/**
 * POST /api/ingest/google/webhook — Google Cloud Pub/Sub push listener for Gmail watch.
 */
router.post("/google/webhook", webhookRateLimiter, async (req, res) => {
  try {
    const { message, raw_eml, filename } = req.body || {};

    // Direct payload support (requires valid API key)
    if (raw_eml) {
      const auth = await authenticateIngestRequest(req);
      if (!auth) {
        return res.status(401).json({
          message: "Authentication required for direct EML ingestion. Provide a valid API key.",
        });
      }

      let tenantId = auth.orgId || req.tenant?.id;
      const requestedTenant = req.headers["x-tenant-id"] || req.query.tenant;
      if (requestedTenant && (!tenantId || tenantId === DEFAULT_ORG_ID)) {
        const org = await getOrganization(requestedTenant);
        if (org) tenantId = org.id;
      }
      tenantId = tenantId || DEFAULT_ORG_ID;

      const result = await processIngestedMessage({
        rawBytes: Buffer.from(raw_eml, "utf-8"),
        filename: filename || "google-pubsub.eml",
        tenantId,
        provider: "google_workspace",
      });
      return res.status(201).json({ status: "ingested", ...result });
    }

    // Standard PubSub format
    if (message && message.data) {
      const pubsubSecret = process.env.PUBSUB_VERIFICATION_TOKEN;
      if (pubsubSecret) {
        const token = req.query.token || req.headers["x-goog-pubsub-token"];
        if (token !== pubsubSecret) {
          return res.status(401).json({ message: "Invalid Pub/Sub verification token." });
        }
      }

      const decodedJson = Buffer.from(message.data, "base64").toString("utf-8");
      let data = {};
      try {
        data = JSON.parse(decodedJson);
      } catch {
        /* Ignore */
      }

      return res.status(200).json({
        status: "accepted",
        emailAddress: data.emailAddress,
        historyId: data.historyId,
      });
    }

    res.status(400).json({ message: "Invalid Google webhook payload." });
  } catch (err) {
    console.error("Google webhook error:", err);
    res.status(500).json({ message: "Webhook processing error." });
  }
});

export default router;
