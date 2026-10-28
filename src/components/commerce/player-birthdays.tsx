import { useEffect, useState, type ReactNode } from "react";
import {
  getMissingPlayerBirthdays,
  savePlayerBirthday,
  getPrivatePlayerBirthday,
} from "@/lib/player-birthdays";
import { chicagoDate } from "@/lib/scheduling";
import { Button } from "@/components/ui/button";

export function PrivatePlayerBirthday({ athleteId }: { athleteId: string }) {
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="text-sm">
      <Button
        variant="outlineDark"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const value = await getPrivatePlayerBirthday({ data: { athleteId } });
            setText(
              value.birthDate
                ? `Date of birth: ${value.birthDate}`
                : "No birthday is saved on the linked player record. The parent should complete their player profile.",
            );
          } catch (e) {
            setText(e instanceof Error ? e.message : "Could not load birthday.");
          } finally {
            setBusy(false);
          }
        }}
      >
        View private birthday
      </Button>
      {text ? <p role="status">{text}</p> : null}
    </div>
  );
}

export function PlayerBirthdays({ children }: { children?: ReactNode }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getMissingPlayerBirthdays>>>();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    getMissingPlayerBirthdays()
      .then((r) => {
        if (active) setRows(r);
      })
      .catch((e) => {
        if (active) setError(e.message || "Could not load player profiles.");
      });
    return () => {
      active = false;
    };
  }, []);
  if (rows?.length === 0) return <>{children}</>;
  return (
    <section
      className="my-4 grid gap-3 rounded-xl border border-line bg-paper p-4"
      aria-label="Required player birthdays"
    >
      <h2 className="text-2xl">Complete your player profile</h2>
      <p>
        Enter each player’s date of birth. Youth lessons are only for players age 11 or younger on
        the lesson date. Birthdays are private to that player’s parent or guardian and assigned team
        coaches.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {!rows && !error ? <p role="status">Checking player profiles…</p> : null}
      {rows?.map((row) => (
        <form
          key={row.id}
          className="grid gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const birthDate = String(new FormData(e.currentTarget).get("birthDate"));
            setBusy(true);
            setError("");
            try {
              await savePlayerBirthday({ data: { athleteId: row.id, birthDate } });
              setRows(await getMissingPlayerBirthdays());
              window.dispatchEvent(new Event("player-profile-updated"));
              if (children) window.location.reload();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not save birthday.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="grid min-w-0 gap-1">
            {row.name} · Date of birth
            <input
              className="min-w-0 w-full rounded-lg border p-3"
              name="birthDate"
              type="date"
              required
              max={chicagoDate()}
            />
          </label>
          <Button disabled={busy} type="submit">
            {busy ? "Saving…" : "Save birthday"}
          </Button>
        </form>
      ))}
    </section>
  );
}
