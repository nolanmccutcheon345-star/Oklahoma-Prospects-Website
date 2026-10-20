import { useEffect, useRef, useState } from "react";
import {
  getOrganizationContent,
  getOrganizationContentReview,
  classifyOrganizationContent,
  saveOrganizationEditorialDraft,
  decideOrganizationEditorialDraft,
  saveOrganizationRecruitingProfile,
  saveOrganizationRecruitingMetric,
  reviewOrganizationRecruitingMetric,
  saveOrganizationDocumentMetadata,
} from "@/lib/coordinator/organization-communications-api";
import { blankProfile, metricDefinitions } from "@/lib/recruiting-contracts";
import type {
  OrganizationContent as Content,
  ContentReviewSource,
} from "@/lib/coordinator/organization-communications-contracts";
import { Button } from "../ui/button";
const control = "min-h-11 w-full min-w-0 rounded border border-line bg-white p-2 text-ink";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Unable to save. Refresh and try again.";
type Save = (work: () => Promise<unknown>) => Promise<void>;
type EditorProps = { data: Content; busy: boolean; save: Save; dirty: () => void };
export function OrganizationContent() {
  const [data, setData] = useState<Content | null>(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [tab, setTab] = useState("drafts"),
    [generation, setGeneration] = useState(0),
    [review, setReview] = useState<ContentReviewSource[] | null>(null);
  const pending = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    getOrganizationContent()
      .then((value) => {
        if (mounted.current) setData(value);
      })
      .catch((e) => {
        if (mounted.current) setError(message(e));
      });
    return () => {
      mounted.current = false;
    };
  }, []);
  async function reload() {
    const value = await getOrganizationContent();
    if (mounted.current) {
      setData(value);
      setReview(null);
      setDirty(false);
      setGeneration((n) => n + 1);
    }
  }
  async function save(work: () => Promise<unknown>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    let saved = false;
    try {
      await work();
      saved = true;
      await reload();
      if (mounted.current) setSuccess("Changes saved.");
    } catch (e) {
      if (mounted.current) {
        setError((saved ? "Changes saved. Refresh before editing again. " : "") + message(e));
        if (saved) setData(null);
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function refresh() {
    if (pending.current || dirty) return;
    pending.current = true;
    setBusy(true);
    try {
      await reload();
      setError("");
    } catch (e) {
      setError(message(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function loadReview() {
    if (pending.current || dirty) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      setReview(await getOrganizationContentReview());
      setTab("review");
      setGeneration((n) => n + 1);
    } catch (e) {
      setError(message(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const props = data ? { data, busy, save, dirty: () => setDirty(true) } : null;
  return (
    <section aria-label="Organization content" className="grid gap-4">
      <h2 className="text-2xl">Editorial, recruiting & document metadata</h2>
      <p>
        Editorial approval records a review. It does not publish a website announcement. Recruiting
        publication remains controlled by the guardian’s current consent. Document tools edit
        existing metadata only.
      </p>
      {error && <p role="alert">{error}</p>}
      {success && <p role="status">{success}</p>}
      {!data && !error && <p role="status">Loading content…</p>}
      <div className="flex flex-wrap gap-2">
        {[
          ["drafts", "Editorial drafts"],
          ["profiles", "Recruiting profiles"],
          ["metrics", "Recruiting measurements"],
          ["documents", "Document metadata"],
        ].map(([key, title]) => (
          <Button
            key={key}
            disabled={busy || dirty || !data}
            onClick={() => {
              setTab(key);
              setGeneration((n) => n + 1);
            }}
          >
            {title}
          </Button>
        ))}
        <Button disabled={busy || dirty} onClick={() => void refresh()}>
          Refresh content
        </Button>
        {data?.owner && (
          <Button disabled={busy || dirty} onClick={() => void loadReview()}>
            Review withheld content
          </Button>
        )}
        {dirty && (
          <Button
            disabled={busy}
            onClick={() => {
              setDirty(false);
              setGeneration((n) => n + 1);
            }}
          >
            Discard changes
          </Button>
        )}
      </div>
      {data && (
        <p>
          Withheld pending owner classification: {data.withheld.drafts} drafts,{" "}
          {data.withheld.profiles} profiles, {data.withheld.metrics} measurement details,{" "}
          {data.withheld.documents} document records.
        </p>
      )}
      {props && (
        <div key={generation}>
          {tab === "drafts" ? (
            <DraftEditor {...props} />
          ) : tab === "profiles" ? (
            <ProfileEditor {...props} />
          ) : tab === "metrics" ? (
            <MetricEditor {...props} />
          ) : tab === "documents" ? (
            <DocumentEditor {...props} />
          ) : (
            review && (
              <ClassificationEditor
                sources={review}
                busy={busy}
                save={save}
                dirty={() => setDirty(true)}
              />
            )
          )}
        </div>
      )}
    </section>
  );
}
function DraftEditor({ data, busy, save, dirty }: EditorProps) {
  const [id, setId] = useState(""),
    [edited, setEdited] = useState(false),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [sport, setSport] = useState<"baseball" | "softball">("baseball"),
    [teamId, setTeamId] = useState(""),
    [reason, setReason] = useState("");
  const row = data.drafts.find((d) => d.id === id);
  const mark = () => {
    setEdited(true);
    dirty();
  };
  function choose(value: string) {
    setId(value);
    const next = data.drafts.find((d) => d.id === value);
    setTitle(next?.title || "");
    setBody(next?.body || "");
    setSport(next?.sport || "baseball");
    setTeamId(next?.teamId || "");
    setReason("");
  }
  const write = (submit: boolean) =>
    save(() =>
      saveOrganizationEditorialDraft({
        data: {
          id: id || crypto.randomUUID(),
          revision: row?.revision || 0,
          sport,
          teamId,
          title,
          body,
          submit,
        },
      }),
    );
  const reviewable =
    row?.status === "submitted" && ![row.authorId, row.lastEditorId].includes(data.actorId);
  return (
    <div className="grid gap-3">
      <label>
        Editorial draft
        <select
          className={control}
          disabled={busy || edited}
          value={id}
          onChange={(e) => choose(e.target.value)}
        >
          <option value="">New draft</option>
          {data.drafts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title} · {d.status}
            </option>
          ))}
        </select>
      </label>
      <form
        aria-label="Editorial draft"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void write(false);
        }}
      >
        <fieldset disabled={busy || row?.status === "submitted"} className="grid gap-3">
          <label>
            Sport
            <select
              className={control}
              disabled={Boolean(row)}
              value={sport}
              onChange={(e) => {
                setSport(e.target.value as typeof sport);
                mark();
              }}
            >
              <option value="baseball">Baseball</option>
              <option value="softball">Softball</option>
            </select>
          </label>
          <label>
            Team identifier (leave empty for the sport)
            <input
              className={control}
              disabled={Boolean(row)}
              value={teamId}
              onChange={(e) => {
                setTeamId(e.target.value);
                mark();
              }}
            />
          </label>
          <label>
            Title
            <input
              className={control}
              name="title"
              required
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                mark();
              }}
            />
          </label>
          <label>
            Body
            <textarea
              className={control}
              name="body"
              required
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                mark();
              }}
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit">Save editorial draft</Button>
            <Button type="button" disabled={!title || !body} onClick={() => void write(true)}>
              Submit for editorial review
            </Button>
          </div>
        </fieldset>
      </form>
      {row?.status === "submitted" && <p>Submitted drafts are read-only until reviewed.</p>}
      {reviewable && (
        <form
          aria-label="Editorial decision"
          onSubmit={(e) => {
            e.preventDefault();
          }}
          className="grid gap-3"
        >
          <label>
            Editorial review reason
            <textarea
              className={control}
              required
              minLength={10}
              value={reason}
              disabled={busy}
              onChange={(e) => {
                setReason(e.target.value);
                mark();
              }}
            />
          </label>
          {(["approved", "rejected"] as const).map((decision) => (
            <Button
              key={decision}
              disabled={busy || reason.trim().length < 10 || !row.approvalRevision}
              onClick={() =>
                void save(() =>
                  decideOrganizationEditorialDraft({
                    data: {
                      id: row.id,
                      revision: row.revision,
                      approvalRevision: row.approvalRevision!,
                      decision,
                      reason,
                    },
                  }),
                )
              }
            >
              {decision === "approved" ? "Approve editorial draft" : "Reject editorial draft"}
            </Button>
          ))}
        </form>
      )}
    </div>
  );
}
function ProfileEditor({ data, busy, save, dirty }: EditorProps) {
  const [id, setId] = useState(data.athletes[0]?.id || ""),
    [edited, setEdited] = useState(false);
  const first = data.profiles.find((p) => p.athleteId === id);
  const [value, setValue] = useState(first?.profile || { ...blankProfile });
  const row = data.profiles.find((p) => p.athleteId === id);
  const withheld = Boolean(row && !row.profile);
  return (
    <form
      aria-label="Recruiting profile"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && !withheld && id)
          void save(() =>
            saveOrganizationRecruitingProfile({
              data: { athleteId: id, revision: row?.revision || 0, profile: value },
            }),
          );
      }}
      className="grid gap-3"
    >
      <label>
        Player
        <select
          className={control}
          disabled={busy || edited}
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setValue(
              data.profiles.find((p) => p.athleteId === e.target.value)?.profile || {
                ...blankProfile,
              },
            );
          }}
        >
          {data.athletes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <p>
        {row?.published && row.consentCurrent
          ? "Current guardian publication consent is recorded."
          : "This profile is not currently published with active consent."}{" "}
        Saving never signs, grants, or withdraws consent.
      </p>
      {withheld ? (
        <p>Profile narrative is withheld until an owner classifies this exact revision.</p>
      ) : (
        <fieldset disabled={busy || !id} className="grid gap-3">
          {Object.keys(blankProfile).map((key) => (
            <label key={key}>
              {key}
              <input
                className={control}
                name={key}
                value={value[key as keyof typeof value]}
                onChange={(e) => {
                  setValue({ ...value, [key]: e.target.value });
                  setEdited(true);
                  dirty();
                }}
              />
            </label>
          ))}
          <Button type="submit">Save recruiting profile</Button>
        </fieldset>
      )}
    </form>
  );
}
function MetricEditor({ data, busy, save, dirty }: EditorProps) {
  const initial = data.metrics.find(
    (m) => m.athleteId === data.athletes[0]?.id && m.metric === "pitchVelocity",
  );
  const [athleteId, setAthlete] = useState(data.athletes[0]?.id || ""),
    [metric, setMetric] = useState<keyof typeof metricDefinitions>("pitchVelocity"),
    [edited, setEdited] = useState(false),
    [editKind, setEditKind] = useState<"" | "measurement" | "review">(""),
    [value, setValue] = useState(initial ? String(initial.value) : ""),
    [day, setDay] = useState(initial?.measuredOn || ""),
    [evidence, setEvidence] = useState(initial?.detail?.evidence || ""),
    [request, setRequest] = useState(true),
    [method, setMethod] = useState(""),
    [note, setNote] = useState("");
  const row = data.metrics.find((m) => m.athleteId === athleteId && m.metric === metric);
  const withheld = Boolean(row && !row.detail);
  function choose(id: string, key: keyof typeof metricDefinitions) {
    const m = data.metrics.find((m) => m.athleteId === id && m.metric === key);
    setAthlete(id);
    setMetric(key);
    setValue(m ? String(m.value) : "");
    setDay(m?.measuredOn || "");
    setEvidence(m?.detail?.evidence || "");
    setMethod("");
    setNote("");
  }
  const mark = (kind: "measurement" | "review" = "measurement") => {
    setEditKind(kind);
    setEdited(true);
    dirty();
  };
  return (
    <div className="grid gap-3">
      <label>
        Measurement player
        <select
          className={control}
          disabled={busy || edited}
          value={athleteId}
          onChange={(e) => choose(e.target.value, metric)}
        >
          {data.athletes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Measurement
        <select
          className={control}
          disabled={busy || edited}
          value={metric}
          onChange={(e) => choose(athleteId, e.target.value as typeof metric)}
        >
          {Object.entries(metricDefinitions).map(([key, m]) => (
            <option key={key} value={key}>
              {m.label} · {m.unit}
            </option>
          ))}
        </select>
      </label>
      {withheld ? (
        <p>Existing measurement narrative is withheld until owner review.</p>
      ) : (
        <>
          <form
            aria-label="Recruiting measurement"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy && editKind !== "review")
                void save(() =>
                  saveOrganizationRecruitingMetric({
                    data: {
                      id: row?.id || "",
                      revision: row?.revision || 0,
                      athleteId,
                      metric,
                      value: Number(value),
                      measuredOn: day,
                      evidence,
                      request,
                    },
                  }),
                );
            }}
          >
            <fieldset disabled={busy || !athleteId || editKind === "review"} className="grid gap-3">
              <label>
                Value
                <input
                  className={control}
                  name="value"
                  type="number"
                  min="0.001"
                  step="any"
                  required
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    mark();
                  }}
                />
              </label>
              <label>
                Measurement date
                <input
                  className={control}
                  name="measuredOn"
                  type="date"
                  required
                  value={day}
                  onChange={(e) => {
                    setDay(e.target.value);
                    mark();
                  }}
                />
              </label>
              <label>
                Evidence link
                <input
                  className={control}
                  name="evidence"
                  type="url"
                  value={evidence}
                  onChange={(e) => {
                    setEvidence(e.target.value);
                    mark();
                  }}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={request}
                  onChange={(e) => {
                    setRequest(e.target.checked);
                    mark();
                  }}
                />{" "}
                Request verification
              </label>
              <Button type="submit">Save measurement</Button>
            </fieldset>
          </form>
          {row?.status === "pending" && (
            <form
              aria-label="Measurement review"
              onSubmit={(e) => e.preventDefault()}
              className="grid gap-3"
            >
              <label>
                Verification method
                <textarea
                  className={control}
                  disabled={busy || editKind === "measurement"}
                  value={method}
                  onChange={(e) => {
                    setMethod(e.target.value);
                    mark("review");
                  }}
                />
              </label>
              <label>
                Review note
                <textarea
                  className={control}
                  disabled={busy || editKind === "measurement"}
                  value={note}
                  onChange={(e) => {
                    setNote(e.target.value);
                    mark("review");
                  }}
                />
              </label>
              {[true, false].map((approve) => (
                <Button
                  key={String(approve)}
                  disabled={busy || editKind === "measurement" || (approve && !method.trim())}
                  onClick={() =>
                    void save(() =>
                      reviewOrganizationRecruitingMetric({
                        data: { id: row.id, revision: row.revision, approve, method, note },
                      }),
                    )
                  }
                >
                  {approve ? "Verify measurement" : "Reject measurement"}
                </Button>
              ))}
            </form>
          )}
        </>
      )}
    </div>
  );
}
function DocumentEditor({ data, busy, save, dirty }: EditorProps) {
  const [id, setId] = useState(data.documents[0]?.id || ""),
    [edited, setEdited] = useState(false);
  const row = data.documents.find((d) => d.id === id);
  const [value, setValue] = useState({
    name: row?.name || "",
    kind: row?.kind || "",
    date: row?.date || "",
  });
  return (
    <form
      aria-label="Document metadata"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && row)
          void save(() => saveOrganizationDocumentMetadata({ data: { ...row, ...value } }));
      }}
      className="grid gap-3"
    >
      <p>
        These are existing stored metadata records. No file upload, download, signature, or storage
        location is changed.
      </p>
      <label>
        Document record
        <select
          className={control}
          disabled={busy || edited}
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            const d = data.documents.find((d) => d.id === e.target.value)!;
            setValue({ name: d.name, kind: d.kind, date: d.date });
          }}
        >
          {data.documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset disabled={busy || !row} className="grid gap-3">
        {(["name", "kind", "date"] as const).map((key) => (
          <label key={key}>
            {key}
            <input
              className={control}
              name={key}
              type={key === "date" ? "date" : "text"}
              required={key !== "date"}
              value={value[key]}
              onChange={(e) => {
                setValue({ ...value, [key]: e.target.value });
                setEdited(true);
                dirty();
              }}
            />
          </label>
        ))}
        <Button type="submit">Save document metadata</Button>
      </fieldset>
    </form>
  );
}
function ClassificationEditor({
  sources,
  busy,
  save,
  dirty,
}: {
  sources: ContentReviewSource[];
  busy: boolean;
  save: Save;
  dirty: () => void;
}) {
  const [index, setIndex] = useState(0),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [edited, setEdited] = useState(false);
  const row = sources[index];
  return (
    <form
      aria-label="Owner content classification"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && row && confirmed)
          void save(() =>
            classifyOrganizationContent({
              data: {
                kind: row.kind,
                id: row.id,
                revision: row.revision,
                sourceDigest: row.sourceDigest,
                confirmed: true,
                reason,
              },
            }),
          );
      }}
      className="grid gap-3"
    >
      <p>
        Classify only text you have reviewed as operational and safe for organization operations
        access.
      </p>
      <select
        aria-label="Withheld source"
        className={control}
        disabled={busy || edited}
        value={index}
        onChange={(e) => setIndex(Number(e.target.value))}
      >
        {sources.map((s, i) => (
          <option key={s.kind + s.id} value={i}>
            {s.kind} · {s.id} · revision {s.revision}
          </option>
        ))}
      </select>
      {row && (
        <dl>
          {Object.entries(row.content).map(([key, value]) => (
            <div key={key}>
              <dt className="font-semibold">{key}</dt>
              <dd className="whitespace-pre-wrap break-words">{String(value ?? "")}</dd>
            </div>
          ))}
        </dl>
      )}
      <label>
        Classification reason
        <textarea
          className={control}
          disabled={busy || !row}
          required
          minLength={10}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setEdited(true);
            dirty();
          }}
        />
      </label>
      <label>
        <input
          type="checkbox"
          disabled={busy || !row}
          checked={confirmed}
          onChange={(e) => {
            setConfirmed(e.target.checked);
            setEdited(true);
            dirty();
          }}
        />{" "}
        I reviewed this exact revision and confirm it contains operational content
      </label>
      <Button type="submit" disabled={busy || !row || !confirmed || reason.trim().length < 10}>
        Classify reviewed content
      </Button>
    </form>
  );
}
