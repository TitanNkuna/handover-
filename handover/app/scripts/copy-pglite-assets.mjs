#!/usr/bin/env node
/**
 * The embedded PGLite fallback (used when DATABASE_URL is not set) loads its
 * WASM and data files at runtime, but the bundler does not copy them into the
 * server output. Copy them next to the bundled library so `npm run preview`
 * works without an external database. Skipped when DATABASE_URL is set, since
 * a deployed app talks to Postgres and does not need them.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.DATABASE_URL?.trim()) {
  console.log("[pglite-assets] DATABASE_URL is set — skipping.");
  process.exit(0);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules/@electric-sql/pglite/dist");
const to = join(root, ".vercel/output/functions/__server.func/_libs");

if (!existsSync(to)) {
  console.log("[pglite-assets] no server output to patch — skipping.");
  process.exit(0);
}
mkdirSync(to, { recursive: true });
for (const file of ["pglite.wasm", "pglite.data", "initdb.wasm"]) {
  copyFileSync(join(from, file), join(to, file));
}
console.log("[pglite-assets] copied PGLite runtime files into the server output.");
