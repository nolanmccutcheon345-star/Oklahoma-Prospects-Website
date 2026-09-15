import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CANCEL_POLICY } from "@/lib/club";
import { getSquareStatus, saveSquareSettings } from "@/lib/square";

const ITEMS = [
  { id: "square-total", label: "Square charges the order total — never a leftover $50 cage link" },
  { id: "multi-cage", label: "Coaches can select and pay for multiple cages in one checkout" },
  { id: "team-rate", label: "Household rate cannot be used for a team of three or more" },
  { id: "cancel", label: CANCEL_POLICY.short },
  { id: "development", label: "Development membership is $229/mo ($279 first month without an assessment)" },
  { id: "surcharge", label: "$50 first-lesson fee when no assessment is on file (hour = $150)" },
  { id: "no-discount", label: "Prospect / All-Star / Elite Family do not discount other products" },
  { id: "card-only", label: "Debit or credit only — no Cash App or Venmo" },
  { id: "roles", label: "Admin, coach, parent, player, and guest desks; admins get coach tools" },
] as const;

export function LaunchChecklist() {
  const [connected, setConnected] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getSquareStatus()
      .then((row) => {
        setConnected(row.connected);
        setLocationId(row.locationId);
      })
      .catch(() => setConnected(false));
  }, []);

  return (
    <section className="rounded-2xl bg-paper-2 p-5 shadow-border" data-launch-checklist="true">
      <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Launch</p>
      <h3 className="mt-2 text-2xl">Go-live checklist</h3>
      <ul className="mt-4 grid gap-2">
        {ITEMS.map((item) => (
          <li key={item.id} className="flex gap-3 text-sm">
            <span className="mt-0.5 font-display text-maroon" aria-hidden>
              ✓
            </span>
            <span>{item.label}</span>
          </li>
        ))}
        <li className="flex gap-3 text-sm">
          <span className="mt-0.5 font-display text-maroon" aria-hidden>
            {connected ? "✓" : "○"}
          </span>
          <span>
            {connected
              ? "Square API connected — checkout creates a payment link for the exact total."
              : "Connect Square (Location ID + access token) so live card charges match the receipt."}
          </span>
        </li>
      </ul>

      <form
        className="mt-5 grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          setSaved("");
          try {
            const next = await saveSquareSettings({
              data: { locationId, accessToken: token, environment: "production" },
            });
            setConnected(next.connected);
            setToken("");
            setSaved(next.connected ? "Square is connected." : "Saved. Add both Location ID and access token.");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save Square settings.");
          }
        }}
      >
        <label className="text-sm font-semibold">
          Square Location ID
          <input
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            className="mt-1.5 block min-h-11 w-full rounded-md border border-line bg-paper px-3"
            autoComplete="off"
          />
        </label>
        <label className="text-sm font-semibold">
          Square access token
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={connected ? "Token on file — paste to replace" : "Production access token"}
            className="mt-1.5 block min-h-11 w-full rounded-md border border-line bg-paper px-3"
            autoComplete="off"
          />
        </label>
        <Button type="submit">Save Square connection</Button>
        {saved ? <p className="text-sm text-maroon">{saved}</p> : null}
        {error ? <p className="text-sm text-maroon">{error}</p> : null}
      </form>
    </section>
  );
}
