import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArmConfirm, pushUndo } from "@/components/pd/polish";
import { CoachEducationProgress } from "@/components/pd/education";
import { useDevelopment } from "@/lib/pd/context";
import {
  SERVICE_KINDS,
  deleteAccount,
  deleteService,
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
    discipline: kind === "lesson" ? "Pitching" : kind === "cage" || kind === "cage_plan" ? "Cage" : "",
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
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

export function AdminServicesDesk() {
  const [rows, setRows] = useState<ClubService[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [editing, setEditing] = useState<ServiceInput | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setRows(await getServices());
  }
  useEffect(() => {
    refresh().catch(() => setRows([]));
  }, []);
  const visible = rows.filter((row) => (filter === "all" ? true : row.kind === filter));
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
          <h3 className="text-2xl">Services and prices</h3>
          <p className="mt-1 text-sm text-muted">Lessons, packages, memberships, cages. Changes show on Train, Book, and Pay.</p>
        </div>
        <Button type="button" onClick={() => setEditing(emptyService("lesson"))}>
          Add service
        </Button>
      </div>
      <div className="mt-4 flex gap-1 overflow-x-auto rounded-xl bg-ink p-1 text-fg-inverse">
        {[{ id: "all", label: "All" }, ...SERVICE_KINDS].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={cn(
              "min-h-11 shrink-0 rounded-lg px-3 text-xs font-semibold tracking-wide uppercase",
              filter === item.id ? "bg-maroon text-fg-inverse" : "text-fg-soft",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {editing ? (
        <form onSubmit={onSave} className="mt-4 grid gap-3 rounded-2xl bg-paper-2 p-5 shadow-border">
          <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
            {editing.id ? `Edit ${editing.name}` : "New service"}
          </p>
          <label className="text-sm font-semibold">
            Type
            <select
              value={editing.kind}
              onChange={(event) => setEditing({ ...editing, kind: event.target.value as ServiceKind })}
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
            <NumberField label="Price ($)" step={0.01} value={editing.price} onChange={(price) => setEditing({ ...editing, price })} />
            <NumberField label="Minutes" value={editing.minutes} onChange={(minutes) => setEditing({ ...editing, minutes })} />
          </div>
          <label className="text-sm font-semibold">
            Short description
            <input
              value={editing.purpose}
              onChange={(event) => setEditing({ ...editing, purpose: event.target.value })}
              className={fieldClass}
            />
          </label>
          <CheckField label="Active (visible on the site)" checked={editing.active} onChange={(active) => setEditing({ ...editing, active })} />
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
      <ul className="mt-4 grid gap-2">
        {visible.map((row) => (
          <li key={row.id} className="rounded-2xl bg-paper-2 p-4 shadow-border">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-xl uppercase">{row.name}</p>
                <p className="text-sm text-muted">
                  {row.kind}
                  {row.minutes ? ` · ${row.minutes} min` : ""} · {row.purpose || row.detail}
                </p>
              </div>
              <p className="font-display text-2xl">${row.price}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outlineDark" size="sm" onClick={() => setEditing(fromRow(row))}>
                Edit
              </Button>
              <ArmConfirm
                label="Delete"
                armedLabel="Tap again to delete"
                onConfirm={async () => {
                  const snapshot = fromRow(row);
                  await deleteService({ data: { id: row.id } });
                  await refresh();
                  pushUndo({
                    label: `Deleted ${row.name}.`,
                    run: async () => {
                      await saveService({ data: snapshot });
                      await refresh();
                    },
                  });
                }}
              />
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

export function AdminAccountsDesk() {
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
  const [notice,setNotice]=useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setRows(await listAccounts());
  }
  useEffect(() => {
    refresh().catch(() => setRows([]));
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
      const saved=await saveAccount({
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
      setNotice(saved.invitation||"Changes saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that account.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      {notice?<p role="status" className="mb-3">{notice}</p>:null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-2xl">Accounts and access</h3>
          <p className="mt-1 text-sm text-muted">New accounts receive a pending invitation at /invitations. Share that link with the recipient; they choose their own password and verify their email.</p>
        </div>
        <Button
          type="button"
          onClick={() =>
            setEditing({ name: "", email: "", role: "parent", playerName: "", password: "", owner: false })
          }
        >
          Add account
        </Button>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {(["admin", "coach", "parent", "player"] as const).map((role) => (
          <div key={role} className="rounded-xl bg-paper-2 px-3 py-3 shadow-border">
            <p className="text-[0.65rem] font-semibold tracking-widest text-muted uppercase">{role}</p>
            <p className="pd-num font-display text-2xl">{counts[role]}</p>
          </div>
        ))}
      </div>
      {editing ? (
        <form onSubmit={onSave} className="mt-4 grid gap-3 rounded-2xl bg-paper-2 p-5 shadow-border">
          <label className="text-sm font-semibold">
            Name
            <input required className={fieldClass} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </label>
          <label className="text-sm font-semibold">
            Email
            <input required className={fieldClass} value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
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
      <ul className="mt-4 grid gap-2">
        {rows.map((row) => (
          <li key={row.user_id} className="rounded-2xl bg-paper-2 p-4 shadow-border">
            <p className="font-display text-xl uppercase">{row.name}</p>
            <p className="text-sm text-muted">
              {row.email} · {row.role}
            </p>
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
              {row.owner ? null : (
                <ArmConfirm
                  label="Deactivate"
                  armedLabel="Tap again to deactivate"
                  onConfirm={async () => {
                    await deleteAccount({ data: { userId: row.user_id } });
                    await refresh();

                  }}
                />
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
