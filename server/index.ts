import "dotenv/config";
import express from "express";
import cors from "cors";
import { runMigrations } from "./db/migrate.js";
import analyzeRouter from "./routes/analyze.js";
import casesRouter from "./routes/cases.js";
import vendorsRouter from "./routes/vendors.js";
import campaignsRouter from "./routes/campaigns.js";

import tenantsRouter from "./routes/tenants.js";

import ingestRouter from "./routes/ingest.js";

import { tenantAuthMiddleware } from "./middleware/auth.js";

import { initMongoDb, isMongoActive, closeMongo } from "./db/mongo.js";
import { initDbPool, isPostgresActive, realPool } from "./db/connection.js";

// const PORT = Number(process.env["API_PORT"] ?? 3001);
const PORT = Number(process.env["PORT"] ?? process.env["API_PORT"] ?? 3001);

async function main() {
  let dbDescription = "Zero-config high-performance MemoryStore";

  const hasPgConfig = Boolean(process.env["DATABASE_URL"]);
  const hasMongoConfig = Boolean(process.env["MONGODB_URI"] || process.env["MONGODB_URL"]);

  let connectedTier = "none";

  // Tier 1: PostgreSQL (Primary)
  if (hasPgConfig) {
    console.log("[DATABASE CASCADE] Attempting Tier 1 (PostgreSQL)...");
    const pgConnected = await initDbPool();
    if (pgConnected) {
      connectedTier = "postgresql";
      dbDescription = `PostgreSQL (${process.env["DATABASE_URL"]?.replace(/:[^:@]+@/, ":***@")})`;
      console.log("Running database migrations...");
      try {
        await runMigrations();
        console.log("Migrations complete.");
      } catch (migErr) {
        console.error("Migration error:", migErr);
        console.error(
          "FATAL: Database migrations failed. Aborting startup to prevent schema mismatches.",
        );
        process.exit(1);
      }
    } else {
      const maskedPgUrl = process.env["DATABASE_URL"]?.replace(/:[^:@]+@/, ":***@");
      console.warn(
        `⚠️  [DATABASE CASCADE] PostgreSQL at ${maskedPgUrl} is unreachable. Falling back to MongoDB...`,
      );
    }
  }

  // Tier 2: MongoDB (Secondary Fallback)
  if (connectedTier === "none" && hasMongoConfig) {
    console.log("[DATABASE CASCADE] Attempting Tier 2 (MongoDB)...");
    const mongoConnected = await initMongoDb();
    if (mongoConnected) {
      connectedTier = "mongodb";
      const rawUri = (process.env["MONGODB_URI"] || process.env["MONGODB_URL"] || "").replace(
        /:[^:@]+@/,
        ":***@",
      );
      dbDescription = `MongoDB (${rawUri})`;
    } else {
      const rawUri = (process.env["MONGODB_URI"] || process.env["MONGODB_URL"] || "").replace(
        /:[^:@]+@/,
        ":***@",
      );
      console.warn(
        `⚠️  [DATABASE CASCADE] MongoDB at ${rawUri} is unreachable. Falling back to MemoryStore...`,
      );
    }
  }

  // Tier 3: MemoryStore (Ephemeral Tertiary Fallback)
  if (connectedTier === "none") {
    if (process.env["NODE_ENV"] === "production" && (hasPgConfig || hasMongoConfig)) {
      console.error(
        "FATAL: Configured database (PostgreSQL/MongoDB) is unreachable in production mode. Refusing to degrade to ephemeral MemoryStore in production.",
      );
      process.exit(1);
    }

    console.warn("\n" + "=".repeat(78));
    console.warn("  ⚠️   WARNING: OPERATING IN EPHEMERAL IN-MEMORY STORAGE (MemoryStore) FALLBACK");
    console.warn("  " + "-".repeat(74));
    console.warn("  Neither PostgreSQL nor MongoDB could be reached.");
    console.warn("  The server is running on zero-config in-memory storage.");
    console.warn("  ⚠️   CUSTOMER DATA (CASES, CAMPAIGNS, API KEYS) WILL NOT PERSIST ON RESTART!");
    console.warn("=".repeat(78) + "\n");
    dbDescription = "⚠️  EPHEMERAL IN-MEMORY STORE (MemoryStore) — NOT PERSISTENT";
  }

  const app = express();

  // Middleware
  const rawOrigins = (
    process.env.CORS_ORIGIN || "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000"
  )
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const allowedOrigins = rawOrigins.flatMap((o) => {
    if (o.startsWith("http://") || o.startsWith("https://")) {
      return [o];
    }
    return [`http://${o}`, `https://${o}`, o];
  });

  app.use(
    cors({
      origin: (origin, callback) => {
        if (
          !origin ||
          allowedOrigins.includes("*") ||
          allowedOrigins.includes(origin) ||
          origin.endsWith(".onrender.com") ||
          origin.startsWith("http://localhost:") ||
          origin.startsWith("http://127.0.0.1:")
        ) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "10mb" }));

  // Root health / info
  app.get("/", (_req, res) => {
    res.send(`
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; line-height: 1.6;">
        <h2>🛡️ SentinelMail API Backend is Running</h2>
        <p>The forensic analysis API is active.</p>
        <p>👉 To view the SentinelMail UI, open the frontend at: <br/>
           <a href="http://localhost:3000" style="font-size: 1.2rem; color: #2563eb; font-weight: bold;">http://localhost:3000</a>
        </p>
      </div>
    `);
  });

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      database: isMongoActive ? "mongodb" : isPostgresActive ? "postgresql" : "memory",
      timestamp: new Date().toISOString(),
    });
  });

  // Enterprise Multi-Tenant & RBAC Authentication Layer
  app.use("/api", tenantAuthMiddleware);

  // API routes
  app.use("/api/analyze", analyzeRouter);
  app.use("/api/cases", casesRouter);
  app.use("/api/vendors", vendorsRouter);
  app.use("/api/campaigns", campaignsRouter);
  app.use("/api/tenants", tenantsRouter);
  app.use("/api/ingest", ingestRouter);

  // 404 handler for unknown API routes
  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "API route not found." });
  });

  // Global Error Handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.name === "MulterError" || (err && err.code === "LIMIT_FILE_SIZE")) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ message: "File exceeds 25 MB size limit." });
      }
      return res.status(400).json({ message: err.message || "File upload error." });
    }
    console.error("Unhandled API Error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  });

  const server = app.listen(PORT, "0.0.0.0", () => {
    const aiProvider = process.env["GEMINI_API_KEY"]
      ? `enabled (Google Gemini: ${process.env["GEMINI_MODEL"] || "gemini-2.5-flash"})`
      : process.env["OPENAI_API_KEY"]
        ? "enabled (OpenAI GPT-4o-mini)"
        : "disabled (rules-only fallback)";

    console.log(`\n  🛡️  SentinelMail API server listening on http://localhost:${PORT}`);
    console.log(`  📦  Database: ${dbDescription}`);
    console.log(`  🧠  AI classification: ${aiProvider}`);
    console.log(
      `  🚨  Containment alerts: ${
        [
          process.env["CONTAINMENT_WEBHOOK_URL"] && "webhook",
          process.env["SLACK_WEBHOOK_URL"] && "slack",
          process.env["TEAMS_WEBHOOK_URL"] && "teams",
          process.env["SMTP_HOST"] && "email",
        ]
          .filter(Boolean)
          .join(", ") || "none configured"
      }\n`,
    );
  });

  // Graceful Shutdown
  const shutdown = async () => {
    console.log("\nShutting down server gracefully...");
    server.close();
    try {
      if (realPool) {
        await realPool.end();
      }
      await closeMongo();
    } catch (err) {
      console.error("Error during graceful shutdown:", err);
    }
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
