import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import { Button } from "../ui/button";
import { TOURNAMENT_DIRECTORIES, tournamentToday } from "@/lib/teams/tournament-finder";
import {
  defaultOrganizationTournamentFilters,
  filterOrganizationTournaments,
  organizationTournamentConflict,
  organizationTournamentRange,
  organizationTournamentSourceInput,
  type OrganizationTournament,
  type OrganizationTournamentFilters,
  type OrganizationTournamentSourceInput,
  type OrganizationTournamentWorkspace,
} from "@/lib/coordinator/organization-tournaments-contracts";
import {
  getOrganizationTournaments,
  getOrganizationTournamentReport,
  saveOrganizationTournamentSource,
} from "@/lib/coordinator/organization-tournaments-api";

const control =
  "min-h-12 w-full min-w-0 rounded-lg border border-line bg-white px-3 py-2 text-base text-ink";
function Field({
  title,
  children,
}: {
  title: string;
  children: ReactElement<{ id?: string; "aria-label"?: string }>;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="grid min-w-0 gap-1 text-sm font-semibold">
      <span>{title}</span>
      {cloneElement(children, { id, "aria-label": title })}
    </label>
  );
}
const errorMessage = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : "Unable to complete the request. Please reload and try again.";

function SourceForm({
  event,
  revision,
  busy,
  onCancel,
  onSave,
}: {
  event: OrganizationTournament;
  revision: number;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: OrganizationTournamentSourceInput) => Promise<void>;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    heading.current?.focus();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const values = new FormData(e.currentTarget);
    const distance = String(values.get("distanceMiles") || "");
    const parsed = organizationTournamentSourceInput.safeParse({
      id: event.id,
      revision,
      sourceUrl: String(values.get("sourceUrl") || "").trim(),
      sourceCheckedOn: String(values.get("sourceCheckedOn") || ""),
      distanceMiles: distance === "" ? null : Number(distance),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Check the source details.");
      return;
    }
    setError("");
    await onSave(parsed.data);
  }
  return (
    <form
      className="grid min-w-0 gap-3 rounded-lg border-2 border-powder bg-paper p-4"
      onSubmit={(event) => void submit(event)}
    >
      <h3 className="text-lg font-semibold" tabIndex={-1} ref={heading}>
        Source details: {event.name}
      </h3>
      <p className="text-sm">
        Use a public USSSA or Perfect Game event link, or an official directory below. Private links
        and unknown URL parameters are not accepted. Record a check date only after reviewing the
        organizer page.
      </p>
      <fieldset disabled={busy} className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Field title="Public organizer URL">
          <input
            name="sourceUrl"
            type="url"
            maxLength={2000}
            className={control}
            defaultValue={event.sourceUrl}
          />
        </Field>
        <Field title="Source checked on">
          <input
            name="sourceCheckedOn"
            type="date"
            max={tournamentToday()}
            className={control}
            defaultValue={event.sourceCheckedOn}
          />
        </Field>
        <Field title="Approximate drive miles from Broken Arrow">
          <input
            name="distanceMiles"
            type="number"
            min="0"
            max="5000"
            step="any"
            className={control}
            defaultValue={event.distanceMiles ?? ""}
          />
        </Field>
        <div className="flex flex-wrap items-end gap-2">
          <Button type="submit">Save source details</Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-maroon">
          {error}
        </p>
      )}
    </form>
  );
}

