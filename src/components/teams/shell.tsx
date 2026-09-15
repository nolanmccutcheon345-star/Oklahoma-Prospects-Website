import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import { cn } from "@/lib/utils";

export function TeamsShell({
  title,
  path,
  nav,
  demo,
  lang,
  onLang,
  children,
}: {
  title: string;
  path: string;
  nav: { to: string; label: string }[];
  demo?: boolean;
  lang?: "en" | "es";
  onLang?: (next: "en" | "es") => void;
  children: ReactNode;
}) {
  return (
    <div className="bg-paper text-fg">
      {demo ? (
        <p className="bg-navy px-4 py-2 text-center text-sm font-semibold text-powder">
          Sample club — labelled demo data. Not a live roster.
        </p>
      ) : null}
      <div className="border-b border-fg-inverse/10 bg-ink text-fg-inverse">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">
              {title} desk
            </p>
            <p className="font-display text-xl leading-none italic">{title}</p>
          </div>
          <div className="flex items-center gap-2 text-fg-inverse">
            {onLang ? (
              <button
                type="button"
                className="min-h-11 px-2 text-xs font-semibold uppercase"
                aria-label="Language"
                onClick={() => onLang(lang === "es" ? "en" : "es")}
              >
                {lang === "es" ? "EN" : "ES"}
              </button>
            ) : null}
            <UserButton />
          </div>
        </div>
        <nav aria-label="Club desks" className="border-t border-fg-inverse/10">
          <ul className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-2">
            {nav.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={path === item.to ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center px-3 text-xs font-semibold tracking-wide uppercase no-underline",
                    path === item.to ? "text-powder" : "text-fg-soft",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <main id="main" className="mx-auto max-w-3xl px-4 py-5 pb-24">
        {children}
      </main>
    </div>
  );
}
