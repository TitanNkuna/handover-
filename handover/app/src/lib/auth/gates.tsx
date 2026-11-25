import { useState } from "react";
import { Navigate } from "@tanstack/react-router";
import { signOut } from "./client";
import { useCurrentUser } from "./use-current-user";

/** Where `RedirectToSignIn` sends signed-out visitors. */
export const SIGN_IN_PATH = "/login";

/** Client-side redirect to the sign-in route. */
export function RedirectToSignIn({ to = SIGN_IN_PATH }: { to?: string }) {
  return <Navigate to={to} />;
}

/** Signed-in identity chip with a sign-out control. */
export function UserButton() {
  const user = useCurrentUser();
  const [signingOut, setSigningOut] = useState(false);
  if (!user) return null;
  const label = user.displayName ?? user.primaryEmail ?? "Account";
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-ink/10 text-sm font-semibold"
      >
        {label.charAt(0).toUpperCase()}
      </span>
      <span className="user-label text-sm font-medium">{label}</span>
      <button
        type="button"
        disabled={signingOut}
        onClick={() => {
          setSigningOut(true);
          // Success navigates away; on failure re-enable so it can be retried.
          void signOut().catch(() => setSigningOut(false));
        }}
        className="min-h-11 text-sm whitespace-nowrap underline-offset-4 opacity-70 hover:underline disabled:cursor-wait disabled:no-underline"
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
