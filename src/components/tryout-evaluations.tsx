import { CLUB } from "@/lib/club";
import { cloneElement, useEffect, useId, useState, type ReactElement } from "react";
import { getTryoutEvaluations, saveTryoutEvaluation } from "@/lib/tryout-evaluations-api";
import {
  blankEvaluationPayload,
  EVALUATION_SKILLS,
  evaluationInput,
  evaluationTotal,
  RECOMMENDATIONS,
  type EvaluationInput,
  type EvaluationPayload,
  type EvaluationWorkspace,
  type SavedEvaluation,
} from "@/lib/tryout-evaluation-contracts";
import { chicagoDate } from "@/lib/scheduling";
import { Button } from "@/components/ui/button";

const control =
  "min-h-11 w-full min-w-0 rounded-md border border-line bg-white px-3 py-2 text-base text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon";
function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-1.5 text-sm font-semibold">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}
function scoreLabel(row: SavedEvaluation) {
  const total = evaluationTotal(row.payload.ratings);
  return total === null ? "Pending" : `${total} / 35`;
}
function editInput(row: SavedEvaluation): EvaluationInput {
  return {
    id: row.id,
    baseRevision: row.revision,
    registrationId: row.registrationId,
    teamId: row.teamId,
    ageGroup: row.ageGroup,
    sport: row.sport,
    playerName: row.playerName,
    evaluationDate: row.evaluationDate,
    status: row.status,
    recommendation: row.recommendation,
    payload: structuredClone(row.payload),
  };
}

