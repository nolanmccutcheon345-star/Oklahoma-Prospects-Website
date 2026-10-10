import { formatDollars } from "@/lib/pricing";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArmConfirm, pushUndo } from "@/components/pd/polish";
import { CoachEducationProgress } from "@/components/pd/education";
import { useDevelopment } from "@/lib/pd/context";
import {
  SERVICE_KINDS,
  deleteAccount,
  deleteStaff,
  getServices,
  listAccounts,
  listStaff,
  saveAccount,
  saveService,
  saveStaff,
  type ClubAccount,
  type ClubService,
  type ClubStaff,
  type ServiceInput,
  type ServiceKind,
} from "@/lib/ops";
import type { ClubRole } from "@/lib/club-data";
import { cn } from "@/lib/utils";

const fieldClass =
  "mt-1.5 block min-h-11 w-full rounded-md border border-line bg-paper-2 px-3 text-ink";

function emptyService(kind: ServiceKind): ServiceInput {
  return {
    kind,
    name: "",
    discipline:
      kind === "lesson" ? "Pitching" : kind === "cage" || kind === "cage_plan" ? "Cage" : "",
    price: 0,
    minutes: kind === "cage" ? 60 : 0,
    purpose: "",
    entry: false,
    group_session: false,
    requires_assessment: false,
    credits: 0,
    remote: 0,
    expires_days: 0,
    hours: kind === "cage" ? 1 : 0,
    featured: false,
    detail: "",
    includes: [],
    unit: kind === "cage" ? "/ hour" : "",
    lanes: "",
    period: kind === "cage_plan" || kind === "membership" ? "/ month" : "",
    hourly: "",
    bestFor: "",
    savings: "",
    perks: [],
    active: true,
  };
}

function fromRow(row: ClubService): ServiceInput {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    discipline: row.discipline,
    price: row.price,
    minutes: row.minutes,
    purpose: row.purpose,
    entry: row.entry,
    group_session: row.group_session,
    requires_assessment: row.requires_assessment,
    credits: row.credits,
    remote: row.remote,
    expires_days: row.expires_days,
    hours: row.hours,
    featured: row.featured,
    detail: row.detail,
    includes: row.includes,
    unit: row.unit,
    lanes: row.lanes,
    period: row.period,
    hourly: row.hourly,
    bestFor: row.bestFor,
    savings: row.savings,
    perks: row.perks,
    active: row.active,
    sort_order: row.sort_order,
  };
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  step?: number;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <input
        type="number"
        step={step}
        min={0}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className={fieldClass}
      />
    </label>
  );
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

