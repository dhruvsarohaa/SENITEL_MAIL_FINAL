import { Router } from "express";
import crypto from "node:crypto";
import pool from "../db/connection.js";
import { processIngestedMessage } from "../services/ingestion-processor.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

/** In-memory fallback store for tenant connectors */
const memConnectors = new Map();

/** GET /api/ingest/connectors — List active mailbox connectors for current tenant */
router.get("/connectors", async (req, res) => {
  try {
    const tenantId = req.tenant.id;
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

    const id = `conn-${crypto.randomUUID()}`;
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
router.post("/m365/webhook", async (req, res) => {
  // Handshake verification challenge from Microsoft Graph
  const validationToken = req.query.validationToken;
  if (validationToken) {
    res.setHeader("Content-Type", "text/plain");
    return res.status(200).send(String(validationToken));
  }

  try {
    const tenantId = req.tenant?.id || "00000000-0000-0000-0000-000000000001";
    const { value, raw_eml, filename } = req.body || {};

    // Direct EML ingestion payload via webhook
    if (raw_eml) {
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

    res.status(200).json({ status: "acknowledged" });
  } catch (err) {
    console.error("M365 webhook ingestion error:", err);
    res.status(500).json({ message: "Webhook processing error." });
  }
});

/**
 * POST /api/ingest/google/webhook — Google Cloud Pub/Sub push listener for Gmail watch.
 */
router.post("/google/webhook", async (req, res) => {
  try {
    const tenantId = req.tenant?.id || "00000000-0000-0000-0000-000000000001";
    const { message, raw_eml, filename } = req.body || {};

    // Direct payload support
    if (raw_eml) {
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

    res.status(200).json({ status: "acknowledged" });
  } catch (err) {
    console.error("Google webhook error:", err);
    res.status(500).json({ message: "Webhook processing error." });
  }
});

export default router;
