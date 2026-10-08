import {SiteFooter} from "./site-footer";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarClock,
  Dumbbell,
  Home,
  Trophy,
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
    { to: "/", label: "Home", icon: Home, match: (path: string) => path === "/" || ["/more", "/fundraising", "/contact", "/facility", "/privacy", "/terms"].some(p => path.startsWith(p)) },
    { to: "/training", label: "Train", icon: Dumbbell, match: (path: string) => path.startsWith("/training") || path.startsWith("/account") },
    { to: "/teams", label: "Teams", icon: Users, match: (path: string) => ["/teams", "/softball", "/tryouts", "/recruiting", "/coach", "/family", "/office"].some(p => path.startsWith(p)) },
    { to: "/book", label: "Book", icon: CalendarClock, match: (path: string) => ["/book", "/go", "/memberships", "/pay", "/paid"].some(p => path.startsWith(p)) },
    { to: "/games", label: "Games", icon: Trophy, match: (path: string) => path.startsWith("/games") },
  ] as const;

  return (
    <div className="flex min-h-dvh flex-col bg-paper pb-[var(--bottom-nav-space)] text-fg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-paper-2 focus:px-4 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-fg-inverse/10 bg-ink text-fg-inverse">
        <div className="h-1 bg-maroon" />
        <div className="mx-auto flex min-h-16 max-w-3xl items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-4">
          <Link to="/" aria-label={`${CLUB.name} home`} className="flex min-w-0 flex-1 items-center gap-2 no-underline sm:gap-3">
            <img
              src="/brand/mark.png"
              alt=""
              width={40}
              height={40}
              className="size-9 shrink-0 object-contain sm:size-10"
            />
            <span className="min-w-0">
              <span className="block font-display text-[1.02rem] leading-[0.95] font-extrabold tracking-normal text-balance italic min-[400px]:text-lg min-[400px]:leading-none min-[400px]:tracking-wide">
                {CLUB.name}
              </span>
              <span className="mt-1 block text-[0.58rem] leading-tight font-medium tracking-[0.08em] text-fg-soft uppercase min-[400px]:text-[0.65rem] min-[400px]:tracking-[0.14em]">
                Baseball & softball · Est. {CLUB.established}
              </span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
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
      <SiteFooter/>

      <nav
        aria-label="Primary"
        data-site-nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-fg-inverse/10 bg-ink/96 text-fg-inverse backdrop-blur-md"
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
                    "flex min-h-14 flex-col items-center justify-center gap-1 px-0.5 text-[0.62rem] leading-none font-semibold tracking-normal whitespace-nowrap no-underline uppercase min-[380px]:text-[0.7rem] min-[380px]:tracking-wide",
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
