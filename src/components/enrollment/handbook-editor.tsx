import { useEffect, useState, type FormEvent } from "react";
import {
  getHandbookWorkspace,
  prepareHandbookDrafts,
  saveHandbookDocument,
  saveStandards,
} from "@/lib/enrollment/api";
import {
  defaultStandards,
  emptyReview,
  type HandbookVersion,
  type HandbookWorkspace,
} from "@/lib/enrollment/contracts";
import { HandbookReader } from "./handbook-reader";
const field = "mt-1 min-h-11 w-full rounded border border-line bg-white p-2 text-ink";
export function HandbookEditor() {
  const [data, setData] = useState<HandbookWorkspace>(),
    [selected, setSelected] = useState("academy-2027"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () => getHandbookWorkspace().then(setData);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function work(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
      setNotice("Saved. Published versions remain preserved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  const documents = data?.documents.filter((d) => d.documentId === selected) || [],
    latest = documents[0];
  return (
    <div className="grid gap-5">
      <p>
        Organization standards apply to every team. Coaches prepare team addenda; an owner approves
        publication. Legal and insurance review is recorded separately before enrollment signatures
        can open.
      </p>
      {error && (
        <p role="alert" className="rounded border border-maroon p-3">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!data ? (
        <p role="status">Loading authorized handbook access…</p>
      ) : (
        <>
          {data.owner && (
            <button
              disabled={busy}
              className="min-h-11 rounded border px-4"
              onClick={() => work(() => prepareHandbookDrafts())}
            >
              Prepare 2027 drafts from the policy framework
            </button>
          )}
          <label>
            Handbook or team
            <select
              className={field}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="academy-2027">Organization handbook</option>
              <option value="baseball-2027">Baseball supplement</option>
              <option value="softball-2027">Softball supplement</option>
              <option value="medical-2027">Emergency medical authorization</option>
              {data.teams.map((t) => (
                <option key={t.id} value={"team:" + t.id}>
                  {t.name} — {t.season}
                </option>
              ))}
            </select>
          </label>
          {selected.startsWith("team:") ? (
            (() => {
              const team = data.teams.find((t) => "team:" + t.id === selected);
              return team?.canDraft ? (
                <StandardsForm
                  key={selected + ":" + latest?.version + ":" + latest?.revision}
                  teamId={team.id}
                  latest={latest}
                  owner={data.owner}
                  busy={busy}
                  run={work}
                />
              ) : null;
            })()
          ) : data.owner && latest ? (
            <DocumentForm
              key={selected + ":" + latest.version + ":" + latest.revision}
              latest={latest}
              busy={busy}
              run={work}
            />
          ) : null}
          <details>
            <summary className="min-h-11 cursor-pointer py-3 font-semibold">
              Preview and version history ({documents.length})
            </summary>
            <HandbookReader documents={documents} />
          </details>
        </>
      )}
    </div>
  );
}
function DocumentForm({
  latest,
  busy,
  run,
}: {
  latest: HandbookVersion;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [content, setContent] = useState(latest.content),
    [review, setReview] = useState(
      latest.status === "published" ? emptyReview : { ...emptyReview, ...latest.review },
    ),
    [effectiveOn, setEffectiveOn] = useState(latest.effectiveOn);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const action =
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "publish"
        ? "publish"
        : "draft";
    const reviewConfirmed = new FormData(e.currentTarget).get("reviewConfirmed") === "on";
    void run(() =>
      saveHandbookDocument({
        data: {
          documentId: latest.documentId,
          version: latest.version,
          revision: latest.revision,
          action,
          effectiveOn,
          content,
          review,
          reviewConfirmed,
        },
      }),
    );
  }
  return (
    <form onSubmit={submit} className="grid gap-4 rounded-2xl bg-paper-2 p-5">
      <h2 className="text-2xl">
        {latest.status === "published" ? "Create the next version" : "Edit draft"}
      </h2>
      <label>
        Title
        <input
          required
          className={field}
          value={content.title}
          onChange={(e) => setContent({ ...content, title: e.target.value })}
        />
      </label>
      <label>
        Effective date
        <input
          type="date"
          required
          className={field}
          value={effectiveOn}
          onChange={(e) => setEffectiveOn(e.target.value)}
        />
      </label>
      {content.sections.map((s, i) => (
        <details key={i}>
          <summary className="min-h-11 cursor-pointer py-3">{s.title}</summary>
          <label>
            Section title
            <input
              required
              className={field}
              value={s.title}
              onChange={(e) =>
                setContent({
                  ...content,
                  sections: content.sections.map((x, j) =>
                    j === i ? { ...x, title: e.target.value } : x,
                  ),
                })
              }
            />
          </label>
          <label>
            Policy text
            <textarea
              required
              rows={7}
              className={field}
              value={s.body}
              onChange={(e) =>
                setContent({
                  ...content,
                  sections: content.sections.map((x, j) =>
                    j === i ? { ...x, body: e.target.value } : x,
                  ),
                })
              }
            />
          </label>
          <button
            type="button"
            className="min-h-11 underline"
            disabled={content.sections.length === 1}
            onClick={() =>
              setContent({ ...content, sections: content.sections.filter((_, j) => j !== i) })
            }
          >
            Remove section
          </button>
        </details>
      ))}
      <button
        type="button"
        className="min-h-11 underline"
        onClick={() =>
          setContent({
            ...content,
            sections: [...content.sections, { title: "New section", body: "" }],
          })
        }
      >
        Add section
      </button>
      <fieldset className="grid gap-3 rounded border p-4">
        <legend>Review evidence — record completed reviews only</legend>
        {(
          [
            "legalReviewer",
            "legalReviewedOn",
            "insuranceReviewer",
            "insuranceReviewedOn",
            "reviewReference",
          ] as const
        ).map((k) => (
          <label key={k}>
            {
              {
                legalReviewer: "Legal reviewer",
                legalReviewedOn: "Legal review date",
                insuranceReviewer: "Insurance reviewer",
                insuranceReviewedOn: "Insurance review date",
                reviewReference: "Review reference / approval record",
              }[k]
            }
            <input
              type={k.endsWith("On") ? "date" : "text"}
              className={field}
              value={review[k]}
              onChange={(e) => setReview({ ...review, [k]: e.target.value })}
            />
          </label>
        ))}
      </fieldset>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="reviewConfirmed" />
        The review evidence above covers this exact text and effective date.
      </label>
      <p className="text-sm">
        Publishing creates an immutable policy version. It does not change prices, charge families,
        or open enrollment signatures. Changes to reviewed text require review of the new version.
      </p>
      <div className="flex flex-wrap gap-3">
        <button disabled={busy} value="draft" className="min-h-11 rounded border px-4">
          Save draft
        </button>
        <button disabled={busy} value="publish" className="min-h-11 rounded bg-ink px-4 text-white">
          Publish version
        </button>
      </div>
    </form>
  );
}
function StandardsForm({
  teamId,
  latest,
  owner,
  busy,
  run,
}: {
  teamId: string;
  latest?: HandbookVersion;
  owner: boolean;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [s, setS] = useState(latest?.standards || defaultStandards),
    [date, setDate] = useState(latest?.effectiveOn || "2027-01-01");
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const action =
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "publish"
        ? "publish"
        : "draft";
    void run(() =>
      saveStandards({
        data: {
          teamId,
          version: latest?.version || 0,
          revision: latest?.revision || 0,
          action,
          effectiveOn: date,
          standards: s,
        },
      }),
    );
  }
  return (
    <form onSubmit={submit} className="grid gap-4 rounded-2xl bg-paper-2 p-5">
      <h2 className="text-2xl">Team standards</h2>
      <label>
        Effective date
        <input
          required
          type="date"
          className={field}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <label>
        Team designation
        <select
          className={field}
          value={s.designation}
          onChange={(e) => setS({ ...s, designation: e.target.value as typeof s.designation })}
        >
          <option value="developmental">Developmental</option>
          <option value="competitive">Competitive</option>
        </select>
      </label>
      {(
        [
          "playingTime",
          "practiceExpectations",
          "tournamentCommitment",
          "evaluationMethod",
          "communicationChannel",
        ] as const
      ).map((k) => (
        <label key={k}>
          {
            {
              playingTime: "Playing time and positions",
              practiceExpectations: "Practice expectations",
              tournamentCommitment: "Tournament commitment",
              evaluationMethod: "How development is evaluated",
              communicationChannel: "Approved communication channel",
            }[k]
          }
          <textarea
            required
            rows={3}
            className={field}
            value={s[k]}
            onChange={(e) => setS({ ...s, [k]: e.target.value })}
          />
        </label>
      ))}
      <div className="grid gap-3 sm:grid-cols-3">
        {(["practiceNoticeHours", "tournamentNoticeDays", "inSeasonUpdates"] as const).map((k) => (
          <label key={k}>
            {
              {
                practiceNoticeHours: "Practice notice (hours)",
                tournamentNoticeDays: "Tournament notice (days)",
                inSeasonUpdates: "In-season updates",
              }[k]
            }
            <input
              required
              type="number"
              min={k === "practiceNoticeHours" ? 48 : k === "tournamentNoticeDays" ? 14 : 1}
              className={field}
              value={s[k]}
              onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={s.rsvpIsNotice}
          onChange={(e) => setS({ ...s, rsvpIsNotice: e.target.checked })}
        />
        An account absence notice counts as direct notice to this coach.
      </label>
      <p className="text-sm">
        A final evaluation is required. Emergency exceptions, medical restrictions, organization
        safety rules and the 48-hour routine communication standard always apply. Fees stay in the
        separate published financial agreement.
      </p>
      <div className="flex flex-wrap gap-3">
        <button disabled={busy} value="draft" className="min-h-11 rounded border px-4">
          Save for owner review
        </button>
        {owner && (
          <button
            disabled={busy}
            value="publish"
            className="min-h-11 rounded bg-ink px-4 text-white"
          >
            Approve and publish standards
          </button>
        )}
      </div>
    </form>
  );
}
