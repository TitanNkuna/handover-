import { createFileRoute } from "@tanstack/react-router";
import { FloorApp } from "@/components/floor/floor-app";
import { Boot } from "@/components/floor/ui";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <Boot />;
  if (!user) return <RedirectToSignIn />;
  return <FloorApp />;
}
