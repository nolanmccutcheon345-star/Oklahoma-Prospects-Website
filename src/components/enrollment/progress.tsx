import { useEffect, useState } from "react";
import * as api from "@/lib/enrollment/progress-api";
import type { getEnrollmentHome } from "@/lib/enrollment/enrollment-api";
import type { z } from "zod";
import type { progressInput } from "@/lib/enrollment/progress-contracts";
const field = "mt-1 min-h-11 w-full rounded border border-line bg-white p-2 text-ink";
const button = "min-h-11 rounded border border-line px-4 disabled:opacity-50";
const text = (f: FormData, k: string) => String(f.get(k) || "");
type Progress = Awaited<ReturnType<typeof api.getSeasonProgress>>;
type Home = Awaited<ReturnType<typeof getEnrollmentHome>>;
type Action = z.infer<typeof progressInput>;
export function SeasonProgress({ teamId, playerId }: { teamId: string; playerId: string }) {
  const [data, setData] = useState<Progress>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api
      .getSeasonProgress({ data: { teamId, playerId } })
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [teamId, playerId]);
  async function save(input: Action) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.saveSeasonProgress({ data: input });
      setData(await api.getSeasonProgress({ data: { teamId, playerId } }));
      setNotice("Season progress saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  const key = { teamId, playerId };
  return (
    <section className="grid gap-5 rounded-xl border p-4" aria-label="Season progress">
      <h2 className="text-2xl">Your season: first 30 days and beyond</h2>
      {error && (
        <p role="alert" className="text-maroon">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!data ? (
        <p>Loading season progress…</p>
      ) : (
        <>
          <p>
            Enrollment requirements appear above. Optional media permission is never a checklist
            requirement. Day counts begin when this enrollment record is started.
          </p>
          <h3 className="text-xl">First-30-days checklist</h3>
          <a className="underline" href="/family">
            Open family account for uniform sizes
          </a>
          <ul className="grid gap-2">
            {data.checklist.map((t) => (
              <li className="rounded border p-3" key={t.key}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{t.label}</p>
                    <p className="text-sm">
                      By day {t.day} · {t.dueOn} ·{" "}
                      {t.completed ? "Complete" : t.dueOn < data.today ? "Overdue" : "Pending"} ·{" "}
                      {t.guardian ? "Guardian confirmation" : "Staff confirmation"}
                    </p>
                  </div>
                  {(t.guardian ? data.guardian : data.canManage) && (
                    <button
                      className={button}
                      disabled={busy}
                      onClick={() =>
                        void save({
                          ...key,
                          action: "checklist",
                          task: t.key,
                          complete: !t.completed,
                          revision: t.revision,
                        })
                      }
                    >
                      {t.completed ? "Reopen" : "Confirm completed"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <h3 className="text-xl">Attendance and absence notices</h3>
          <p>
            Planned notices follow your published team standards.{" "}
            {data.rsvpIsNotice
              ? "The account notice counts as direct notice."
              : "Contact the coach directly as well as recording availability."}{" "}
            An acknowledgment confirms receipt; it does not excuse an absence. Emergencies are
            reported as soon as practical, without automatic penalties. Keep medical details in the
            restricted medical form.
          </p>
          {!data.events.length && <p>No scheduled team activities yet.</p>}
          {data.events.map((e) => (
            <details key={e.key} className="rounded border p-3">
              <summary className="min-h-11 cursor-pointer">
                {e.date} · {e.title} · {e.attendance || "Attendance not recorded"}
              </summary>
              <p>
                Planned absence notice due:{" "}
                {new Date(e.noticeDueAt).toLocaleString("en-US", { timeZone: "America/Chicago" })}{" "}
                Central. For events without an exact time, the deadline uses the start of the day.
              </p>
              {e.notice && (
                <p>
                  Availability: {e.notice.availability} ·{" "}
                  {e.notice.acknowledgedAt ? "Received by staff" : "Awaiting staff acknowledgment"}
                  {e.lateNotice ? " · Recorded after planned-notice deadline" : ""}
                  {e.notice.directContact ? " · Direct contact confirmed" : ""}
                </p>
              )}
              {data.guardian && (
                <form
                  key={"notice" + e.notice?.revision}
                  className="my-3 grid gap-3"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    const f = new FormData(ev.currentTarget);
                    void save({
                      ...key,
                      action: "notice",
                      activityKey: e.key,
                      availability: text(f, "availability") as
                        "going" | "absent" | "late" | "early",
                      noticeKind: text(f, "kind") as "planned" | "emergency",
                      directContact: f.get("direct") === "on",
                      revision: e.notice?.revision || 0,
                    });
                  }}
                >
                  <label>
                    Availability
                    <select
                      name="availability"
                      className={field}
                      defaultValue={e.notice?.availability || "going"}
                    >
                      <option value="going">Going</option>
                      <option value="absent">Absent</option>
                      <option value="late">Arriving late</option>
                      <option value="early">Leaving early</option>
                    </select>
                  </label>
                  <label>
                    Notice type
                    <select
                      name="kind"
                      className={field}
                      defaultValue={e.notice?.noticeKind || "planned"}
                    >
                      <option value="planned">Planned</option>
                      <option value="emergency">Unexpected illness or emergency</option>
                    </select>
                  </label>
                  <label className="flex min-h-11 items-center gap-3">
                    <input type="checkbox" name="direct" defaultChecked={e.notice?.directContact} />
                    I contacted the coach directly.
                  </label>
                  <button className={button} disabled={busy}>
                    Save availability
                  </button>
                </form>
              )}
              {data.canManage && (
                <div className="my-3 grid gap-3">
                  {e.notice && !e.notice.acknowledgedAt && (
                    <button
                      className={button}
                      disabled={busy}
                      onClick={() =>
                        void save({
                          ...key,
                          action: "acknowledge",
                          activityKey: e.key,
                          revision: e.notice!.revision,
                        })
                      }
                    >
                      Acknowledge receipt
                    </button>
                  )}
                  <form
                    className="grid gap-2"
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      const f = new FormData(ev.currentTarget);
                      void save({
                        ...key,
                        action: "attendance",
                        activityKey: e.key,
                        status: text(f, "status") as "present" | "late" | "excused" | "absent",
                        expected: e.attendance as "" | "present" | "late" | "excused" | "absent",
                      });
                    }}
                  >
                    <label>
                      Observed attendance
                      <select className={field} name="status" required defaultValue={e.attendance}>
                        <option value="">Choose attendance</option>
                        {["present", "late", "excused", "absent"].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <button className={button} disabled={busy || e.date > data.today}>
                      Record attendance
                    </button>
                  </form>
                </div>
              )}
            </details>
          ))}
          <h3 className="text-xl">Development checkpoints</h3>
          <p>
            A preseason baseline is recommended, with a day-14 onboarding target. Minimum:{" "}
            {data.requiredUpdates} in-season update(s) and a final evaluation. Completed in-season:{" "}
            {data.checkpoints.filter((c) => c.kind === "in-season" && c.completedOn).length}; final:{" "}
            {data.checkpoints.some((c) => c.kind === "final" && c.completedOn)
              ? "complete"
              : "pending"}
            . Checkpoints do not automatically complete lessons, assessments or development
            assignments.
          </p>
          {!data.athleteLinked && (
            <p>
              Staff must link this roster athlete in the existing development workspace before
              recording a checkpoint.
            </p>
          )}
          {data.checkpoints.map((c) => (
            <details className="rounded border p-3" key={c.id + ":" + c.revision}>
              <summary className="min-h-11 cursor-pointer">
                {c.kind} · due {c.dueOn} ·{" "}
                {c.completedOn
                  ? "completed " + c.completedOn
                  : c.dueOn < data.today
                    ? "overdue"
                    : "planned"}
              </summary>
              {c.feedback && <p className="whitespace-pre-wrap">{c.feedback}</p>}
              {data.canEvaluate && (
                <CheckpointForm data={data} record={c} identity={key} busy={busy} save={save} />
              )}
            </details>
          ))}
          {data.canEvaluate && data.athleteLinked && (
            <details className="rounded border p-3">
              <summary className="min-h-11 cursor-pointer">Plan or record a checkpoint</summary>
              <CheckpointForm data={data} identity={key} busy={busy} save={save} />
            </details>
          )}
          {data.canSeeTravel && (
            <details className="rounded border p-3">
              <summary className="min-h-11 cursor-pointer">Travel and supervision contact</summary>
              <p>
                Outside official activities, guardians arrange supervision. This records permission
                for a responsible adult; it does not transfer custody or replace team supervision
                duties.
              </p>
              {data.travel && (
                <p>
                  {data.travel.adultName} · {data.travel.adultPhone}
                </p>
              )}
              {data.guardian && (
                <form
                  key={data.travel?.revision}
                  className="grid gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void save({
                      ...key,
                      action: "travel",
                      adultName: text(f, "name"),
                      adultPhone: text(f, "phone"),
                      adultAtLeast18: true,
                      guardianAuthorization: true,
                      revision: data.travel?.revision || 0,
                    });
                  }}
                >
                  <label>
                    Authorized adult
                    <input
                      className={field}
                      name="name"
                      required
                      minLength={3}
                      defaultValue={data.travel?.adultName}
                    />
                  </label>
                  <label>
                    Contact phone
                    <input
                      className={field}
                      name="phone"
                      type="tel"
                      required
                      minLength={7}
                      defaultValue={data.travel?.adultPhone}
                    />
                  </label>
                  <label className="flex min-h-11 items-center gap-3">
                    <input type="checkbox" required />I am the legal guardian, authorize this adult
                    to supervise outside official activities, and confirm they are at least 18.
                  </label>
                  <button className={button} disabled={busy}>
                    Save travel contact
                  </button>
                </form>
              )}
            </details>
          )}
        </>
      )}
    </section>
  );
}
function CheckpointForm({
  data,
  record,
  identity,
  busy,
  save,
}: {
  data: Progress;
  record?: Progress["checkpoints"][number];
  identity: { teamId: string; playerId: string };
  busy: boolean;
  save: (i: Action) => Promise<void>;
}) {
  return (
    <form
      className="grid gap-3 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void save({
          ...identity,
          action: "checkpoint",
          id: record?.id || "",
          revision: record?.revision || 0,
          kind: text(f, "kind") as "baseline" | "in-season" | "final",
          dueOn: text(f, "due"),
          completedOn: text(f, "completed"),
          feedback: text(f, "feedback"),
          assessmentId: text(f, "assessment"),
        });
      }}
    >
      <label>
        Checkpoint
        <select className={field} name="kind" defaultValue={record?.kind || "baseline"}>
          <option value="baseline">Baseline (recommended)</option>
          <option value="in-season">In-season update</option>
          <option value="final">Final evaluation</option>
        </select>
      </label>
      <label>
        Due date
        <input className={field} name="due" type="date" required defaultValue={record?.dueOn} />
      </label>
      <label>
        Completion date (leave empty while planned)
        <input
          className={field}
          name="completed"
          type="date"
          max={data.today}
          defaultValue={record?.completedOn || ""}
        />
      </label>
      <label>
        Observed progress and next steps
        <textarea
          className={field}
          name="feedback"
          rows={4}
          maxLength={8000}
          defaultValue={record?.feedback}
        />
      </label>
      <label>
        Related completed assessment (optional)
        <select className={field} name="assessment" defaultValue={record?.assessmentId || ""}>
          <option value="">No linked assessment</option>
          {data.assessments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.discipline} · {a.completedOn}
            </option>
          ))}
        </select>
      </label>
      <button className={button} disabled={busy}>
        Save checkpoint
      </button>
    </form>
  );
}
export function OrganizationRollout({
  home,
  busy,
  run,
}: {
  home: Home;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const enabled = home.settings.mode === "organization" && home.settings.allTeamsEnabled;
  return (
    <details className="rounded-xl border p-4">
      <summary className="min-h-11 cursor-pointer font-semibold">
        Organization enrollment controls
      </summary>
      <p className="my-3">
        {enabled ? "Organization-wide enrollment is open." : "Organization enrollment is paused."}{" "}
        No pilot or 30-day waiting period is required. The first-month checklist remains part of
        each athlete’s onboarding.
      </p>
      <p className="my-3">
        Published organization team standards apply unless a team has its own published addendum.
        Families still complete their own signatures, emergency information, annual requirements and
        verified financial steps.
      </p>
      <button
        className={button}
        disabled={busy}
        onClick={() =>
          run(() =>
            api.enableOrganizationEnrollment({
              data: {
                revision: home.settings.revision,
                enabled: !enabled,
                evidence: enabled
                  ? "Owner paused organization enrollment through enrollment settings."
                  : "Owner authorized direct organization-wide enrollment through enrollment settings; no pilot is required.",
              },
            }),
          )
        }
      >
        {enabled ? "Pause organization signatures" : "Enable organization enrollment"}
      </button>
      <h3 className="mt-5 text-xl">Team signature controls</h3>
      {home.teams.map((t) => {
        const p = [...home.pilots, ...home.additionalTeams].find((p) => p.teamId === t.id);
        return (
          <details key={t.id + ":" + p?.revision} className="my-3 rounded border p-3">
            <summary className="min-h-11 cursor-pointer">
              {t.name} · {enabled && p?.signaturesOpen ? "signatures open" : "paused"}
            </summary>
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(() =>
                  api.setAdditionalEnrollmentTeam({
                    data: {
                      teamId: t.id,
                      seasonKey: text(f, "season"),
                      signaturesOpen: f.get("open") === "on",
                      revision: p?.revision || 0,
                    },
                  }),
                );
              }}
            >
              <label>
                Enrollment season
                <input
                  name="season"
                  className={field}
                  required
                  readOnly={Boolean(p)}
                  defaultValue={p?.seasonKey || t.season || "2027"}
                />
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <input name="open" type="checkbox" defaultChecked={p?.signaturesOpen} />
                Open this team’s signatures
              </label>
              <button className={button} disabled={busy || !enabled}>
                Save team enrollment
              </button>
            </form>
          </details>
        );
      })}
    </details>
  );
}