export function AdminServicesDesk() {
  const [loaded, setLoaded] = useState(false);
  const [rows, setRows] = useState<ClubService[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [state, setState] = useState("active");
  const [editing, setEditing] = useState<ServiceInput | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setRows(await getServices());
    setLoaded(true);
  }
  useEffect(() => {
    refresh().catch((e) => setError(e instanceof Error ? e.message : "Could not load services."));
  }, []);
  const visible = rows.filter(
    (row) =>
      (filter === "all" || row.kind === filter) &&
      (!search || row.name.toLowerCase().includes(search.toLowerCase())) &&
      (state === "all" || row.active === (state === "active")),
  );
  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      await saveService({ data: editing });
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that service.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-2xl">Services & Pricing</h3>
          <p className="mt-2 text-sm">
            Published services use the approved price schedule shown here. New service IDs remain
            drafts until added to that schedule; changing a draft price does not change a published
            charge.
          </p>
          <p className="mt-1 text-sm text-muted">
            Lessons, packages, memberships, cages. Changes show on Train, Book, and Pay.
          </p>
        </div>
        <Button type="button" onClick={() => setEditing(emptyService("lesson"))}>
          Add service
        </Button>
      </div>
      <div className="my-4 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          Search services
          <input
            type="search"
            className="office-control"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Category
          <select
            className="office-control"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All categories</option>
            {SERVICE_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Status
          <select
            className="office-control"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>
      {error && !editing && <p role="alert">{error}</p>}
      {editing ? (
        <form
          onSubmit={onSave}
          className="mt-4 grid gap-3 rounded-2xl bg-paper-2 p-5 shadow-border"
        >
          <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
            {editing.id ? `Edit ${editing.name}` : "New service"}
          </p>
          <label className="text-sm font-semibold">
            Type
            <select
              value={editing.kind}
              onChange={(event) =>
                setEditing({ ...editing, kind: event.target.value as ServiceKind })
              }
              className={fieldClass}
            >
              {SERVICE_KINDS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Name
            <input
              required
              value={editing.name}
              onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              className={fieldClass}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Price ($)"
              step={0.01}
              value={editing.price}
              onChange={(price) => setEditing({ ...editing, price })}
            />
            <NumberField
              label="Minutes"
              value={editing.minutes}
              onChange={(minutes) => setEditing({ ...editing, minutes })}
            />
          </div>
          <label className="text-sm font-semibold">
            Short description
            <input
              value={editing.purpose}
              onChange={(event) => setEditing({ ...editing, purpose: event.target.value })}
              className={fieldClass}
            />
          </label>
          <CheckField
            label="Active (visible on the site)"
            checked={editing.active}
            onChange={(active) => setEditing({ ...editing, active })}
          />
          {error ? <p className="text-sm text-maroon">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="outlineDark" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      {!loaded && !error && <p role="status">Loading services…</p>}
      {loaded && !visible.length && <p>No services match these filters.</p>}
      <ul className="mt-4 grid gap-2">
        {visible.map((row) => (
          <li key={row.id} className="rounded-2xl bg-paper-2 p-4 shadow-border">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-xl uppercase">{row.name}</p>
                <p className="text-sm text-muted">
                  {SERVICE_KINDS.find((k) => k.id === row.kind)?.label || row.kind}
                  {row.minutes ? ` · ${row.minutes} min` : ""} ·{" "}
                  {row.active ? "Active" : "Archived"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-2xl">{formatDollars(row.price)}</p>
                <p className="text-xs text-muted">
                  {row.kind === "cage"
                    ? "per hour"
                    : ["membership", "cage_plan"].includes(row.kind)
                      ? "per month"
                      : row.kind === "package"
                        ? "per package"
                        : "per session"}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outlineDark"
                size="sm"
                onClick={() => setEditing(fromRow(row))}
              >
                Edit
              </Button>
              <details>
                <summary className="min-h-11 cursor-pointer px-3 py-2 text-sm">
                  More actions
                </summary>
                <p className="max-w-sm text-xs text-muted">
                  Archiving removes this service from the public catalog and keeps its booking
                  history.
                </p>
                <Button
                  type="button"
                  variant="outlineDark"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await saveService({ data: { ...fromRow(row), active: !row.active } });
                      await refresh();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Could not update service.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {row.active ? "Archive Service" : "Restore Service"}
                </Button>
              </details>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AdminStaffDesk() {
  const [services, setServices] = useState<ClubService[]>([]);
  const [offerings, setOfferings] = useState<{ serviceId: string; profitSplit: number }[]>([]);
  const [staff, setStaff] = useState<ClubStaff[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "coach" as ClubRole,
    access_notes: "",
    active: true,
    createLogin: false,
    password: "",
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const { data } = useDevelopment();
  async function refresh() {
    const [people, catalog] = await Promise.all([listStaff(), getServices()]);
    setStaff(people);
    setServices(catalog.filter((service) => service.kind === "lesson"));
  }
  useEffect(() => {
    refresh().catch(() => setError("Could not load coaches and services. Please reload."));
  }, []);
  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveStaff({
        data: {
          id: editingId === "new" ? undefined : (editingId ?? undefined),
          name: form.name,
          email: form.email,
          phone: form.phone,
          role: form.role,
          access_notes: form.access_notes,
          active: form.active,
          createLogin: form.createLogin,
          offerings,
        },
      });
      setEditingId(null);
      await refresh();
      setNotice(saved.invitation || "Coach and service assignments saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that coach.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      {notice ? (
        <p role="status" className="mb-3">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mb-3 text-maroon">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-2xl">Coach services</h3>
          <p className="mt-1 text-sm text-muted">
            Choose the assessments, lessons and video reviews each coach offers. Package and
            membership sessions use these same assignments.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditingId("new");
            setOfferings([]);
            setError("");
            setNotice("");
            setForm({
              name: "",
              email: "",
              phone: "",
              role: "coach",
              access_notes: "",
              active: true,
              createLogin: false,
              password: "",
            });
          }}
        >
          Add coach
        </Button>
      </div>
      {editingId ? (
        <form
          onSubmit={onSave}
          className="mt-4 grid gap-3 rounded-2xl bg-paper-2 p-5 shadow-border"
        >
          <label className="text-sm font-semibold">
            Name
            <input
              required
              className={fieldClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="text-sm font-semibold">
            Email
            <input
              required
              className={fieldClass}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <fieldset className="grid gap-3" disabled={busy}>
            <legend className="font-semibold">Services this coach offers</legend>
            <p className="text-sm text-muted">
              Check each service this coach may teach. An unchecked service cannot be booked with
              this coach. Existing bookings stay on the calendar.
            </p>
            {services.length ? (
              Array.from(new Set(services.map((service) => service.discipline || "Other"))).map(
                (discipline) => (
                  <fieldset
                    key={discipline}
                    className="grid gap-2 rounded-lg border border-line p-3"
                  >
                    <legend className="px-1 font-semibold">{discipline}</legend>
                    {services
                      .filter((service) => (service.discipline || "Other") === discipline)
                      .map((service) => {
                        const assigned = offerings.find((offer) => offer.serviceId === service.id);
                        return (
                          <div
                            key={service.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-paper p-3"
                          >
                            <label className="flex min-h-11 flex-1 items-center gap-3">
                              <input
                                type="checkbox"
                                className="h-5 w-5 shrink-0"
                                checked={Boolean(assigned)}
                                onChange={(event) =>
                                  setOfferings((current) =>
                                    event.target.checked
                                      ? [...current, { serviceId: service.id, profitSplit: 60 }]
                                      : current.filter((offer) => offer.serviceId !== service.id),
                                  )
                                }
                              />
                              <span>
                                {service.name}
                                <span className="block text-sm text-muted">
                                  {service.minutes} min
                                  {!service.active ? " · Service inactive" : ""}
                                  {service.id === "s6"
                                    ? " · Enrollment awaits a group schedule"
                                    : ""}
                                </span>
                              </span>
                            </label>
                            {assigned ? (
                              <label className="text-sm">
                                Coach share (%)
                                <input
                                  aria-label={`Coach share for ${service.name}`}
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={1}
                                  required
                                  className="ml-2 min-h-11 w-20 rounded-md border border-line bg-paper-2 px-2"
                                  value={assigned.profitSplit}
                                  onChange={(event) =>
                                    setOfferings((current) =>
                                      current.map((offer) =>
                                        offer.serviceId === service.id
                                          ? { ...offer, profitSplit: Number(event.target.value) }
                                          : offer,
                                      ),
                                    )
                                  }
                                />
                              </label>
                            ) : null}
                          </div>
                        );
                      })}
                  </fieldset>
                ),
              )
            ) : (
              <p>No lesson services are available. Add them in the service catalog first.</p>
            )}
            {!offerings.length ? (
              <p className="text-sm text-muted">
                No services selected. This coach will not appear in lesson booking.
              </p>
            ) : null}
          </fieldset>
          {editingId === "new" ? (
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                checked={form.createLogin}
                onChange={(event) => setForm({ ...form, createLogin: event.target.checked })}
              />
              Send a sign-in invitation to this coach
            </label>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save coach and services"}
            </Button>
            <Button type="button" variant="outlineDark" onClick={() => setEditingId(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      <CoachEducationProgress
        coaches={staff.map((row) => ({ name: row.name, email: row.email, note: row.role }))}
      />
      <ul className="mt-4 grid gap-2">
        {staff.map((row) => (
          <li key={row.id} className="rounded-2xl bg-paper-2 p-4 shadow-border">
            <p className="font-display text-xl uppercase">{row.name}</p>
            <p className="text-sm text-muted">
              {row.email} · {row.active ? "Active" : "Deactivated"}
            </p>
            <p className="mt-2 text-sm">
              {row.offerings.length
                ? row.offerings.map((offer) => offer.service_name).join(" · ")
                : "No services assigned"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outlineDark"
                size="sm"
                onClick={() => {
                  setEditingId(row.id);
                  setOfferings(
                    row.offerings.map((offer) => ({
                      serviceId: offer.service_id,
                      profitSplit: offer.profit_split,
                    })),
                  );
                  setError("");
                  setNotice("");
                  setForm({
                    name: row.name,
                    email: row.email,
                    phone: row.phone,
                    role: row.role,
                    access_notes: row.access_notes,
                    active: row.active,
                    createLogin: false,
                    password: "",
                  });
                }}
              >
                Edit coach & services
              </Button>
              <ArmConfirm
                label="Deactivate"
                armedLabel="Tap again to deactivate"
                onConfirm={async () => {
                  await deleteStaff({ data: { id: row.id } });
                  await refresh();
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">{data.coaches.length} on the development roster.</p>
    </section>
  );
}

export function AdminAccountsDesk({ assignments = {} }: { assignments?: Record<string, string> }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [loaded, setLoaded] = useState(false);
  const [rows, setRows] = useState<ClubAccount[]>([]);
  const [editing, setEditing] = useState<{
    userId?: string;
    name: string;
    email: string;
    role: ClubRole;
    playerName: string;
    password: string;
    owner?: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setRows(await listAccounts());
    setLoaded(true);
  }
  useEffect(() => {
    refresh().catch((e) => setError(e instanceof Error ? e.message : "Could not load accounts."));
  }, []);
  const counts = useMemo(
    () => ({
      admin: rows.filter((row) => row.role === "admin").length,
      coach: rows.filter((row) => row.role === "coach").length,
      parent: rows.filter((row) => row.role === "parent").length,
      player: rows.filter((row) => row.role === "player").length,
    }),
    [rows],
  );
  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      const saved = await saveAccount({
        data: {
          userId: editing.userId,
          name: editing.name,
          email: editing.email,
          role: editing.role,
          playerName: editing.playerName,
        },
      });
      setEditing(null);
      await refresh();
      setNotice(saved.invitation || "Changes saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that account.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      {notice ? (
        <p role="status" className="mb-3">
          {notice}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-2xl">Users & Permissions</h3>
          <p className="mt-1 text-sm text-muted">
            New accounts receive a pending invitation at /invitations. Share that link with the
            recipient; they choose their own password and verify their email.
          </p>
        </div>
        <Button
          type="button"
          onClick={() =>
            setEditing({
              name: "",
              email: "",
              role: "parent",
              playerName: "",
              password: "",
              owner: false,
            })
          }
        >
          Invite User
        </Button>
      </div>
      <div className="my-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          Search users
          <input
            className="office-control"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Access status
          <select
            className="office-control"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>
      {error && !editing && <p role="alert">{error}</p>}
      <div className="mt-4 grid grid-cols-4 gap-2">
        {(["admin", "coach", "parent", "player"] as const).map((role) => (
          <div key={role} className="rounded-xl bg-paper-2 px-3 py-3 shadow-border">
            <p className="text-[0.65rem] font-semibold tracking-widest text-muted uppercase">
              {role}
            </p>
            <p className="pd-num font-display text-2xl">{counts[role]}</p>
          </div>
        ))}
      </div>
      {editing ? (
        <form
          onSubmit={onSave}
          className="mt-4 grid gap-3 rounded-2xl bg-paper-2 p-5 shadow-border"
        >
          <label className="text-sm font-semibold">
            Name
            <input
              required
              className={fieldClass}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          <label className="text-sm font-semibold">
            Email
            <input
              required
              className={fieldClass}
              value={editing.email}
              onChange={(e) => setEditing({ ...editing, email: e.target.value })}
            />
          </label>
          <label className="text-sm font-semibold">
            Role
            <select
              className={fieldClass}
              value={editing.role}
              onChange={(e) => setEditing({ ...editing, role: e.target.value as ClubRole })}
            >
              <option value="admin">admin</option>
              <option value="coach">coach</option>
              <option value="parent">parent</option>
              <option value="player">player</option>
            </select>
          </label>
          {error ? <p className="text-sm text-maroon">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              Save
            </Button>
            <Button type="button" variant="outlineDark" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      {!loaded && !error && <p role="status">Loading users…</p>}
      {loaded &&
        !rows.some(
          (row) =>
            (status === "all" || (row.status || "active") === status) &&
            (!search || `${row.name} ${row.email}`.toLowerCase().includes(search.toLowerCase())),
        ) && <p>No users match these filters.</p>}
      <ul className="mt-4 grid gap-2">
        {rows
          .filter(
            (row) =>
              (status === "all" || (row.status || "active") === status) &&
              (!search || `${row.name} ${row.email}`.toLowerCase().includes(search.toLowerCase())),
          )
          .map((row) => (
            <li key={row.user_id} className="rounded-2xl bg-paper-2 p-4 shadow-border">
              <p className="font-display text-xl uppercase">{row.name}</p>
              <p className="text-sm text-muted">
                {row.email} · {row.role} · {row.status || "active"}
              </p>
              {assignments[row.email.toLowerCase()] && (
                <p className="mt-1 text-sm">Teams: {assignments[row.email.toLowerCase()]}</p>
              )}
              {row.assignments && <p className="mt-1 text-sm">Services: {row.assignments}</p>}
              {row.player_name && <p className="mt-1 text-sm">Player: {row.player_name}</p>}
              {row.status === "invited" && (
                <p className="mt-2 text-sm">
                  Pending invitation. Sign in with this email at /invitations
                  {row.expires_at ? ` before ${new Date(row.expires_at).toLocaleDateString()}` : ""}
                  .
                </p>
              )}
              {row.status !== "invited" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outlineDark"
                    size="sm"
                    onClick={() =>
                      setEditing({
                        userId: row.user_id,
                        name: row.name,
                        email: row.email,
                        role: row.role,
                        playerName: row.player_name,
                        password: "",
                        owner: row.owner,
                      })
                    }
                  >
                    Edit
                  </Button>
                  {row.owner || row.status === "inactive" ? null : (
                    <details>
                      <summary className="min-h-11 cursor-pointer px-3 py-2 text-sm">
                        More actions
                      </summary>
                      <p className="max-w-sm text-sm">
                        Deactivation blocks sign-in, ends active sessions, and disables staff
                        access. Saved records remain.
                      </p>
                      <ArmConfirm
                        label="Deactivate"
                        armedLabel="Confirm Deactivation"
                        onConfirm={async () => {
                          try {
                            await deleteAccount({ data: { userId: row.user_id } });
                            await refresh();
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Could not deactivate user.");
                          }
                        }}
                      />
                    </details>
                  )}
                </div>
              )}
            </li>
          ))}
      </ul>
    </section>
  );
}
