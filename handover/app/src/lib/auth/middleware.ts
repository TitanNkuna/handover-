import { createMiddleware } from "@tanstack/react-start";

/**
 * Auth middleware for server functions. Rejects cross-site scripted requests,
 * then resolves the verified user id from the session cookie into
 * `context.userId`. Signed out -> throws `UnauthorizedError` ("Unauthorized").
 *
 * Only import `*.server` modules inside the handler so the server-only code
 * never ships to the browser.
 */
export const authMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { assertSameSiteRequest } = await import("./isolation.server");
  const { requireUserId } = await import("./verify.server");
  assertSameSiteRequest();
  const userId = await requireUserId();
  return next({ context: { userId } });
});
