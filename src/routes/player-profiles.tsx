import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  getRecruitingWorkspace,
  saveRecruiting,
  setRecruitingConsent,
  submitRecruitingMetric,
  reviewRecruiting,
  linkRecruiting,
} from "@/lib/recruiting-api";
import { metricDefinitions, CONSENT_TEXT, type MetricKey } from "@/lib/recruiting-contracts";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/seo";
export const Route = createFileRoute("/player-profiles")({
  head: () =>
    pageHead(
      "/player-profiles",
      "Recruiting workspace",
      "Manage your recruiting profile and metric verification.",
      true,
    ),
  component: Page,
});
type Workspace = Awaited<ReturnType<typeof getRecruitingWorkspace>>;
type Player = Workspace["players"][number];
function Page() {
  const { user, isPending } = useCurrentUserState();
  const [data, setData] = useState<Workspace>(),
    [error, setError] = useState(""),
    [selected, setSelected] = useState("");
  const reload = async () => setData(await getRecruitingWorkspace());
  useEffect(() => {
    if (user && !user.isDevFallback) reload().catch((e) => setError(e.message));
  }, [user?.id]);
  if (isPending)
    return (
      <main id="main" className="p-5">
        Checking access…
      </main>
    );
  if (!user || user.isDevFallback)
    return (
      <main id="main" className="p-5">
        <a className="underline" href="/login?next=%2Fplayer-profiles">
          Sign in to manage recruiting profiles
        </a>
      </main>
    );
  const player = data?.players.find((p) => p.id === selected);
  return (
    <main id="main" className="mx-auto max-w-4xl px-5 py-8">
      <a className="inline-flex min-h-11 items-center underline" href="/players">
        Public player directory
      </a>
      <h1 className="text-3xl">Recruiting workspace</h1>
      <p className="my-3">
        Players and guardians manage their profile. Only a guardian can publish it. Admins and
        assigned head coaches review measurement requests here.
      </p>
      {error && <p role="alert">{error}</p>}
      {!data ? (
        <p>Loading records…</p>
      ) : (
        <>
          <label>
            Player
            <select
              className="office-control my-3"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Choose a player</option>
              {data.players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {!data.players.length && (
            <p>
              No editable players are linked to your account. Parents can add players in{" "}
              <a href="/family" className="underline">
                Family
              </a>
              ; the office can link a player’s login under Staff & Access.
            </p>
          )}
          {player && <Editor key={player.id} player={player} data={data} reload={reload} />}
          <section className="mt-8">
            <h2 className="text-2xl">Metric verification requests · {data.requests.length}</h2>
            <p className="mb-3">
              This is the approval inbox for admins and each player’s assigned head coach. Approve
              only a measurement you can substantiate.
            </p>
            {data.requests.map((r) => (
              <Review key={r.id + ":" + r.revision} request={r} reload={reload} />
            ))}
            {!data.requests.length && <p>No pending requests assigned to you.</p>}
          </section>
        </>
      )}
    </main>
  );
}
function Editor({
  player,
  data,
  reload,
}: {
  player: Player;
  data: Workspace;
  reload: () => Promise<void>;
}) {
  const [profile, setProfile] = useState(player.profile),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [signer, setSigner] = useState(""),
    [consent, setConsent] = useState(false),
    [roster, setRoster] = useState("");
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await reload();
      setNotice(msg);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="grid min-w-0 gap-4 rounded-xl border bg-white p-4">
      <h2 className="text-2xl">{player.name}</h2>
      <p>{player.published ? "Public · guardian consent on file" : "Private draft"}</p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <form
        className="grid min-w-0 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              saveRecruiting({
                data: { athleteId: player.id, revision: player.revision, profile },
              }),
            "Profile saved.",
          );
        }}
      >
        <label>
          Player photo (JPG, PNG or WebP, up to 5 MB)
          <input
            className="office-control"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                if (f.size > 5000000 || !["image/jpeg", "image/png", "image/webp"].includes(f.type))
                  throw Error("Choose a JPG, PNG or WebP up to 5 MB.");
                const url = URL.createObjectURL(f);
                try {
                  const img = new Image();
                  img.src = url;
                  await img.decode();
                  const canvas = document.createElement("canvas");
                  const scale = Math.min(1, 800 / Math.max(img.width, img.height));
                  canvas.width = Math.max(1, Math.round(img.width * scale));
                  canvas.height = Math.max(1, Math.round(img.height * scale));
                  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
                  const photo = canvas.toDataURL("image/jpeg", 0.8);
                  if (photo.length > 1000000) throw Error("Choose a smaller photo.");
                  setProfile((p) => ({ ...p, photo }));
                } finally {
                  URL.revokeObjectURL(url);
                }
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
        </label>
        {profile.photo && (
          <>
            <img
              src={profile.photo}
              alt="Profile photo preview"
              className="h-40 w-40 rounded object-cover"
            />
            <Button
              type="button"
              variant="outlineDark"
              onClick={() => setProfile({ ...profile, photo: "" })}
            >
              Remove photo
            </Button>
          </>
        )}
        <label>
          Biography
          <textarea
            className="office-control"
            maxLength={3000}
            rows={4}
            value={profile.bio}
            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
          />
        </label>
        <p className="text-sm">
          Do not put birthdays, phone numbers, home addresses, or private coaching/medical
          information in your public biography.
        </p>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {(
            [
              ["school", "School"],
              ["gradYear", "Graduation year"],
              ["city", "Hometown (city/state)"],
              ["positions", "Positions"],
              ["height", "Height (include units)"],
              ["weight", "Weight (include units)"],
              ["gpa", "GPA (optional, self-reported)"],
              ["commitment", "College commitment (optional)"],
              ["video", "Player video HTTPS link"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="min-w-0">
              {label}
              <input
                className="office-control"
                value={profile[key]}
                maxLength={key === "video" ? 2000 : 150}
                onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
              />
            </label>
          ))}
          {(["bats", "throws"] as const).map((k) => (
            <label key={k}>
              {k === "bats" ? "Bats" : "Throws"}
              <select
                className="office-control"
                value={profile[k]}
                onChange={(e) => setProfile({ ...profile, [k]: e.target.value })}
              >
                <option value="">Not specified</option>
                <option value="R">Right</option>
                <option value="L">Left</option>
                {k === "bats" && <option value="S">Switch</option>}
              </select>
            </label>
          ))}
        </div>
        <Button type="submit" disabled={busy}>
          Save profile
        </Button>
      </form>
      <details open>
        <summary className="min-h-11 cursor-pointer font-semibold">Public profile consent</summary>
        <p className="my-3">{CONSENT_TEXT}</p>
        {player.guardian ? (
          <div className="grid gap-3">
            <label>
              Parent / guardian signature
              <input
                className="office-control"
                value={signer}
                onChange={(e) => setSigner(e.target.value)}
              />
            </label>
            <label className="flex gap-3">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I agree to the public recruiting profile consent above.
            </label>
            <Button
              disabled={busy || !player.revision || !signer.trim() || !consent}
              onClick={() =>
                void run(
                  () =>
                    setRecruitingConsent({
                      data: { athleteId: player.id, publish: true, signer, consent },
                    }),
                  "Profile published.",
                )
              }
            >
              Authorize & publish profile
            </Button>
            {player.published && (
              <Button
                variant="outlineDark"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      setRecruitingConsent({
                        data: { athleteId: player.id, publish: false, signer, consent: false },
                      }),
                    "Consent withdrawn. Profile hidden.",
                  )
                }
              >
                Withdraw consent & hide profile
              </Button>
            )}
            {!player.revision && <p>Save your profile before authorizing publication.</p>}
          </div>
        ) : (
          <p>
            Only a parent or legal guardian linked to this player can authorize or withdraw
            publication.
          </p>
        )}
      </details>
      <section>
        <h3 className="text-xl">Player measurements</h3>
        <p>
          Enter the measured value and date. Request verification to send it to the admin and
          assigned head coach inbox. Editing a value removes any previous verification.
        </p>
        {(Object.keys(metricDefinitions) as MetricKey[]).map((k) => (
          <MetricEditor
            key={k + ":" + (player.metrics.find((m) => m.metric === k)?.revision || 0)}
            player={player}
            metric={k}
            reload={reload}
          />
        ))}
      </section>
      {data.admin && (
        <details>
          <summary className="min-h-11 cursor-pointer font-semibold">
            Link team records & game stats
          </summary>
          <p>
            Link this player’s exact roster record. Names alone are never merged. These links
            control team stats and head-coach verification access.
          </p>
          {player.links.map((l) => (
            <div key={l.team_id + l.roster_id} className="my-2 rounded border p-3">
              <p>
                {data.rosters.find((r) => r.teamId === l.team_id && r.rosterId === l.roster_id)
                  ?.label || l.roster_id}
              </p>
              <Button
                disabled={busy}
                variant="outlineDark"
                onClick={() =>
                  void run(
                    () =>
                      linkRecruiting({
                        data: {
                          athleteId: player.id,
                          teamId: l.team_id,
                          rosterId: l.roster_id,
                          remove: true,
                        },
                      }),
                    "Roster unlinked.",
                  )
                }
              >
                Unlink record
              </Button>
            </div>
          ))}
          <label>
            Roster record
            <select
              className="office-control"
              value={roster}
              onChange={(e) => setRoster(e.target.value)}
            >
              <option value="">Choose exact player and team</option>
              {data.rosters.map((r, i) => (
                <option key={r.teamId + r.rosterId} value={i}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            className="mt-3"
            disabled={busy || roster === ""}
            onClick={() => {
              const r = data.rosters[Number(roster)];
              void run(
                () =>
                  linkRecruiting({
                    data: { athleteId: player.id, teamId: r.teamId, rosterId: r.rosterId },
                  }),
                "Roster linked.",
              );
            }}
          >
            Link selected roster
          </Button>
        </details>
      )}
    </section>
  );
}
function MetricEditor({
  player,
  metric,
  reload,
}: {
  player: Player;
  metric: MetricKey;
  reload: () => Promise<void>;
}) {
  const old = player.metrics.find((m) => m.metric === metric),
    def = metricDefinitions[metric];
  const [value, setValue] = useState(old?.value.toString() || ""),
    [date, setDate] = useState(old?.measured_on || ""),
    [evidence, setEvidence] = useState(old?.evidence || ""),
    [request, setRequest] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <details className="my-3 rounded border p-3">
      <summary className="min-h-11 cursor-pointer font-semibold">
        {def.label}
        {old
          ? ` · ${old.value} ${def.unit} · ${old.status === "verified" ? "Verified" : old.status === "pending" ? "Verification requested" : "Unverified"}`
          : " · Not entered"}
      </summary>
      <form
        className="grid min-w-0 gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await submitRecruitingMetric({
              data: {
                athleteId: player.id,
                id: old?.id || "",
                revision: old?.revision || 0,
                metric,
                value: Number(value),
                measuredOn: date,
                evidence,
                request,
              },
            });
            await reload();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {def.label} ({def.unit})
          <input
            className="office-control"
            type="number"
            min={0.01}
            max={def.max}
            step="0.01"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <label className="min-w-0">
          Measurement date
          <input
            className="office-control block appearance-none"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Evidence link (optional; staff review only)
          <input
            className="office-control"
            type="url"
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
          />
        </label>
        <label className="flex gap-3">
          <input type="checkbox" checked={request} onChange={(e) => setRequest(e.target.checked)} />
          Request admin / head-coach verification
        </label>
        {old?.review_note && <p>Staff feedback: {old.review_note}</p>}
        {error && <p role="alert">{error}</p>}
        <Button type="submit" disabled={busy}>
          {request ? "Save & request verification" : "Save unverified measurement"}
        </Button>
      </form>
    </details>
  );
}
function Review({
  request: r,
  reload,
}: {
  request: Workspace["requests"][number];
  reload: () => Promise<void>;
}) {
  const [method, setMethod] = useState(""),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const review = async (approve: boolean) => {
    setBusy(true);
    setError("");
    try {
      await reviewRecruiting({ data: { id: r.id, revision: r.revision, approve, method, note } });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="my-3 grid gap-3 rounded-xl border bg-white p-4">
      <h3 className="text-xl">
        {r.playerName} · {metricDefinitions[r.metric].label}
      </h3>
      <p>
        {r.value} {metricDefinitions[r.metric].unit} · measured {r.measured_on}
      </p>
      {r.evidence && (
        <a className="underline" href={r.evidence} target="_blank" rel="noreferrer">
          Review submitted evidence
        </a>
      )}
      <label>
        Verification method (shown publicly when verified)
        <input
          className="office-control"
          placeholder="Observed with radar at facility on…"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        />
      </label>
      <label>
        Private feedback to player / guardian
        <textarea
          className="office-control"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy || !method.trim()} onClick={() => void review(true)}>
          Verify measurement
        </Button>
        <Button disabled={busy} variant="outlineDark" onClick={() => void review(false)}>
          Return unverified
        </Button>
      </div>
    </article>
  );
}
