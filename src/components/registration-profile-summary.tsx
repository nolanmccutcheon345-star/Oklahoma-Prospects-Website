import type { RegistrationSummary } from "@/lib/athlete-registration-contracts";
export function RegistrationProfileSummary({ profile = {} }: { profile?: RegistrationSummary }) {
  return (
    <div className="rounded border bg-paper p-3 text-sm">
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="font-semibold">Birth month / year</dt>
          <dd>{profile.birthMonthYear || "Missing — needs review"}</dd>
        </div>
        <div>
          <dt className="font-semibold">Graduation year</dt>
          <dd>
            {profile.graduationYear === "unknown"
              ? "Not sure yet"
              : profile.graduationYear || "Missing"}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">School</dt>
          <dd>
            {profile.school ||
              { homeschool: "Homeschool", "not-enrolled": "Not enrolled yet" }[
                profile.schoolStatus || ""
              ] ||
              "Missing"}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Suggested division</dt>
          <dd>{profile.suggestedDivision || "Not calculated"}</dd>
        </div>
      </dl>
      <p>
        Reported grade:{" "}
        {profile.currentGrade && profile.currentGrade !== "unknown"
          ? profile.currentGrade
          : "Not provided"}
      </p>
      <p className="mt-2 font-semibold">{profile.eligibilityStatus || "Needs review"}</p>
      <p>
        {profile.eligibilityExplanation ||
          "Complete missing athlete information before classifying this registration."}
      </p>
      {profile.eligibilitySource && (
        <p>
          <a
            className="underline"
            href={profile.eligibilitySource}
            target="_blank"
            rel="noreferrer"
          >
            Eligibility rule source
          </a>{" "}
          · Cutoff: {profile.eligibilityCutoff}
        </p>
      )}
    </div>
  );
}
