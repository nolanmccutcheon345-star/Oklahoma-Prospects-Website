import {
  concussionFacts,
  concussionResources,
  CONCUSSION_ACKNOWLEDGMENT,
} from "@/lib/enrollment/organization-policy";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import * as api from "@/lib/enrollment/enrollment-api";
import { SIGNATURE_STATEMENT, MEDIA_STATEMENT } from "@/lib/enrollment/enrollment-contracts";
import { SeasonProgress, OrganizationRollout } from "./progress";
import { HandbookReader } from "./handbook-reader";
import { TeamFeeWorkspace } from "../teams/fee-workspace";

export const enrollmentField =
  "mt-1 min-h-11 w-full rounded border border-line bg-white p-2 text-ink";
type Home = Awaited<ReturnType<typeof api.getEnrollmentHome>>;
type Case = Awaited<ReturnType<typeof api.getEnrollmentCase>>;
const text = (f: FormData, k: string) => String(f.get(k) || "");
export function EnrollmentWorkspace() {
  const [home, setHome] = useState<Home>(),
    [selected, setSelected] = useState(""),
    [data, setData] = useState<Case>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const loadHome = () => api.getEnrollmentHome().then(setHome);
  useEffect(() => {
    loadHome().catch((e) => setError(e.message));
  }, []);
  const candidate = home?.candidates.find((p) => p.teamId + ":" + p.playerId === selected);
  const candidateTeamId = candidate?.teamId,
    candidatePlayerId = candidate?.playerId;
  async function refresh() {
    if (candidate)
      setData(
        await api.getEnrollmentCase({
          data: { teamId: candidate.teamId, playerId: candidate.playerId },
        }),
      );
  }
  useEffect(() => {
    let active = true;
    setData(undefined);
    setError("");
    if (candidateTeamId && candidatePlayerId)
      api
        .getEnrollmentCase({ data: { teamId: candidateTeamId, playerId: candidatePlayerId } })
        .then((v) => {
          if (active) setData(v);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [candidateTeamId, candidatePlayerId]);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await loadHome();
      await refresh();
      setNotice("Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-5">
      {error && (
        <p role="alert" className="rounded border border-maroon p-3">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!home ? (
        <p>Loading your authorized teams…</p>
      ) : (
        <>
          <p className="rounded-xl bg-paper-2 p-4">
            {home.settings.mode === "pilot"
              ? "Organization enrollment has not been enabled."
              : home.settings.allTeamsEnabled
                ? "Organization-wide enrollment is open."
                : "Organization enrollment is paused."}{" "}
            Your existing team, booking and account services remain available.
          </p>
          {home.owner && <PilotSettings home={home} busy={busy} run={run} />}
          <label>
            Athlete and season
            <select
              className={enrollmentField}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Choose an athlete</option>
              {home.candidates.map((p) => (
                <option key={p.teamId + ":" + p.playerId} value={p.teamId + ":" + p.playerId}>
                  {p.playerName} · {home.teams.find((t) => t.id === p.teamId)?.name}
                </option>
              ))}
            </select>
          </label>
          {!home.candidates.length && (
            <p>
              No team enrollment is assigned to your account yet.{" "}
              <a href="/family" className="underline">
                Open your family account
              </a>
              .
            </p>
          )}
          {data && (
            <CaseWorkspace
              key={"case:" + data.summary.id}
              data={data}
              busy={busy}
              run={run}
              refresh={refresh}
            />
          )}
          {data && (
            <SeasonProgress
              key={"progress:" + data.summary.id}
              teamId={data.summary.teamId}
              playerId={data.summary.playerId}
            />
          )}
          {home.owner && <OrganizationRollout home={home} busy={busy} run={run} />}
          {home.owner && <SafetyInbox />}
        </>
      )}
    </div>
  );
}
function PilotSettings({
  home,
  busy,
  run,
}: {
  home: Home;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <details className="rounded-xl border p-4">
      <summary className="min-h-11 cursor-pointer font-semibold">
        Safety contacts and emergency-response plan
      </summary>
      <p className="my-3">
        These contacts are configured for nonurgent safety concerns. Use 911 for emergencies and
        Oklahoma’s 1-800-522-3511 hotline for suspected child abuse. A concern involving an owner
        goes to the other owner.
      </p>
      <a href="/handbooks" className="inline-flex min-h-11 items-center underline">
        Edit handbook and team standards
      </a>
      <form
        key={"contacts:" + home.settings.revision}
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(() =>
            api.setEnrollmentContacts({
              data: {
                revision: home.settings.revision,
                safetyName: text(f, "safetyName"),
                safetyContact: text(f, "safetyContact"),
                alternateName: text(f, "alternateName"),
                alternateContact: text(f, "alternateContact"),
                emergencyPlanReference: text(f, "emergencyPlanReference"),
              },
            }),
          );
        }}
      >
        {(
          [
            "safetyName",
            "safetyContact",
            "alternateName",
            "alternateContact",
            "emergencyPlanReference",
          ] as const
        ).map((k) => (
          <label key={k}>
            {
              {
                safetyName: "Safety contact name",
                safetyContact: "Reachable phone / email",
                alternateName: "Alternate safety contact",
                alternateContact: "Alternate phone / email",
                emergencyPlanReference: "Emergency-response plan reference",
              }[k]
            }
            <input required name={k} defaultValue={home.settings[k]} className={enrollmentField} />
          </label>
        ))}
        <button disabled={busy} className="min-h-11 rounded border px-4">
          Save safety contacts
        </button>
      </form>
    </details>
  );
}
function CaseWorkspace({
  data,
  busy,
  run,
  refresh,
}: {
  data: Case;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  refresh: () => Promise<void>;
}) {
  const s = data.summary,
    ids = useMemo(() => ({ teamId: s.teamId, playerId: s.playerId }), [s.teamId, s.playerId]);
  return (
    <div className="grid gap-5">
      <section className="rounded-2xl bg-ink p-5 text-white">
        <p className="text-powder">{s.seasonKey}</p>
        <h2 className="text-3xl">{s.playerName} · Your season</h2>
        <p className="mt-3">
          {s.clearedAt && s.waiverCurrent ? "Owner clearance on file" : "Enrollment steps remain"}
        </p>
        <p className="mt-2 text-sm">
          Handbook acknowledgment, payment and participation clearance are separate records.
        </p>
      </section>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Packet", s.packetSigned],
          ["Emergency information", s.medicalComplete],
          ["Annual waiver", s.waiverCurrent],
          ["Annual concussion acknowledgment", s.concussionCurrent],
        ].map(([label, done]) => (
          <li key={String(label)} className="rounded-xl border p-3">
            <strong>{label}</strong>
            <p>{done ? "On file" : "Needs attention"}</p>
          </li>
        ))}
      </ol>
      {s.acknowledgmentUpdate && (
        <p className="rounded border p-3">
          A newer packet is available. Your previously signed version remains preserved below; new
          acknowledgment does not rewrite your financial agreement.
        </p>
      )}
      {data.concussionAcknowledgments.length > 0 && (
        <details className="rounded-xl border p-4">
          <summary className="min-h-11 cursor-pointer font-semibold">
            Annual concussion acknowledgment history
          </summary>
          {data.concussionAcknowledgments.map((a) => (
            <article key={a.id} className="my-4 grid gap-2">
              <p>
                Guardian: {a.guardianName} · Athlete: {a.athleteName} ·{" "}
                {new Date(a.acknowledgedAt).toLocaleDateString()}
              </p>
              <p>{a.statement}</p>
              {a.materials.facts.map((f) => (
                <p key={f}>{f}</p>
              ))}
            </article>
          ))}
        </details>
      )}
      <details className="rounded-xl border p-4" open>
        <summary className="min-h-11 cursor-pointer text-xl font-semibold">
          1. Review your handbook and team standards
        </summary>
        <HandbookReader documents={data.packet.documents} />
        {!data.packet.ready && (
          <ul className="my-3 list-disc pl-5">
            {data.packet.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
        {!data.pilot.signaturesOpen && (
          <p className="my-3">The office has paused enrollment signatures for this team.</p>
        )}
        {s.guardian && data.packet.ready && data.pilot.signaturesOpen && (
          <form
            className="mt-5 grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(() =>
                api.signEnrollmentPacket({
                  data: {
                    ...ids,
                    packetDigest: data.packet.digest,
                    signerName: text(f, "name"),
                    guardian: true,
                    electronicConsent: true,
                    conductDiscussed: true,
                    medicalAuthorization: true,
                    concussionAcknowledged: true,
                    athleteAcknowledged: true,
                    athleteSignerName: text(f, "athleteName"),
                  },
                }),
              );
            }}
          >
            <section className="grid gap-3 rounded border p-4">
              <h3 className="text-xl">Annual concussion information — athlete and guardian</h3>
              {concussionFacts.map((fact) => (
                <p key={fact}>{fact}</p>
              ))}
              {concussionResources.map((resource) => (
                <a
                  key={resource.url}
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {resource.label}
                </a>
              ))}
              <p>{CONCUSSION_ACKNOWLEDGMENT}</p>
              <label>
                Athlete’s name — entered for their acknowledgment
                <input name="athleteName" required maxLength={150} className={enrollmentField} />
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" required />
                The athlete has reviewed or heard the information and gives their acknowledgment,
                with age-appropriate assistance if needed.
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" required />
                As guardian, I received and reviewed the concussion information and understand the
                reporting and return requirements.
              </label>
            </section>
            <p>{SIGNATURE_STATEMENT}</p>
            <label>
              Guardian’s full legal name
              <input required minLength={3} name="name" className={enrollmentField} />
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input required type="checkbox" />I am the legal guardian and consent to electronic
              signature and records.
            </label>
            {data.packet.documents.map((d) => (
              <label key={d.documentId} className="flex min-h-11 items-center gap-3">
                <input required type="checkbox" />I have read {d.content.title}, version {d.version}
                {d.kind === "medical" ? ", and give the medical authorization described above" : ""}
                .
              </label>
            ))}
            <label className="flex min-h-11 items-center gap-3">
              <input required type="checkbox" />I discussed player conduct expectations with my
              athlete.
            </label>
            <button disabled={busy} className="min-h-11 rounded bg-ink px-4 text-white">
              Sign this packet
            </button>
          </form>
        )}
      </details>
      {(s.guardian || data.owner) && (
        <MedicalForm ids={ids} editable={s.guardian} busy={busy} run={run} />
      )}
      <section className="rounded-xl border p-4">
        <h3 className="text-xl">Annual waiver</h3>
        <p>
          {s.athleteLinked
            ? "Use your existing annual facility waiver."
            : "The office must link this roster athlete to the existing athlete record before waiver status can be verified."}
        </p>
        <a href="/waiver" className="inline-flex min-h-11 items-center underline">
          Review or sign annual waiver
        </a>
      </section>
      {data.canViewFinancial && (
        <section className="rounded-xl border p-4">
          <h3 className="text-xl">3. Your published fee and payment</h3>
          <p className="my-3">
            Review your actual season total, due dates and optional access here. The signed
            financial offer controls these amounts.
          </p>
          <TeamFeeWorkspace teamId={s.teamId} />
          <FinancialReadiness ids={ids} owner={data.owner} busy={busy} run={run} />
        </section>
      )}
      {s.guardian && <MediaForm ids={ids} busy={busy} run={run} />}
      {data.signatures.length > 0 && (
        <details className="rounded-xl border p-4">
          <summary className="min-h-11 cursor-pointer font-semibold">Your signed copies</summary>
          {data.signatures.map((v) => (
            <section key={v.id} className="my-5">
              <p>
                Signed by {v.signerName} ·{" "}
                {new Date(v.signedAt).toLocaleString("en-US", { timeZone: "America/Chicago" })}{" "}
                Central
              </p>
              <p className="my-3 text-sm">{v.statement}</p>
              <HandbookReader documents={v.packet} />
            </section>
          ))}
        </details>
      )}
      <SafetyForm ids={ids} settings={data.settings} busy={busy} run={run} />
      <button className="min-h-11 rounded border px-4" onClick={() => run(refresh)} disabled={busy}>
        Refresh verified status
      </button>
    </div>
  );
}
function MedicalForm({
  ids,
  editable,
  busy,
  run,
}: {
  ids: { teamId: string; playerId: string };
  editable: boolean;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [record, setRecord] = useState<Awaited<ReturnType<typeof api.getEnrollmentMedical>>>(),
    [error, setError] = useState("");
  useEffect(() => {
    api
      .getEnrollmentMedical({ data: ids })
      .then(setRecord)
      .catch((e) => setError(e.message));
  }, [ids]);
  return (
    <details className="rounded-xl border p-4">
      <summary className="min-h-11 cursor-pointer text-xl font-semibold">
        2. Private emergency and medical information
      </summary>
      <p>
        Visible to your linked guardian and authorized owners. Routine coordinator and coach screens
        receive completion status only.
      </p>
      {error && <p role="alert">{error}</p>}
      {record !== undefined && (
        <form
          key={record?.revision ?? "new"}
          className="mt-4 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(async () => {
              await api.saveEnrollmentMedical({
                data: {
                  ...ids,
                  revision: record?.revision || 0,
                  emergencyName: text(f, "emergencyName"),
                  emergencyPhone: text(f, "emergencyPhone"),
                  medicalAlerts: text(f, "medicalAlerts"),
                  restrictions: text(f, "restrictions"),
                  accuracyConfirmed: true,
                },
              });
              setRecord(await api.getEnrollmentMedical({ data: ids }));
            });
          }}
        >
          {(["emergencyName", "emergencyPhone", "medicalAlerts", "restrictions"] as const).map(
            (k) => (
              <label key={k}>
                {
                  {
                    emergencyName: "Emergency contact name",
                    emergencyPhone: "Emergency phone",
                    medicalAlerts: "Relevant medical alerts",
                    restrictions: "Current activity restrictions",
                  }[k]
                }
                <textarea
                  rows={k === "medicalAlerts" || k === "restrictions" ? 3 : 1}
                  required={k === "emergencyName" || k === "emergencyPhone"}
                  disabled={!editable}
                  name={k}
                  defaultValue={record?.payload[k] || ""}
                  className={enrollmentField}
                />
              </label>
            ),
          )}
          {editable && (
            <>
              <label className="flex min-h-11 items-center gap-3">
                <input required type="checkbox" />
                This information is accurate and I will report changes.
              </label>
              <button disabled={busy} className="min-h-11 rounded border px-4">
                Save private information
              </button>
            </>
          )}
        </form>
      )}
    </details>
  );
}
function FinancialReadiness({
  ids,
  owner,
  busy,
  run,
}: {
  ids: { teamId: string; playerId: string };
  owner: boolean;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getEnrollmentFinance>>>(),
    [error, setError] = useState("");
  useEffect(() => {
    api
      .getEnrollmentFinance({ data: ids })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [ids, busy]);
  return (
    <div className="mt-4 grid gap-3">
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>
            Financial agreement: {data.agreementSigned ? "accepted" : "not yet accepted"}. Deposit
            requirement:{" "}
            {data.depositSatisfied
              ? "satisfied by verified Square funds / approved credits"
              : "awaiting verified funds or owner financial review"}
            .
          </p>
          <p className="text-sm">
            This status excludes unverified or sandbox payments. Refunds reduce the verified amount.
            A payment-return page alone cannot confirm payment.
          </p>
        </>
      )}
      {owner && (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(() =>
              api.approveEnrollment({
                data: {
                  ...ids,
                  reason: text(f, "reason"),
                  medicalReviewed: true,
                  staffSafetyReviewed: true,
                },
              }),
            );
          }}
        >
          <label>
            Clearance review note
            <input required minLength={10} name="reason" className={enrollmentField} />
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input required type="checkbox" />I reviewed the private medical information and
            applicable participation restrictions.
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input required type="checkbox" />I checked current annual concussion training, required
            safeguarding records for team officials, and the venue emergency arrangements.
            Enrollment activation does not complete these requirements.
          </label>
          <button disabled={busy} className="min-h-11 rounded bg-ink px-4 text-white">
            Record owner participation clearance
          </button>
        </form>
      )}
    </div>
  );
}
function MediaForm({
  ids,
  busy,
  run,
}: {
  ids: { teamId: string; playerId: string };
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [choice, setChoice] = useState<Awaited<ReturnType<typeof api.getEnrollmentMedia>>>(),
    [error, setError] = useState("");
  useEffect(() => {
    api
      .getEnrollmentMedia({ data: ids })
      .then(setChoice)
      .catch((e) => setError(e.message));
  }, [ids, busy]);
  return (
    <details className="rounded-xl border p-4">
      <summary className="min-h-11 cursor-pointer font-semibold">
        Optional photos and video permission
      </summary>
      <p>{MEDIA_STATEMENT}</p>
      {error && <p role="alert">{error}</p>}
      <p className="my-3">
        Current choice: {choice?.consent ? "permission recorded" : "no permission recorded"}. This
        never blocks enrollment.
      </p>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(() =>
            api.saveEnrollmentMedia({
              data: { ...ids, consent: text(f, "choice") === "yes", signerName: text(f, "name") },
            }),
          );
        }}
      >
        <label>
          Your legal name
          <input required minLength={3} name="name" className={enrollmentField} />
        </label>
        <label>
          Your choice
          <select name="choice" className={enrollmentField} defaultValue="no">
            <option value="no">Decline / withdraw future permission</option>
            <option value="yes">Give optional permission</option>
          </select>
        </label>
        <button disabled={busy} className="min-h-11 rounded border px-4">
          Save media choice
        </button>
      </form>
      <a href="/family" className="mt-3 inline-flex min-h-11 items-center underline">
        Manage separate public roster permission
      </a>
    </details>
  );
}
function SafetyForm({
  ids,
  settings,
  busy,
  run,
}: {
  ids: { teamId: string; playerId: string };
  settings: Home["settings"];
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <details className="rounded-xl border p-4">
      <summary className="min-h-11 cursor-pointer font-semibold">Report a safety concern</summary>
      <p>
        For immediate danger, contact emergency services. This form is not continuously monitored
        and does not replace reporting to appropriate authorities. Safety concerns bypass the
        24-hour cooling-off rule.
      </p>
      <p className="my-3">
        {settings.safetyName}: {settings.safetyContact || "Contact the academy"}. Alternate:{" "}
        {settings.alternateName}: {settings.alternateContact || "Contact ownership"}.
      </p>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(() =>
            api.submitEnrollmentSafety({
              data: {
                ...ids,
                concerning: text(f, "concerning") as "other" | "steve" | "nolan",
                body: text(f, "body"),
              },
            }),
          );
        }}
      >
        <label>
          Route this report
          <select name="concerning" className={enrollmentField}>
            <option value="other">Organization safety contact</option>
            <option value="steve">Concern involving Steve — route to alternate</option>
            <option value="nolan">Concern involving Nolan — route to Steve</option>
          </select>
        </label>
        <label>
          Concern
          <textarea name="body" required minLength={10} rows={5} className={enrollmentField} />
        </label>
        <button disabled={busy} className="min-h-11 rounded border px-4">
          Submit restricted report
        </button>
      </form>
    </details>
  );
}
function SafetyInbox() {
  const [reports, setReports] = useState<Awaited<ReturnType<typeof api.getEnrollmentSafety>>>(),
    [error, setError] = useState("");
  async function load() {
    try {
      setReports(await api.getEnrollmentSafety());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unavailable");
    }
  }
  return (
    <details className="rounded-xl border p-4">
      <summary className="min-h-11 cursor-pointer font-semibold">
        Owner restricted safety inbox
      </summary>
      <button className="min-h-11 underline" onClick={load}>
        Load restricted reports
      </button>
      {error && <p role="alert">{error}</p>}
      {reports?.map((r) => (
        <article key={r.id} className="my-3 rounded border p-4">
          <p>
            {r.createdAt} · {r.status}
          </p>
          <p className="my-3 whitespace-pre-line">{r.body}</p>
          <p>{r.response}</p>
          <form
            onSubmit={async (e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await api.respondEnrollmentSafety({
                  data: {
                    reportId: r.id,
                    status: text(f, "status") as "reviewing" | "closed",
                    response: text(f, "response"),
                  },
                });
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not save");
              }
            }}
          >
            <label>
              Response / action
              <textarea required minLength={10} name="response" className={enrollmentField} />
            </label>
            <label>
              Status
              <select name="status" className={enrollmentField}>
                <option value="reviewing">Reviewing</option>
                <option value="closed">Closed</option>
              </select>
            </label>
            <button className="min-h-11 underline">Record response</button>
          </form>
        </article>
      ))}
    </details>
  );
}
