import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Parse ALLOWED_HOSTS env var (comma-separated) for Vite host header validation.
 * Falls back to localhost only when unset.
 */
const allowedHosts: string[] = process.env["ALLOWED_HOSTS"]
  ? process.env["ALLOWED_HOSTS"].split(",").map((h) => h.trim())
  : ["localhost"];

export default defineConfig({
  preview: {
    host: true,
    allowedHosts,
  },
  server: {
    allowedHosts,
    proxy: {
      // In dev, forward /api requests to the Express backend on port 3001
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    tailwindcss(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
      server: { entry: "server" },
    }),
    nitro({
      defaultPreset: process.env["NITRO_PRESET"] || "node-server",
      routeRules: {
        "/api/**": {
          proxy: (process.env["INTERNAL_API_URL"] || "http://sentinelmail-api:10000/api/**").replace(/\/$/, ""),
        },
      },
    }),
    react(),
  ],
  // @ts-expect-error Vitest configuration extension
  test: {
    poolOptions: {
      threads: {
        isolate: false,
      },
    },
    teardownTimeout: 1000,
  },
});
