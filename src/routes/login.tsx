import {pageHead} from "@/lib/seo";
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

import { safeNext } from "@/lib/auth/redirect";

type LoginSearch = { next?: string; token?: string };

export const Route = createFileRoute("/login")({head:()=>pageHead("/login","Sign In","Sign in to your Oklahoma Prospects account.",true),
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    next: safeNext(search.next),
    token: typeof search.token === "string" ? search.token.slice(0,1000) : undefined,
  }),
  component: Login,
});

function persistSessionToken(token: string | null | undefined) {
  if (!token || window.self === window.top) return;
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
  const { next, token } = Route.useSearch();
  const dest = next || "/account";
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function onEmail(event: React.FormEvent) {
    event.preventDefault();
    if(busy)return;
    setError("");setNotice("");
    setBusy(true);
    try {
      const payload = {
        email: email.trim(),
        password,
        ...(mode === "up" ? { name } : {}),
      };
      if(token){const result=await authClient.resetPassword({token,newPassword:password});if(result.error)throw new Error(result.error.message);setNotice("Password saved. Sign in using your new password.");setBusy(false);return;}
      await emailAuth(mode, payload);
      if(mode === "up"){setNotice("Check your email to verify your account before signing in.");setBusy(false);return;}
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
      {notice?<p role="status" className="mb-4 rounded-lg bg-paper-2 p-3">{notice}</p>:null}
      {token?<p className="mb-4">Enter a new password below to reset your account.</p>:null}
      <Button type="button" variant="outlineDark" disabled={busy} onClick={async()=>{setBusy(true);setError("");try{const result=await authClient.requestPasswordReset({email,redirectTo:window.location.origin+"/login"});if(result.error)throw new Error(result.error.message);setNotice("If this email has an account, a reset link has been sent.");}catch(e){setError(e instanceof Error?e.message:"Could not request password reset.");}finally{setBusy(false);}}}>Forgot password? Enter your email below, then tap here</Button>

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
