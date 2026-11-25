/**
 * Better Auth for Linebook (server-only): username/password accounts stored in
 * Postgres. `DATABASE_URL` selects Postgres (Neon etc.); without it the app
 * uses an embedded in-memory PGLite database, which is handy for local dev.
 *
 * Production env:
 *   BETTER_AUTH_SECRET  long random string (required, or sessions break across instances)
 *   BETTER_AUTH_URL     the public origin, e.g. https://linebook.example.com
 *   DATABASE_URL        Postgres connection string
 *
 * Never import this from client code — use `@/lib/auth/client`.
 */
import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { ensureDbReady, getPglite } from "../db";
import { pgliteDialect } from "./pglite-dialect";

/** Read an env var, treating empty/whitespace as unset. */
const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

// Start (and share) PGLite bootstrap as soon as this module loads.
ensureDbReady().catch((err) => console.error("[auth] database bootstrap failed:", err));

// A dev-only secret that survives HMR (PGLite and its sessions live on globalThis too).
const globalAuthRef = globalThis as typeof globalThis & { __authDevSecret__?: string };
function secret(): string {
  const configured = env("BETTER_AUTH_SECRET");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[auth] BETTER_AUTH_SECRET is not set. Sessions will not survive a restart or work across instances.",
    );
  }
  globalAuthRef.__authDevSecret__ ??= randomBytes(32).toString("hex");
  return globalAuthRef.__authDevSecret__;
}

const explicitBaseURL = env("BETTER_AUTH_URL") ?? (env("VERCEL_URL") ? `https://${env("VERCEL_URL")}` : undefined);
const LOCAL_ORIGINS = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
];
const extraOrigins = (env("TRUSTED_ORIGINS") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const databaseUrl = env("DATABASE_URL");
const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

export const auth = betterAuth({
  // With no explicit URL Better Auth derives the origin from each request.
  ...(explicitBaseURL ? { baseURL: explicitBaseURL } : {}),
  secret: secret(),
  database,
  trustedOrigins: [...(explicitBaseURL ? [explicitBaseURL] : []), ...LOCAL_ORIGINS, ...extraOrigins],
  session: { cookieCache: { enabled: true, maxAge: 300 } },
  emailAndPassword: { enabled: true },
  // Plugin must stay last so it can bridge Set-Cookie into TanStack Start responses.
  plugins: [tanstackStartCookies()],
});
