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

import { initMongoDb, isMongoActive } from "./db/mongo.js";
import { initDbPool, isPostgresActive } from "./db/connection.js";

// const PORT = Number(process.env["API_PORT"] ?? 3001);
const PORT = Number(process.env["PORT"] ?? process.env["API_PORT"] ?? 3001);

async function main() {
  let dbDescription = "Zero-config high-performance MemoryStore";

  const isProd = process.env.NODE_ENV === "production";
  const hasPgConfig = Boolean(process.env["DATABASE_URL"]);
  const hasMongoConfig = Boolean(process.env["MONGODB_URI"] || process.env["MONGODB_URL"]);

  if (hasPgConfig) {
    // Primary database: PostgreSQL
    const pgConnected = await initDbPool();
    if (!pgConnected) {
      const maskedUrl = process.env["DATABASE_URL"]?.replace(/:[^:@]+@/, ":***@");
      if (isProd) {
        console.error(
          `FATAL: Configured primary PostgreSQL database at ${maskedUrl} is unreachable. Aborting startup.`,
        );
        process.exit(1);
      } else {
        console.warn("\n" + "=".repeat(72));
        console.warn("  ⚠️   WARNING: RUNNING ON EPHEMERAL IN-MEMORY STORAGE (MemoryStore)");
        console.warn("  ------------------------------------------------------------------------");
        console.warn(`  PostgreSQL database at ${maskedUrl} is unreachable.`);
        console.warn("  The server has fallen back to zero-config in-memory storage.");
        console.warn("  ⚠️   DEMO DATA WILL NOT PERSIST ACROSS SERVER RESTARTS!");
        console.warn("=".repeat(72) + "\n");
        dbDescription = "⚠️  EPHEMERAL IN-MEMORY STORE (MemoryStore) — NOT PERSISTENT";
      }
    } else {
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
    }
  } else if (hasMongoConfig) {
    // Optional secondary database: MongoDB
    const mongoConnected = await initMongoDb();
    const rawUri = (process.env["MONGODB_URI"] || process.env["MONGODB_URL"] || "").replace(
      /:[^:@]+@/,
      ":***@",
    );
    if (!mongoConnected) {
      if (isProd) {
        console.error(
          `FATAL: Configured MongoDB database at ${rawUri} is unreachable. Aborting startup.`,
        );
        process.exit(1);
      } else {
        console.warn(
          `⚠️ [DEV] Configured MongoDB database at ${rawUri} is unreachable. Operating with zero-config MemoryStore.`,
        );
      }
    } else {
      dbDescription = `MongoDB (${rawUri})`;
    }
  } else {
    console.log(
      "Running with built-in zero-config database storage (no external database required).",
    );
  }

  const app = express();

  // Middleware
  const allowedOrigins = (
    process.env.CORS_ORIGIN || "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000"
  )
    .split(",")
    .map((o) => o.trim());

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
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
    // Assuming closeMongo() could be called if imported, skipping for safety
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
