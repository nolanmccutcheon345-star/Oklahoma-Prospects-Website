import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarClock,
  Dumbbell,
  Home,
  MapPin,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { CLUB } from "@/lib/club";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isPending } = useCurrentUserState();
  const tabs = [
    { to: "/", label: "Home", icon: Home, match: (path: string) => path === "/" },
    {
      to: "/book",
      label: "Book",
      icon: CalendarClock,
      match: (path: string) =>
        path.startsWith("/book") ||
        path.startsWith("/go") ||
        path.startsWith("/memberships") ||
        path.startsWith("/pay") ||
        path.startsWith("/paid"),
    },
    {
      to: "/training",
      label: "Train",
      icon: Dumbbell,
      match: (path: string) =>
        path.startsWith("/training") || path.startsWith("/account"),
    },
    {
      to: "/teams",
      label: "Teams",
      icon: Users,
      match: (path: string) =>
        path.startsWith("/teams") ||
        path.startsWith("/tryouts") ||
        path.startsWith("/recruiting") ||
        path.startsWith("/coach") ||
        path.startsWith("/family") ||
        path.startsWith("/office"),
    },
    {
      to: "/more",
      label: "Visit",
      icon: MapPin,
      match: (path: string) =>
        path.startsWith("/more") ||
        path.startsWith("/parents") ||
        path.startsWith("/contact") ||
        path.startsWith("/privacy") ||
        path.startsWith("/visits") ||
        path.startsWith("/facility") ||
        path.startsWith("/waiver") ||
        path.startsWith("/login"),
    },
  ] as const;

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-fg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-paper-2 focus:px-4 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-fg-inverse/10 bg-ink text-fg-inverse">
        <div className="h-1 bg-maroon" />
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4">
          <Link to="/" className="flex min-w-0 items-center gap-3 no-underline">
            <img
              src="/brand/mark.png"
              alt=""
              width={40}
              height={40}
              className="size-10 object-contain"
            />
            <span className="min-w-0">
              <span className="block truncate font-display text-lg leading-none font-extrabold tracking-wide italic">
                OKLAHOMA PROSPECTS
              </span>
              <span className="mt-1 block text-[0.65rem] font-medium tracking-[0.18em] text-fg-soft uppercase">
                Baseball & softball · Est. {CLUB.established}
              </span>
            </span>
          </Link>
          <div className="shrink-0">
            {isPending ? (
              <Button size="sm" variant="primary" disabled>
                Account
              </Button>
            ) : user ? (
              <Button asChild size="sm" variant="primary">
                <Link to="/account">Account</Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="primary">
                <Link to="/login" search={{ next: "/account" }}>
                  Sign in
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <nav
        aria-label="Primary"
        className="sticky bottom-0 z-40 border-t border-fg-inverse/10 bg-ink/96 text-fg-inverse backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto grid max-w-3xl grid-cols-5">
          {tabs.map((tab) => {
            const active = tab.match(pathname);
            const Icon = tab.icon;
            return (
              <li key={tab.label}>
                <Link
                  to={tab.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 text-[0.7rem] font-semibold tracking-wide no-underline uppercase",
                    active ? "text-powder" : "text-fg-soft",
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
