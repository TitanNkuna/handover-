import { getRequest } from "@tanstack/react-start/server";

/**
 * Fetch-Metadata request guard — **server-only** (keep the `.server` suffix:
 * it imports `@tanstack/react-start/server`, which must never reach the browser).
 *
 * Allows same-origin requests (this app's own client), non-browser requests
 * (no `Sec-Fetch-Site`) and top-level GET navigations. Rejects scripted
 * cross-site requests so a hostile page can't ride the session cookie.
 */
export class CrossSiteRequestError extends Error {
  readonly status = 403;
  constructor() {
    super("Forbidden: cross-site request blocked");
    this.name = "CrossSiteRequestError";
  }
}

export function assertSameSiteRequest(): void {
  const request = getRequest();
  if (!request) return;
  const h = request.headers;
  const site = h.get("sec-fetch-site");
  if (!site || site === "same-origin" || site === "none") return;
  const dest = h.get("sec-fetch-dest");
  const isTopLevelGet =
    h.get("sec-fetch-mode") === "navigate" &&
    request.method === "GET" &&
    dest !== "object" &&
    dest !== "embed";
  if (isTopLevelGet) return;
  throw new CrossSiteRequestError();
}
