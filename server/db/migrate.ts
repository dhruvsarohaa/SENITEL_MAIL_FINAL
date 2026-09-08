import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getClient, initDbPool } from "./connection.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  const postgresReady = await initDbPool();

  if (!postgresReady) {
    throw new Error(
      "PostgreSQL is not available. Check DATABASE_URL and make sure PostgreSQL is running.",
    );
  }

  const client = await getClient();

  try {
    // Use the existing migration history table.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const { rows: appliedRows } = await client.query("SELECT name FROM schema_migrations");

    const appliedMigrations = new Set(appliedRows.map((row: { name: string }) => row.name));

    /*
     * The database was previously migrated using a slightly different
     * migration naming/order. Map those existing records to the current
     * migration filenames.
     */
    const legacyMigrationMap: Record<string, string> = {
      "001_vendors.sql": "001_vendors.sql",
      "002_cases.sql": "002_cases.sql",
      "003_actions.sql": "005_actions.sql",
      "004_indicators.sql": "004_indicators.sql",
      "005_case_number_seq.sql": "006_case_number_seq.sql",
    };

    for (const [legacyName, currentName] of Object.entries(legacyMigrationMap)) {
      if (appliedMigrations.has(legacyName)) {
        appliedMigrations.add(currentName);
      }
    }

    const migrationsDir = path.join(__dirname, "migrations");

    const files = await fs.readdir(migrationsDir);

    const migrationFiles = files
      .filter((file) => file.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    for (const file of migrationFiles) {
      if (appliedMigrations.has(file)) {
        console.log(`Skipping already applied migration: ${file}`);
        continue;
      }

      console.log(`Running migration: ${file}`);

      const filePath = path.join(migrationsDir, file);
      const sql = await fs.readFile(filePath, "utf-8");

      await client.query("BEGIN");

      try {
        await client.query(sql);

        await client.query(
          "INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
          [file],
        );

        await client.query("COMMIT");

        console.log(`Applied migration: ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");

        console.error(`Failed to apply migration: ${file}`);
        throw err;
      }
    }

    console.log("All migrations applied successfully.");
  } finally {
    client.release();
  }
}

// Allow running directly: tsx server/db/migrate.ts
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").includes("db/migrate")) {
  runMigrations()
    .then(() => {
      console.log("Migration check complete.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}

// import "dotenv/config";
// import fs from "fs/promises";
// import path from "path";
// import { fileURLToPath } from "url";
// //import { getClient } from "./connection.js";
// import { getClient, initDbPool } from "./connection.js";

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// export async function runMigrations() {
//   const postgresReady = await initDbPool();

//   if (!postgresReady) {
//     throw new Error(
//       "PostgreSQL is not available. Check DATABASE_URL and make sure PostgreSQL is running.",
//     );
//   }

//   const client = await getClient();

//   try {

// // export async function runMigrations() {
// //   const client = await getClient();

// //   try {
//     // Create migrations table if it doesn't exist
//     await client.query(`
//       CREATE TABLE IF NOT EXISTS migrations (
//         id SERIAL PRIMARY KEY,
//         name TEXT UNIQUE NOT NULL,
//         applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
//       );
//     `);

//     // Get all applied migrations
//     const { rows: appliedRows } = await client.query("SELECT name FROM migrations");
//     const appliedMigrations = new Set(appliedRows.map((row: any) => row.name));

//     // Get all migration files
//     const migrationsDir = path.join(__dirname, "migrations");
//     const files = await fs.readdir(migrationsDir);
//     const migrationFiles = files
//       .filter((file) => file.endsWith(".sql"))
//       .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

//     for (const file of migrationFiles) {
//       if (appliedMigrations.has(file)) {
//         continue;
//       }

//       console.log(`Running migration: ${file}`);
//       const filePath = path.join(migrationsDir, file);
//       const sql = await fs.readFile(filePath, "utf-8");

//       // Run each migration in a transaction
//       await client.query("BEGIN");
//       try {
//         await client.query(sql);
//         await client.query("INSERT INTO migrations (name) VALUES ($1)", [file]);
//         await client.query("COMMIT");
//         console.log(`Applied migration: ${file}`);
//       } catch (err) {
//         await client.query("ROLLBACK");
//         console.error(`Failed to apply migration: ${file}`);
//         throw err;
//       }
//     }

//     console.log("All migrations applied successfully.");
//   } finally {
//     client.release();
//   }
// }

// // Allow running directly: tsx server/db/migrate.ts
// if (process.argv[1] && process.argv[1].replace(/\\/g, "/").includes("db/migrate")) {
//   runMigrations()
//     .then(() => {
//       console.log("Migration check complete.");
//       process.exit(0);
//     })
//     .catch((err) => {
//       console.error("Migration failed:", err);
//       process.exit(1);
//     });
// }
