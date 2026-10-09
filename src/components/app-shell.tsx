import {SiteFooter} from "./site-footer";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarClock,
  Dumbbell,
  Home,
  Trophy,
  Users,
  ShoppingBag,
  ChevronUp,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { CLUB } from "@/lib/club";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const headerAccountClass =
  "min-w-24 whitespace-nowrap px-2.5 tracking-normal max-[360px]:px-2";

function ClubWordmark({ name }: { name: string }) {
  const splitAt = name.lastIndexOf(" ");
  const lines = splitAt > 0 ? [name.slice(0, splitAt), name.slice(splitAt + 1)] : [name];
  return (
    <span
      className="club-wordmark max-[360px]:text-[0.94rem] max-[360px]:whitespace-nowrap"
      data-club-wordmark
    >
      {lines.map((line, index) => (
        <span className="club-wordmark-line" key={line}>
          {index > 0 ? (
            <span className="club-wordmark-gap" aria-hidden="true">
              {" "}
            </span>
          ) : null}
          {line}
        </span>
      ))}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isPending } = useCurrentUserState();
  const [teamsMenuOpen, setTeamsMenuOpen] = useState(false);
  useEffect(() => { setTeamsMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!teamsMenuOpen) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") setTeamsMenuOpen(false); };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [teamsMenuOpen]);
  const tabs = [
    { to: "/", label: "Home", icon: Home, match: (path: string) => path === "/" || ["/more", "/fundraising", "/contact", "/facility", "/privacy", "/terms"].some(p => path.startsWith(p)) },
    { to: "/training", label: "Train", icon: Dumbbell, match: (path: string) => path.startsWith("/training") || path.startsWith("/account") },
    { to: "/teams", label: "Teams", icon: Users, match: (path: string) => ["/teams", "/softball", "/tryouts", "/coaches", "/recruiting", "/coach", "/family", "/office"].some(p => path.startsWith(p)) },
    { to: "/book", label: "Book", icon: CalendarClock, match: (path: string) => ["/book", "/go", "/memberships", "/pay", "/paid"].some(p => path.startsWith(p)) },
    { to: "/games", label: "Games", icon: Trophy, match: (path: string) => path.startsWith("/games") },
    { to: "/merchandise", label: "Merchandise", icon: ShoppingBag, match: (path: string) => path.startsWith("/merchandise") },
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
        <div className="mx-auto flex min-h-16 max-w-3xl items-center justify-between gap-2 overflow-visible px-2.5 py-2 sm:gap-3 sm:px-4">
          <Link to="/" aria-label={`${CLUB.name} home`} className="flex min-w-0 flex-1 items-center gap-2 overflow-visible no-underline sm:gap-3">
            <img
              src="/brand/mark.png"
              alt="Prospects Sports Academy"
              width={40}
              height={40}
              className="size-8 shrink-0 object-contain min-[400px]:size-10"
            />
            <span className="min-w-0 overflow-visible">
              <ClubWordmark name={CLUB.name} />
              <span className="mt-1 block text-[0.56rem] leading-tight font-medium tracking-[0.04em] text-fg-soft uppercase min-[400px]:text-[0.65rem] min-[400px]:tracking-[0.14em]">
                Baseball & softball ·{" "}
                <span className="whitespace-nowrap">Est. {CLUB.established}</span>
              </span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center">
            {isPending ? (
              <Button size="sm" variant="primary" className={headerAccountClass} disabled>
                Account
              </Button>
            ) : user ? (
              <Button asChild size="sm" variant="primary" className={headerAccountClass}>
                <Link to="/account">Account</Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="primary" className={headerAccountClass}>
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
        <ul className="relative mx-auto grid max-w-3xl grid-cols-6">
          {tabs.map((tab) => {
            const active = tab.match(pathname);
            const Icon = tab.icon;
            const tabClass = cn(
              "flex min-h-14 w-full flex-col items-center justify-center gap-1 px-0.5 text-[0.53rem] leading-none font-semibold tracking-normal whitespace-nowrap no-underline uppercase focus-visible:outline-offset-[-3px] min-[380px]:text-[0.62rem] min-[440px]:text-[0.7rem]",
              active ? "text-powder" : "text-fg-soft",
            );
            return (
              <li key={tab.label}>
                {tab.label === "Teams" ? (
                  <button
                    type="button"
                    className={tabClass}
                    aria-current={active ? "page" : undefined}
                    aria-expanded={teamsMenuOpen}
                    aria-haspopup="menu"
                    aria-controls="teams-submenu"
                    onClick={() => setTeamsMenuOpen((open) => !open)}
                  >
                    <span className="relative">
                      <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
                      <ChevronUp aria-hidden="true" className={cn("absolute -right-3 top-0 size-3 transition-transform", teamsMenuOpen && "rotate-180")} />
                    </span>
                    Teams
                  </button>
                ) : (
                  <Link
                    to={tab.to}
                    aria-current={active ? "page" : undefined}
                    className={tabClass}
                  >
                    <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
                    {tab.label}
                  </Link>
                )}
              </li>
            );
          })}
          {teamsMenuOpen ? (
            <li className="absolute bottom-[calc(100%+0.5rem)] left-1/2 z-50 w-[min(92vw,19rem)] -translate-x-1/2 rounded-2xl border border-powder/30 bg-ink p-2 shadow-xl" id="teams-submenu">
              <div role="menu" aria-label="Teams submenu" className="grid grid-cols-2 gap-2">
                {[
                  {label:"Baseball",hash:"baseball",to:"/teams" as const},
                  {label:"Softball",hash:"softball",to:"/teams" as const},
                  {label:"Coaches",hash:undefined,to:"/coaches" as const},
                  {label:"Tryouts",hash:undefined,to:"/tryouts" as const},
                ].map((item) => (
                  <Link
                    key={item.label}
                    to={item.to}
                    hash={item.hash}
                    role="menuitem"
                    className="flex min-h-12 items-center justify-center rounded-lg bg-paper-2 px-3 text-sm font-semibold text-ink no-underline focus-visible:outline-2 focus-visible:outline-powder"
                    onClick={() => setTeamsMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </li>
          ) : null}

        </ul>
      </nav>
    </div>
  );
}