export function TryoutEvaluations() {
  const [workspace, setWorkspace] = useState<EvaluationWorkspace>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EvaluationInput | null>(null);
  const [viewing, setViewing] = useState<SavedEvaluation | null>(null);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState(""),
    [teamFilter, setTeamFilter] = useState(""),
    [ageFilter, setAgeFilter] = useState(""),
    [sportFilter, setSportFilter] = useState(""),
    [dateFilter, setDateFilter] = useState(""),
    [coachFilter, setCoachFilter] = useState(""),
    [statusFilter, setStatusFilter] = useState("");
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setWorkspace(await getTryoutEvaluations());
    } catch (e) {
      setWorkspace(undefined);
      setError(e instanceof Error ? e.message : "Could not load evaluations.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    getTryoutEvaluations()
      .then((data) => {
        if (active) setWorkspace(data);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Could not load evaluations.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const readonly = !!viewing && !viewing.canEdit;
  function leave() {
    if (dirty && !window.confirm("Leave without saving these evaluation changes?")) return;
    setForm(null);
    setViewing(null);
    setDirty(false);
    setError("");
    setNotice("");
  }
  function change(update: Partial<EvaluationInput>) {
    setForm((f) => (f ? { ...f, ...update } : f));
    setDirty(true);
    setNotice("");
  }
  function detail<K extends keyof EvaluationPayload>(key: K, value: EvaluationPayload[K]) {
    setForm((f) => (f ? { ...f, payload: { ...f.payload, [key]: value } } : f));
    setDirty(true);
    setNotice("");
  }
  function create() {
    setForm({
      id: crypto.randomUUID(),
      baseRevision: 0,
      registrationId: null,
      ageGroup: "",
      sport: "baseball",
      teamId: workspace?.teams.some((t) => t.id === teamFilter)
        ? teamFilter
        : workspace?.teams[0]?.id || "",
      playerName: "",
      evaluationDate: chicagoDate(),
      status: "draft",
      recommendation: "undecided",
      payload: blankEvaluationPayload(),
    });
    setViewing(null);
    setDirty(false);
    setError("");
    setNotice("");
  }
  async function save(status: "draft" | "submitted") {
    if (!form || saving || readonly) return;
    if (!form.teamId && !form.ageGroup.trim() && !form.registrationId) {
      setError("Enter an age group for this general tryout.");
      return;
    }
    const parsed = evaluationInput.safeParse({ ...form, status });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Check the evaluation fields.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const row = await saveTryoutEvaluation({ data: { ...form, status } });
      setForm(editInput(row));
      setViewing(row);
      setDirty(false);
      setWorkspace((w) =>
        w ? { ...w, evaluations: [row, ...w.evaluations.filter((r) => r.id !== row.id)] } : w,
      );
      setNotice(
        status === "submitted"
          ? "Evaluation submitted. Club owners can review these results."
          : "Draft saved. Club owners can see it marked as a draft.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save. Your entries are still on this screen.",
      );
    } finally {
      setSaving(false);
    }
  }
  if (!workspace)
    return (
      <section className="grid gap-4 py-6" aria-live="polite">
        <h1 className="text-3xl">Tryout evaluations</h1>
        {loading ? (
          <p role="status">Loading saved evaluations…</p>
        ) : (
          <>
            <p role="alert">{error}</p>
            <p className="text-sm text-muted">
              Evaluations are available to club owners and active coaches assigned to a team.
            </p>
            <Button onClick={() => void refresh()}>Try again</Button>
          </>
        )}
      </section>
    );

  const rows = workspace.evaluations.filter(
    (r) =>
      (!search || r.playerName.toLowerCase().includes(search.toLowerCase())) &&
      (!teamFilter || r.teamId === (teamFilter === "__general__" ? "" : teamFilter)) &&
      (!ageFilter || r.ageGroup === ageFilter) &&
      (!sportFilter || r.sport === sportFilter) &&
      (!dateFilter || r.evaluationDate === dateFilter) &&
      (!coachFilter || r.evaluatorId === coachFilter) &&
      (!statusFilter || r.status === statusFilter),
  );
  const candidate = form?.registrationId
    ? workspace.candidates.find((c) => c.id === form.registrationId)
    : undefined;
  const total = form ? evaluationTotal(form.payload.ratings) : null;
  const teamOptions = form?.registrationId
    ? workspace.teams.filter((t) => candidate?.teamIds.includes(t.id))
    : workspace.teams;
  const resultTeams = [
    ...new Map(
      [
        ...workspace.evaluations
          .filter((r) => r.teamId)
          .map((r) => ({
            id: r.teamId,
            name: workspace.teams.find((t) => t.id === r.teamId)?.name || "Archived team",
            age: r.ageGroup,
            sport: r.sport,
          })),
        ...workspace.teams,
      ].map((t) => [t.id, t]),
    ).values(),
  ];
  const coachOptions = [
    ...new Map(workspace.evaluations.map((r) => [r.evaluatorId, r.evaluatorName])).entries(),
  ];

  return (
    <div className="grid gap-5">
      {!form ? (
        <>
          <header className="flex flex-wrap items-start justify-between gap-4 border-b-4 border-maroon pb-5">
            <div>
              <p className="mb-1 text-sm font-semibold text-muted">
                {CLUB.name} · {workspace.owner ? "Owner results" : "Coach workspace"}
              </p>
              <h1 className="text-3xl sm:text-4xl">Tryout evaluations</h1>
              <p className="mt-2 text-sm text-muted">
                {workspace.owner
                  ? "Review saved evaluations across all ages and teams."
                  : "Record a general tryout or evaluate players for your assigned teams."}
              </p>
            </div>
            <Button onClick={create}>New evaluation</Button>
          </header>
          <div className="grid grid-cols-3 gap-2" aria-label="Evaluation totals">
            {[
              ["Saved", workspace.evaluations.length],
              ["Submitted", workspace.evaluations.filter((r) => r.status === "submitted").length],
              [
                "Follow-up",
                workspace.evaluations.filter(
                  (r) =>
                    ["callback", "development", "incomplete"].includes(r.recommendation) ||
                    !!r.payload.followUpDate,
                ).length,
              ],
            ].map(([label, count]) => (
              <div key={label} className="rounded-lg border border-line bg-white p-3">
                <strong className="block text-2xl text-navy">{count}</strong>
                <span className="text-sm text-muted">{label}</span>
              </div>
            ))}
          </div>
          {!workspace.teams.length ? (
            <p className="rounded-lg border border-line p-4">
              Use General tryout to enter a player and age group. Team assignments are optional.
            </p>
          ) : null}
          <section
            aria-label="Filter evaluations"
            className="grid gap-3 rounded-xl border border-line bg-white p-4"
          >
            <Field label="Search players">
              <input
                className={control}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Player name"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Team">
                <select
                  className={control}
                  value={teamFilter}
                  onChange={(e) => setTeamFilter(e.target.value)}
                >
                  <option value="">All teams and general tryouts</option>
                  <option value="__general__">General tryouts</option>
                  {resultTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.age}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Age group">
                <select
                  className={control}
                  value={ageFilter}
                  onChange={(e) => setAgeFilter(e.target.value)}
                >
                  <option value="">All ages</option>
                  {[...new Set(workspace.evaluations.map((r) => r.ageGroup))]
                    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                    .map((age) => (
                      <option key={age} value={age}>
                        {age}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Sport">
                <select
                  className={control}
                  value={sportFilter}
                  onChange={(e) => setSportFilter(e.target.value)}
                >
                  <option value="">Both sports</option>
                  <option value="baseball">Baseball</option>
                  <option value="softball">Softball</option>
                </select>
              </Field>
              <Field label="Tryout date">
                <input
                  type="date"
                  className={control}
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                />
              </Field>
              <Field label="Evaluator">
                <select
                  className={control}
                  value={coachFilter}
                  onChange={(e) => setCoachFilter(e.target.value)}
                >
                  <option value="">All evaluators</option>
                  {coachOptions.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select
                  className={control}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">Drafts and submitted</option>
                  <option value="submitted">Submitted</option>
                  <option value="draft">Drafts</option>
                </select>
              </Field>
              <div className="flex items-end gap-2">
                <Button
                  variant="outlineDark"
                  onClick={() => {
                    setSearch("");
                    setTeamFilter("");
                    setAgeFilter("");
                    setSportFilter("");
                    setDateFilter("");
                    setCoachFilter("");
                    setStatusFilter("");
                  }}
                >
                  Clear filters
                </Button>
                <Button variant="outlineDark" disabled={loading} onClick={() => void refresh()}>
                  {loading ? "Refreshing…" : "Refresh"}
                </Button>
              </div>
            </div>
          </section>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-2xl">
              Results <span className="text-muted">({rows.length})</span>
            </h2>
            <a
              className="text-sm font-semibold text-maroon underline"
              href="/forms/tryout-evaluation-plan.pdf"
              target="_blank"
              rel="noreferrer"
            >
              Baseball workout plan (PDF)
            </a>
          </div>
          <p className="text-sm text-muted">
            A total appears only when all seven skills have a rating. Compare players within the
            same age group and drill setup.
          </p>
          {!rows.length ? (
            <div className="rounded-xl border border-dashed border-line p-7 text-center">
              <h3 className="text-xl">
                {workspace.evaluations.length
                  ? "No matching evaluations"
                  : "No evaluations saved yet"}
              </h3>
              <p className="mt-2 text-sm text-muted">
                {workspace.evaluations.length
                  ? "Change the filters to see other results."
                  : "Start with a registered player or a walk-in. Saved results will appear here."}
              </p>
            </div>
          ) : null}
          <ul className="grid gap-3">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="w-full rounded-xl border border-line bg-white p-4 text-left focus-visible:outline-2 focus-visible:outline-maroon"
                  onClick={() => {
                    setForm(editInput(r));
                    setViewing(r);
                    setDirty(false);
                    setNotice("");
                    setError("");
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-xl font-semibold">{r.playerName}</h3>
                      <p className="mt-1 text-sm text-muted">
                        {r.ageGroup} · {r.sport} · {r.evaluationDate}
                      </p>
                    </div>
                    <strong className="shrink-0 rounded-md bg-navy px-3 py-2 text-powder">
                      {scoreLabel(r)}
                    </strong>
                  </div>
                  <p className="mt-3 text-sm">
                    {r.evaluatorName} ·{" "}
                    <span className="font-semibold">
                      {r.status === "draft" ? "Draft" : "Submitted"}
                    </span>{" "}
                    · {RECOMMENDATIONS[r.recommendation]}
                  </p>
                  {r.payload.strengths ? (
                    <p className="mt-2 line-clamp-2 break-words text-sm text-muted">
                      {r.payload.strengths}
                    </p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outlineDark" disabled={saving} onClick={leave}>
              Back to results
            </Button>
            <span className="text-sm text-muted">
              {dirty
                ? "Unsaved changes"
                : viewing
                  ? `Saved · ${new Date(viewing.updatedAt).toLocaleString("en-US", { timeZone: "America/Chicago" })}`
                  : "New evaluation"}
            </span>
          </div>
          <header>
            <p className="text-sm font-semibold text-maroon">
              {readonly ? "Evaluation details" : viewing ? "Edit evaluation" : "New evaluation"}
            </p>
            <h1 className="mt-1 break-words text-3xl">{form.playerName || "Player scorecard"}</h1>
            <p className="mt-2 text-sm text-muted">
              Evaluator: {viewing?.evaluatorName || workspace.name}
              {viewing ? ` · ${viewing.status === "submitted" ? "Submitted" : "Draft"}` : ""}
            </p>
            {readonly ? (
              <p className="mt-2 text-sm">
                Only the original evaluator with current coach or owner access can edit this record.
              </p>
            ) : null}
          </header>
          <form
            className="grid gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void save("submitted");
            }}
          >
            <fieldset
              disabled={readonly || saving}
              className="grid min-w-0 gap-5 disabled:opacity-90"
            >
              <section className="grid gap-4 rounded-xl border border-line bg-white p-4">
                <h2 className="text-2xl">Player &amp; tryout</h2>
                <Field label="Registration">
                  <select
                    className={control}
                    value={form.registrationId || ""}
                    disabled={form.baseRevision > 0}
                    onChange={(e) => {
                      const c = workspace.candidates.find((row) => row.id === e.target.value);
                      change({
                        registrationId: c?.id || null,
                        playerName: c?.name || "",
                        ageGroup: c?.age || form.ageGroup,
                        sport:
                          c?.sport === "softball"
                            ? "softball"
                            : c?.sport === "baseball"
                              ? "baseball"
                              : form.sport,
                        teamId: c
                          ? c.teamIds.includes(form.teamId)
                            ? form.teamId
                            : c.teamIds[0] || ""
                          : form.teamId,
                        payload: { ...form.payload, session: c?.session || "" },
                      });
                    }}
                  >
                    <option value="">Walk-in / enter a player</option>
                    {form.registrationId && !candidate ? (
                      <option value={form.registrationId}>
                        {form.playerName} · Saved registration
                      </option>
                    ) : null}
                    {workspace.candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.age} · {c.sport}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Player name">
                    <input
                      required
                      maxLength={120}
                      className={control}
                      value={form.playerName}
                      readOnly={!!form.registrationId}
                      onChange={(e) => change({ playerName: e.target.value })}
                    />
                  </Field>
                  <Field label="Team (optional)">
                    <select
                      disabled={form.baseRevision > 0}
                      className={control}
                      value={form.teamId}
                      onChange={(e) => {
                        const team = workspace.teams.find((t) => t.id === e.target.value);
                        change({
                          teamId: e.target.value,
                          ageGroup: team?.age || form.ageGroup,
                          sport: team?.sport || form.sport,
                        });
                      }}
                    >
                      <option value="">General tryout / no team</option>
                      {viewing && form.teamId && !teamOptions.some((t) => t.id === form.teamId) ? (
                        <option value={form.teamId}>
                          Archived team · {viewing.ageGroup} · {viewing.sport}
                        </option>
                      ) : null}
                      {teamOptions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} · {t.age} · {t.sport}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {!form.teamId ? (
                    <>
                      <Field label="Age group">
                        <input
                          required
                          maxLength={40}
                          className={control}
                          value={form.ageGroup}
                          readOnly={!!form.registrationId}
                          onChange={(e) => change({ ageGroup: e.target.value })}
                          placeholder="Example: 8U"
                        />
                      </Field>
                      <Field label="Sport">
                        <select
                          className={control}
                          value={form.sport}
                          disabled={!!form.registrationId}
                          onChange={(e) =>
                            change({ sport: e.target.value as EvaluationInput["sport"] })
                          }
                        >
                          <option value="baseball">Baseball</option>
                          <option value="softball">Softball</option>
                        </select>
                      </Field>
                    </>
                  ) : null}
                  <Field label="Evaluation date">
                    <input
                      required
                      className={control}
                      type="date"
                      value={form.evaluationDate}
                      onChange={(e) => change({ evaluationDate: e.target.value })}
                    />
                  </Field>
                  <Field label="Session / location">
                    <input
                      maxLength={120}
                      className={control}
                      value={form.payload.session}
                      onChange={(e) => detail("session", e.target.value)}
                    />
                  </Field>
                  <Field label="Player number">
                    <input
                      maxLength={20}
                      className={control}
                      value={form.payload.playerNumber}
                      onChange={(e) => detail("playerNumber", e.target.value)}
                    />
                  </Field>
                  <Field label="Primary / other positions">
                    <input
                      maxLength={120}
                      className={control}
                      value={form.payload.positions}
                      onChange={(e) => detail("positions", e.target.value)}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Bats">
                    <select
                      className={control}
                      value={form.payload.bats}
                      onChange={(e) => detail("bats", e.target.value as EvaluationPayload["bats"])}
                    >
                      <option value="">Not recorded</option>
                      <option value="R">Right</option>
                      <option value="L">Left</option>
                      <option value="S">Switch</option>
                    </select>
                  </Field>
                  <Field label="Throws">
                    <select
                      className={control}
                      value={form.payload.throws}
                      onChange={(e) =>
                        detail("throws", e.target.value as EvaluationPayload["throws"])
                      }
                    >
                      <option value="">Not recorded</option>
                      <option value="R">Right</option>
                      <option value="L">Left</option>
                    </select>
                  </Field>
                </div>
              </section>
              <details className="rounded-xl border border-line bg-white p-4">
                <summary className="min-h-11 cursor-pointer text-lg font-semibold">
                  Throwing readiness &amp; drill details
                </summary>
                <div className="mt-3 grid gap-4">
                  <Field label="Throw today?">
                    <select
                      className={control}
                      value={form.payload.readiness}
                      onChange={(e) =>
                        detail("readiness", e.target.value as EvaluationPayload["readiness"])
                      }
                    >
                      <option value="">Not recorded</option>
                      <option value="ready">Ready for planned reps</option>
                      <option value="rest">Rest / do not throw</option>
                      <option value="recheck">Recheck before throwing</option>
                    </select>
                  </Field>
                  {(
                    [
                      ["workload", "Recent throwing dates / counts"],
                      ["readinessNotes", "Readiness notes"],
                      ["drillDetails", "Feed method, distances and catching notes"],
                    ] as const
                  ).map(([key, label]) => (
                    <Field key={key} label={label}>
                      <textarea
                        rows={2}
                        maxLength={1500}
                        className={control}
                        value={form.payload[key]}
                        onChange={(e) => detail(key, e.target.value)}
                      />
                    </Field>
                  ))}
                </div>
              </details>
              <section className="grid gap-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-2xl">Seven-skill evaluation</h2>
                  <strong className="rounded-md bg-navy px-3 py-2 text-powder">
                    {total === null ? "Pending" : `${total} / 35`}
                  </strong>
                </div>
                <p className="text-sm text-muted">
                  1 Needs instruction · 2 Inconsistent · 3 Functional · 4 Consistent · 5 Consistent
                  and adapts. N/O means not observed and is never zero.
                </p>
                {EVALUATION_SKILLS.map((skill) => (
                  <fieldset
                    key={skill.key}
                    className="min-w-0 rounded-xl border border-line bg-white p-4"
                  >
                    <legend className="px-1 text-base font-semibold">{skill.label}</legend>
                    <div className="grid grid-cols-6 gap-1">
                      {[1, 2, 3, 4, 5, null].map((value) => (
                        <label
                          key={value ?? "no"}
                          className={`flex min-h-11 cursor-pointer items-center justify-center rounded-md border text-sm font-semibold ${form.payload.ratings[skill.key] === value ? "border-navy bg-navy text-white" : "border-line bg-white text-fg"}`}
                        >
                          <input
                            className="sr-only peer"
                            type="radio"
                            name={`score-${skill.key}`}
                            aria-label={`${skill.label}: ${value ?? "Not observed"}`}
                            checked={form.payload.ratings[skill.key] === value}
                            onChange={() =>
                              detail("ratings", { ...form.payload.ratings, [skill.key]: value })
                            }
                          />
                          <span className="peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-powder">
                            {value ?? "N/O"}
                          </span>
                        </label>
                      ))}
                    </div>
                    <label className="mt-3 grid gap-1 text-sm">
                      Evidence / example
                      <input
                        className={control}
                        maxLength={1500}
                        value={form.payload.evidence[skill.key]}
                        onChange={(e) =>
                          detail("evidence", {
                            ...form.payload.evidence,
                            [skill.key]: e.target.value,
                          })
                        }
                      />
                    </label>
                  </fieldset>
                ))}
              </section>
              <details className="rounded-xl border border-line bg-white p-4">
                <summary className="min-h-11 cursor-pointer text-lg font-semibold">
                  Rep counts &amp; measurements
                </summary>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {(
                    [
                      ["throwingReps", "Target hits / attempts"],
                      ["groundReps", "Clean ground balls / attempts"],
                      ["outfieldReps", "Outfield catches / attempts"],
                      ["contactReps", "Solid contact / attempts"],
                      ["movementResult", "Movement drill / times"],
                      ["pitchingReps", "Pitch strikes / attempts"],
                    ] as const
                  ).map(([key, label]) => (
                    <Field key={key} label={label}>
                      <input
                        className={control}
                        maxLength={100}
                        value={form.payload[key]}
                        onChange={(e) => detail(key, e.target.value)}
                        placeholder={
                          key === "movementResult" ? "Drill and result" : "Example: 6 / 8"
                        }
                      />
                    </Field>
                  ))}
                </div>
              </details>
              <section className="grid gap-4 rounded-xl border border-line bg-white p-4">
                <h2 className="text-2xl">Coach notes &amp; next step</h2>
                {(
                  [
                    ["strengths", "Best skill / possible role"],
                    ["nextLook", "Response to coaching / needs another look"],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <textarea
                      className={control}
                      rows={3}
                      maxLength={1500}
                      value={form.payload[key]}
                      onChange={(e) => detail(key, e.target.value)}
                    />
                  </Field>
                ))}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Recommendation">
                    <select
                      className={control}
                      value={form.recommendation}
                      onChange={(e) =>
                        change({
                          recommendation: e.target.value as EvaluationInput["recommendation"],
                        })
                      }
                    >
                      {Object.entries(RECOMMENDATIONS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Follow-up date">
                    <input
                      className={control}
                      type="date"
                      value={form.payload.followUpDate}
                      onChange={(e) => detail("followUpDate", e.target.value)}
                    />
                  </Field>
                </div>
                <p className="text-sm text-muted">
                  A recommendation does not send an offer, contact a family or change the roster.
                </p>
              </section>
            </fieldset>
            {error ? (
              <p role="alert" className="rounded-lg border border-maroon bg-white p-3 text-maroon">
                {error} Your entries remain on this screen.
              </p>
            ) : null}
            {notice ? (
              <p role="status" className="rounded-lg bg-powder/30 p-3 font-semibold text-navy">
                {notice}
              </p>
            ) : null}
            {!readonly ? (
              <div className="flex flex-wrap gap-3 rounded-xl border border-line bg-white p-4">
                <Button
                  type="button"
                  variant="outlineDark"
                  disabled={saving}
                  onClick={() => void save("draft")}
                >
                  {saving ? "Saving…" : "Save draft"}
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving
                    ? "Saving…"
                    : viewing?.status === "submitted"
                      ? "Update submitted evaluation"
                      : "Submit evaluation"}
                </Button>
                <p className="w-full text-sm text-muted">
                  Saved to the shared club record. Keep this page open until saving is confirmed.
                </p>
              </div>
            ) : null}
          </form>
        </>
      )}
    </div>
  );
}
