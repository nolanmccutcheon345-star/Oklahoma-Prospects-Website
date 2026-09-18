import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { safeNext } from "./redirect";

export const SIGN_IN_PATH = "/login";

/** Mount only after the session has resolved as signed out. */
export function RedirectToSignIn({ to = SIGN_IN_PATH }: { to?: string }) {
  const location = useRouterState({ select: (s) => s.location });
  const navigate = useNavigate();
  // The router publishes the pending login location before this screen unmounts.
  // Capture the original destination so rerenders cannot nest /login?next= forever.
  const [next] = useState(() => safeNext(`${location.pathname}${location.searchStr || ""}`));

  useEffect(() => {
    void navigate({ to, search: { next }, replace: true });
  }, [navigate, to, next]);

  return null;
}
