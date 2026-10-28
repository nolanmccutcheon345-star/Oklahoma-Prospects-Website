import { useEffect, useRef, useState } from "react";
import {
  getOrganizationPeople,
  getOrganizationPerson,
  saveOrganizationPerson,
} from "@/lib/coordinator/organization-people-api";
import { saveOrganizationInstruction } from "@/lib/operational-instruction-api";
import type { OrganizationPersonInput } from "@/lib/coordinator/organization-people-contracts";
import type { OperationalInstructionInput } from "@/lib/operational-instruction-contracts";
import { OrganizationInstructionAccess } from "./organization-instruction-access";
import { Button } from "../ui/button";
type Detail = Awaited<ReturnType<typeof getOrganizationPerson>>;
type Directory = Awaited<ReturnType<typeof getOrganizationPeople>>;
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to save. Refresh and try again.";
const control = "min-h-11 w-full min-w-0 rounded border border-line bg-white p-2 text-ink";
export function OrganizationPeople() {
  const [directory, setDirectory] = useState<Directory | null>(null),
    [person, setPerson] = useState<Detail | null>(null),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const pending = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    getOrganizationPeople()
      .then((value) => {
        if (mounted.current) setDirectory(value);
      })
      .catch((cause) => {
        if (mounted.current) setError(message(cause));
      });
    return () => {
      mounted.current = false;
    };
  }, []);
  async function load(userId: string) {
    setPerson(null);
    const value = await getOrganizationPerson({ data: { userId } });
    if (mounted.current) setPerson(value);
  }
  async function select(userId: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setSelected(userId);
    setError("");
    setSuccess("");
    try {
      await load(userId);
    } catch (cause) {
      if (mounted.current) setError(message(cause));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function save(
    value: OrganizationPersonInput | OperationalInstructionInput,
    instruction = false,
  ) {
    if (pending.current || value.userId !== selected) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    let saved = false;
    try {
      if (instruction)
        await saveOrganizationInstruction({ data: value as OperationalInstructionInput });
      else await saveOrganizationPerson({ data: value as OrganizationPersonInput });
      saved = true;
      await load(value.userId);
      const list = await getOrganizationPeople();
      if (mounted.current) {
        setDirectory(list);
        setSuccess(instruction ? "Operational instructor access saved." : "Person updated.");
      }
    } catch (cause) {
      if (mounted.current) {
        setError(
          saved
            ? "Changes saved. Refresh people before making more changes. " + message(cause)
            : message(cause),
        );
        if (saved) setPerson(null);
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className="grid gap-4" aria-label="Organization people">
      <h2 className="text-2xl">People & public profiles</h2>
      <p>
        Manage operational contacts, directory status, public profile text, and availability for
        existing approved services. Account security and financial settings use their protected
        workflows.
      </p>
      {error && <p role="alert">{error}</p>}
      {success && <p role="status">{success}</p>}
      <label>
        Person
        <select
          className={control}
          aria-label="Person"
          disabled={busy || !directory}
          value={selected}
          onChange={(e) => void select(e.target.value)}
        >
          <option value="">Choose person</option>
          {directory?.people.map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.name}
              {!p.active ? " (inactive)" : ""}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <Button disabled={busy} onClick={() => void select(selected)}>
          Refresh person
        </Button>
      )}
      {busy && <p role="status">Loading or saving…</p>}
      {person && (
        <>
          <OrganizationInstructionAccess
            key={person.userId + ":" + person.instruction.revision}
            userId={person.userId}
            instruction={person.instruction}
            busy={busy}
            onSave={(value) => save(value, true)}
          />
          <PersonForm
            key={person.userId + ":" + person.revision + ":" + person.profileRevision}
            person={person}
            busy={busy}
            onSave={(value) => save(value)}
          />
        </>
      )}
    </section>
  );
}
export function PersonForm({
  person,
  busy,
  onSave,
}: {
  person: Detail;
  busy: boolean;
  onSave: (value: OrganizationPersonInput) => Promise<void>;
}) {
  const [value, setValue] = useState<OrganizationPersonInput>({
    userId: person.userId,
    revision: person.revision,
    profileRevision: person.profileRevision,
    sourceRevision: person.sourceRevision,
    contactEmail: person.contactEmail,
    phone: person.phone,
    active: person.active,
    profile: person.profile,
    publishCoach: person.publishCoach,
    publishInstructor: person.publishInstructor,
    windows: person.windows,
    unavailableServiceIds: person.services.filter((s) => !s.available).map((s) => s.id),
    reviewedPublication: false,
  });
  const update = (change: Partial<OrganizationPersonInput>) =>
    setValue((v) => ({ ...v, ...change }));
  const profileChanged =
    JSON.stringify(value.profile) !== JSON.stringify(person.profile) ||
    value.publishCoach !== person.publishCoach ||
    value.publishInstructor !== person.publishInstructor;
  const needsReview = profileChanged && (value.publishCoach || value.publishInstructor);
  return (
    <form
      aria-label="Operational person"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void onSave(value);
      }}
      className="grid gap-4"
    >
      <p>Sign-in email (read only): {person.loginEmail}</p>
      {person.accountDisabled && (
        <p>Account sign-in is disabled. Directory status does not enable sign-in.</p>
      )}
      <fieldset disabled={busy} className="grid gap-3">
        <label>
          Operational contact email
          <input
            className={control}
            type="email"
            name="contactEmail"
            value={value.contactEmail}
            onChange={(e) => update({ contactEmail: e.target.value })}
          />
        </label>
        <label>
          Operational phone
          <input
            className={control}
            name="phone"
            value={value.phone}
            onChange={(e) => update({ phone: e.target.value })}
          />
        </label>
        <label>
          <input
            type="checkbox"
            name="active"
            checked={value.active}
            onChange={(e) => update({ active: e.target.checked })}
          />{" "}
          Active in operational directory
        </label>
        <p>
          Current team associations:{" "}
          {person.teams.map((t) => t.name + " (" + t.role + ")").join(", ") || "None"}
        </p>
        {person.profileWithheld ? (
          <p>This private profile needs owner review before its text can be edited.</p>
        ) : (
          value.profile && (
            <>
              <h3 className="font-semibold">Public profile</h3>
              {(
                ["name", "photo", "bio", "ages", "approach", "achievements", "welcome"] as const
              ).map((key) => (
                <label key={key}>
                  {key[0].toUpperCase() + key.slice(1)}
                  {key === "bio" ||
                  key === "approach" ||
                  key === "achievements" ||
                  key === "welcome" ? (
                    <textarea
                      className={control}
                      name={key}
                      value={value.profile![key]}
                      onChange={(e) =>
                        update({
                          profile: { ...value.profile!, [key]: e.target.value },
                          reviewedPublication: false,
                        })
                      }
                    />
                  ) : (
                    <input
                      className={control}
                      name={key}
                      value={value.profile![key]}
                      onChange={(e) =>
                        update({
                          profile: { ...value.profile!, [key]: e.target.value },
                          reviewedPublication: false,
                        })
                      }
                    />
                  )}
                </label>
              ))}
              <label>
                Specialties (comma separated)
                <input
                  className={control}
                  name="specialties"
                  value={value.profile.specialties.join(", ")}
                  onChange={(e) =>
                    update({
                      profile: {
                        ...value.profile!,
                        specialties: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      },
                      reviewedPublication: false,
                    })
                  }
                />
              </label>
              {(["baseball", "softball"] as const).map((sport) => (
                <label key={sport}>
                  <input
                    type="checkbox"
                    checked={value.profile!.sports.includes(sport)}
                    onChange={(e) =>
                      update({
                        profile: {
                          ...value.profile!,
                          sports: e.target.checked
                            ? [...value.profile!.sports, sport]
                            : value.profile!.sports.filter((s) => s !== sport),
                        },
                        reviewedPublication: false,
                      })
                    }
                  />
                  {sport}
                </label>
              ))}
              <label>
                <input
                  name="publishCoach"
                  type="checkbox"
                  checked={value.publishCoach}
                  onChange={(e) =>
                    update({ publishCoach: e.target.checked, reviewedPublication: false })
                  }
                />{" "}
                Publish on Coaches
              </label>
              <label>
                <input
                  name="publishInstructor"
                  type="checkbox"
                  checked={value.publishInstructor}
                  disabled={!person.canPublishInstructor && !value.publishInstructor}
                  onChange={(e) =>
                    update({ publishInstructor: e.target.checked, reviewedPublication: false })
                  }
                />{" "}
                Publish on Instructors
              </label>
              {needsReview && (
                <label>
                  <input
                    name="reviewedPublication"
                    required
                    type="checkbox"
                    checked={value.reviewedPublication}
                    onChange={(e) => update({ reviewedPublication: e.target.checked })}
                  />{" "}
                  I reviewed this profile for public display
                </label>
              )}
            </>
          )
        )}
        <h3 className="font-semibold">Existing approved services</h3>
        {person.services.length ? (
          person.services.map((service) => (
            <label key={service.id}>
              <input
                type="checkbox"
                checked={!value.unavailableServiceIds.includes(service.id)}
                onChange={(e) =>
                  update({
                    unavailableServiceIds: e.target.checked
                      ? value.unavailableServiceIds.filter((id) => id !== service.id)
                      : [...value.unavailableServiceIds, service.id],
                  })
                }
              />
              {service.name} · {service.minutes} minutes available for new bookings
            </label>
          ))
        ) : (
          <p>No approved instructor services.</p>
        )}
        <h3 className="font-semibold">Recurring availability · Central time</h3>
        {value.windows.map((window, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-4">
            <select
              aria-label={"Weekday " + (index + 1)}
              className={control}
              value={window.weekday}
              onChange={(e) =>
                update({
                  windows: value.windows.map((w, i) =>
                    i === index ? { ...w, weekday: e.target.value as typeof w.weekday } : w,
                  ),
                })
              }
            >
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <option key={day}>{day}</option>
              ))}
            </select>
            {(["start", "end"] as const).map((key) => (
              <input
                key={key}
                aria-label={key + " " + (index + 1)}
                className={control}
                type="time"
                value={window[key]}
                onChange={(e) =>
                  update({
                    windows: value.windows.map((w, i) =>
                      i === index ? { ...w, [key]: e.target.value } : w,
                    ),
                  })
                }
              />
            ))}
            <Button
              type="button"
              onClick={() => update({ windows: value.windows.filter((_, i) => i !== index) })}
            >
              Remove window
            </Button>
          </div>
        ))}
        <Button
          type="button"
          disabled={!person.services.length || value.windows.length >= 28}
          onClick={() =>
            update({
              windows: [...value.windows, { weekday: "Mon", start: "16:00", end: "20:00" }],
            })
          }
        >
          Add window
        </Button>
        <Button type="submit" disabled={busy || (needsReview && !value.reviewedPublication)}>
          Save person
        </Button>
      </fieldset>
    </form>
  );
}
