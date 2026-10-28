import { SiteFooter } from "./site-footer";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarClock,
  Dumbbell,
  Home,
  Trophy,
  Users,
  ShoppingBag,
  ChevronUp,
  Menu,
  Newspaper,
  ChevronDown,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CLUB } from "@/lib/club";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useStickyHeight } from "@/lib/use-sticky-height";
import {
  publicNavigation,
  navigationGroups,
  navigationActive,
  type NavigationGroupId,
  type NavigationLink,
} from "@/lib/site-navigation";

const headerAccountClass = "min-w-24 whitespace-nowrap px-2.5 tracking-normal max-[360px]:px-2";

function ClubWordmark({ name }: { name: string }) {
  const splitAt = name.lastIndexOf(" ");
  const lines = splitAt > 0 ? [name.slice(0, splitAt), name.slice(splitAt + 1)] : [name];
  return (
    <span className="club-wordmark max-[360px]:text-[0.94rem]" data-club-wordmark>
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
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const { user, isPending } = useCurrentUserState();
  const [openMenu, setOpenMenu] = useState<NavigationGroupId | "Menu" | null>(null);
  const [expanded, setExpanded] = useState<NavigationGroupId | null>(null);
  const menuRef = useRef<HTMLDialogElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  useStickyHeight(headerRef, "--header-height", pathname !== "/pay");
  useEffect(() => {
    setOpenMenu(null);
  }, [pathname, search]);
  useEffect(() => {
    setExpanded(null);
  }, [openMenu]);
  useEffect(() => {
    const dialog = menuRef.current;
    if (!dialog) return;
    if (!openMenu) {
      dialog.close();
      return;
    }
    dialog.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      dialog.close();
    };
  }, [openMenu]);
  const privateWorkspace =
    /^\/(office|coordinator|coach|family|instructor|account|my-profile)(?:\/|$)/.test(pathname);
  const tabs = [
    {
      to: "/",
      label: "Home",
      icon: Home,
      match: (path: string) =>
        path === "/" ||
        ["/more", "/fundraising", "/contact", "/facility", "/privacy", "/terms"].some((p) =>
          path.startsWith(p),
        ),
    },
    {
      to: "/training",
      label: "Train",
      icon: Dumbbell,
      match: (path: string) =>
        ["/events", "/training", "/instructor", "/my-profile", "/account"].some((p) =>
          path.startsWith(p),
        ),
    },
    {
      to: "/teams",
      label: "Teams",
      icon: Users,
      match: (path: string) =>
        [
          "/players",
          "/player/",
          "/player-profiles",
          "/teams",
          "/baseball",
          "/softball",
          "/tryouts",
          "/coaches",
          "/recruiting",
          "/coach",
          "/family",
          "/office",
        ].some((p) => path.startsWith(p)),
    },
    {
      to: "/book",
      label: "Book",
      icon: CalendarClock,
      match: (path: string) =>
        ["/book", "/go", "/memberships", "/pay", "/paid"].some((p) => path.startsWith(p)),
    },
    {
      to: "/games",
      label: "Games",
      icon: Trophy,
      match: (path: string) => path.startsWith("/games"),
    },
    {
      to: "/merchandise",
      label: "Shop",
      icon: ShoppingBag,
      match: (path: string) => path.startsWith("/merchandise"),
    },
    {
      to: "/articles",
      label: "Articles & News",
      icon: Newspaper,
      match: (path: string) => path.startsWith("/articles"),
    },
  ] as const;
  const navigation = publicNavigation(Boolean(user));
  const utility = navigation.filter(
    (item): item is NavigationLink =>
      !("children" in item) && ["account", "contact", "about"].includes(item.id),
  );
  function menuLink(item: NavigationLink) {
    return item.id === "account" && isPending ? (
      <button key={item.id} type="button" disabled className="site-menu-link">
        Account / Sign In
      </button>
    ) : (
      <Link
        key={item.id}
        to={item.to}
        search={item.search}
        aria-current={navigationActive(item, pathname, search) ? "page" : undefined}
        className="site-menu-link"
        onClick={() => setOpenMenu(null)}
      >
        {item.label}
      </Link>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-dvh flex-col bg-paper pb-[var(--bottom-nav-space)] text-fg lg:pb-0",
        !privateWorkspace && "public-site-shell",
        pathname === "/pay" && "payment-site-shell",
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-paper-2 focus:px-4 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>
      <header
        ref={headerRef}
        className="site-header sticky top-0 z-40 border-b border-fg-inverse/10 bg-ink text-fg-inverse"
      >
        <div className="h-1 bg-maroon" />
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-2 overflow-visible px-2.5 py-2 sm:gap-3 sm:px-4">
          <Link
            to="/"
            aria-label={`${CLUB.name} home`}
            className="flex min-w-0 flex-1 basis-48 items-center gap-2 overflow-visible no-underline sm:gap-3"
          >
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
          <div
            className={cn(
              "flex shrink-0 flex-wrap items-center gap-2",
              !privateWorkspace && "max-lg:w-full max-lg:justify-end",
            )}
          >
            {!privateWorkspace && (
              <>
                <Button asChild size="sm" className="min-h-11 max-w-full shrink-0">
                  <Link to="/book">Book a cage</Link>
                </Button>
                <button
                  type="button"
                  className="flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-fg-inverse/30 px-4 font-semibold lg:hidden"
                  aria-controls="site-section-navigation"
                  aria-expanded={openMenu === "Menu"}
                  aria-haspopup="dialog"
                  onClick={() => setOpenMenu("Menu")}
                >
                  <Menu className="size-5" aria-hidden />
                  Menu
                </button>
              </>
            )}
            <div className={cn(!privateWorkspace && "max-lg:hidden")}>
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
            {!privateWorkspace && (
              <nav aria-label="Utility" className="hidden items-center gap-4 lg:flex">
                {utility
                  .filter((item) => item.id !== "account")
                  .map((item) => (
                    <Link
                      key={item.id}
                      to={item.to}
                      className="inline-flex min-h-11 items-center text-sm font-semibold"
                      aria-current={navigationActive(item, pathname, search) ? "page" : undefined}
                    >
                      {item.label}
                    </Link>
                  ))}
              </nav>
            )}
          </div>
        </div>
        <nav
          aria-label="Primary"
          data-site-nav
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 border-t border-fg-inverse/10 bg-ink/96 text-fg-inverse backdrop-blur-md lg:static lg:border-t-0",
            !privateWorkspace && "hidden lg:block",
          )}
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <ul
            className={cn(
              "relative mx-auto grid max-w-6xl",
              privateWorkspace ? "grid-cols-6" : "grid-cols-7",
            )}
          >
            {!privateWorkspace
              ? navigation
                  .filter((item) => !utility.includes(item as NavigationLink))
                  .map((item) => {
                    const active = navigationActive(item, pathname, search);
                    const className = cn(
                      "flex min-h-12 w-full items-center justify-center gap-1 px-2 py-2 text-center text-sm font-semibold no-underline focus-visible:outline-offset-[-3px]",
                      active ? "text-powder" : "text-fg-soft",
                    );
                    return (
                      <li key={item.id}>
                        {"children" in item ? (
                          <button
                            type="button"
                            className={className}
                            aria-current={active ? "page" : undefined}
                            aria-expanded={openMenu === item.id}
                            aria-haspopup="dialog"
                            aria-controls="site-section-navigation"
                            onClick={() => setOpenMenu(item.id)}
                          >
                            {item.label}
                            <ChevronDown className="size-4 shrink-0" aria-hidden />
                          </button>
                        ) : (
                          <Link
                            to={item.to}
                            search={item.search}
                            className={className}
                            aria-current={active ? "page" : undefined}
                          >
                            {item.label}
                          </Link>
                        )}
                      </li>
                    );
                  })
              : tabs
                  .filter((tab) => tab.to !== "/articles")
                  .map((tab) => {
                    const active = tab.match(pathname);
                    const Icon = tab.icon;
                    const tabClass = cn(
                      "flex min-h-14 w-full flex-col items-center justify-center gap-1 px-0.5 text-[0.53rem] leading-none font-semibold tracking-normal whitespace-normal break-words no-underline uppercase focus-visible:outline-offset-[-3px] min-[380px]:text-[0.62rem] min-[440px]:text-[0.7rem] lg:min-h-12 lg:flex-row lg:gap-2 lg:text-sm",
                      active ? "text-powder" : "text-fg-soft",
                    );
                    return (
                      <li key={tab.label}>
                        {tab.label === "Teams" || tab.label === "Train" ? (
                          <button
                            type="button"
                            className={tabClass}
                            aria-current={active ? "page" : undefined}
                            aria-expanded={
                              openMenu === (tab.label === "Train" ? "Training" : "Teams")
                            }
                            aria-haspopup="dialog"
                            aria-controls={"site-section-navigation"}
                            onClick={() =>
                              setOpenMenu(tab.label === "Train" ? "Training" : "Teams")
                            }
                          >
                            <span className="relative">
                              <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
                              <ChevronUp
                                aria-hidden="true"
                                className={cn(
                                  "absolute -right-3 top-0 size-3 transition-transform",
                                  openMenu === (tab.label === "Train" ? "Training" : "Teams") &&
                                    "rotate-180",
                                )}
                              />
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
      <SiteFooter />
      <dialog
        ref={menuRef}
        id="site-section-navigation"
        aria-labelledby="site-menu-heading"
        onCancel={() => setOpenMenu(null)}
        onClose={() => setOpenMenu(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpenMenu(null);
        }}
        className="site-navigation-sheet"
      >
        <div className="site-menu-header">
          <h2 id="site-menu-heading" className="min-w-0 text-2xl sm:text-3xl">
            {openMenu === "Menu" ? "Explore Prospects" : openMenu || "Explore Prospects"}
          </h2>
          <button
            type="button"
            autoFocus
            onClick={() => setOpenMenu(null)}
            className="min-h-11 shrink-0 rounded-lg border border-line px-4 font-semibold"
          >
            Close
          </button>
        </div>
        <nav aria-label={`${openMenu || "Section"} destinations`} className="site-menu-content">
          {openMenu === "Menu"
            ? navigation.map((item) =>
                "children" in item ? (
                  <div key={item.id} className="site-menu-group">
                    <button
                      type="button"
                      className="site-menu-link w-full justify-between"
                      aria-expanded={expanded === item.id}
                      aria-controls={`site-menu-${item.id}`}
                      onClick={() =>
                        setExpanded((current) => (current === item.id ? null : item.id))
                      }
                    >
                      {item.label}
                      <ChevronDown
                        aria-hidden
                        className={cn(
                          "size-5 shrink-0 transition-transform",
                          expanded === item.id && "rotate-180",
                        )}
                      />
                    </button>
                    <div
                      id={`site-menu-${item.id}`}
                      hidden={expanded !== item.id}
                      className="site-menu-children"
                      aria-label={`${item.label} subpages`}
                    >
                      {item.children.map(menuLink)}
                    </div>
                  </div>
                ) : (
                  menuLink(item)
                ),
              )
            : openMenu && navigationGroups[openMenu].children.map(menuLink)}
        </nav>
      </dialog>
    </div>
  );
}
