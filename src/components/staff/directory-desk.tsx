import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getStaffDirectory, saveStaffDirectoryListing } from "@/lib/staff-directory-api";
import type { StaffListing } from "@/lib/staff-directory";

const field = "mt-1 block min-h-11 w-full rounded-md border border-line bg-paper px-3 text-ink";
export function StaffDirectoryDesk() {
  const [rows, setRows] = useState<StaffListing[]>([]);
  const [editing, setEditing] = useState<StaffListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setRows(await getStaffDirectory());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Staff listings could not load.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveStaffDirectoryListing({ data: editing });
      setRows((current) =>
        [...current.filter((row) => row.id !== saved.id), saved].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      setEditing(null);
      setNotice(
        saved.published ? "Staff listing saved and published." : "Staff listing saved privately.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Staff listing could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Staff directory">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl">Staff directory</h3>
          <p className="mt-2 text-muted">
            Titles, contact details and biographies for coordinators, recruiters and staff. Listings
            do not grant account access.
          </p>
        </div>
        <Button
          disabled={loading || busy}
          onClick={() => {
            setNotice("");
            setEditing({
              id: crypto.randomUUID(),
              version: 0,
              name: "",
              title: "",
              program: "Softball",
              email: "",
              phone: "",
              bio: "",
              published: false,
            });
          }}
        >
          Add staff listing
        </Button>
      </div>
      <Link to="/coaches" className="my-3 inline-flex min-h-11 items-center underline">
        View public coaches & staff
      </Link>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="my-3 text-maroon">
          {error}
        </p>
      )}
      {editing && (
        <form onSubmit={save} className="my-4 rounded-2xl bg-paper-2 p-5 shadow-border">
          <fieldset disabled={busy} className="grid gap-4">
            <legend className="mb-3 text-xl font-semibold">
              {editing.version ? "Edit staff listing" : "New staff listing"}
            </legend>
            <label>
              Name
              <input
                required
                maxLength={120}
                className={field}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </label>
            <label>
              Title
              <input
                required
                maxLength={160}
                placeholder="Softball Coordinator & Recruiter"
                className={field}
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </label>
            <label>
              Program
              <select
                className={field}
                value={editing.program}
                onChange={(e) =>
                  setEditing({ ...editing, program: e.target.value as StaffListing["program"] })
                }
              >
                <option>Softball</option>
                <option>Baseball</option>
                <option>Organization</option>
              </select>
            </label>
            <label>
              Email
              <input
                required
                type="email"
                maxLength={254}
                className={field}
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
              />
            </label>
            <label>
              Phone
              <input
                type="tel"
                maxLength={40}
                className={field}
                value={editing.phone}
                onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
              />
            </label>
            <label>
              Biography
              <textarea
                rows={4}
                maxLength={3000}
                className={field + " py-3"}
                value={editing.bio}
                onChange={(e) => setEditing({ ...editing, bio: e.target.value })}
              />
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                checked={editing.published}
                onChange={(e) => setEditing({ ...editing, published: e.target.checked })}
              />
              Publish name, title, biography, email and phone on the website
            </label>
            <div className="flex flex-wrap gap-3">
              <Button type="submit">{busy ? "Saving…" : "Save staff listing"}</Button>
              <Button type="button" variant="outlineDark" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      {loading ? (
        <p role="status">Loading staff listings…</p>
      ) : (
        <>
          <Button variant="outlineDark" disabled={busy} onClick={() => void refresh()}>
            Refresh staff list
          </Button>
          {!rows.length && !error && <p className="mt-4">No staff listings yet.</p>}
          <ul className="mt-4 grid gap-4">
            {rows.map((row) => (
              <li key={row.id} className="rounded-2xl bg-paper-2 p-5 shadow-border">
                <h4 className="text-2xl">{row.name}</h4>
                <p className="mt-1 font-semibold">{row.title}</p>
                <p>
                  {row.program} · {row.published ? "Published" : "Private"}
                </p>
                <p className="mt-2 break-words">
                  {row.email}
                  {row.phone && ` · ${row.phone}`}
                </p>
                {row.bio && <p className="mt-3 whitespace-pre-line">{row.bio}</p>}
                <Button
                  className="mt-3"
                  variant="outlineDark"
                  disabled={busy}
                  onClick={() => {
                    setNotice("");
                    setEditing({ ...row });
                  }}
                >
                  Edit {row.name}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
