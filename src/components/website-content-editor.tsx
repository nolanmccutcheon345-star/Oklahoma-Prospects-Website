import { useEffect, useState } from "react";
import { getWebsiteEditor, saveHomepage, saveTestimonial } from "@/lib/website-content-api";
import type { Testimonial } from "@/lib/website-content-contracts";
import { FeaturedCoachCard } from "./homepage-content";
import { Button } from "./ui/button";

type Editor = Awaited<ReturnType<typeof getWebsiteEditor>>;
const blank = () => ({
  revision: 0,
  quote: "",
  attribution: "",
  teamAffiliation: "",
  status: "draft" as const,
  consentConfirmed: false,
  consentNote: "",
  sortOrder: 0,
});
export function WebsiteContentEditor() {
  const [data, setData] = useState<Editor>();
  const [selected, setSelected] = useState<string[]>(["", "", ""]);
  const [editing, setEditing] = useState<(Omit<Testimonial, "id"> & { id?: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    const result = await getWebsiteEditor();
    setData(result);
    setSelected([0, 1, 2].map((i) => result.homepage.featuredCoachIds[i] || ""));
  }
  useEffect(() => {
    let live = true;
    void getWebsiteEditor()
      .then((result) => {
        if (live) {
          setData(result);
          setSelected([0, 1, 2].map((i) => result.homepage.featuredCoachIds[i] || ""));
        }
      })
      .catch(() => {
        if (live) setError("Could not load homepage settings. Reload to try again.");
      });
    return () => {
      live = false;
    };
  }, []);
  async function run(work: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setEditing(null);
      await load();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }
  const updateCopy = (change: Partial<Testimonial>) =>
    editing && setEditing({ ...editing, ...change, consentConfirmed: false, status: "draft" });
  return (
    <section className="mt-10 grid gap-5 border-t border-line pt-8" aria-label="Homepage settings">
      <h3 className="text-3xl">Homepage settings</h3>
      <p>
        Feature existing published coaches and authentic family testimonials. Publication does not
        grant account permissions.
      </p>
      <div>
        <Button
          type="button"
          variant="outlineDark"
          disabled={busy}
          onClick={() => void run(load, "Homepage settings reloaded.")}
        >
          Reload homepage settings
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!data ? (
        <p role="status">
          {error ? "Settings are unavailable until reloaded." : "Loading homepage settings…"}
        </p>
      ) : (
        <>
          <form
            className="grid gap-4 rounded-xl border border-line bg-white p-5"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () =>
                  saveHomepage({
                    data: {
                      revision: data.homepage.revision,
                      featuredCoachIds: selected.filter(Boolean),
                    },
                  }),
                "Featured coaches saved.",
              );
            }}
          >
            <h4 className="text-2xl">Featured coaches</h4>
            <p>
              Choose zero to three, in display order. Photos, roles, bios and availability come from
              the current published profile. Unpublished coaches are automatically hidden.
            </p>
            <fieldset disabled={busy} className="grid gap-3 md:grid-cols-3">
              {selected.map((id, i) => (
                <label key={i} className="grid gap-1 text-sm font-semibold">
                  Coach {i + 1}
                  <select
                    className="office-control"
                    aria-label={`Coach ${i + 1}`}
                    value={id}
                    onChange={(e) =>
                      setSelected((s) => s.map((v, n) => (n === i ? e.target.value : v)))
                    }
                  >
                    <option value="">None</option>
                    {id && !data.coaches.some((p) => p.id === id) && (
                      <option value={id}>Previously selected profile — unavailable</option>
                    )}
                    {data.coaches.map((p) => (
                      <option
                        key={p.id}
                        value={p.id}
                        disabled={selected.includes(p.id) && id !== p.id}
                      >
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </fieldset>
            <div className="grid gap-4 md:grid-cols-3" aria-label="Featured coach preview">
              {selected
                .filter(Boolean)
                .map((id) => data.coaches.find((p) => p.id === id))
                .filter((p): p is NonNullable<typeof p> => Boolean(p))
                .map((p) => (
                  <FeaturedCoachCard key={p.id} person={p} />
                ))}
            </div>
            <Button disabled={busy} type="submit">
              Save featured coaches
            </Button>
          </form>
          <section
            className="grid gap-4 rounded-xl border border-line bg-white p-5"
            aria-label="Testimonial management"
          >
            <h4 className="text-2xl">Family testimonials</h4>
            <p>
              The first three published, consented testimonials appear on the homepage. Permission
              must cover the exact quote and public attribution. For a minor, record guardian
              consent. Keep private consent details out of the quote.
            </p>
            <div>
              <Button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditing(blank());
                  setError("");
                }}
              >
                Add testimonial
              </Button>
            </div>
            {!data.testimonials.length && (
              <p>
                No testimonials have been added. This section stays hidden publicly until you
                publish approved quotes.
              </p>
            )}
            {data.testimonials.map((t) => (
              <article key={t.id} className="rounded-lg bg-paper p-4">
                <p>“{t.quote}”</p>
                <p className="mt-2 font-semibold">{t.attribution}</p>
                <p>
                  {t.status} · Order {t.sortOrder} ·{" "}
                  {t.consentConfirmed ? "Consent recorded" : "Consent required"}
                </p>
                <Button
                  type="button"
                  variant="outlineDark"
                  disabled={busy}
                  onClick={() => {
                    setEditing(t);
                    setError("");
                  }}
                >
                  Edit testimonial
                </Button>
              </article>
            ))}
            {editing && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const { updatedAt: _updatedAt, ...input } = editing;
                  void run(() => saveTestimonial({ data: input }), "Testimonial saved.");
                }}
                className="grid gap-3 rounded-xl border border-line p-4"
              >
                <fieldset disabled={busy} className="grid gap-3">
                  <legend className="text-xl font-semibold">
                    {editing.id ? "Edit testimonial" : "New testimonial"}
                  </legend>
                  <label>
                    Quote
                    <textarea
                      required
                      maxLength={600}
                      className="office-control"
                      value={editing.quote}
                      onChange={(e) => updateCopy({ quote: e.target.value })}
                    />
                  </label>
                  <label>
                    Public attribution
                    <input
                      required
                      maxLength={100}
                      className="office-control"
                      value={editing.attribution}
                      onChange={(e) => updateCopy({ attribution: e.target.value })}
                    />
                  </label>
                  <label>
                    Team affiliation (optional)
                    <input
                      maxLength={100}
                      className="office-control"
                      value={editing.teamAffiliation}
                      onChange={(e) => updateCopy({ teamAffiliation: e.target.value })}
                    />
                  </label>
                  <label>
                    Display order
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      className="office-control"
                      value={editing.sortOrder}
                      onChange={(e) =>
                        setEditing({ ...editing, sortOrder: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Private consent reference / note
                    <textarea
                      maxLength={1000}
                      className="office-control"
                      value={editing.consentNote}
                      onChange={(e) => setEditing({ ...editing, consentNote: e.target.value })}
                    />
                  </label>
                  <label className="flex min-h-11 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={editing.consentConfirmed}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          consentConfirmed: e.target.checked,
                          ...(!e.target.checked ? { status: "draft" as const } : {}),
                        })
                      }
                    />
                    I verified permission for this exact quote and attribution, including guardian
                    consent when needed.
                  </label>
                  <label>
                    Publication status
                    <select
                      className="office-control"
                      aria-label="Publication status"
                      value={editing.status}
                      onChange={(e) =>
                        setEditing({ ...editing, status: e.target.value as Testimonial["status"] })
                      }
                    >
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                      <option value="archived">Archived / withdrawn</option>
                    </select>
                  </label>
                  <div className="flex gap-3">
                    <Button type="submit">Save testimonial</Button>
                    <Button type="button" variant="outlineDark" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </fieldset>
              </form>
            )}
          </section>
          <details className="rounded-xl border border-line p-4">
            <summary className="min-h-11 cursor-pointer font-semibold">
              Recent website changes
            </summary>
            {!data.audit.length ? (
              <p>No website changes recorded yet.</p>
            ) : (
              <ul className="grid gap-2">
                {data.audit.map((a, i) => (
                  <li key={i}>
                    {a.entity} · {a.actor} ·{" "}
                    {new Date(a.at).toLocaleString("en-US", { timeZone: "America/Chicago" })} CT
                  </li>
                ))}
              </ul>
            )}
          </details>
        </>
      )}
    </section>
  );
}
