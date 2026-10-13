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
import { useEffect, useRef, useState, type ReactNode } from "react";
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
  const [openMenu, setOpenMenu] = useState<"Teams" | "Train" | null>(null);
  const menuRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { setOpenMenu(null); }, [pathname]);
  useEffect(() => {
    const dialog = menuRef.current;
    if (!dialog) return;
    if (!openMenu) { dialog.close(); return; }
    dialog.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; dialog.close(); };
  }, [openMenu]);
  const tabs = [
    { to: "/", label: "Home", icon: Home, match: (path: string) => path === "/" || ["/more", "/fundraising", "/contact", "/facility", "/privacy", "/terms"].some(p => path.startsWith(p)) },
    { to: "/training", label: "Train", icon: Dumbbell, match: (path: string) => ["/events", "/training", "/instructor", "/my-profile", "/account"].some(p => path.startsWith(p)) },
    { to: "/teams", label: "Teams", icon: Users, match: (path: string) => ["/players", "/player/", "/player-profiles", "/teams", "/baseball", "/softball", "/tryouts", "/coaches", "/recruiting", "/coach", "/family", "/office"].some(p => path.startsWith(p)) },
    { to: "/book", label: "Book", icon: CalendarClock, match: (path: string) => ["/book", "/go", "/memberships", "/pay", "/paid"].some(p => path.startsWith(p)) },
    { to: "/games", label: "Games", icon: Trophy, match: (path: string) => path.startsWith("/games") },
    { to: "/merchandise", label: "Shop", icon: ShoppingBag, match: (path: string) => path.startsWith("/merchandise") },
  ] as const;

  return (
    <div className="flex min-h-dvh flex-col bg-paper pb-[var(--bottom-nav-space)] text-fg lg:pb-0">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-paper-2 focus:px-4 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-fg-inverse/10 bg-ink text-fg-inverse">
        <div className="h-1 bg-maroon" />
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-2 overflow-visible px-2.5 py-2 sm:gap-3 sm:px-4">
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
      <nav
        aria-label="Primary"
        data-site-nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-fg-inverse/10 bg-ink/96 text-fg-inverse backdrop-blur-md lg:static lg:border-t-0"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="relative mx-auto grid max-w-6xl grid-cols-6">
          {tabs.map((tab) => {
            const active = tab.match(pathname);
            const Icon = tab.icon;
            const tabClass = cn(
              "flex min-h-14 w-full flex-col items-center justify-center gap-1 px-0.5 text-[0.53rem] leading-none font-semibold tracking-normal whitespace-nowrap no-underline uppercase focus-visible:outline-offset-[-3px] min-[380px]:text-[0.62rem] min-[440px]:text-[0.7rem] lg:min-h-12 lg:flex-row lg:gap-2 lg:text-sm",
              active ? "text-powder" : "text-fg-soft",
            );
            return (
              <li key={tab.label}>
                {tab.label === "Teams" || tab.label === "Train" ? (
                  <button
                    type="button"
                    className={tabClass}
                    aria-current={active ? "page" : undefined}
                    aria-expanded={openMenu === tab.label}
                    aria-haspopup="dialog"
                    aria-controls={"site-section-navigation"}
                    onClick={() => setOpenMenu(open => open === tab.label ? null : tab.label)}
                  >
                    <span className="relative">
                      <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
                      <ChevronUp aria-hidden="true" className={cn("absolute -right-3 top-0 size-3 transition-transform", openMenu === tab.label && "rotate-180")} />
                    </span>
                    {tab.label}
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
        </ul>
      </nav>
      </header>

      <div className="flex-1">{children}</div>
      <SiteFooter/>
      <dialog
        ref={menuRef}
        id="site-section-navigation"
        aria-labelledby="site-menu-heading"
        onCancel={() => setOpenMenu(null)}
        onClose={() => setOpenMenu(null)}
        onClick={event => { if (event.target === event.currentTarget) setOpenMenu(null); }}
        className="site-navigation-sheet"
      >
        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 id="site-menu-heading" className="text-3xl">{openMenu === "Train" ? "Find your training" : "Find your team"}</h2>
            <button type="button" autoFocus onClick={() => setOpenMenu(null)} className="min-h-11 rounded-lg border border-line px-4 font-semibold">Close</button>
          </div>
          <nav aria-label={`${openMenu || "Section"} destinations`} className="grid gap-2 sm:grid-cols-2">
            {openMenu && (openMenu === "Train" ? [
              {label:"All training",to:"/training" as const},
              {label:"Private lessons",to:"/training" as const,search:{view:"lessons" as const}},
              {label:"Monthly training plans",to:"/training" as const,search:{view:"plans" as const}},
              {label:"Instructors",to:"/instructors" as const},
              {label:"Camps & clinics",to:"/events" as const},
              {label:"Cage memberships",to:"/memberships" as const},
            ] : [
              {label:"Browse all teams",to:"/teams" as const},
              {label:"Baseball",to:"/baseball" as const},
              {label:"Softball",to:"/softball" as const},
              {label:"Coaches",to:"/coaches" as const},
              {label:"Tryouts",to:"/tryouts" as const},
              {label:"Players",to:"/players" as const},
            ]).map(item => <Link key={item.label} to={item.to} search={"search" in item ? item.search : undefined}
              className="flex min-h-12 items-center rounded-lg bg-paper-2 px-4 py-3 font-semibold text-ink no-underline"
              onClick={() => setOpenMenu(null)}>{item.label}</Link>)}
          </nav>
        </div>
      </dialog>


    </div>
  );
}
