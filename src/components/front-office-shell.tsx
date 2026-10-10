import { useState, type ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
export const OFFICE_SECTIONS = [
  ["dashboard", "Dashboard"],
  ["requests", "Requests"],
  ["teams", "Teams & Players"],
  ["evaluations", "Evaluations"],
  ["bookings", "Bookings"],
  ["events", "Camps & Clinics"],
  ["payments", "Payments"],
  ["services", "Services & Pricing"],
  ["staff", "Staff & Access"],
  ["reports", "Reports"],
] as const;
export type OfficeSection = (typeof OFFICE_SECTIONS)[number][0];
export function FrontOfficeShell({
  section,
  name,
  onSection,
  children,
  preview = false,
}: {
  section: OfficeSection;
  name: string;
  onSection: (section: OfficeSection, filter?: string) => void;
  children: ReactNode;
  preview?: boolean;
}) {
  const [more, setMore] = useState(false);
  const go = (id: OfficeSection) => {
    setMore(false);
    onSection(id);
  };
  return (
    <main id="main" className="front-office">
      <header className="border-b-4 border-maroon bg-ink px-4 py-5 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-powder">OKLAHOMA PROSPECTS</p>
            <h1 className="mt-1 text-3xl">Front Office</h1>
            <p className="mt-1 text-sm text-fg-soft">
              Manage today’s schedule, tryout requests, teams, and payments.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <p>Signed in as {name} · Admin</p>
            {!preview && (
              <>
                <details className="relative">
                  <summary className="min-h-11 cursor-pointer py-3">Workspace</summary>
                  <div className="absolute right-0 z-40 grid w-56 rounded-xl border border-line bg-ink p-3 shadow-xl">
                    <a className="min-h-11 py-3" href="/office">
                      Front Office
                    </a>
                    <a className="min-h-11 py-3" href="/my-profile">My Shared Profile</a><a className="min-h-11 py-3" href="/instructor">Instructor</a>
                    <a className="min-h-11 py-3" href="/coach">
                      Coach
                    </a>
                    <a className="min-h-11 py-3" href="/family">
                      Family
                    </a>
                    <a className="min-h-11 py-3" href="/account?desk=overview">
                      Player Development
                    </a>
                  </div>
                </details>
                <details className="relative">
                  <summary className="min-h-11 cursor-pointer py-3">Account</summary>
                  <div className="absolute right-0 z-40 grid w-60 rounded-xl border border-line bg-ink p-3 shadow-xl">
                    <a className="min-h-11 py-3" href="/account?desk=security">
                      Security
                    </a>
                    <a className="min-h-11 py-3" href="/invitations">
                      Invitations
                    </a>
                    <UserButton />
                  </div>
                </details>
              </>
            )}
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav
            aria-label="Front Office"
            className="sticky top-24 grid gap-1 rounded-xl border border-line bg-white p-2"
          >
            {OFFICE_SECTIONS.map(([id, label]) => (
              <button
                key={id}
                aria-current={section === id ? "page" : undefined}
                className={`min-h-11 rounded-lg px-3 py-3 text-left text-sm font-semibold ${section === id ? "bg-maroon text-white" : "hover:bg-paper"}`}
                onClick={() => go(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          <p
            className="office-page-title sticky top-16 z-10 mb-4 border-b border-line bg-paper py-3 text-sm font-semibold"
            aria-current="page"
          >
            {OFFICE_SECTIONS.find(([id]) => id === section)?.[1]}
          </p>
          {children}
        </div>
      </div>
      <nav
        aria-label="Front Office mobile"
        className="office-mobile-nav fixed inset-x-0 bottom-0 z-50 border-t border-line bg-ink text-white lg:hidden"
      >
        <div className="grid grid-cols-4">
          {(["dashboard", "requests", "bookings"] as const).map((id) => (
            <button
              key={id}
              aria-current={section === id ? "page" : undefined}
              onClick={() => go(id)}
              className={`min-h-14 px-1 text-xs font-semibold ${section === id ? "bg-maroon" : ""}`}
            >
              {OFFICE_SECTIONS.find(([key]) => key === id)?.[1]}
            </button>
          ))}
          <button
            aria-expanded={more}
            aria-controls="office-more"
            onClick={() => setMore((v) => !v)}
            className="min-h-14 text-xs font-semibold"
          >
            More {more ? "−" : "+"}
          </button>
        </div>
        {more && (
          <div
            id="office-more"
            className="absolute inset-x-3 bottom-full mb-2 grid max-h-[65dvh] grid-cols-2 gap-2 overflow-y-auto rounded-xl border border-line bg-ink p-3 shadow-xl"
          >
            {OFFICE_SECTIONS.filter(
              ([id]) => !["dashboard", "requests", "bookings"].includes(id),
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => go(id)}
                className="min-h-12 rounded-lg border border-white/20 px-3 py-2 text-left text-sm"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </nav>
    </main>
  );
}
