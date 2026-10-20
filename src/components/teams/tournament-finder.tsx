import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  ExternalLink,
  MapPin,
  Search,
  SlidersHorizontal,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClubRecord, EventItem } from "@/lib/teams/types";
import {
  defaultTournamentFilters,
  filterTournaments,
  parseTournamentRecord,
  parseTournamentSourceMetadata,
  safeTournamentUrl,
  TOURNAMENT_DIRECTORIES,
  tournamentConflict,
  tournamentMatchesTeam,
  tournamentRange,
  tournamentToday,
  type TournamentFilters,
} from "@/lib/teams/tournament-finder";
import type { TeamFinancialView } from "@/lib/teams/financial-view";
import { saveFinancialCatalogPrice } from "@/lib/teams/store";
import { money } from "./ui";

const control =
  "min-h-12 w-full min-w-0 rounded-xl border border-line bg-white px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon";
function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-ink">
      <span>{title}</span>
      {children}
    </label>
  );
}
function dateLabel(value: string) {
  const date = new Date(value + "T12:00:00Z");
  return Number.isNaN(date.getTime())
    ? value || "Date not recorded"
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
}

/** Staff-only desks pass their existing server-scoped club; no separate data feed or permissions. */
export function TournamentFinder({
  club,
  teamId: fixedTeamId,
  admin = false,
  financial,
  onReload,
  onSave,
}: {
  club: ClubRecord;
  teamId?: string;
  admin?: boolean;
  financial?: TeamFinancialView | null;
  onReload?: () => Promise<void>;
  onSave: (next?: ClubRecord) => Promise<boolean>;
}) {
  const [selectedTeamId, setSelectedTeamId] = useState(fixedTeamId || club.teams[0]?.id || "");
  const team = club.teams.find((t) => t.id === (fixedTeamId || selectedTeamId)) || club.teams[0];
  const [filters, setFilters] = useState(() => defaultTournamentFilters(team));
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<EventItem | "new" | null>(null);
  const advancedId = useId();
  const [advanced, setAdvanced] = useState(false);
  const [priceReview, setPriceReview] = useState<{
    event: EventItem;
    fee: number;
    reason: string;
    confirmed: boolean;
    basisVersion: number;
    sourceClubRevision: number;
  } | null>(null);
  const financialPrices = new Map(financial?.catalog.map((e) => [e.id, e.fee]));
  const canSeePrices = !financial || financial.owner;
  let results = filterTournaments(
    club.catalog,
    financial
      ? { ...filters, maxFee: "", sort: filters.sort === "fee" ? "date" : filters.sort }
      : filters,
    team,
  );
  if (financial?.owner) {
    if (filters.maxFee !== "")
      results = results.filter(
        (e) => financialPrices.has(e.id) && financialPrices.get(e.id)! <= Number(filters.maxFee),
      );
    if (filters.sort === "fee")
      results.sort(
        (a, b) => (financialPrices.get(a.id) ?? Infinity) - (financialPrices.get(b.id) ?? Infinity),
      );
  }
  const catalog = club.catalog.filter((e) => e.org !== "Team schedule");
  const states = [
    ...new Set(["OK", "TX", "AR", "KS", "MO", ...catalog.map((e) => e.state).filter(Boolean)]),
  ].sort();
  const ages = [
    ...new Set([
      "8U",
      "9U",
      "10U",
      "11U",
      "12U",
      "13U",
      "14U",
      "15U",
      "16U",
      "17U",
      "18U",
      ...(team?.age ? [team.age] : []),
      ...catalog.flatMap((e) => e.ages),
    ]),
  ].sort((a, b) => parseInt(a) - parseInt(b));
  const divisions = [...new Set(catalog.flatMap((e) => e.levels))].sort();
  const range = tournamentRange(filters, team);
  const badRange = Boolean(range.from && range.to && range.from > range.to);
  const selected = catalog.filter((e) => team?.tournamentIds.includes(e.id));
  const set = <K extends keyof TournamentFilters>(key: K, value: TournamentFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  async function save(next: ClubRecord, message: string): Promise<boolean> {
    if (saving.current) return false;
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!(await onSave(next)))
        throw new Error(
          "Could not confirm the save. Reload to check the latest records before trying again.",
        );
      setNotice(message);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Please try again.");
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function toggle(event: EventItem) {
    if (!team || busy) return;
    const on = team.tournamentIds.includes(event.id);
    if (!on && !tournamentMatchesTeam(event, team)) return;
    const tournamentIds = on
      ? team.tournamentIds.filter((id) => id !== event.id)
      : [...team.tournamentIds, event.id];
    const saved = await save(
      { ...club, teams: club.teams.map((t) => (t.id === team.id ? { ...t, tournamentIds } : t)) },
      `${event.name} ${on ? "removed from" : "saved to"} ${team.name}'s schedule. This does not register or pay for the event.`,
    );
    if (saved)
      window.dispatchEvent(new window.CustomEvent("team-budget-updated", { detail: team.id }));
  }

  return (
    <section
      id="tournament-finder"
      data-tournament-finder
      className="min-w-0 overflow-hidden rounded-2xl border border-line bg-white shadow-sm"
      aria-label="Prospects Tournament Finder"
    >
      <div className="relative overflow-hidden border-b-4 border-maroon bg-ink p-5 text-white sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/brand/mark.png" alt="" className="h-12 w-12 object-contain" />
            <p className="text-xs font-bold tracking-[0.16em] text-powder uppercase">
              Prospects Sports Academy
            </p>
          </div>
          <span className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-semibold">
            Coach & Front Office
          </span>
        </div>
        <h2 className="mt-6 text-4xl leading-tight sm:text-5xl">
          Find your next
          <br />
          <span className="text-powder">great weekend.</span>
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-fg-soft">
          Tournament Finder · Baseball & softball. Compare club records, check organizer details,
          and plan your team's schedule.
        </p>
        <div className="mt-5 flex flex-wrap gap-4 text-xs text-fg-soft">
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={15} aria-hidden="true" /> Based in Broken Arrow, OK
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Trophy size={15} aria-hidden="true" /> {catalog.length} club{" "}
            {catalog.length === 1 ? "record" : "records"}
          </span>
        </div>
      </div>
      <div className="grid gap-5 p-4 sm:p-6">
        {club._demo && (
          <p
            role="note"
            className="rounded-xl border border-maroon/30 bg-paper p-3 text-sm font-semibold text-maroon"
          >
            Demo club: sample tournament records are for testing, not real event listings.
          </p>
        )}
        <div className="grid gap-3 rounded-xl bg-paper p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          {!fixedTeamId ? (
            <Field title="Planning for">
              <select
                aria-label="Planning for"
                className={control}
                value={team?.id || ""}
                disabled={busy || !club.teams.length}
                onChange={(e) => {
                  const next = club.teams.find((t) => t.id === e.target.value);
                  setSelectedTeamId(e.target.value);
                  setFilters(defaultTournamentFilters(next));
                  setNotice("");
                  setError("");
                }}
              >
                {!club.teams.length && <option value="">No teams created yet</option>}
                {club.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                Planning for
              </p>
              <p className="mt-1 font-semibold">{team?.name || "No assigned team"}</p>
            </div>
          )}
          <p className="text-sm text-muted">
            {team
              ? `${team.age} · ${team.sport} · ${selected.length} catalog events on schedule`
              : "Create a team to save a schedule."}
          </p>
        </div>
        <div className="grid gap-4">
          <Field title="Search tournaments">
            <div className="relative">
              <Search
                size={18}
                aria-hidden="true"
                className="pointer-events-none absolute top-4 left-3 text-muted"
              />
              <input
                aria-label="Search tournaments"
                className={`${control} pl-10`}
                value={filters.query}
                onChange={(e) => set("query", e.target.value)}
                placeholder="Event, organizer, or city"
                maxLength={200}
              />
            </div>
          </Field>
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 lg:grid-cols-4">
            <Field title="Sport">
              <select
                className={control}
                value={filters.sport}
                onChange={(e) => set("sport", e.target.value)}
              >
                <option value="">Baseball & softball</option>
                <option value="baseball">Baseball</option>
                <option value="softball">Softball</option>
              </select>
            </Field>
            <Field title="Age division">
              <select
                className={control}
                value={filters.age}
                onChange={(e) => set("age", e.target.value)}
              >
                <option value="">All ages</option>
                {ages.map((age) => (
                  <option key={age}>{age}</option>
                ))}
              </select>
            </Field>
            <Field title="State">
              <select
                className={control}
                value={filters.state}
                onChange={(e) => set("state", e.target.value)}
              >
                <option value="">All states</option>
                {states.map((state) => (
                  <option key={state}>{state}</option>
                ))}
              </select>
            </Field>
            <Field title="Date range">
              <select
                className={control}
                value={filters.range}
                onChange={(e) => set("range", e.target.value as TournamentFilters["range"])}
              >
                {team && <option value="season">Team season</option>}
                <option value="30">Next 30 days</option>
                <option value="90">Next 90 days</option>
                <option value="all">All dates</option>
                <option value="custom">Custom dates</option>
              </select>
            </Field>
          </div>
          {filters.range === "custom" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field title="From (includes overlapping events)">
                <input
                  className={control}
                  type="date"
                  value={filters.from}
                  onChange={(e) => set("from", e.target.value)}
                />
              </Field>
              <Field title="Through">
                <input
                  className={control}
                  type="date"
                  value={filters.to}
                  onChange={(e) => set("to", e.target.value)}
                />
              </Field>
            </div>
          )}
          {filters.range === "season" && team && (
            <p className="text-xs text-muted">
              Team season: {dateLabel(team.seasonStart)} – {dateLabel(team.seasonEnd)}.
            </p>
          )}
          {badRange && (
            <p role="alert" className="text-sm text-maroon">
              Choose an end date on or after the start date.
            </p>
          )}
          <button
            type="button"
            className="flex min-h-11 items-center gap-2 text-left text-sm font-semibold text-ink"
            aria-expanded={advanced}
            aria-controls={advancedId}
            onClick={() => setAdvanced((v) => !v)}
          >
            <SlidersHorizontal size={18} aria-hidden="true" /> Advanced filters{" "}
            {advanced ? "−" : "+"}
          </button>
          <div id={advancedId} hidden={!advanced}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field title="Competition division">
                <select
                  className={control}
                  value={filters.division}
                  onChange={(e) => set("division", e.target.value)}
                >
                  <option value="">All divisions</option>
                  {divisions.map((level) => (
                    <option key={level}>{level}</option>
                  ))}
                </select>
              </Field>
              {canSeePrices && (
                <Field title="Maximum entry fee (USD)">
                  <input
                    className={control}
                    type="number"
                    min="0"
                    step="1"
                    inputMode="decimal"
                    placeholder="Any amount"
                    value={filters.maxFee}
                    onChange={(e) => set("maxFee", e.target.value)}
                  />
                </Field>
              )}
              <Field title="Maximum drive miles">
                <select
                  className={control}
                  value={filters.maxDistance}
                  onChange={(e) => set("maxDistance", e.target.value)}
                >
                  <option value="">Any distance</option>
                  {[50, 100, 200, 300, 500].map((miles) => (
                    <option key={miles} value={miles}>
                      {miles} miles from Broken Arrow
                    </option>
                  ))}
                </select>
              </Field>
              <Field title="Event type">
                <select
                  className={control}
                  value={filters.type}
                  onChange={(e) => set("type", e.target.value)}
                >
                  <option value="">All types</option>
                  <option value="tournament">Tournament</option>
                  <option value="showcase">Showcase</option>
                </select>
              </Field>
            </div>
            <p className="mt-2 text-xs text-muted">
              Distance uses office-recorded driving estimates, not live routing. Events without a
              distance are excluded when a limit is set.
            </p>
            <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filters.noStayToPlay}
                onChange={(e) => set("noStayToPlay", e.target.checked)}
              />{" "}
              Hide stay-to-play events
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={!team}
                checked={filters.plannedOnly}
                onChange={(e) => set("plannedOnly", e.target.checked)}
              />{" "}
              On this team's schedule
            </label>
            <Button
              variant="outlineDark"
              onClick={() => setFilters(defaultTournamentFilters(team))}
            >
              Reset filters
            </Button>
          </div>
        </div>
        <div className="rounded-xl border border-powder bg-paper p-4 text-sm">
          <p className="font-semibold">Club records, with clear sources.</p>
          <p className="mt-1 text-muted">
            This searches records saved by Front Office. A live nationwide feed is not connected.
            Dates, prices, availability, and eligibility must be confirmed with the organizer before
            registering.
          </p>
        </div>
        {notice && (
          <p role="status" className="rounded-xl bg-paper p-3 text-sm">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl border border-maroon/30 p-3 text-sm text-maroon">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p role="status" aria-live="polite" className="font-semibold">
            {results.length} matching {results.length === 1 ? "tournament" : "tournaments"}
          </p>
          <Field title="Sort results">
            <select
              className={control}
              value={filters.sort}
              onChange={(e) => set("sort", e.target.value as TournamentFilters["sort"])}
            >
              <option value="date">Soonest first</option>
              {canSeePrices && <option value="fee">Lowest entry fee</option>}
              <option value="distance">Nearest recorded distance</option>
            </select>
          </Field>
        </div>
        {!results.length ? (
          <div className="rounded-xl border border-dashed border-line p-6 text-center">
            <Trophy className="mx-auto mb-3 text-muted" aria-hidden="true" />
            <h3 className="text-xl">
              {catalog.length
                ? "No tournaments match these filters."
                : "Your tournament board starts here."}
            </h3>
            <p className="mt-2 text-sm text-muted">
              {catalog.length
                ? "Try all dates or reset your filters. You can also browse organizer directories below."
                : "Browse the official directories below. Front Office can add real event details and their source links to the club catalog."}
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2" data-tournament-results>
            {results.map((event) => {
              const on = Boolean(team?.tournamentIds.includes(event.id));
              const matches = Boolean(team && tournamentMatchesTeam(event, team));
              const conflict =
                team && !on ? tournamentConflict(event, team, club.catalog) : undefined;
              const source = safeTournamentUrl(event.sourceUrl);
              return (
                <li
                  key={event.id}
                  className={`flex min-w-0 flex-col rounded-xl border p-4 sm:p-5 ${on ? "border-powder bg-paper" : "border-line bg-white"}`}
                  data-tournament={event.id}
                >
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-ink px-2.5 py-1 text-white">
                      {event.sport === "softball" ? "Softball" : "Baseball"}
                    </span>
                    <span className="rounded-full bg-paper-2 px-2.5 py-1 text-ink">
                      {event.ages.join(" / ")}
                    </span>
                    {on && (
                      <span className="rounded-full bg-powder px-2.5 py-1 text-ink">
                        On team schedule
                      </span>
                    )}
                  </div>
                  <h3 className="mt-3 break-words text-2xl leading-tight text-ink">{event.name}</h3>
                  <p className="mt-1 text-sm text-muted">
                    {event.org} · {event.levels.join(" / ") || "Division not recorded"}
                  </p>
                  <p className="mt-4 flex items-start gap-2 text-sm">
                    <CalendarDays
                      size={17}
                      className="mt-0.5 shrink-0 text-muted"
                      aria-hidden="true"
                    />
                    <span>
                      {dateLabel(event.start)}
                      {event.end && event.end !== event.start ? ` – ${dateLabel(event.end)}` : ""}
                    </span>
                  </p>
                  <p className="mt-2 flex items-start gap-2 text-sm">
                    <MapPin size={17} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
                    <span>
                      {event.city}, {event.state}
                      {event.distanceMiles != null
                        ? ` · ~${event.distanceMiles} drive miles`
                        : " · Distance not recorded"}
                    </span>
                  </p>
                  <p className="mt-4 text-lg font-semibold">
                    {!financial ? (
                      <>
                        {money(event.fee)}{" "}
                        <span className="text-xs font-normal text-muted">recorded entry fee</span>
                      </>
                    ) : financial.owner ? (
                      financialPrices.has(event.id) ? (
                        <>
                          {money(financialPrices.get(event.id)!)}{" "}
                          <span className="text-xs font-normal text-muted">approved entry fee</span>
                        </>
                      ) : (
                        "Financial price review needed"
                      )
                    ) : (
                      "Confirm entry fee with organizer"
                    )}
                  </p>
                  {event.stayToPlay && (
                    <p className="mt-2 text-xs font-semibold text-maroon">
                      Stay-to-play. Check the organizer's lodging requirements and extra costs.
                    </p>
                  )}
                  <div className="mt-4 border-t border-line pt-3 text-xs text-muted">
                    <p>
                      {source && event.sourceCheckedOn
                        ? `Source checked by office: ${dateLabel(event.sourceCheckedOn)}`
                        : "Not source-checked · confirm details"}
                    </p>
                    {source ? (
                      <a
                        href={source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex min-h-11 items-center gap-1 font-semibold text-maroon underline"
                      >
                        Organizer page <ExternalLink size={13} aria-hidden="true" />
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    ) : (
                      <p className="mt-1">No organizer link recorded.</p>
                    )}
                  </div>
                  {conflict && (
                    <p className="mt-2 text-xs font-semibold text-maroon">
                      Date overlap: {conflict.name}. Review before adding.
                    </p>
                  )}
                  {!matches && !on && team && (
                    <p className="mt-2 text-xs text-muted">
                      Does not match {team.name}'s sport and age.
                    </p>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    <Button
                      className="grow"
                      variant={on ? "outlineDark" : "ink"}
                      disabled={busy || !team || (!on && !matches)}
                      onClick={() => void toggle(event)}
                    >
                      {busy ? "Saving…" : on ? "Remove from schedule" : "Add to team schedule"}
                    </Button>
                    {financial?.owner && onReload && (
                      <Button
                        variant="outlineDark"
                        disabled={busy}
                        onClick={() => {
                          setPriceReview({
                            event,
                            fee: financialPrices.get(event.id) ?? 0,
                            reason: "",
                            confirmed: false,
                            basisVersion: financial.version,
                            sourceClubRevision: club._rev,
                          });
                          setError("");
                        }}
                      >
                        Review financial price
                      </Button>
                    )}
                    {admin && (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          setEditing(event);
                          setError("");
                        }}
                      >
                        Edit record
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted">
          Saved selections use your existing team schedule and may be visible to families. Adding
          here does not register, pay, or send a notification.
        </p>
        {admin && (
          <div className="border-t border-line pt-4">
            <Button
              variant="maroon"
              disabled={busy}
              onClick={() => {
                setEditing("new");
                setError("");
              }}
            >
              Add tournament record
            </Button>
            <p className="mt-2 text-xs text-muted">
              Front Office maintains the catalog. New manual records are not independently verified.
            </p>
          </div>
        )}
        {financial?.owner && onReload && priceReview && (
          <form
            aria-label="Owner catalog financial price"
            className="grid gap-3 rounded-xl border-2 border-maroon bg-paper p-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy || !priceReview.confirmed) return;
              setBusy(true);
              setError("");
              setNotice("");
              try {
                await saveFinancialCatalogPrice({
                  data: {
                    expectedBasisVersion: priceReview.basisVersion,
                    sourceClubRevision: priceReview.sourceClubRevision,
                    catalogId: priceReview.event.id,
                    fee: priceReview.fee,
                    reason: priceReview.reason,
                    confirmed: true,
                  },
                });
                setPriceReview(null);
                await onReload();
                setNotice("Financial catalog price saved.");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not save financial price.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <h3 className="text-xl">Review financial price: {priceReview.event.name}</h3>
            <p>
              {financialPrices.has(priceReview.event.id)
                ? "This changes only the saved financial catalog price. Existing financial event details stay as recorded."
                : `This adds this catalog event to financial records: ${priceReview.event.org}, ${priceReview.event.start} to ${priceReview.event.end}, ${priceReview.event.city}, ${priceReview.event.state}, ${priceReview.event.sport}, ages ${priceReview.event.ages.join(" / ")}.`}
            </p>
            <Field title="Approved catalog entry fee (USD)">
              <input
                className={control}
                type="number"
                min="0"
                max="1000000000"
                step="0.01"
                required
                value={priceReview.fee}
                onChange={(e) => setPriceReview({ ...priceReview, fee: Number(e.target.value) })}
              />
            </Field>
            <Field title="Reason">
              <textarea
                className={control}
                maxLength={1000}
                required
                value={priceReview.reason}
                onChange={(e) => setPriceReview({ ...priceReview, reason: e.target.value })}
              />
            </Field>
            <label className="flex gap-2">
              <input
                type="checkbox"
                required
                checked={priceReview.confirmed}
                onChange={(e) => setPriceReview({ ...priceReview, confirmed: e.target.checked })}
              />
              I approve this catalog price for financial and public catalog records.
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={busy || !priceReview.confirmed || !priceReview.reason.trim()}
              >
                Save financial catalog price
              </Button>
              <Button
                type="button"
                variant="outlineDark"
                disabled={busy}
                onClick={() => setPriceReview(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outlineDark"
                disabled={busy}
                onClick={async () => {
                  setPriceReview(null);
                  setBusy(true);
                  try {
                    await onReload();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not refresh records.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Refresh financial prices
              </Button>
            </div>
          </form>
        )}
        {admin && editing && (
          <TournamentRecordForm
            key={typeof editing === "string" ? "new" : editing.id}
            event={editing === "new" ? undefined : editing}
            busy={busy}
            operationalOnly={Boolean(financial)}
            locked={
              !financial &&
              typeof editing !== "string" &&
              club.teams.some((t) => t.tournamentIds.includes(editing.id))
            }
            onCancel={() => setEditing(null)}
            onSubmit={async (event) => {
              const nextCatalog =
                editing === "new"
                  ? [...club.catalog, event]
                  : club.catalog.map((e) => (e.id === event.id ? event : e));
              const ok = await save(
                { ...club, catalog: nextCatalog },
                "Tournament record saved. Confirm current details with the organizer before registration.",
              );
              if (ok) setEditing(null);
            }}
          />
        )}
        <details className="rounded-xl border border-line bg-paper p-4" open={!catalog.length}>
          <summary className="min-h-11 cursor-pointer font-semibold">
            Browse official organizer directories
          </summary>
          <p className="mb-3 text-sm text-muted">
            These links open the organizer's website. They do not import results into Prospects.
            Directory links checked October 19, 2026.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {TOURNAMENT_DIRECTORIES.filter(
              (source) => !filters.sport || !source.sport || source.sport === filters.sport,
            ).map((source) => (
              <a
                key={source.name}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-12 items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold"
              >
                {source.name}
                <ExternalLink size={16} aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}

function TournamentRecordForm({
  event,
  busy,
  locked = false,
  operationalOnly = false,
  onCancel,
  onSubmit,
}: {
  event?: EventItem;
  busy: boolean;
  locked?: boolean;
  operationalOnly?: boolean;
  onCancel: () => void;
  onSubmit: (event: EventItem) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <form
      className="grid gap-4 rounded-xl border-2 border-powder bg-paper p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const fd = new FormData(e.currentTarget);
        const value = (key: string) => String(fd.get(key) || "").trim();
        try {
          setError("");
          const metadata = parseTournamentSourceMetadata({
            sourceUrl: value("sourceUrl"),
            sourceCheckedOn: value("sourceCheckedOn"),
            distanceMiles: value("distanceMiles") ? Number(value("distanceMiles")) : undefined,
          });
          const parsed =
            locked && event
              ? { ...event, ...metadata }
              : parseTournamentRecord({
                  id: event?.id || `tournament-${crypto.randomUUID()}`,
                  name: value("name"),
                  org: value("org"),
                  city: value("city"),
                  state: value("state").toUpperCase(),
                  start: value("start"),
                  end: value("end"),
                  ages: value("ages")
                    .split(",")
                    .map((v) =>
                      v.trim().toUpperCase() === "ADULT" ? "Adult" : v.trim().toUpperCase(),
                    )
                    .filter(Boolean),
                  levels: value("levels")
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean),
                  sport: value("sport"),
                  type: value("type"),
                  fee: operationalOnly ? 0 : Number(value("fee")),
                  stayToPlay: fd.has("stayToPlay"),
                  verifiedOn: event?.verifiedOn || "",
                  ...metadata,
                });
          await onSubmit(parsed);
        } catch (err) {
          const issues =
            err && typeof err === "object" && "issues" in err
              ? (err.issues as { message: string }[])
              : [];
          setError(
            issues[0]?.message || (err instanceof Error ? err.message : "Check the event details."),
          );
        }
      }}
    >
      <h3 className="text-2xl" ref={heading} tabIndex={-1}>
        {event ? "Edit tournament record" : "Add a real tournament"}
      </h3>
      <p className="text-sm text-muted">
        Copy details from the organizer. Only enter a source-check date after reviewing that page.
        No verification badge is assigned automatically.
      </p>
      {operationalOnly && (
        <p className="text-sm">
          Catalog details and schedule changes are operational. Use the owner financial price review
          to approve an entry fee.
        </p>
      )}
      {locked && (
        <p className="text-sm font-semibold text-maroon">
          This event is already on a team schedule. Dates, costs, and eligibility are locked to
          preserve existing planning. You can update its source and distance.
        </p>
      )}
      <fieldset disabled={busy || locked} className="grid gap-3 sm:grid-cols-2">
        <Field title="Tournament name">
          <input
            name="name"
            className={control}
            required
            maxLength={200}
            defaultValue={event?.name}
          />
        </Field>
        <Field title="Organizer">
          <input
            name="org"
            className={control}
            required
            maxLength={200}
            defaultValue={event?.org}
          />
        </Field>
        <Field title="Sport">
          <select name="sport" className={control} defaultValue={event?.sport || "baseball"}>
            <option value="baseball">Baseball</option>
            <option value="softball">Softball</option>
          </select>
        </Field>
        <Field title="Event type">
          <select name="type" className={control} defaultValue={event?.type || "tournament"}>
            <option value="tournament">Tournament</option>
            <option value="showcase">Showcase</option>
          </select>
        </Field>
        <Field title="City">
          <input
            name="city"
            className={control}
            required
            maxLength={200}
            defaultValue={event?.city}
          />
        </Field>
        <Field title="State abbreviation">
          <input
            name="state"
            className={control}
            required
            pattern="[A-Za-z]{2}"
            maxLength={2}
            placeholder="OK"
            defaultValue={event?.state}
          />
        </Field>
        <Field title="Start date">
          <input
            name="start"
            type="date"
            className={control}
            required
            defaultValue={event?.start}
          />
        </Field>
        <Field title="End date">
          <input name="end" type="date" className={control} required defaultValue={event?.end} />
        </Field>
        <Field title="Ages (comma separated)">
          <input
            name="ages"
            className={control}
            required
            maxLength={150}
            placeholder="13U, 14U"
            defaultValue={event?.ages.join(", ")}
          />
        </Field>
        <Field title="Divisions (comma separated)">
          <input
            name="levels"
            className={control}
            required
            maxLength={200}
            placeholder="AA, AAA, Open"
            defaultValue={event?.levels.join(", ")}
          />
        </Field>
        {!operationalOnly && (
          <Field title="Entry fee (USD)">
            <input
              name="fee"
              type="number"
              min="0"
              max="10000000"
              step="0.01"
              className={control}
              required
              defaultValue={event?.fee}
            />
          </Field>
        )}
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input name="stayToPlay" type="checkbox" defaultChecked={event?.stayToPlay} />{" "}
          Stay-to-play lodging required
        </label>
      </fieldset>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        <Field title="Approximate drive miles from Broken Arrow">
          <input
            name="distanceMiles"
            type="number"
            min="0"
            max="5000"
            step="1"
            className={control}
            placeholder="Optional"
            defaultValue={event?.distanceMiles}
          />
        </Field>
        <Field title="Organizer event URL">
          <input
            name="sourceUrl"
            type="url"
            className={control}
            maxLength={2000}
            placeholder="https://… (optional)"
            defaultValue={event?.sourceUrl}
          />
        </Field>
        <Field title="Source checked on (optional)">
          <input
            name="sourceCheckedOn"
            type="date"
            max={tournamentToday()}
            className={control}
            defaultValue={event?.sourceCheckedOn}
          />
        </Field>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-maroon">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save tournament record"}
        </Button>
        <Button variant="outlineDark" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
