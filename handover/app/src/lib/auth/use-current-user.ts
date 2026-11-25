import { useMemo } from "react";
import { authClient } from "./client";

/** Normalized user shape used across the app. */
export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
};

export type CurrentUserState = {
  /** `null` both while the session loads and when signed out. */
  user: AppUser | null;
  /** True while the session is still resolving; don't treat `user: null` as signed out yet. */
  isPending: boolean;
};

/** Current user plus loading state (Better Auth `useSession`). */
export function useCurrentUserState(): CurrentUserState {
  const { data, isPending } = authClient.useSession();
  const id = data?.user.id;
  const displayName = data?.user.name ?? null;
  const primaryEmail = data?.user.email ?? null;
  const profileImageUrl = data?.user.image ?? null;
  const user = useMemo<AppUser | null>(
    () => (id ? { id, displayName, primaryEmail, profileImageUrl } : null),
    [id, displayName, primaryEmail, profileImageUrl],
  );
  return useMemo(() => ({ user, isPending }), [user, isPending]);
}

export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
