import "dotenv/config";
import express from "express";
import cors from "cors";
import { runMigrations } from "./db/migrate.js";
import analyzeRouter from "./routes/analyze.js";
import casesRouter from "./routes/cases.js";
import vendorsRouter from "./routes/vendors.js";
import campaignsRouter from "./routes/campaigns.js";
// @ts-ignore - JavaScript route modules for Enterprise Phase 1 & 2
import tenantsRouter from "./routes/tenants.js";
// @ts-ignore
import ingestRouter from "./routes/ingest.js";
// @ts-ignore
import { tenantAuthMiddleware } from "./middleware/auth.js";

import { initMongoDb, isMongoActive } from "./db/mongo.js";
import { initDbPool, isPostgresActive } from "./db/connection.js";

// const PORT = Number(process.env["API_PORT"] ?? 3001);
const PORT = Number(process.env["PORT"] ?? process.env["API_PORT"] ?? 3001);

async function main() {
  let dbDescription = "Zero-config high-performance MemoryStore";

  // 1. Try MongoDB connection if configured
  const mongoConnected = await initMongoDb();
  if (mongoConnected) {
    const rawUri = process.env["MONGODB_URI"] || process.env["MONGODB_URL"] || "";
    dbDescription = `MongoDB (${rawUri.replace(/:[^:@]+@/, ":***@")})`;
  } else {
    // 2. Try PostgreSQL connection if configured
    const pgConnected = await initDbPool();
    if (pgConnected) {
      dbDescription = `PostgreSQL (${process.env["DATABASE_URL"]?.replace(/:[^:@]+@/, ":***@")})`;
      console.log("Running database migrations...");
      try {
        await runMigrations();
        console.log("Migrations complete.");
      } catch (migErr) {
        console.error("Migration error:", migErr);
      }
    } else {
      console.log(
        "Running with built-in zero-config database storage (no external database required).",
      );
    }
  }

  const app = express();

  // Middleware
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "10mb" }));

  // Root health / info
  app.get("/", (_req, res) => {
    res.send(`
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; line-height: 1.6;">
        <h2>🛡️ SentinelMail API Backend is Running</h2>
        <p>The forensic analysis API is active.</p>
        <p>👉 To view the SentinelMail UI, open the frontend at: <br/>
           <a href="SentinelMail frontend" style="font-size: 1.2rem; color: #2563eb; font-weight: bold;">http://localhost:3000</a>
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
    console.error("Unhandled API Error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  });

  const server = app.listen(PORT, () => {
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