/** Receives only the separate server allowlist; never a ClubRecord or legacy saver. */
export function OrganizationTournamentFinder({
  onSaved,
}: {
  onSaved?: () => void | Promise<void>;
}) {
  const [workspace, setWorkspace] = useState<OrganizationTournamentWorkspace | null>(null);
  const [teamId, setTeamId] = useState("");
  const [filters, setFilters] = useState(defaultOrganizationTournamentFilters());
  const [editing, setEditing] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = useRef(0),
    running = useRef(false),
    initialized = useRef(false);
  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError("");
    try {
      const next = await getOrganizationTournaments();
      if (id !== request.current) return false;
      setWorkspace(next);
      if (!initialized.current) {
        initialized.current = true;
        setTeamId(next.teams[0]?.id || "");
        setFilters(defaultOrganizationTournamentFilters(next.teams[0]));
      }
      return true;
    } catch (cause) {
      if (id === request.current) {
        setWorkspace(null);
        setError(errorMessage(cause));
      }
      return false;
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    return () => {
      request.current += 1;
    };
  }, [load]);
  const team = workspace?.teams.find((item) => item.id === teamId);
  const results = workspace ? filterOrganizationTournaments(workspace.catalog, filters, team) : [];
  const range = organizationTournamentRange(filters, team);
  const badRange = Boolean(range.from && range.to && range.from > range.to);
  const edit = workspace?.catalog.find((event) => event.id === editing);
  const set = <K extends keyof OrganizationTournamentFilters>(
    key: K,
    value: OrganizationTournamentFilters[K],
  ) => setFilters((current) => ({ ...current, [key]: value }));
  async function save(input: OrganizationTournamentSourceInput) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await saveOrganizationTournamentSource({ data: input });
      setEditing("");
      setNotice(
        result.changed ? "Source details saved." : "Source details are already up to date.",
      );
      await load();
      if (onSaved) await onSaved();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function download() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const report = await getOrganizationTournamentReport({
        data: { teamId: team?.id || "", filters },
      });
      const url = URL.createObjectURL(new Blob([report.body], { type: report.contentType }));
      const link = document.createElement("a");
      link.href = url;
      link.download = report.filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Tournament CSV prepared.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      data-organization-tournament-finder
      aria-label="Tournament Finder"
      className="grid min-w-0 gap-4 rounded-2xl border border-line bg-white p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Tournament Finder</h2>
          <p className="mt-1 text-sm">Search baseball and softball club records across teams.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={busy || loading}
          onClick={() => {
            setEditing("");
            setNotice("");
            void load();
          }}
        >
          Reload tournaments
        </Button>
      </div>
      <p className="rounded-lg bg-paper p-3 text-sm">
        Event creation, core record changes, and adding or removing schedule entries require an
        authorized owner because they can change team obligations. Historical notes, lodging
        requirements, and unsupported source links remain protected.
      </p>
      {notice && (
        <p role="status" className="text-green-800">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-maroon">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading tournaments…</p>
      ) : !workspace ? null : (
        <>
          <fieldset disabled={busy} className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <legend className="sr-only">Tournament search filters</legend>
            <Field title="Planning for">
              <select
                className={control}
                value={team?.id || ""}
                onChange={(e) => {
                  const next = workspace.teams.find((t) => t.id === e.target.value);
                  setTeamId(e.target.value);
                  setFilters(defaultOrganizationTournamentFilters(next));
                  setEditing("");
                  setNotice("");
                  setError("");
                }}
              >
                <option value="">All teams</option>
                {workspace.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.sport}
                  </option>
                ))}
              </select>
            </Field>
            <Field title="Search tournaments">
              <input
                className={control}
                placeholder="Event, organizer, or city"
                value={filters.query}
                maxLength={200}
                onChange={(e) => set("query", e.target.value)}
              />
            </Field>
            <Field title="Sport">
              <select
                className={control}
                value={filters.sport}
                onChange={(e) =>
                  set("sport", e.target.value as OrganizationTournamentFilters["sport"])
                }
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
                {[
                  ...new Set([
                    ...(team?.age ? [team.age] : []),
                    ...workspace.catalog.flatMap((event) => event.ages),
                  ]),
                ]
                  .sort()
                  .map((age) => (
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
                {[...new Set(workspace.catalog.map((event) => event.state).filter(Boolean))]
                  .sort()
                  .map((state) => (
                    <option key={state}>{state}</option>
                  ))}
              </select>
            </Field>
            <Field title="Division">
              <select
                className={control}
                value={filters.division}
                onChange={(e) => set("division", e.target.value)}
              >
                <option value="">All divisions</option>
                {[...new Set(workspace.catalog.flatMap((event) => event.levels))]
                  .sort()
                  .map((division) => (
                    <option key={division}>{division}</option>
                  ))}
              </select>
            </Field>
            <Field title="Date range">
              <select
                className={control}
                value={filters.range}
                onChange={(e) =>
                  set("range", e.target.value as OrganizationTournamentFilters["range"])
                }
              >
                {team && <option value="season">Team season</option>}
                <option value="30">Next 30 days</option>
                <option value="90">Next 90 days</option>
                <option value="all">All dates</option>
                <option value="custom">Custom dates</option>
              </select>
            </Field>
            <Field title="Event type">
              <select
                className={control}
                value={filters.type}
                onChange={(e) =>
                  set("type", e.target.value as OrganizationTournamentFilters["type"])
                }
              >
                <option value="">All types</option>
                <option value="tournament">Tournament</option>
                <option value="showcase">Showcase</option>
              </select>
            </Field>
            {filters.range === "custom" && (
              <>
                <Field title="From date">
                  <input
                    className={control}
                    type="date"
                    value={filters.from}
                    onChange={(e) => set("from", e.target.value)}
                  />
                </Field>
                <Field title="Through date">
                  <input
                    className={control}
                    type="date"
                    value={filters.to}
                    onChange={(e) => set("to", e.target.value)}
                  />
                </Field>
              </>
            )}
            <Field title="Maximum drive miles">
              <input
                className={control}
                type="number"
                min="0"
                max="5000"
                value={filters.maxDistance}
                onChange={(e) => set("maxDistance", e.target.value)}
              />
            </Field>
            <Field title="Sort by">
              <select
                className={control}
                value={filters.sort}
                onChange={(e) =>
                  set("sort", e.target.value as OrganizationTournamentFilters["sort"])
                }
              >
                <option value="date">Date</option>
                <option value="distance">Drive distance</option>
              </select>
            </Field>
            <label className="flex min-h-12 items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={!team}
                checked={filters.plannedOnly}
                onChange={(e) => set("plannedOnly", e.target.checked)}
              />
              On selected team schedule
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFilters(defaultOrganizationTournamentFilters(team))}
            >
              Reset filters
            </Button>
          </fieldset>
          {badRange && (
            <p role="alert" className="text-maroon">
              The end date must be on or after the start date.
            </p>
          )}
          {edit && edit.sourceEditable && (
            <SourceForm
              key={`${edit.id}:${workspace.revision}`}
              event={edit}
              revision={workspace.revision}
              busy={busy}
              onCancel={() => setEditing("")}
              onSave={save}
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p aria-live="polite" className="text-sm">
              {results.length} matching {results.length === 1 ? "tournament" : "tournaments"}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={busy || badRange}
              onClick={() => void download()}
            >
              Download results CSV
            </Button>
          </div>
          {!results.length && (
            <p className="rounded-lg bg-paper p-4">
              {workspace.catalog.length
                ? "No tournaments match these filters. Try all dates or reset the filters."
                : "No supported tournament records are available. Browse an official organizer directory below."}
            </p>
          )}
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">
            {results.map((event) => {
              const planned = Boolean(team?.tournamentIds.includes(event.id));
              const conflict = team
                ? organizationTournamentConflict(event, team, workspace.catalog)
                : undefined;
              return (
                <article
                  key={event.id}
                  className="grid min-w-0 gap-2 rounded-xl border border-line p-4"
                >
                  <h3 className="break-words text-xl font-semibold">{event.name}</h3>
                  <p className="text-sm">
                    {event.org} · {event.sport} · {event.type}
                  </p>
                  <p className="text-sm">
                    {event.start || "Date not recorded"}
                    {event.end && event.end !== event.start ? ` – ${event.end}` : ""} · {event.city}
                    , {event.state}
                  </p>
                  <p className="text-sm">
                    {event.ages.join(", ")} · {event.levels.join(", ")}
                    {event.distanceMiles !== null
                      ? ` · Approximately ${event.distanceMiles} drive miles`
                      : ""}
                  </p>
                  {planned && (
                    <p className="font-semibold text-green-800">On {team?.name}'s schedule</p>
                  )}
                  {team && (event.sport !== team.sport || !event.ages.includes(team.age)) && (
                    <p className="text-sm text-maroon">
                      Sport or age does not match the selected team.
                    </p>
                  )}
                  {conflict && <p className="text-sm text-maroon">Date overlap: {conflict.name}</p>}
                  {event.sourceUrl ? (
                    <a
                      className="min-h-11 break-words py-2 font-semibold underline"
                      href={event.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open public organizer page{" "}
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  ) : (
                    <p className="text-sm">No supported public organizer link is available.</p>
                  )}
                  <p className="text-xs">
                    {event.sourceCheckedOn
                      ? `Source checked by office: ${event.sourceCheckedOn}`
                      : "Source check not recorded."}
                  </p>
                  {event.sourceEditable ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setEditing(event.id);
                        setError("");
                        setNotice("");
                      }}
                    >
                      Edit source details
                    </Button>
                  ) : (
                    <p className="text-sm">Source details require owner review before editing.</p>
                  )}
                </article>
              );
            })}
          </div>
          <details className="rounded-lg border border-line bg-paper p-4">
            <summary className="min-h-11 cursor-pointer font-semibold">
              Browse official organizer directories
            </summary>
            <p className="mb-3 text-sm">
              These links open organizer websites and do not import records. Directory links checked
              October 19, 2026.
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
                  className="min-h-12 rounded-lg border border-line bg-white p-3 font-semibold underline"
                >
                  {source.name}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ))}
            </div>
          </details>
        </>
      )}
    </section>
  );
}
