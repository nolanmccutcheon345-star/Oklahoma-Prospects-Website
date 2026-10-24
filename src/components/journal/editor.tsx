import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  getJournalEditor,
  getArticleEditor,
  saveArticle,
  actOnArticle,
  saveEditorialGrant,
  saveJournalCategory,
  saveJournalConsent,
  withdrawJournalConsent,
  uploadJournalImage,
  importJournalAssignments,
  setJournalMetrics,
} from "@/lib/journal/api";
import {
  blankArticle,
  journalPermissions,
  type ArticleDocument,
  type JournalBlock,
  type ArticleRow,
} from "@/lib/journal/contracts";
import { ArticleBody } from "./article-body";
type Desk = Awaited<ReturnType<typeof getJournalEditor>>;
type Detail = Awaited<ReturnType<typeof getArticleEditor>>;
const control = "min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm";
const button =
  "min-h-11 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50";
function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="grid gap-1 text-sm font-semibold">
      <label htmlFor={id}>{label}</label>
      {Children.map(children, (child) =>
        isValidElement(child) && ["input", "select", "textarea"].includes(String(child.type))
          ? cloneElement(child as ReactElement<{ id: string }>, { id })
          : child,
      )}
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1"
      />
      {label}
    </label>
  );
}
export function JournalEditor() {
  const [desk, setDesk] = useState<Desk>(),
    [detail, setDetail] = useState<Detail>(),
    [doc, setDoc] = useState<ArticleDocument>(),
    [revision, setRevision] = useState(0),
    [tab, setTab] = useState("articles"),
    [message, setMessage] = useState("Loading editorial workspace…"),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [saveFailed, setSaveFailed] = useState(false),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [sport, setSport] = useState(""),
    [categoryFilter, setCategoryFilter] = useState(""),
    [authorFilter, setAuthorFilter] = useState(""),
    [sort, setSort] = useState("updated"),
    [preview, setPreview] = useState(""),
    [scheduledAt, setScheduledAt] = useState("");
  const current = useRef(doc),
    saved = useRef(""),
    working = useRef(false);
  current.current = doc;
  const reload = useCallback(async () => {
    try {
      setDesk(await getJournalEditor());
      setMessage("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not load the Journal.");
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (!dirty) return;
    const leave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);
  const open = async (id: string, force = false) => {
    if (!force && dirty && !window.confirm("Discard unsaved changes and open another article?"))
      return;
    try {
      const d = await getArticleEditor({ data: { id } });
      setDetail(d);
      setDoc(d.row.document);
      current.current = d.row.document;
      setRevision(d.row.revision);
      saved.current = JSON.stringify(d.row.document);
      setDirty(false);
      setSaveFailed(false);
      setMessage("Draft loaded.");
      setPreview("");
    } catch (e) {
      setMessage(String(e));
    }
  };
  const change = (next: ArticleDocument) => {
    setDoc(next);
    current.current = next;
    setDirty(JSON.stringify(next) !== saved.current);
    if (!saveFailed) setMessage("Unsaved changes");
  };
  const set = <K extends keyof ArticleDocument>(key: K, value: ArticleDocument[K]) => {
    if (doc) change({ ...doc, [key]: value });
  };
  const save = useCallback(async () => {
    if (!detail || !current.current || working.current) return false;
    working.current = true;
    setBusy(true);
    const snapshot = current.current;
    setSaveFailed(false);
    try {
      const r = await saveArticle({ data: { id: detail.row.id, revision, document: snapshot } });
      setRevision(r.revision);
      saved.current = JSON.stringify(snapshot);
      setDirty(JSON.stringify(current.current) !== saved.current);
      setDetail({
        ...detail,
        row: {
          ...detail.row,
          document: snapshot,
          revision: r.revision,
          status: "draft",
          approved_revision: null,
          approved_by: null,
        },
      });
      setMessage("Saved. Any previous approval applies only to the earlier version.");
      return r.revision;
    } catch (e) {
      setSaveFailed(true);
      setMessage(e instanceof Error ? e.message : "Save failed. Your edits remain on this screen.");
      return false;
    } finally {
      working.current = false;
      setBusy(false);
    }
  }, [detail, revision]);
  useEffect(() => {
    if (!dirty || busy || saveFailed || !doc?.title.trim()) return;
    const t = window.setTimeout(() => void save(), 1800);
    return () => window.clearTimeout(t);
  }, [dirty, busy, doc, save, saveFailed]);
  const act = async (
    action:
      | "submit"
      | "return"
      | "approve"
      | "publish"
      | "schedule"
      | "unpublish"
      | "archive"
      | "restore",
    restoreRevision?: number,
  ) => {
    if (!detail) return;
    if (
      ["publish", "unpublish", "archive", "restore"].includes(action) &&
      !window.confirm(
        `${action === "publish" ? "Publish this approved article publicly" : action === "restore" ? "Restore this revision as a new draft" : action === "archive" ? "Archive this article and remove it from public pages" : "Remove this article from public pages"}?`,
      )
    )
      return;
    const rev = dirty ? await save() : revision;
    if (!rev) return;
    setBusy(true);
    try {
      await actOnArticle({
        data: {
          id: detail.row.id,
          revision: rev,
          action,
          ...(action === "schedule" ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
          ...(restoreRevision ? { restoreRevision } : {}),
          note: "",
        },
      });
      setDirty(false);
      await open(detail.row.id, true);
      await reload();
      setMessage(`Article ${action} completed.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await reload();
      setMessage("Saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };
  if (!desk)
    return (
      <section className="p-6">
        <h1 className="text-3xl">Articles & News</h1>
        <p role="status" className="my-4">
          {message}
        </p>
        <button className={button} onClick={() => void reload()}>
          Retry
        </button>
        <a className="ml-4 underline" href="/login">
          Sign in
        </a>
      </section>
    );
  const allow = (p: (typeof journalPermissions)[number]) =>
    desk.owner || desk.permissions.includes(p);
  const filtered = desk.articles.filter(
    (a) =>
      (!status || a.status === status) &&
      (!sport || a.document.sport === sport) &&
      (!categoryFilter || a.document.categoryIds.includes(categoryFilter)) &&
      (!authorFilter || a.document.authorId === authorFilter) &&
      `${a.document.title} ${a.document.tags.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const blockChange = (i: number, b: JournalBlock) =>
    set(
      "body",
      doc!.body.map((old, j) => (i === j ? b : old)),
    );
  return (
    <section className="journal-editor min-w-0 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Articles & News</h1>
          <p className="mt-1 text-sm text-muted">The Prospects Journal · Editorial workspace</p>
        </div>
        <a href="/articles" className={button}>
          View public Journal
        </a>
      </header>
      <nav aria-label="Editorial sections" className="flex flex-wrap gap-2">
        {[
          "articles",
          "calendar",
          ...(allow("categories") ? ["categories"] : []),
          ...(desk.owner ? ["access", "measurement"] : []),
        ].map((t) => (
          <button
            key={t}
            className={`${button} ${tab === t ? "!bg-powder" : ""}`}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      <p role="status" aria-live="polite" className="rounded-lg bg-white p-3 text-sm">
        {busy ? "Working… " : ""}
        {message || "Ready"}
        {dirty ? " · Changes not saved yet." : ""}
      </p>
      {(tab === "articles" || tab === "calendar") && (
        <>
          <div className="flex flex-wrap gap-3">
            {allow("create") && (
              <button
                disabled={busy || dirty}
                className={`${button} !bg-powder`}
                onClick={() =>
                  void run(async () => {
                    const d = blankArticle();
                    d.sport = (desk.sports[0] || "academy") as ArticleDocument["sport"];
                    d.teamIds = desk.teamIds;
                    const r = await saveArticle({ data: { revision: 0, document: d } });
                    await open(r.id);
                  })
                }
              >
                New article
              </button>
            )}
            {desk.owner && (
              <button
                disabled={busy || dirty}
                className={button}
                onClick={() => void run(() => importJournalAssignments())}
              >
                Import launch assignments as drafts
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Search drafts">
              <input className={control} value={query} onChange={(e) => setQuery(e.target.value)} />
            </Field>
            <Field label="Workflow status">
              <select
                className={control}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">All statuses</option>
                {["draft", "pending", "approved", "scheduled", "published", "archived"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Sport">
              <select className={control} value={sport} onChange={(e) => setSport(e.target.value)}>
                <option value="">All authorized sports</option>
                {desk.sports.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Filter by category">
              <select
                className={control}
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">All categories</option>
                {desk.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Filter by author">
              <select
                className={control}
                value={authorFilter}
                onChange={(e) => setAuthorFilter(e.target.value)}
              >
                <option value="">All authors</option>
                {desk.authors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sort articles">
              <select className={control} value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="updated">Most recently updated</option>
                <option value="title">Title</option>
                <option value="priority">Editorial priority</option>
              </select>
            </Field>
          </div>
          <div className="max-h-96 overflow-auto rounded-xl border border-line bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-3">Article</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Target / scheduled date</th>
                </tr>
              </thead>
              <tbody>
                {[...filtered]
                  .sort((a, b) =>
                    tab === "calendar"
                      ? (a.document.targetDate || "9999").localeCompare(
                          b.document.targetDate || "9999",
                        )
                      : sort === "title"
                        ? a.document.title.localeCompare(b.document.title)
                        : sort === "priority"
                          ? ["high", "normal", "low"].indexOf(a.document.priority) -
                            ["high", "normal", "low"].indexOf(b.document.priority)
                          : 0,
                  )
                  .map((a) => (
                    <tr key={a.id} className="border-t border-line">
                      <td className="p-3">
                        <button
                          className="text-left font-semibold underline"
                          disabled={busy}
                          onClick={() => void open(a.id)}
                        >
                          {a.document.title}
                        </button>
                        <p className="text-xs text-muted">
                          {a.document.sport} · {a.document.priority} priority · v{a.revision}
                        </p>
                      </td>
                      <td className="p-3">{a.status}</td>
                      <td className="p-3">
                        {a.scheduled_at
                          ? new Date(a.scheduled_at).toLocaleString()
                          : a.document.targetDate || "Unscheduled"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!filtered.length && (
              <p className="p-5">
                No matching articles. Create a draft or import the launch assignments.
              </p>
            )}
          </div>
          {doc && detail && (
            <div className="space-y-6 rounded-2xl border border-line bg-white p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-3xl">{preview ? "Private preview" : "Article editor"}</h2>
                <p className="text-sm">
                  {detail.row.status} · Revision {revision}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={busy || !dirty}
                  className={`${button} !bg-powder`}
                  onClick={() => void save()}
                >
                  Save draft
                </button>
                <button className={button} onClick={() => setPreview(preview ? "" : "desktop")}>
                  {preview ? "Back to editor" : "Private preview"}
                </button>
                {preview && (
                  <button
                    className={button}
                    onClick={() => setPreview(preview === "mobile" ? "desktop" : "mobile")}
                  >
                    Preview {preview === "mobile" ? "desktop" : "mobile"}
                  </button>
                )}
                {allow("submit") && (
                  <button
                    disabled={busy || detail.row.status !== "draft"}
                    className={button}
                    onClick={() => void act("submit")}
                  >
                    Submit for review
                  </button>
                )}
                {allow("review") && (
                  <button
                    disabled={
                      busy || !["pending", "approved", "scheduled"].includes(detail.row.status)
                    }
                    className={button}
                    onClick={() => void act("return")}
                  >
                    Return to draft
                  </button>
                )}
                {allow("approve") && (
                  <button
                    disabled={busy || dirty || detail.row.status !== "pending"}
                    className={button}
                    onClick={() => void act("approve")}
                  >
                    Approve exact revision
                  </button>
                )}
                {allow("publish") && (
                  <>
                    <button
                      disabled={
                        busy || dirty || !["approved", "scheduled"].includes(detail.row.status)
                      }
                      className={`${button} !bg-ink !text-white`}
                      onClick={() => void act("publish")}
                    >
                      Publish approved article
                    </button>
                    <button
                      disabled={busy}
                      className={button}
                      onClick={() => void act("unpublish")}
                    >
                      Unpublish
                    </button>
                    <button disabled={busy} className={button} onClick={() => void act("archive")}>
                      Archive
                    </button>
                  </>
                )}
              </div>
              {preview ? (
                <div
                  className={`mx-auto border border-line p-5 ${preview === "mobile" ? "max-w-[390px]" : "max-w-3xl"}`}
                >
                  <p className="mb-5 rounded bg-powder p-2 text-sm">
                    Private preview · Not a published article
                  </p>
                  <h1 className="text-4xl">{doc.title}</h1>
                  <p className="my-4 text-xl">{doc.subtitle}</p>
                  {doc.heroId && (
                    <img
                      className="mb-6 w-full"
                      src={`/api/journal/images/${doc.heroId}`}
                      alt={doc.heroAlt}
                    />
                  )}
                  <ArticleBody blocks={doc.body} credits={detail.media} />
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Headline">
                      <input
                        className={control}
                        maxLength={180}
                        value={doc.title}
                        onChange={(e) => set("title", e.target.value)}
                      />
                    </Field>
                    <Field label="Subtitle">
                      <input
                        className={control}
                        maxLength={300}
                        value={doc.subtitle}
                        onChange={(e) => set("subtitle", e.target.value)}
                      />
                    </Field>
                    <Field label="Excerpt">
                      <textarea
                        className={control}
                        maxLength={500}
                        value={doc.excerpt}
                        onChange={(e) => set("excerpt", e.target.value)}
                      />
                    </Field>
                    <Field label="Sport">
                      <select
                        className={control}
                        value={doc.sport}
                        onChange={(e) => set("sport", e.target.value as ArticleDocument["sport"])}
                      >
                        {desk.sports.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Author (published staff profile)">
                      <select
                        className={control}
                        value={doc.authorId || ""}
                        onChange={(e) => set("authorId", e.target.value || null)}
                      >
                        <option value="">Select author</option>
                        {desk.authors.map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Public reviewer credit (optional)">
                      <select
                        className={control}
                        value={doc.reviewerId || ""}
                        onChange={(e) => set("reviewerId", e.target.value || null)}
                      >
                        <option value="">No public reviewer credit</option>
                        {desk.authors.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Series">
                      <input
                        list="journal-series"
                        className={control}
                        value={doc.series}
                        onChange={(e) => set("series", e.target.value)}
                      />
                      <datalist id="journal-series">
                        {[
                          "Prospects Weekend Recap",
                          "Prospects Player Spotlight",
                          "Inside the Dugout — Coach Spotlight",
                          "Prospects Academy News",
                        ].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </datalist>
                    </Field>
                    <Field label="Target editorial date (not a publication schedule)">
                      <input
                        type="date"
                        className={control}
                        value={doc.targetDate || ""}
                        onChange={(e) => set("targetDate", e.target.value || null)}
                      />
                    </Field>
                    <Field label="Priority">
                      <select
                        className={control}
                        value={doc.priority}
                        onChange={(e) =>
                          set("priority", e.target.value as ArticleDocument["priority"])
                        }
                      >
                        {["high", "normal", "low"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Tags (comma separated)">
                      <input
                        className={control}
                        value={doc.tags.join(", ")}
                        onChange={(e) =>
                          set(
                            "tags",
                            e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          )
                        }
                      />
                    </Field>
                  </div>
                  <fieldset className="space-y-2">
                    <legend className="mb-2 font-semibold">Categories</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {desk.categories
                        .filter((c) => c.active)
                        .map((c) => (
                          <Toggle
                            key={c.id}
                            label={c.name}
                            value={doc.categoryIds.includes(c.id)}
                            onChange={(on) =>
                              set(
                                "categoryIds",
                                on
                                  ? [...doc.categoryIds, c.id]
                                  : doc.categoryIds.filter((id) => id !== c.id),
                              )
                            }
                          />
                        ))}
                    </div>
                  </fieldset>
                  <fieldset className="space-y-2">
                    <legend className="mb-2 font-semibold">
                      Related teams and article access scope
                    </legend>
                    {desk.teams
                      .filter((t) => t.sport === doc.sport)
                      .map((t) => (
                        <Toggle
                          key={t.id}
                          label={t.name}
                          value={doc.teamIds.includes(t.id)}
                          onChange={(on) =>
                            set(
                              "teamIds",
                              on ? [...doc.teamIds, t.id] : doc.teamIds.filter((id) => id !== t.id),
                            )
                          }
                        />
                      ))}
                  </fieldset>
                  <details className="rounded border border-line p-4">
                    <summary className="cursor-pointer font-semibold">
                      Related coaches, events and services
                    </summary>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {desk.relatedOptions.map((r) => (
                        <Toggle
                          key={`${r.kind}-${r.id}`}
                          label={`${r.name} (${r.kind})`}
                          value={doc.related.some((x) => x.kind === r.kind && x.id === r.id)}
                          onChange={(on) =>
                            set(
                              "related",
                              on
                                ? [...doc.related, { kind: r.kind, id: r.id }]
                                : doc.related.filter((x) => x.kind !== r.kind || x.id !== r.id),
                            )
                          }
                        />
                      ))}
                    </div>
                  </details>
                  <section className="space-y-4">
                    <h3 className="text-2xl">Article body</h3>
                    <p className="text-sm text-muted">
                      Text supports **bold**, *italic*, and [link text](https://example.com). HTML
                      is displayed as text. Move blocks to arrange the story.
                    </p>
                    {doc.body.map((b, i) => (
                      <div className="space-y-3 rounded-xl border border-line p-4" key={i}>
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="mr-auto text-sm">
                            {i + 1}. {b.type}
                          </strong>
                          <button
                            className={button}
                            disabled={i === 0}
                            onClick={() => {
                              const body = [...doc.body];
                              [body[i - 1], body[i]] = [body[i], body[i - 1]];
                              set("body", body);
                            }}
                          >
                            Move up
                          </button>
                          <button
                            className={button}
                            disabled={i === doc.body.length - 1}
                            onClick={() => {
                              const body = [...doc.body];
                              [body[i + 1], body[i]] = [body[i], body[i + 1]];
                              set("body", body);
                            }}
                          >
                            Move down
                          </button>
                          <button
                            className={button}
                            onClick={() =>
                              set(
                                "body",
                                doc.body.filter((_, j) => j !== i),
                              )
                            }
                          >
                            Remove
                          </button>
                        </div>
                        {"title" in b && (
                          <Field label="Block title">
                            <input
                              className={control}
                              value={b.title}
                              onChange={(e) => blockChange(i, { ...b, title: e.target.value })}
                            />
                          </Field>
                        )}
                        {"text" in b && (
                          <Field label={b.type === "heading" ? "Heading" : "Text"}>
                            <textarea
                              className={control}
                              rows={b.type === "heading" ? 2 : 5}
                              value={b.text}
                              onChange={(e) => blockChange(i, { ...b, text: e.target.value })}
                            />
                          </Field>
                        )}
                        {b.type === "heading" && (
                          <Field label="Heading level">
                            <select
                              className={control}
                              value={b.level}
                              onChange={(e) =>
                                blockChange(i, { ...b, level: Number(e.target.value) as 2 | 3 })
                              }
                            >
                              <option value="2">Section heading</option>
                              <option value="3">Subheading</option>
                            </select>
                          </Field>
                        )}
                        {b.type === "quote" && (
                          <Field label="Verified quote attribution">
                            <input
                              className={control}
                              value={b.attribution}
                              onChange={(e) =>
                                blockChange(i, { ...b, attribution: e.target.value })
                              }
                            />
                          </Field>
                        )}
                        {b.type === "list" && (
                          <>
                            <Toggle
                              label="Numbered list"
                              value={b.ordered}
                              onChange={(ordered) => blockChange(i, { ...b, ordered })}
                            />
                            <Field label="One item per line">
                              <textarea
                                rows={5}
                                className={control}
                                value={b.items.join("\n")}
                                onChange={(e) =>
                                  blockChange(i, { ...b, items: e.target.value.split("\n") })
                                }
                              />
                            </Field>
                          </>
                        )}
                        {b.type === "video" && (
                          <Field label="YouTube or Vimeo video URL">
                            <input
                              className={control}
                              value={b.url}
                              onChange={(e) => blockChange(i, { ...b, url: e.target.value })}
                            />
                          </Field>
                        )}
                        {b.type === "image" && (
                          <>
                            <Field label="Article image">
                              <select
                                className={control}
                                value={b.mediaId}
                                onChange={(e) => blockChange(i, { ...b, mediaId: e.target.value })}
                              >
                                {detail.media.map((m) => (
                                  <option value={m.id} key={m.id}>
                                    {m.credit}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            <Field label="Alternative text">
                              <input
                                className={control}
                                value={b.alt}
                                onChange={(e) => blockChange(i, { ...b, alt: e.target.value })}
                              />
                            </Field>
                            <Field label="Caption">
                              <input
                                className={control}
                                value={b.caption}
                                onChange={(e) => blockChange(i, { ...b, caption: e.target.value })}
                              />
                            </Field>
                          </>
                        )}
                        {b.type === "table" && (
                          <>
                            <Field label="Column headings separated by |">
                              <input
                                className={control}
                                value={b.headers.join(" | ")}
                                onChange={(e) =>
                                  blockChange(i, {
                                    ...b,
                                    headers: e.target.value.split("|").map((v) => v.trim()),
                                  })
                                }
                              />
                            </Field>
                            <Field label="Rows: one per line, cells separated by |">
                              <textarea
                                rows={5}
                                className={control}
                                value={b.rows.map((r) => r.join(" | ")).join("\n")}
                                onChange={(e) =>
                                  blockChange(i, {
                                    ...b,
                                    rows: e.target.value
                                      .split("\n")
                                      .map((r) => r.split("|").map((s) => s.trim())),
                                  })
                                }
                              />
                            </Field>
                          </>
                        )}
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          "paragraph",
                          "heading",
                          "list",
                          "quote",
                          "callout",
                          "drill",
                          "table",
                          "video",
                          "image",
                        ] as const
                      ).map((type) => (
                        <button
                          key={type}
                          className={button}
                          disabled={type === "image" && !detail.media.length}
                          onClick={() => {
                            const b: JournalBlock =
                              type === "paragraph"
                                ? { type, text: "" }
                                : type === "heading"
                                  ? { type, text: "Section heading", level: 2 }
                                  : type === "list"
                                    ? { type, ordered: false, items: [""] }
                                    : type === "quote"
                                      ? { type, text: "", attribution: "" }
                                      : type === "table"
                                        ? { type, headers: ["Column"], rows: [[""]] }
                                        : type === "video"
                                          ? {
                                              type,
                                              title: "Video",
                                              url: "https://www.youtube.com/watch?v=___________",
                                            }
                                          : type === "image"
                                            ? {
                                                type,
                                                mediaId: detail.media[0].id,
                                                alt: "Describe this image",
                                                caption: "",
                                              }
                                            : { type, title: "", text: "" };
                            set("body", [...doc.body, b]);
                          }}
                        >
                          Add {type}
                        </button>
                      ))}
                    </div>
                  </section>
                  <JournalMedia
                    article={detail.row}
                    revision={revision}
                    disabled={busy || dirty}
                    media={detail.media}
                    onUploaded={async () => {
                      const next = await getArticleEditor({ data: { id: detail.row.id } });
                      setDetail(next);
                    }}
                    report={setMessage}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Hero image">
                      <select
                        className={control}
                        value={doc.heroId || ""}
                        onChange={(e) =>
                          change({
                            ...doc,
                            heroId: e.target.value || null,
                            heroAlt: e.target.value ? doc.heroAlt || "Describe the hero image" : "",
                          })
                        }
                      >
                        <option value="">No hero image</option>
                        {detail.media.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.credit}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Hero alternative text">
                      <input
                        className={control}
                        value={doc.heroAlt}
                        onChange={(e) => set("heroAlt", e.target.value)}
                      />
                    </Field>
                  </div>
                  <section className="space-y-3">
                    <h3 className="text-2xl">Sources</h3>
                    {doc.sources.map((s, i) => (
                      <div
                        key={i}
                        className="grid gap-2 rounded border border-line p-3 sm:grid-cols-3"
                      >
                        <Field label="Source title">
                          <input
                            className={control}
                            value={s.title}
                            onChange={(e) =>
                              set(
                                "sources",
                                doc.sources.map((x, j) =>
                                  i === j ? { ...x, title: e.target.value } : x,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field label="HTTPS link">
                          <input
                            className={control}
                            value={s.url}
                            onChange={(e) =>
                              set(
                                "sources",
                                doc.sources.map((x, j) =>
                                  i === j ? { ...x, url: e.target.value } : x,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field label="Verified on">
                          <input
                            className={control}
                            type="date"
                            value={s.checkedOn || ""}
                            onChange={(e) =>
                              set(
                                "sources",
                                doc.sources.map((x, j) =>
                                  i === j ? { ...x, checkedOn: e.target.value || null } : x,
                                ),
                              )
                            }
                          />
                        </Field>
                        <button
                          className={button}
                          onClick={() =>
                            set(
                              "sources",
                              doc.sources.filter((_, j) => i !== j),
                            )
                          }
                        >
                          Remove source
                        </button>
                      </div>
                    ))}
                    <button
                      className={button}
                      onClick={() =>
                        set("sources", [
                          ...doc.sources,
                          {
                            title: "Source to verify",
                            url: "https://prospectssports.club",
                            checkedOn: null,
                          },
                        ])
                      }
                    >
                      Add source
                    </button>
                  </section>
                  <Field label="Internal planning and verification notes">
                    <textarea
                      className={control}
                      rows={5}
                      value={doc.planningNotes}
                      onChange={(e) => set("planningNotes", e.target.value)}
                    />
                  </Field>
                  {allow("seo") && (
                    <details className="rounded border border-line p-4">
                      <summary className="cursor-pointer font-semibold">
                        Search and social presentation
                      </summary>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {(
                          ["slug", "seoTitle", "seoDescription", "canonical", "seoTarget"] as const
                        ).map((key) => (
                          <Field
                            key={key}
                            label={
                              {
                                slug: "Article URL slug",
                                seoTitle: "SEO title",
                                seoDescription: "SEO description",
                                canonical: "Canonical URL (optional)",
                                seoTarget: "Internal search topic",
                              }[key]
                            }
                          >
                            <input
                              className={control}
                              value={doc[key]}
                              onChange={(e) => set(key, e.target.value)}
                            />
                          </Field>
                        ))}
                        <Toggle
                          label="Exclude from search indexing"
                          value={doc.noindex}
                          onChange={(v) => set("noindex", v)}
                        />
                        <Toggle
                          label="News article (otherwise educational Article schema)"
                          value={doc.news}
                          onChange={(v) => set("news", v)}
                        />
                      </div>
                      <p className="mt-3 text-sm text-muted">
                        Published URL changes create a permanent redirect to the current article
                        URL.
                      </p>
                    </details>
                  )}
                  {allow("features") && (
                    <details className="rounded border border-line p-4">
                      <summary className="cursor-pointer font-semibold">Featured placement</summary>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {(["homepage", "newsroom", "category"] as const).map((k) => (
                          <Toggle
                            key={k}
                            label={`Feature on ${k}`}
                            value={doc.featured[k]}
                            onChange={(v) => set("featured", { ...doc.featured, [k]: v })}
                          />
                        ))}
                        <Field label="Display priority">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            className={control}
                            value={doc.featured.priority}
                            onChange={(e) =>
                              set("featured", { ...doc.featured, priority: Number(e.target.value) })
                            }
                          />
                        </Field>
                        <Field label="Feature expiry (local time)">
                          <input
                            type="datetime-local"
                            className={control}
                            value={
                              doc.featured.expiresAt ? localDateTime(doc.featured.expiresAt) : ""
                            }
                            onChange={(e) =>
                              set("featured", {
                                ...doc.featured,
                                expiresAt: e.target.value
                                  ? new Date(e.target.value).toISOString()
                                  : null,
                              })
                            }
                          />
                        </Field>
                      </div>
                    </details>
                  )}
                  <fieldset className="space-y-3 rounded border border-maroon p-4">
                    <legend className="font-semibold">Publication review</legend>
                    <Toggle
                      label="Names, claims, dates, quotes and cited guidance have been checked by an authorized human reviewer."
                      value={doc.factsVerified}
                      onChange={(v) => set("factsVerified", v)}
                    />
                    <Toggle
                      label="We have publication rights for the text and every image or video reference."
                      value={doc.rightsConfirmed}
                      onChange={(v) => set("rightsConfirmed", v)}
                    />
                    <Toggle
                      label="This article identifies or depicts a minor (including in images)."
                      value={doc.containsMinorIdentity}
                      onChange={(v) => set("containsMinorIdentity", v)}
                    />
                    {desk.owner && (
                      <>
                        <p className="text-sm text-muted">
                          Select every athlete appearing in this article. Save the version before
                          recording article-specific guardian consent. Any edit requires renewed
                          consent for the new version.
                        </p>
                        {desk.athletes.map((a) => (
                          <Toggle
                            key={a.id}
                            label={a.name}
                            value={doc.athleteIds.includes(a.id)}
                            onChange={(on) =>
                              set(
                                "athleteIds",
                                on
                                  ? [...doc.athleteIds, a.id]
                                  : doc.athleteIds.filter((id) => id !== a.id),
                              )
                            }
                          />
                        ))}
                      </>
                    )}
                  </fieldset>
                  {desk.owner && (
                    <JournalConsent
                      desk={desk}
                      detail={detail}
                      disabled={busy || dirty}
                      revision={revision}
                      onSaved={() => open(detail.row.id)}
                      report={setMessage}
                    />
                  )}
                  {allow("publish") && (
                    <div className="flex flex-wrap items-end gap-3">
                      <Field label="Approved publication time (your browser’s local timezone)">
                        <input
                          type="datetime-local"
                          className={control}
                          value={scheduledAt}
                          onChange={(e) => setScheduledAt(e.target.value)}
                        />
                      </Field>
                      <button
                        disabled={busy || dirty || !scheduledAt || detail.row.status !== "approved"}
                        className={button}
                        onClick={() => void act("schedule")}
                      >
                        Schedule approved revision
                      </button>
                    </div>
                  )}
                </>
              )}
              <details>
                <summary className="cursor-pointer font-semibold">
                  Revision history and editorial activity
                </summary>
                <p className="my-3 text-sm text-muted">
                  Restoring creates a new draft and never silently replaces the public article.
                </p>
                <div className="flex flex-wrap gap-2">
                  {detail.revisions.map((r) => (
                    <button
                      key={r.revision}
                      className={button}
                      disabled={busy}
                      onClick={() => void act("restore", r.revision)}
                    >
                      Restore v{r.revision}
                    </button>
                  ))}
                </div>
                <ul className="mt-4 space-y-2 text-xs">
                  {detail.audit.map((a, i) => (
                    <li key={i}>
                      {new Date(a.created_at).toLocaleString()} · {a.action}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}
        </>
      )}
      {tab === "categories" && <CategoryManager desk={desk} run={run} busy={busy} />}
      {tab === "access" && desk.owner && <AccessManager desk={desk} run={run} busy={busy} />}
      {tab === "measurement" && desk.owner && (
        <div className="space-y-4 rounded-xl bg-white p-6">
          <h2 className="text-3xl">Journal measurement</h2>
          <p className="text-sm">
            Optional first-party counts record article views and CTA clicks only. They are not
            unique visitors, bookings, or revenue. No tracking cookies or user IDs are stored. Do
            Not Track and Global Privacy Control are respected. Automated traffic may affect counts.
          </p>
          <Toggle
            label="Enable aggregate article and CTA counts"
            value={desk.settings.metrics_enabled}
            onChange={(enabled) =>
              void run(() =>
                setJournalMetrics({ data: { enabled, revision: desk.settings.revision } }),
              )
            }
          />
          <p className="text-sm text-muted">
            GA4 and Google Search Console: not connected. Search impressions, rankings and provider
            conversions are unavailable.
          </p>
          <ul className="space-y-2 text-sm">
            {desk.metrics.map((m) => (
              <li key={`${m.article_id}-${m.event}`}>
                {desk.articles.find((a) => a.id === m.article_id)?.document.title || "Article"} ·{" "}
                {m.event}: {m.count}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
function localDateTime(s: string) {
  const d = new Date(s);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function JournalMedia({
  article,
  revision,
  disabled,
  media,
  onUploaded,
  report,
}: {
  article: ArticleRow;
  revision: number;
  disabled: boolean;
  media: Detail["media"];
  onUploaded: () => Promise<void>;
  report: (s: string) => void;
}) {
  const [credit, setCredit] = useState(""),
    [rights, setRights] = useState(""),
    [uploading, setUploading] = useState(false);
  return (
    <section className="space-y-3 rounded-xl border border-line p-4">
      <h3 className="text-2xl">Article images</h3>
      <p className="text-sm text-muted">
        PNG, JPEG or WebP · up to 4 MB · metadata removed and image optimized on upload. Save the
        draft first.
      </p>
      <Field label="Public image credit">
        <input className={control} value={credit} onChange={(e) => setCredit(e.target.value)} />
      </Field>
      <Field label="Private rights or license record">
        <input className={control} value={rights} onChange={(e) => setRights(e.target.value)} />
      </Field>
      <Field label="Upload image">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={disabled || uploading || !credit || rights.length < 5}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 4 * 1024 * 1024) {
              report("Select an image smaller than 4 MB.");
              return;
            }
            setUploading(true);
            try {
              const dataUrl = await new Promise<string>((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(String(r.result));
                r.onerror = () => reject(Error("Image could not be read."));
                r.readAsDataURL(file);
              });
              await uploadJournalImage({
                data: { articleId: article.id, revision, dataUrl, credit, rightsNote: rights },
              });
              await onUploaded();
              report("Image uploaded. Select it as a hero or body image.");
            } catch (error) {
              report(error instanceof Error ? error.message : "Upload failed.");
            } finally {
              setUploading(false);
              e.target.value = "";
            }
          }}
        />
      </Field>
      {uploading && <p role="status">Optimizing image…</p>}
      <div className="flex flex-wrap gap-3">
        {media.map((m) => (
          <figure key={m.id}>
            <img
              src={`/api/journal/images/${m.id}`}
              alt="Uploaded article image preview"
              className="h-24 w-32 rounded object-cover"
            />
            <figcaption className="max-w-32 text-xs">{m.credit}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
function JournalConsent({
  desk,
  detail,
  revision,
  disabled,
  onSaved,
  report,
}: {
  desk: Desk;
  detail: Detail;
  revision: number;
  disabled: boolean;
  onSaved: () => Promise<void>;
  report: (s: string) => void;
}) {
  const [athleteId, setAthlete] = useState(""),
    [guardianId, setGuardian] = useState(""),
    [scope, setScope] = useState(""),
    [evidenceReference, setEvidence] = useState("");
  return (
    <details className="rounded border border-line p-4">
      <summary className="cursor-pointer font-semibold">Article-specific guardian consent</summary>
      <p className="my-3 text-sm">
        Record explicit guardian permission for the exact saved article, including the approved
        identity, photos and details. General roster consent does not apply. Guardians can withdraw
        at Account → Journal publication consent.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Athlete in this saved version">
          <select
            className={control}
            value={athleteId}
            onChange={(e) => setAthlete(e.target.value)}
          >
            <option value="">Select athlete</option>
            {desk.athletes
              .filter((a) => detail.row.document.athleteIds.includes(a.id))
              .map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Verified guardian account">
          <select
            className={control}
            value={guardianId}
            onChange={(e) => setGuardian(e.target.value)}
          >
            <option value="">Select guardian</option>
            {desk.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.email}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Exactly what the guardian approved">
          <textarea className={control} value={scope} onChange={(e) => setScope(e.target.value)} />
        </Field>
        <Field label="Written permission reference (private)">
          <input
            className={control}
            value={evidenceReference}
            onChange={(e) => setEvidence(e.target.value)}
          />
        </Field>
      </div>
      <button
        disabled={
          disabled || !athleteId || !guardianId || scope.length < 10 || evidenceReference.length < 5
        }
        className={`${button} mt-3`}
        onClick={async () => {
          try {
            await saveJournalConsent({
              data: {
                articleId: detail.row.id,
                revision,
                athleteId,
                guardianId,
                scope,
                evidenceReference,
              },
            });
            await onSaved();
            report("Consent recorded for this revision.");
          } catch (e) {
            report(e instanceof Error ? e.message : "Could not save consent.");
          }
        }}
      >
        Record verified written consent
      </button>
      <ul className="mt-4 space-y-2 text-sm">
        {detail.consents.map((c) => (
          <li key={c.id}>
            Revision {c.revision} · {c.revoked_at ? "Withdrawn" : "Recorded"} · {c.scope}{" "}
            {!c.revoked_at && (
              <button
                className={`${button} ml-2`}
                onClick={async () => {
                  try {
                    await withdrawJournalConsent({ data: { id: c.id } });
                    await onSaved();
                    report("Consent withdrawn; public article and images removed.");
                  } catch (e) {
                    report(String(e));
                  }
                }}
              >
                Withdraw consent
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
function CategoryManager({
  desk,
  run,
  busy,
}: {
  desk: Desk;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
}) {
  const [id, setId] = useState(""),
    [name, setName] = useState(""),
    [slug, setSlug] = useState(""),
    [description, setDescription] = useState(""),
    [order, setOrder] = useState(0),
    [active, setActive] = useState(true);
  const existing = desk.categories.find((c) => c.id === id);
  return (
    <section className="space-y-4 rounded-xl bg-white p-5">
      <h2 className="text-3xl">Categories</h2>
      <Field label="Edit existing category">
        <select
          className={control}
          value={existing?.id || ""}
          onChange={(e) => {
            const c = desk.categories.find((c) => c.id === e.target.value);
            setId(c?.id || "");
            setName(c?.name || "");
            setSlug(c?.slug || "");
            setDescription(c?.description || "");
            setOrder(c?.display_order || 0);
            setActive(c?.active ?? true);
          }}
        >
          <option value="">New category</option>
          {desk.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Stable category ID">
          <input
            className={control}
            value={id}
            disabled={Boolean(existing)}
            onChange={(e) => setId(e.target.value)}
          />
        </Field>
        <Field label="Name">
          <input className={control} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Slug">
          <input className={control} value={slug} onChange={(e) => setSlug(e.target.value)} />
        </Field>
        <Field label="Description">
          <input
            className={control}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Display order">
          <input
            className={control}
            type="number"
            value={order}
            onChange={(e) => setOrder(Number(e.target.value))}
          />
        </Field>
        <Toggle label="Active" value={active} onChange={setActive} />
      </div>
      <button
        className={button}
        disabled={busy || !id || !name || !slug}
        onClick={() =>
          void run(() =>
            saveJournalCategory({
              data: {
                id,
                revision: existing?.revision || 0,
                name,
                slug,
                description,
                displayOrder: order,
                active,
              },
            }),
          )
        }
      >
        Save category
      </button>
    </section>
  );
}
function AccessManager({
  desk,
  run,
  busy,
}: {
  desk: Desk;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
}) {
  const [userId, setUser] = useState(""),
    [permissions, setPermissions] = useState<Desk["permissions"]>([]),
    [sports, setSports] = useState<string[]>([]),
    [teamIds, setTeams] = useState<string[]>([]);
  return (
    <section className="space-y-4 rounded-xl bg-white p-5">
      <h2 className="text-3xl">Editorial access</h2>
      <p className="text-sm">
        Existing verified accounts only. New selections start with zero permissions and no sport
        access. These settings grant no financial access and cannot broaden a coordinator’s existing
        sport/team scope.
      </p>
      <Field label="Registered account">
        <select
          className={control}
          value={userId}
          onChange={(e) => {
            setUser(e.target.value);
            const g = desk.grants.find((g) => g.user_id === e.target.value);
            setPermissions(g?.permissions || []);
            setSports(g?.sports || []);
            setTeams(g?.team_ids || []);
          }}
        >
          <option value="">Select account</option>
          {desk.accounts.map((a) => (
            <option value={a.id} key={a.id}>
              {a.name} · {a.email}
            </option>
          ))}
        </select>
      </Field>
      <fieldset className="grid gap-2 sm:grid-cols-3">
        <legend className="mb-3 font-semibold">Explicit editorial permissions</legend>
        {journalPermissions.map((p) => (
          <Toggle
            key={p}
            label={p}
            value={permissions.includes(p)}
            onChange={(v) =>
              setPermissions(v ? [...permissions, p] : permissions.filter((x) => x !== p))
            }
          />
        ))}
      </fieldset>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-3 font-semibold">Approved sports</legend>
        {["baseball", "softball", "academy"].map((s) => (
          <Toggle
            key={s}
            label={s}
            value={sports.includes(s)}
            onChange={(v) => {
              setSports(v ? [...sports, s] : sports.filter((x) => x !== s));
              setTeams([]);
            }}
          />
        ))}
      </fieldset>
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-3 font-semibold">
          Optional team restriction (none means the approved sport scope)
        </legend>
        {desk.teams
          .filter((t) => sports.includes(t.sport))
          .map((t) => (
            <Toggle
              key={t.id}
              label={t.name}
              value={teamIds.includes(t.id)}
              onChange={(v) =>
                setTeams(v ? [...teamIds, t.id] : teamIds.filter((id) => id !== t.id))
              }
            />
          ))}
      </fieldset>
      <button
        className={`${button} !bg-powder`}
        disabled={!userId || busy}
        onClick={() =>
          void run(() =>
            saveEditorialGrant({
              data: {
                userId,
                revision: desk.grants.find((g) => g.user_id === userId)?.revision || 0,
                permissions,
                sports,
                teamIds,
              },
            }),
          )
        }
      >
        Save explicit access
      </button>
    </section>
  );
}
