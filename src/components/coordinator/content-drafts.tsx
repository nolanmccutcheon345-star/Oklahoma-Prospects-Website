import { useEffect, useRef, useState, type FormEvent } from "react";
import * as api from "@/lib/coordinator/api";
import { draftKinds, draftCreatePermission } from "@/lib/coordinator/content-contracts";
import type { Capability, Sport } from "@/lib/coordinator/contracts";
import { Button } from "../ui/button";
const field = "min-h-11 w-full rounded border border-line bg-white p-2 text-ink";
const text = (f: FormData, k: string) => String(f.get(k) || "");
type Draft = Awaited<ReturnType<typeof api.getCoordinatorDrafts>>[number];
export function ContentDrafts({
  sport,
  teamId,
  allowed,
}: {
  sport: Sport;
  teamId: string;
  allowed: (p: Capability) => boolean;
}) {
  const [data, setData] = useState<Draft[]>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [versions, setVersions] =
      useState<Awaited<ReturnType<typeof api.getCoordinatorDraftVersions>>>();
  const canRead = allowed("content.read");
  const createId = useRef(crypto.randomUUID());
  const creatable = draftKinds.filter((k) => allowed(draftCreatePermission(k)));
  const load = async () =>
    setData(canRead ? await api.getCoordinatorDrafts({ data: { sport, teamId } }) : []);
  useEffect(() => {
    let active = true;
    setData(undefined);
    setVersions(undefined);
    setError("");
    (canRead ? api.getCoordinatorDrafts({ data: { sport, teamId } }) : Promise.resolve([]))
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [sport, teamId, canRead]);
  async function run(work: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await load();
      setNotice(message);
    } catch (e) {
      setData(undefined);
      setVersions(undefined);
      setError(e instanceof Error ? e.message : "Could not save content.");
    } finally {
      setBusy(false);
    }
  }
  function save(e: FormEvent<HTMLFormElement>, draft?: Draft) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const submit = f.has("submit");
    if (
      submit &&
      !window.confirm(
        "Submit this exact draft for owner review? It will remain private until separately published by an owner.",
      )
    )
      return;
    void run(
      async () => {
        await api.saveCoordinatorDraft({
          data: {
            id: draft?.id || createId.current,
            revision: draft?.revision || 0,
            sport,
            teamId,
            contentKind: draft?.content_kind || (text(f, "kind") as (typeof draftKinds)[number]),
            title: text(f, "title"),
            body: text(f, "body"),
            submit,
          },
        });
        if (!draft) createId.current = crypto.randomUUID();
      },
      submit ? "Draft submitted for owner review." : "Private draft saved.",
    );
  }
  function form(draft?: Draft) {
    return (
      <form className="grid gap-3" onSubmit={(e) => save(e, draft)}>
        {!draft && (
          <label>
            Draft type
            <select className={field} name="kind">
              {creatable.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Title
          <input
            className={field}
            name="title"
            defaultValue={draft?.title}
            maxLength={140}
            required
          />
        </label>
        <label>
          Draft text
          <textarea
            className={field}
            name="body"
            defaultValue={draft?.body}
            maxLength={3000}
            rows={6}
            required
          />
        </label>
        <p>
          General program information only. Player names, photographs, private family, medical and
          financial information require separate authorized workflows.
        </p>
        {allowed("content.submit") && (
          <label>
            <input name="submit" type="checkbox" /> Submit for owner approval
          </label>
        )}
        <Button type="submit" disabled={busy}>
          Save Draft
        </Button>
      </form>
    );
  }
  return (
    <section className="grid gap-4 rounded-xl border bg-white p-5">
      <h2 className="text-2xl">Website Content</h2>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!data && !error && <p role="status">Loading authorized content…</p>}
      <Button
        variant="outlineDark"
        disabled={busy}
        onClick={() => void run(async () => {}, "Content refreshed.")}
      >
        Refresh Content
      </Button>
      {creatable.length > 0 && (
        <details>
          <summary className="min-h-11">Create Private Draft</summary>
          {form()}
        </details>
      )}
      {!canRead && <p>Content viewing is a separate permission.</p>}
      {canRead && data?.length === 0 && <p>No drafts in this authorized scope.</p>}
      {data?.map((d) => (
        <article className="grid gap-2 rounded border p-3" key={d.id + ":" + d.revision}>
          <h3 className="text-xl">
            {d.title} · {d.status}
          </h3>
          <p>{d.content_kind}</p>
          <p className="whitespace-pre-wrap">{d.body}</p>
          {allowed("content.update") &&
            ["draft", "rejected"].includes(d.status) &&
            (d.content_kind === "announcement" ||
              allowed(draftCreatePermission(d.content_kind))) && (
              <details>
                <summary className="min-h-11">Edit Draft</summary>
                {form(d)}
              </details>
            )}
          <Button
            disabled={busy}
            variant="outlineDark"
            onClick={() =>
              void run(
                async () =>
                  setVersions(await api.getCoordinatorDraftVersions({ data: { id: d.id } })),
                "Versions loaded.",
              )
            }
          >
            View Recorded Versions
          </Button>
        </article>
      ))}
      {versions && (
        <aside className="grid gap-2 rounded border p-3">
          <h3 className="text-xl">Recorded Versions</h3>
          {versions.map((v) => (
            <details key={v.revision}>
              <summary className="min-h-11">
                Version {v.revision} · {v.status} · {new Date(v.created_at).toLocaleString()}
              </summary>
              <strong>{v.title}</strong>
              <p className="whitespace-pre-wrap">{v.body}</p>
            </details>
          ))}
        </aside>
      )}
    </section>
  );
}
export function PublishedContentManagement() {
  const [data, setData] =
      useState<Awaited<ReturnType<typeof api.getOwnerPublishedCoordinatorContent>>>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => setData(await api.getOwnerPublishedCoordinatorContent());
  useEffect(() => {
    let active = true;
    api
      .getOwnerPublishedCoordinatorContent()
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="grid gap-3">
      <h3 className="text-xl">Published Program Updates</h3>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading publications…</p>}
      <Button
        disabled={busy}
        variant="outlineDark"
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await load();
          } catch (e) {
            setData(undefined);
            setError(e instanceof Error ? e.message : "Could not load publications.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Refresh Publications
      </Button>
      {data?.length === 0 && <p>No program updates have been published.</p>}
      {data?.map((p) => (
        <article key={p.id} className="rounded border p-3">
          <h4>
            {p.title} · {p.sport} · {p.visible ? "Published" : "Withdrawn"}
          </h4>
          <p className="whitespace-pre-wrap">{p.body}</p>
          {p.visible && (
            <Button
              disabled={busy}
              variant="outlineDark"
              onClick={async () => {
                const reason = window.prompt(
                  "Reason for withdrawing this public update (at least 10 characters):",
                );
                if (
                  !reason ||
                  !window.confirm(
                    "Remove this update from public pages while preserving its history?",
                  )
                )
                  return;
                setBusy(true);
                setError("");
                try {
                  await api.withdrawPublishedCoordinatorPost({
                    data: { id: p.id, revision: p.revision, reason, confirm: true },
                  });
                  await load();
                } catch (e) {
                  setData(undefined);
                  setError(e instanceof Error ? e.message : "Could not withdraw publication.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Withdraw Public Update
            </Button>
          )}
        </article>
      ))}
    </section>
  );
}
