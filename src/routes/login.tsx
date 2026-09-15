import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  GROK_PROVIDERS,
  authClient,
  authEnabled,
  signIn,
} from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/page-hero";

type LoginSearch = { next?: string };

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    next:
      typeof search.next === "string" && search.next.startsWith("/")
        ? search.next
        : "/account",
  }),
  component: Login,
});

function persistSessionToken(token: string | null | undefined) {
  if (!token) return;
  try {
    sessionStorage.setItem("grok-auth.bearer-token", token);
  } catch {
    /* ignore */
  }
}

async function emailAuth(
  mode: "in" | "up",
  payload: { email: string; password: string; name?: string },
) {
  const path =
    mode === "up" ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email";
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as {
    message?: string;
    token?: string;
    user?: { id: string };
  };
  const headerToken = res.headers.get("set-auth-token");
  persistSessionToken(headerToken || data.token);
  if (!res.ok) {
    throw new Error(data.message ?? "Could not sign in.");
  }
  return data;
}

function Login() {
  const { next } = Route.useSearch();
  const dest = next || "/account";
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onEmail(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = {
        email: email.trim(),
        password,
        ...(mode === "up" ? { name } : {}),
      };
      try {
        await emailAuth(mode, payload);
      } catch (first) {
        if (mode === "up") {
          await emailAuth("in", payload);
        } else {
          throw first;
        }
      }
      try {
        await authClient.getSession();
      } catch {
        /* bearer is set; reload will pick it up */
      }
      window.location.assign(dest);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Could not sign in.");
    }
  }

  return (
    <main id="main">
      <PageHero
        eyebrow="Oklahoma Prospects"
        title="Sign in."
        accent="One account."
        copy="Parents, players, coaches, and the front office. Cages, lessons, and teams share this login."
        image="/brand/training.jpg"
        compact
      />
      <div className="mx-auto max-w-md px-5 py-8">
      {authEnabled ? (
        <div className="mt-6 grid gap-2">
          {GROK_PROVIDERS.map((provider) => (
            <Button
              key={provider.providerId}
              type="button"
              variant="outlineDark"
              onClick={() => signIn(provider.providerId, { callbackURL: dest })}
            >
              Continue with {provider.label}
            </Button>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">
          Sign-in is turned off for this preview. Use email below if it still
          appears, or ask the office to open accounts.
        </p>
      )}
      <form onSubmit={onEmail} className="mt-8 grid gap-3">
        <p className="text-sm font-semibold">Email and password</p>
        {mode === "up" ? (
          <label className="text-sm font-semibold">
            Name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="mt-1.5 block min-h-11 w-full rounded-md border border-line bg-paper-2 px-3"
            />
          </label>
        ) : null}
        <label className="text-sm font-semibold">
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "login-error" : undefined}
            className="mt-1.5 block min-h-11 w-full rounded-md border border-line bg-paper-2 px-3"
          />
        </label>
        <label className="text-sm font-semibold">
          Password
          <input
            required
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "up" ? "new-password" : "current-password"}
            className="mt-1.5 block min-h-11 w-full rounded-md border border-line bg-paper-2 px-3"
          />
        </label>
        {error ? (
          <p id="login-error" className="text-sm text-maroon" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Signing in…" : mode === "up" ? "Create account" : "Sign in"}
        </Button>
        <button
          type="button"
          className="min-h-11 text-sm font-semibold text-maroon"
          onClick={() => setMode(mode === "up" ? "in" : "up")}
        >
          {mode === "up"
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
      </form>
      <p className="mt-6 text-sm">
        <Link to="/">Back to home</Link>
      </p>
      </div>
    </main>
  );
}
