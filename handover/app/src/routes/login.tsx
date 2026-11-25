import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Boot, Button, Field, FormError, Mark, TextInput, messageOf } from "@/components/floor/ui";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({ component: Login });

const USERNAME = /^[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])?$/;

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function accountEmail(username: string): string {
  return `${username}@linebook.test`;
}

function friendlyAuthError(message: string | undefined, fallback: string): string {
  const text = (message ?? "").toLowerCase();
  if (text.includes("exist") || text.includes("already")) return "That username is already taken.";
  if (text.includes("credential") || text.includes("password") || text.includes("invalid")) {
    return "That username or password doesn't match.";
  }
  return message || fallback;
}

function Login() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <Boot />;
  if (user) return <Navigate to="/" />;
  return <LoginScreen />;
}

function LoginScreen() {
  const [mode, setMode] = useState<"in" | "up">("up");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function finish() {
    window.location.assign("/");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const handle = normalizeUsername(username);
    if (!USERNAME.test(handle) || handle.length < 3) {
      setError("Use 3–24 letters or numbers. Dots, dashes, and underscores are fine.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters for the password.");
      return;
    }
    setPending(true);
    try {
      const email = accountEmail(handle);
      if (mode === "up") {
        const result = await authClient.signUp.email({
          email,
          password,
          name: handle,
          callbackURL: "/",
        });
        if (result.error) {
          setError(friendlyAuthError(result.error.message, "Could not create that account."));
          setPending(false);
          return;
        }
        finish();
        return;
      }
      const result = await authClient.signIn.email({
        email,
        password,
        callbackURL: "/",
      });
      if (result.error) {
        setError(friendlyAuthError(result.error.message, "Could not sign in."));
        setPending(false);
        return;
      }
      finish();
    } catch (caught) {
      setError(messageOf(caught));
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen md:grid md:grid-cols-2">
      <section className="bg-ink px-6 py-10 text-paper md:flex md:flex-col md:justify-between md:px-12 md:py-14">
        <div className="flex items-center gap-3">
          <Mark />
          <p className="font-display text-2xl">Linebook</p>
        </div>
        <div className="mt-10 max-w-md md:mt-0">
          <h1 className="font-display text-4xl leading-tight md:text-5xl">
            The work, the handover, and who changed it.
          </h1>
          <ul className="mt-8 space-y-4 text-base">
            <li>
              <span className="font-semibold text-on-copper">Supervisors</span>
              <span className="mt-1 block text-sm opacity-80">
                Build the outstanding list, assign it, and read every edit on the paper trail.
              </span>
            </li>
            <li>
              <span className="font-semibold text-on-copper">Technicians</span>
              <span className="mt-1 block text-sm opacity-80">
                Work your own jobs, share notes with the crew, and hand the shift over.
              </span>
            </li>
          </ul>
        </div>
        <p className="mt-10 hidden text-sm opacity-70 md:block">
          The first supervisor holds the floor key. Everyone else joins as a technician unless they have it.
        </p>
      </section>

      <section className="flex items-center px-4 py-10 md:px-12">
        <div className="mx-auto w-full max-w-md">
          <h2 className="font-display text-3xl text-ink">
            {mode === "up" ? "Create your account" : "Sign in"}
          </h2>
          <p className="mt-2 text-muted">
            Username and password. After that, you join as a technician or a supervisor.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-2 rounded-full bg-sheet p-1 shadow-sheet">
            <button
              type="button"
              onClick={() => {
                setMode("up");
                setError(null);
              }}
              className={
                mode === "up"
                  ? "min-h-11 rounded-full bg-ink text-sm font-semibold text-paper"
                  : "min-h-11 rounded-full text-sm font-semibold text-muted"
              }
            >
              New account
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("in");
                setError(null);
              }}
              className={
                mode === "in"
                  ? "min-h-11 rounded-full bg-ink text-sm font-semibold text-paper"
                  : "min-h-11 rounded-full text-sm font-semibold text-muted"
              }
            >
              Sign in
            </button>
          </div>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label="Username" hint="Letters and numbers. This is what you sign in with.">
              <TextInput
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </Field>
            <Field label="Password" hint="At least 8 characters.">
              <TextInput
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "up" ? "new-password" : "current-password"}
                required
                minLength={8}
              />
            </Field>
            <FormError message={error} />
            <Button type="submit" pending={pending} className="w-full">
              {mode === "up" ? "Create account" : "Sign in"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
