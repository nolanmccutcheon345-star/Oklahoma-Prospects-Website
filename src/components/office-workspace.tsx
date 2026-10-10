import {EventOffice} from "./event-office";
import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { FrontOfficeShell, type OfficeSection } from "./front-office-shell";
import { OfficeRequests } from "./commerce/office-requests";
import { OfficeApp } from "./teams/office-app";
import { TeamFeeWorkspace } from "./teams/fee-workspace";
import { SquareOffice } from "./commerce/square-office";
import { DiscountOffice } from "./commerce/discount-office";
import { OfficeOperations } from "./commerce/operations";
import { StaffBookingChanges } from "./commerce/booking-changes";
import { TryoutEvaluations } from "./tryout-evaluations";
import { AdminServicesDesk, AdminAccountsDesk, AdminStaffDesk } from "./pd/admin-ops";
import { StaffDirectoryDesk } from "./staff/directory-desk";
import { LaunchChecklist } from "./launch-checklist";
import { DevelopmentProvider } from "@/lib/pd/context";
import { getFrontOffice } from "@/lib/front-office-api";
import { authClient } from "@/lib/auth/client";
import { formatMoney } from "@/lib/pricing";
import { useLiveCatalog } from "@/lib/use-catalog";
import type { ClubRecord } from "@/lib/teams/types";
import { Button } from "./ui/button";
export function OfficeWorkspace({
  club,
  onChange,
  onSave,
  name,
}: {
  club: ClubRecord;
  onChange: (c: ClubRecord) => void;
  onSave: (c?: ClubRecord) => Promise<boolean>;
  name: string;
}) {
  const { section = "dashboard", filter, person } = useSearch({ strict: false }) as {
    section?: OfficeSection;
    filter?: string; person?:string;
  };
  const navigate = useNavigate();
  const [data, setData] = useState<Awaited<ReturnType<typeof getFrontOffice>>>(),
    [error, setError] = useState("");
  const { data: session } = authClient.useSession();
  const catalog = useLiveCatalog();
  const label = (id: string) =>
    [...catalog.cages, ...catalog.lessons, ...catalog.memberships, ...catalog.packages].find(
      (x) => x.id === id,
    )?.name || id;
  const go = (section: OfficeSection, filter?: string) => {
    void navigate({ to: "/office", search: { section, filter } });
  };
  async function refresh() {
    setError("");
    try {
      setData(await getFrontOffice());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load dashboard.");
    }
  }
  useEffect(() => {
    void refresh();
  }, [section]);
  const schedule = (
    <section className="grid gap-3">
      <h2 className="text-2xl">Today’s schedule</h2>
      <p className="text-xs text-muted">Confirmed bookings · Central Time</p>
      {!data ? (
        <p role="status">{error || "Loading schedule…"}</p>
      ) : !data.schedule.length ? (
        <p className="rounded-xl bg-white p-5">No confirmed sessions today.</p>
      ) : (
        data.schedule.map((b) => (
          <article key={b.id} className="rounded-xl border border-line bg-white p-4">
            <h3 className="text-xl">{label(b.product_id)}</h3>
            <p>
              {new Date(b.starts_at).toLocaleTimeString("en-US", {
                timeZone: "America/Chicago",
                hour: "numeric",
                minute: "2-digit",
              })}
              –
              {new Date(b.ends_at).toLocaleTimeString("en-US", {
                timeZone: "America/Chicago",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
            <p className="break-words text-sm text-muted">{b.email}</p>
          </article>
        ))
      )}
    </section>
  );
  return (
    <FrontOfficeShell section={section} name={name} onSection={go}>
      {section === "dashboard" && (
        <div className="grid gap-6">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {(
              [
                ["schedule", "Today’s schedule", "bookings", "today"],
                ["requests", "Requests needing follow-up", "requests", "open"],
                ["evaluations", "Evaluations awaiting review", "evaluations", "pending"],
                ["payments", "Payment issues", "payments", "issues"],
              ] as const
            ).map(([key, title, target, filter]) => (
              <button
                key={key}
                onClick={() => go(target, filter)}
                className="rounded-xl border border-line bg-white p-4 text-left hover:border-maroon"
              >
                <strong className="block text-3xl text-maroon">
                  {data ? data.counts[key] : "—"}
                </strong>
                <span className="text-sm font-semibold">{title}</span>
              </button>
            ))}
          </div>
          {error && (
            <div role="alert">
              <p>{error}</p>
              <Button onClick={() => void refresh()}>Retry dashboard</Button>
            </div>
          )}
          {session && !session.user.twoFactorEnabled && (
            <a
              href="/account?desk=security"
              className="rounded-lg border border-line bg-white p-3 text-sm underline"
            >
              Set up an authenticator in Account → Security.
            </a>
          )}
          {schedule}
          <section className="grid gap-3">
            <h2 className="text-2xl">Quick actions</h2>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => go("requests")}>View Requests</Button>
              <Button onClick={() => go("teams")}>Manage Teams</Button>
              <Button variant="outlineDark" onClick={() => go("evaluations", "pending")}>
                Review Evaluations
              </Button>
            </div>
          </section>
        </div>
      )}
      {section === "events" && <EventOffice />}
      {section === "requests" && <OfficeRequests />}
      {section === "teams" && (
        <>
          <a href="/player-profiles" className="my-3 inline-flex min-h-11 items-center rounded bg-maroon px-4 text-white">Recruiting profiles & metric approvals</a>
          <TeamFeeWorkspace />
          <OfficeApp club={club} onChange={onChange} onSave={onSave} initialTab="teams" />
          <a
            className="my-4 inline-flex min-h-11 items-center underline"
            href="/account?desk=athletes"
          >
            Open player development records
          </a>
        </>
      )}
      {section === "evaluations" && (
        <><a href="/player-profiles" className="my-3 inline-flex min-h-11 items-center underline">Review recruiting metric requests</a><TryoutEvaluations key={filter || "all"} pendingOnly={filter === "pending"} /></>
      )}
      {section === "bookings" && (
        <div className="grid gap-5">
          {filter === "today" ? (
            <>
              {schedule}
              <Button variant="outlineDark" onClick={() => go("bookings")}>
                All Booking Tools
              </Button>
            </>
          ) : (
            <>
              <a className="inline-flex min-h-11 items-center text-sm underline" href="/book">
                Check cage availability
              </a>
              <OfficeOperations view="bookings" />
              <StaffBookingChanges />
            </>
          )}
        </div>
      )}
      {section === "payments" && (
        <div className="grid gap-5">
          {filter === "issues" ? (
            <section className="grid gap-3">
              <h2 className="text-2xl">Payment issues</h2>
              <p className="text-sm text-muted">
                Payments flagged for review. Review the provider outcome before making changes.
              </p>
              {!data ? (
                <p>{error || "Loading payment issues…"}</p>
              ) : !data.payments.length ? (
                <p>No payments need review.</p>
              ) : (
                data.payments.map((p) => (
                  <article key={p.id} className="rounded-xl border border-line bg-white p-4">
                    <p className="font-semibold break-words">{p.email}</p>
                    <p>{formatMoney(p.total_cents)} · Needs review</p>
                    <p className="text-xs break-all">Order {p.id}</p>
                  </article>
                ))
              )}
              <Button onClick={() => go("payments")}>Open Payment Tools</Button>
            </section>
          ) : (
            <>
              <LaunchChecklist />
              <SquareOffice />
            </>
          )}
        </div>
      )}
      {section === "services" && (
        <div className="grid gap-6">
          <AdminServicesDesk />
          <details className="rounded-xl border border-line p-4">
            <summary className="min-h-11 cursor-pointer font-semibold">
              Discounts & Promotions
            </summary>
            <DiscountOffice />
          </details>
        </div>
      )}
      {section === "staff" && (
        <div className="grid gap-6">
          <AdminAccountsDesk initialPerson={person}
            assignments={Object.fromEntries(
              club.teams
                .flatMap((t) => [
                  { email: t.coachEmail, label: `${t.name} · Head Coach` },
                  ...t.staff.map((s) => ({ email: s.email, label: `${t.name} · ${s.role}` })),
                ])
                .filter((s) => s.email)
                .map((s) => [
                  s.email.toLowerCase(),
                  club.teams
                    .filter(
                      (t) =>
                        t.coachEmail.toLowerCase() === s.email.toLowerCase() ||
                        t.staff.some((m) => m.email.toLowerCase() === s.email.toLowerCase()),
                    )
                    .map((t) => t.name)
                    .join(", "),
                ]),
            )}
          />
          <details className="rounded-xl border border-line p-4">
            <summary className="min-h-11 cursor-pointer font-semibold">Staff Directory</summary>
            <StaffDirectoryDesk />
          </details>
          <details className="rounded-xl border border-line p-4">
            <summary className="min-h-11 cursor-pointer font-semibold">
              Instructor Services & Assignments
            </summary>
            <DevelopmentProvider>
              <AdminStaffDesk />
            </DevelopmentProvider>
          </details>
        </div>
      )}
      {section === "reports" && (
        <div className="grid gap-6">
          <TeamFeeWorkspace />
          <OfficeOperations view="reports" />
          <OfficeApp club={club} onChange={onChange} onSave={onSave} />
        </div>
      )}
    </FrontOfficeShell>
  );
}
