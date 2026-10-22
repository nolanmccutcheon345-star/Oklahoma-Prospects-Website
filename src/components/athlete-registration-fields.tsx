import { useEffect, useState } from "react";
import { getRegistrationAthletes, claimAthleteRegistration } from "@/lib/portal-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type { AthleteRegistrationInput } from "@/lib/athlete-registration-contracts";
import type { FamilyAthlete } from "@/lib/athlete-registration.server";
import { chicagoDate } from "@/lib/scheduling";
export const emptyAthleteRegistration: AthleteRegistrationInput = {
  athleteId: "",
  revision: 0,
  birthDate: "",
  graduationYear: "",
  schoolStatus: "school",
  school: "",
  eligibilityOrganization: "USSSA",
  currentGrade: "unknown",
  correctionReason: "",
};
const field = "mt-1 block min-h-11 w-full rounded-md border bg-paper-2 p-2 text-base";
export function AthleteRegistrationFields({
  value,
  onChange,
  onName,
}: {
  value: AthleteRegistrationInput;
  onChange: (v: AthleteRegistrationInput) => void;
  onName: (name: string) => void;
}) {
  const { user, isPending } = useCurrentUserState();
  const [athletes, setAthletes] = useState<FamilyAthlete[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const [claim, setClaim] = useState({ requestId: "", token: "", athleteId: "" }),
    [claimBusy, setClaimBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    if (!user) {
      setAthletes([]);
      return;
    }
    setLoading(true);
    getRegistrationAthletes()
      .then((v) => {
        if (active) setAthletes(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);
  const update = (patch: Partial<AthleteRegistrationInput>) => onChange({ ...value, ...patch });
  const selected = athletes.find((a) => a.id === value.athleteId);
  return (
    <div className="grid gap-3 rounded-xl border bg-paper p-4">
      <h4 className="text-xl">Athlete profile</h4>
      <p className="text-sm">
        Enter these details once and confirm them on future signups. Staff lists show birth month
        and year only. Eligibility does not guarantee team placement.
      </p>
      {isPending || loading ? (
        <p role="status">Loading your athletes…</p>
      ) : user ? (
        <label>
          Choose an athlete
          <select
            className={field}
            value={value.athleteId}
            onChange={(e) => {
              const a = athletes.find((a) => a.id === e.target.value);
              if (a) {
                onName(a.name);
                onChange({
                  athleteId: a.id,
                  revision: a.revision,
                  birthDate: a.birthDate,
                  schoolStatus: (a.schoolStatus ||
                    "school") as AthleteRegistrationInput["schoolStatus"],
                  school: a.school,
                  graduationYear: a.graduationYear,
                  eligibilityOrganization: value.eligibilityOrganization,
                  currentGrade: "unknown",
                  correctionReason: "",
                });
              } else onChange({ ...emptyAthleteRegistration });
            }}
          >
            <option value="">Add an athlete</option>
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm">
          <a className="underline" href="/login?next=%2Ftryouts">
            Sign in
          </a>{" "}
          to reuse a saved athlete, or continue as a guest.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <label>
        Date of birth (private)
        <input
          className={field}
          type="date"
          required
          max={chicagoDate()}
          value={value.birthDate}
          onInput={(e) => update({ birthDate: e.currentTarget.value })}
          onChange={(e) => update({ birthDate: e.target.value })}
        />
      </label>
      {selected?.birthDate && selected.birthDate !== value.birthDate && (
        <label>
          Reason for birthdate correction
          <input
            className={field}
            required
            maxLength={500}
            value={value.correctionReason}
            onChange={(e) => update({ correctionReason: e.target.value })}
          />
        </label>
      )}
      <label>
        Expected high-school graduation year
        <select
          className={field}
          required
          value={value.graduationYear}
          onChange={(e) => update({ graduationYear: e.target.value })}
        >
          <option value="">Select a year</option>
          <option value="unknown">Not sure yet</option>
          {Array.from({ length: 35 }, (_, i) => new Date().getFullYear() - 10 + i).map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
      </label>
      <label>
        Eligibility rules reference
        <select
          className={field}
          value={value.eligibilityOrganization}
          onChange={(e) =>
            update({ eligibilityOrganization: e.target.value as "USSSA" | "unknown" })
          }
        >
          <option value="USSSA">USSSA — base age guidance</option>
          <option value="unknown">Other / Not sure — staff review</option>
        </select>
      </label>
      <label>
        Current school grade (for eligibility review)
        <select
          className={field}
          value={value.currentGrade}
          onChange={(e) =>
            update({ currentGrade: e.target.value as AthleteRegistrationInput["currentGrade"] })
          }
        >
          <option value="unknown">Not sure / Not applicable</option>
          <option value="pre-k">Pre-K</option>
          <option value="k">Kindergarten</option>
          {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((g) => (
            <option key={g} value={g}>
              Grade {g}
            </option>
          ))}
        </select>
        <span className="text-sm">
          Grade exceptions require staff review and supporting documentation. Graduation year is not
          used to infer grade.
        </span>
      </label>
      <label>
        School status
        <select
          className={field}
          value={value.schoolStatus}
          onChange={(e) =>
            update({
              schoolStatus: e.target.value as AthleteRegistrationInput["schoolStatus"],
              school: "",
            })
          }
        >
          <option value="school">Attends a school</option>
          <option value="homeschool">Homeschool</option>
          <option value="other">Other</option>
          <option value="not-enrolled">Not enrolled yet</option>
        </select>
      </label>
      {["school", "other"].includes(value.schoolStatus) && (
        <label>
          Current school
          <input
            className={field}
            required
            list="registration-schools"
            maxLength={160}
            value={value.school}
            onChange={(e) => update({ school: e.target.value })}
          />
          <span className="text-sm">Search suggestions or type the full school name.</span>
          <datalist id="registration-schools">
            {[
              "Broken Arrow High School",
              "Union High School",
              "Bixby High School",
              "Jenks High School",
              "Owasso High School",
              "Coweta High School",
              "Wagoner High School",
              "Tulsa Memorial High School",
              "Tulsa Edison Preparatory School",
            ].map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
      )}
      {user && (
        <details>
          <summary>Link an earlier guest registration</summary>
          <p className="text-sm">
            Use the private claim code shown after submission. Sign in with the verified email used
            on that registration.
          </p>
          <label>
            Registration reference
            <input
              className={field}
              value={claim.requestId}
              onChange={(e) => setClaim({ ...claim, requestId: e.target.value })}
            />
          </label>
          <label>
            Private claim code
            <input
              className={field}
              autoComplete="off"
              value={claim.token}
              onChange={(e) => setClaim({ ...claim, token: e.target.value })}
            />
          </label>
          <label>
            Link to
            <select
              className={field}
              value={claim.athleteId}
              onChange={(e) => setClaim({ ...claim, athleteId: e.target.value })}
            >
              <option value="">Create this athlete in my household</option>
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={claimBusy}
            className="mt-2 rounded bg-powder p-3 text-ink"
            onClick={async () => {
              setClaimBusy(true);
              setError("");
              try {
                await claimAthleteRegistration({ data: claim });
                setAthletes(await getRegistrationAthletes());
                setNotice("Registration linked. Select the athlete above.");
                setClaim({ requestId: "", token: "", athleteId: "" });
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not link registration.");
              } finally {
                setClaimBusy(false);
              }
            }}
          >
            Link registration
          </button>
          {notice && <p role="status">{notice}</p>}
        </details>
      )}
    </div>
  );
}
