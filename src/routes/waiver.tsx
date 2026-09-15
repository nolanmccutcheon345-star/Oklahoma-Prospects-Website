import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { CLUB } from "@/lib/club";
import { loadWaiver, saveWaiver } from "@/lib/waiver";

export const Route = createFileRoute("/waiver")({ component: WaiverPage });

function WaiverPage() {
  const [saved, setSaved] = useState<ReturnType<typeof loadWaiver>>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setSaved(loadWaiver());
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const row = {
      adultName: String(data.get("adult-name") ?? "").trim(),
      adultEmail: String(data.get("adult-email") ?? "").trim(),
      adultPhone: String(data.get("adult-phone") ?? "").trim(),
      athleteName: String(data.get("athlete-name") ?? "").trim(),
      participantType: (String(data.get("participant-type") ?? "minor") === "adult"
        ? "adult"
        : "minor") as "adult" | "minor",
      emergencyName: String(data.get("emergency-name") ?? "").trim(),
      emergencyPhone: String(data.get("emergency-phone") ?? "").trim(),
      signerName: String(data.get("signer-name") ?? "").trim(),
      signedAt: Date.now(),
    };
    if (!row.signerName || !row.athleteName) {
      setError("Name and signature are required.");
      return;
    }
    setSaved(saveWaiver(row));
    const subject = encodeURIComponent(`Oklahoma Prospects waiver · ${row.athleteName}`);
    const body = encodeURIComponent(
      [
        "Annual facility waiver",
        `Adult: ${row.adultName}`,
        `Email: ${row.adultEmail}`,
        `Phone: ${row.adultPhone}`,
        `Athlete: ${row.athleteName}`,
        `Participant: ${row.participantType}`,
        `Emergency: ${row.emergencyName} ${row.emergencyPhone}`,
        `Signature: ${row.signerName}`,
        `Signed: ${new Date(row.signedAt).toISOString()}`,
      ].join("\n"),
    );
    window.location.href = `mailto:${CLUB.email}?subject=${subject}&body=${body}`;
  }

  return (
    <main id="main">
      <PageHero
        eyebrow="Required before you train"
        title="One waiver."
        accent="One year."
        copy="Parent or guardian signs for athletes under 18. This is the Oklahoma Prospects facility waiver."
        actions={
          <Button asChild variant="outline">
            <a href={`tel:${CLUB.phoneTel}`}>Call the desk</a>
          </Button>
        }
      />
      <section className="mx-auto max-w-3xl px-5 py-10">
        {saved ? (
          <div className="mb-6 rounded-2xl bg-paper-2 p-5 shadow-border">
            <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
              On this phone
            </p>
            <h2 className="mt-2 text-2xl">Waiver signed</h2>
            <p className="mt-2 text-sm text-muted">
              {saved.athleteName} · signed by {saved.signerName} on{" "}
              {new Date(saved.signedAt).toLocaleDateString("en-US")}. Keep this
              phone handy at the door, and email the desk if you have not already.
            </p>
          </div>
        ) : null}

        <article className="mb-6 rounded-2xl bg-ink p-5 text-sm text-fg-soft">
          <h2 className="text-2xl text-fg-inverse">Facility Waiver & Release</h2>
          <p className="mt-3">
            In consideration of using the Oklahoma Prospects facility at {CLUB.addressLine1},{" "}
            {CLUB.addressLine2}, I understand that baseball, softball, and athletic training
            involve risk of injury, including serious injury. I voluntarily assume those
            risks for myself and, if signing for a minor, for that athlete.
          </p>
          <p className="mt-3">
            I release Oklahoma Prospects, its owners, coaches, and staff from claims arising
            from ordinary participation, except for claims caused by gross negligence or
            willful misconduct. I confirm I am legally authorized to sign, and that emergency
            contact information is accurate.
          </p>
          <p className="mt-3">
            This waiver covers Prospects activity for one year from the signature date.
            Questions: {CLUB.phoneDisplay}.
          </p>
        </article>

        <form className="grid gap-4" onSubmit={onSubmit}>
          <label className="grid gap-1 text-sm font-semibold">
            Responsible adult name
            <input
              name="adult-name"
              autoComplete="name"
              required
              className="min-h-11 rounded-lg border border-line bg-paper px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Adult email
            <input
              name="adult-email"
              type="email"
              autoComplete="email"
              required
              className="min-h-11 rounded-lg border border-line bg-paper px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Adult mobile
            <input
              name="adult-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              className="min-h-11 rounded-lg border border-line bg-paper px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Athlete name
            <input
              name="athlete-name"
              autoComplete="name"
              required
              className="min-h-11 rounded-lg border border-line bg-paper px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Participant
            <select
              name="participant-type"
              defaultValue="minor"
              required
              className="min-h-11 rounded-lg border border-line bg-paper px-3"
            >
              <option value="adult">Adult (18 or older)</option>
              <option value="minor">Minor (under 18)</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Emergency contact
            <input
              name="emergency-name"
              required
              className="min-h-11 rounded-lg border border-line bg-paper px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Emergency phone
            <input
              name="emergency-phone"
              type="tel"
              required
              className="min-h-11 rounded-lg border border-line bg-paper px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Electronic signature (full legal name)
            <input
              name="signer-name"
              autoComplete="name"
              required
              className="min-h-11 rounded-lg border border-line bg-paper px-3"
            />
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input
              name="waiver-accepted"
              type="checkbox"
              required
              className="mt-1 size-6"
            />
            <span>
              I have read the Facility Waiver & Release above, understand sports
              training involves risk of injury, and I am legally authorized to
              sign.
            </span>
          </label>
          {error ? (
            <p className="text-sm text-maroon" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit">Sign the annual waiver</Button>
          <p className="text-xs text-muted">
            Signing saves a copy on this phone and opens your email app to send it
            to the club desk.
          </p>
        </form>
        <Button asChild variant="outlineDark" className="mt-6">
          <Link to="/more">Back to visit tools</Link>
        </Button>
      </section>
    </main>
  );
}
