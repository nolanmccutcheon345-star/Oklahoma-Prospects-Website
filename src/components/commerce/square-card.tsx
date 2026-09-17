import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/pricing";
type Card = {
  attach(selector: string): Promise<void>;
  destroy(): Promise<void>;
  tokenize(details: Record<string, unknown>): Promise<{ status: string; token?: string }>;
};
type SquareBrowser = {
  payments(applicationId: string, locationId: string): { card(): Promise<Card> };
};
declare global {
  interface Window {
    Square?: SquareBrowser;
  }
}
export type PublicSquare = {
  environment: "sandbox" | "production";
  applicationId: string;
  locationId: string;
};
let sdkPromise: Promise<void> | undefined;
function loadSquare(environment: PublicSquare["environment"]) {
  const src =
    environment === "sandbox"
      ? "https://sandbox.web.squarecdn.com/v1/square.js"
      : "https://web.squarecdn.com/v1/square.js";
  if (window.Square) return Promise.resolve();
  if (!sdkPromise)
    sdkPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        sdkPromise = undefined;
        reject(new Error("Secure card fields could not load. Please reload checkout."));
      };
      document.head.append(script);
    });
  return sdkPromise;
}
export function SquareCard({
  config,
  amountCents,
  email,
  name,
  recurring = false,
  expiresAt,
  intent = "CHARGE",
  onToken,
}: {
  config: PublicSquare;
  amountCents: number;
  email: string;
  name: string;
  recurring?: boolean;
  expiresAt?: string;
  intent?: "CHARGE" | "STORE";
  onToken: (token: string, attemptId: string) => Promise<{ message?: string; declined?: boolean }>;
}) {
  const id = "square-card-" + useId().replaceAll(":", "");
  const card = useRef<Card | null>(null);
  const attempt = useRef<{ token: string; id: string } | null>(null),
    lock = useRef(false);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    let active = true;
    let instance: Card | undefined;
    void loadSquare(config.environment)
      .then(async () => {
        instance = await window.Square!.payments(config.applicationId, config.locationId).card();
        if (!active) {
          await instance.destroy();
          return;
        }
        await instance.attach("#" + CSS.escape(id));
        if (active) {
          card.current = instance;
          setReady(true);
        }
      })
      .catch(() => {
        if (active) setError("Secure card fields could not load. Reload checkout to try again.");
      });
    return () => {
      active = false;
      card.current = null;
      if (instance) void instance.destroy();
    };
  }, [config.environment, config.applicationId, config.locationId, id]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000))
    : null;
  async function pay() {
    if (lock.current || !card.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!attempt.current) {
        const result = await card.current.tokenize({
          ...(intent === "CHARGE" ? { amount: (amountCents / 100).toFixed(2) } : {}),
          currencyCode: "USD",
          intent,
          billingContact: { givenName: name, email, countryCode: "US" },
          customerInitiated: true,
          sellerKeyedIn: false,
        });
        if (result.status !== "OK" || !result.token)
          throw new Error(
            "Check your card details and complete any bank verification before continuing.",
          );
        attempt.current = { token: result.token, id: crypto.randomUUID() };
      }
      const result = await onToken(attempt.current.token, attempt.current.id);
      if (result.declined) attempt.current = null;
      if (result.message) setError(result.message);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Payment could not be confirmed. Check your billing history before starting another checkout.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="grid gap-4 rounded-xl border p-5" aria-label="Secure Square payment">
      <h2 className="text-2xl">
        {intent === "STORE" ? "Update payment card" : "Pay securely with Square"}
      </h2>
      {config.environment === "sandbox" ? (
        <p role="status" className="rounded-lg bg-paper-2 p-3">
          Square Sandbox · test cards only. No real money is collected.
        </p>
      ) : null}
      {recurring ? (
        <p>Your card will be saved with Square for the monthly renewal amount you agreed to.</p>
      ) : null}
      {remaining !== null ? (
        <p role="timer">
          {remaining > 0
            ? `Payment session: ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")} remaining. Your time stays available until payment succeeds.`
            : "This payment session has expired. Check billing history before choosing a new time."}
        </p>
      ) : null}
      <div id={id} className="min-h-32" />
      {error ? (
        <p role="alert" className="text-maroon">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        disabled={!ready || busy || (remaining === 0 && !attempt.current)}
        onClick={() => void pay()}
      >
        {busy
          ? "Confirming with Square…"
          : attempt.current
            ? "Retry payment confirmation"
            : intent === "STORE"
              ? "Save payment card"
              : `Pay ${formatMoney(amountCents)}${recurring ? " & start membership" : ""}`}
      </Button>
      <p className="text-sm">
        Card details are entered directly into Square’s secure fields. A booking appears as
        confirmed only after successful payment.
      </p>
    </section>
  );
}
