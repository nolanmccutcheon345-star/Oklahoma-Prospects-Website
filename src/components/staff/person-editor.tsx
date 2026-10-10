import { useEffect, useState, useRef } from "react";
import { getPerson, getMyPerson, savePerson, saveMyPerson } from "@/lib/person-api";
import type { PersonSave, SharedProfile } from "@/lib/person-contracts";
import { Button } from "../ui/button";
type Options = Awaited<ReturnType<typeof getPerson>>["options"];
export function PersonEditor({ userId, onClose }: { userId?: string; onClose?: () => void }) {
  const root = useRef<HTMLElement>(null);
  const [specialtiesText, setSpecialtiesText] = useState("");
  const [record, setRecord] = useState<Awaited<ReturnType<typeof getMyPerson>>>(),
    [options, setOptions] = useState<Options>(),
    [value, setValue] = useState<PersonSave>(),
    [existingHomes, setExistingHomes] = useState<{ id: string; primary_email: string }[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => {
    setError("");
    try {
      if (userId) {
        const r = await getPerson({ data: { userId } });
        setRecord({ ...r, canManage: true });
        setOptions(r.options);
        setExistingHomes(r.existingHouseholds);
        setValue(r.value);
        setSpecialtiesText(r.value.profile.specialties.join(", "));
      } else {
        const r = await getMyPerson();
        setRecord(r);
        setValue(r.value);
        setSpecialtiesText(r.value.profile.specialties.join(", "));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load profile.");
    }
  };
  useEffect(() => {
    void load();
  }, [userId]);
  useEffect(() => {
    if (userId && record) root.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [userId, Boolean(record)]);
  const update = (next: Partial<PersonSave>) => setValue((v) => (v ? { ...v, ...next } : v));
  const profile = (next: Partial<SharedProfile>) =>
    setValue((v) => (v ? { ...v, profile: { ...v.profile, ...next } } : v));
  if (!value || !record)
    return (
      <section>
        <p role={error ? "alert" : "status"}>{error || "Loading person…"}</p>
        {onClose && <Button onClick={onClose}>Close</Button>}
      </section>
    );
  return (
    <section ref={root} className="my-4 rounded-xl border border-line bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl">{userId ? "Edit Person" : "My Coaching & Instructor Profile"}</h2>
        {onClose && (
          <Button variant="outlineDark" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
      <p className="mt-2 text-sm">
        {record.user.email} · Account: {record.primaryRole}
      </p>
      <p className="mt-2 text-sm text-muted">
        One photo and bio across Coaches and Instructors. Assignments do not replace the account’s
        existing role.
      </p>
      {!userId && record.canManage && (
        <a
          className="mt-3 inline-flex min-h-11 items-center underline"
          href={`/office?section=staff&person=${encodeURIComponent(record.user.id)}`}
        >
          Manage my assignments and publication
        </a>
      )}
      <form
        className="mt-5 grid gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          setNotice("");
          try {
            const finalProfile = {
              ...value.profile,
              specialties: specialtiesText
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            };
            if (userId) await savePerson({ data: { ...value, profile: finalProfile } });
            else
              await saveMyPerson({
                data: {
                  revision: value.revision,
                  profile: finalProfile,
                  reviewedSources: value.reviewedSources,
                },
              });
            await load();
            setNotice("Shared profile saved. Both directories use these details.");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {record.sources.length > 0 && (
          <details className="rounded-lg border p-3">
            <summary className="min-h-11 cursor-pointer font-semibold">
              Review existing profiles ({record.sources.length})
            </summary>
            <p className="text-sm">
              These records match this account’s email. Choose the wording you want to keep, then
              review the shared fields below.
            </p>
            {record.sources.map((s, i) => (
              <article className="mt-3 rounded border p-3" key={i}>
                <h3 className="text-xl">{s.label}</h3>
                <p>{s.profile.name}</p>
                <p className="whitespace-pre-wrap text-sm">{s.profile.bio || "No bio recorded."}</p>
                {s.profile.photo && (
                  <img
                    src={s.profile.photo}
                    alt="Existing profile"
                    className="mt-2 h-24 w-24 object-contain"
                  />
                )}
                <Button
                  type="button"
                  variant="outlineDark"
                  className="mt-2"
                  onClick={() => {
                    profile(s.profile);
                    setSpecialtiesText(s.profile.specialties.join(", "));
                  }}
                >
                  Use these profile details
                </Button>
              </article>
            ))}
          </details>
        )}
        <label className="grid gap-1">
          Display name
          <input
            className="office-control"
            required
            maxLength={120}
            value={value.profile.name}
            onChange={(e) => profile({ name: e.target.value })}
          />
        </label>
        <label className="grid gap-1">
          Photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="office-control"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                if (f.size > 5000000) throw new Error("Choose a photo smaller than 5 MB.");
                const url = URL.createObjectURL(f);
                try {
                  const img = new Image();
                  img.src = url;
                  await img.decode();
                  const canvas = document.createElement("canvas");
                  const scale = Math.min(1, 500 / Math.max(img.width, img.height));
                  canvas.width = Math.max(1, Math.round(img.width * scale));
                  canvas.height = Math.max(1, Math.round(img.height * scale));
                  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
                  const result = canvas.toDataURL("image/jpeg", 0.75);
                  if (result.length > 250000) throw new Error("Choose a smaller picture.");
                  profile({ photo: result });
                } finally {
                  URL.revokeObjectURL(url);
                }
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not process photo.");
              }
            }}
          />
        </label>
        {value.profile.photo && (
          <div>
            <img
              src={value.profile.photo}
              alt={value.profile.name}
              className="h-36 w-36 rounded-lg object-contain"
            />
            <button
              className="min-h-11 underline"
              type="button"
              onClick={() => profile({ photo: "" })}
            >
              Remove photo
            </button>
          </div>
        )}
        <fieldset>
          <legend className="font-semibold">Sports</legend>
          <div className="flex gap-5">
            {(["baseball", "softball"] as const).map((s) => (
              <label key={s} className="flex min-h-11 items-center gap-2 capitalize">
                <input
                  type="checkbox"
                  checked={value.profile.sports.includes(s)}
                  onChange={(e) =>
                    profile({
                      sports: e.target.checked
                        ? [...value.profile.sports, s]
                        : value.profile.sports.filter((x) => x !== s),
                    })
                  }
                />
                {s}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="grid gap-1">
          Specialties (comma separated)
          <input
            className="office-control"
            value={specialtiesText}
            onChange={(e) => setSpecialtiesText(e.target.value)}
          />
        </label>
        {(
          [
            ["bio", "Bio & background", 3000],
            ["ages", "Ages and experience levels", 500],
            ["approach", "Coaching approach", 2000],
            ["achievements", "Credentials & accomplishments", 2000],
            ["welcome", "Message to new families", 1000],
          ] as const
        ).map(([key, label, max]) => (
          <label className="grid gap-1" key={key}>
            {label}
            <textarea
              className="office-control"
              rows={key === "bio" ? 5 : 2}
              maxLength={max}
              value={value.profile[key]}
              onChange={(e) => profile({ [key]: e.target.value })}
            />
          </label>
        ))}
        {userId && options && (
          <>
            <fieldset className="grid gap-3 rounded-xl border p-4">
              <legend className="px-2 font-semibold">Team Coach assignments</legend>
              <p className="text-sm">
                Select teams and roles. Seasons come from each team’s published season assignments.
              </p>
              {options.teams.map((t) => {
                const a = value.teams.find((a) => a.teamId === t.id);
                return (
                  <div key={t.id} className="grid gap-2 rounded border p-3">
                    <label className="flex min-h-11 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(a)}
                        onChange={(e) =>
                          update({
                            teams: e.target.checked
                              ? [...value.teams, { teamId: t.id, role: "Assistant Coach" }]
                              : value.teams.filter((a) => a.teamId !== t.id),
                            ...(!e.target.checked && value.teams.length === 1
                              ? { publishCoach: false }
                              : {}),
                          })
                        }
                      />
                      {t.name} · {t.seasons.join(" · ")}
                    </label>
                    {a && (
                      <label>
                        Role
                        <select
                          className="office-control"
                          value={a.role}
                          onChange={(e) =>
                            update({
                              teams: value.teams.map((a) =>
                                a.teamId === t.id
                                  ? { ...a, role: e.target.value as typeof a.role }
                                  : a,
                              ),
                            })
                          }
                        >
                          {[...new Set(["Head Coach", "Assistant Coach", "Coach", a.role])].map(
                            (r) => (
                              <option key={r}>{r}</option>
                            ),
                          )}
                        </select>
                      </label>
                    )}
                    <p className="text-xs text-muted">
                      Current head coach: {t.headCoach || "Unassigned"}
                    </p>
                  </div>
                );
              })}
              {!options.teams.length && <p>No active teams yet.</p>}
            </fieldset>
            <fieldset className="grid gap-3 rounded-xl border p-4">
              <legend className="px-2 font-semibold">Instructor assignment</legend>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={value.instructor}
                  onChange={(e) =>
                    update({
                      instructor: e.target.checked,
                      ...(!e.target.checked ? { publishInstructor: false } : {}),
                    })
                  }
                />
                Offers lessons
              </label>
              {value.instructor && (
                <>
                  <h3 className="text-xl">Approved lesson services</h3>
                  {options.services.map((s) => {
                    const o = value.offerings.find((o) => o.serviceId === s.id);
                    return (
                      <div key={s.id} className="flex flex-wrap items-center gap-3">
                        <label className="flex min-h-11 flex-1 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(o)}
                            onChange={(e) =>
                              update({
                                offerings: e.target.checked
                                  ? [...value.offerings, { serviceId: s.id, profitSplit: 60 }]
                                  : value.offerings.filter((o) => o.serviceId !== s.id),
                              })
                            }
                          />
                          {s.name} · {s.minutes} min{s.active ? "" : " · Archived"}
                        </label>
                        {o && (
                          <label className="w-28 text-sm">
                            Instructor share %
                            <input
                              className="office-control"
                              type="number"
                              min={0}
                              max={100}
                              value={o.profitSplit}
                              onChange={(e) =>
                                update({
                                  offerings: value.offerings.map((o) =>
                                    o.serviceId === s.id
                                      ? { ...o, profitSplit: Number(e.target.value) }
                                      : o,
                                  ),
                                })
                              }
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}
                  <h3 className="mt-2 text-xl">Weekly availability · Central Time</h3>
                  {value.windows.map((w, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <label>
                        Day
                        <select
                          className="office-control"
                          value={w.weekday}
                          onChange={(e) =>
                            update({
                              windows: value.windows.map((w, n) =>
                                n === i ? { ...w, weekday: e.target.value as typeof w.weekday } : w,
                              ),
                            })
                          }
                        >
                          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                            <option key={d}>{d}</option>
                          ))}
                        </select>
                      </label>
                      {(["start", "end"] as const).map((k) => (
                        <label key={k} className="capitalize">
                          {k}
                          <input
                            className="office-control"
                            type="time"
                            value={w[k]}
                            onChange={(e) =>
                              update({
                                windows: value.windows.map((w, n) =>
                                  n === i ? { ...w, [k]: e.target.value } : w,
                                ),
                              })
                            }
                          />
                        </label>
                      ))}
                      <Button
                        type="button"
                        variant="outlineDark"
                        onClick={() => update({ windows: value.windows.filter((_, n) => n !== i) })}
                      >
                        Remove window
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outlineDark"
                    onClick={() =>
                      update({
                        windows: [
                          ...value.windows,
                          { weekday: "Mon", start: "16:00", end: "20:00" },
                        ],
                      })
                    }
                  >
                    Add availability window
                  </Button>
                  <p className="text-sm">
                    Booking opens only for approved services with usable availability. Existing paid
                    bookings remain on the schedule.
                  </p>
                </>
              )}
            </fieldset>
            <details className="rounded-xl border p-4">
              <summary className="min-h-11 cursor-pointer font-semibold">
                Parent / Guardian and Player links
              </summary>
              <p className="text-sm">
                Guardian links grant household access. Player links grant access to the selected
                person’s own player records. Select records carefully.
              </p>
              {existingHomes.length > 0 && (
                <p className="my-3 text-sm">
                  Existing household memberships:{" "}
                  {existingHomes.map((h) => h.primary_email).join(", ")}. These memberships remain
                  in place.
                </p>
              )}
              <h3 className="mt-3 text-xl">Additional guardian households</h3>
              {options.households.map((h) => (
                <label key={h.id} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={value.guardianHouseholds.includes(h.id)}
                    onChange={(e) =>
                      update({
                        guardianHouseholds: e.target.checked
                          ? [...value.guardianHouseholds, h.id]
                          : value.guardianHouseholds.filter((id) => id !== h.id),
                      })
                    }
                  />
                  {h.primary_email}
                </label>
              ))}
              <h3 className="mt-4 text-xl">This person’s own player records</h3>
              {options.players.map((p) => (
                <label key={p.id} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={value.playerIds.includes(p.id)}
                    onChange={(e) =>
                      update({
                        playerIds: e.target.checked
                          ? [...value.playerIds, p.id]
                          : value.playerIds.filter((id) => id !== p.id),
                      })
                    }
                  />
                  {p.name}
                </label>
              ))}
            </details>
            <fieldset className="rounded-xl border p-4">
              <legend className="px-2 font-semibold">Public directories</legend>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={value.publishCoach}
                  disabled={!value.teams.length}
                  onChange={(e) => update({ publishCoach: e.target.checked })}
                />
                Publish on Coaches
              </label>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={value.publishInstructor}
                  disabled={!value.instructor}
                  onChange={(e) => update({ publishInstructor: e.target.checked })}
                />
                Publish on Instructors
              </label>
              <p className="text-sm">
                Publication does not grant permissions. Admin access remains controlled separately.
              </p>
            </fieldset>
          </>
        )}
        {!userId && (
          <p className="text-sm">
            Publication and assignments are managed by Front Office. Currently: Coaches{" "}
            {value.publishCoach ? "published" : "not published"} · Instructors{" "}
            {value.publishInstructor ? "published" : "not published"}.
          </p>
        )}
        {record.sources.length > 1 && (
          <label className="flex gap-2">
            <input
              type="checkbox"
              required
              checked={value.reviewedSources}
              onChange={(e) => update({ reviewedSources: e.target.checked })}
            />
            I reviewed the existing profile details and selected what to keep.
          </label>
        )}
        {error && (
          <p role="alert" className="text-maroon">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        <Button type="submit" disabled={busy || record.user.disabled}>
          {busy ? "Saving…" : "Save Shared Profile" + (userId ? " & Assignments" : "")}
        </Button>
      </form>
    </section>
  );
}
