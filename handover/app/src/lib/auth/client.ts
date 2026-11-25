import { createAuthClient } from "better-auth/react";

/** Better Auth client (browser). Talks to this app's own `/api/auth/*` routes. */
export const authClient = createAuthClient();

/** Sign out, then send the visitor to the sign-in page. */
export async function signOut(): Promise<void> {
  await authClient.signOut();
  window.location.assign("/login");
}
