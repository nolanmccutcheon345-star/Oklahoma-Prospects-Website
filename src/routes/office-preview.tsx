import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  FrontOfficeShell,
  OFFICE_SECTIONS,
  type OfficeSection,
} from "@/components/front-office-shell";
import { pageHead } from "@/lib/seo";
export const Route = createFileRoute("/office-preview")({
  head: () =>
    pageHead(
      "/office-preview",
      "Front Office Design Preview",
      "Fictional read-only Front Office layout preview.",
      true,
    ),
  component: Preview,
});
function Preview() {
  const [section, setSection] = useState<OfficeSection>("dashboard");
  return (
    <FrontOfficeShell section={section} onSection={setSection} name="Sample Admin" preview>
      <p role="status" className="mb-4 rounded-lg border border-maroon bg-white p-3 text-sm">
        Read-only design preview. All names, counts and requests below are fictional. No live
        records are loaded or changed.
      </p>
      {section === "dashboard" ? (
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {(
              [
                ["Today’s schedule", 2, "bookings"],
                ["Requests needing follow-up", 3, "requests"],
                ["Evaluations awaiting review", 1, "evaluations"],
                ["Payment issues", 0, "payments"],
              ] as const
            ).map(([label, count, target]) => (
              <button
                key={label}
                onClick={() => setSection(target)}
                className="rounded-xl border border-line bg-white p-4 text-left"
              >
                <strong className="block text-3xl text-maroon">{count}</strong>
                <span className="text-sm font-semibold">{label}</span>
              </button>
            ))}
          </div>
          <h2 className="text-2xl">Today’s schedule</h2>
          <article className="rounded-xl border border-line bg-white p-4">
            <h3 className="text-xl">Cage rental · Lane 1</h3>
            <p>4:00–5:00 PM Central · Sample family</p>
          </article>
        </div>
      ) : section === "requests" ? (
        <div className="grid gap-4">
          <h2 className="text-3xl">Requests</h2>
          <label className="grid gap-1 text-sm">
            Search requests
            <input className="office-control" placeholder="Player, parent, email or notes" />
          </label>
          <details className="rounded-xl border border-line bg-white p-3">
            <summary className="min-h-11 cursor-pointer">Filters · Unresolved</summary>
            <div className="grid gap-3 sm:grid-cols-2">
              {["Sport", "Age group", "Season", "Status", "Assigned staff"].map((label) => (
                <label className="grid gap-1 text-sm" key={label}>
                  {label}
                  <select disabled className="office-control">
                    <option>All</option>
                  </select>
                </label>
              ))}
            </div>
          </details>
          <article className="rounded-xl border border-line bg-white p-4">
            <h3 className="text-2xl">Sample Player</h3>
            <p className="text-sm font-semibold">Softball · 14U · Spring 2027</p>
            <p className="mt-1 text-sm">Individual evaluation requested</p>
            <p className="mt-2 text-xs text-muted">New · Unassigned · Received today</p>
            <details className="mt-3">
              <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line px-3 font-semibold">
                View Request ＋
              </summary>
              <p className="my-3">Parent: Sample Guardian</p>
              <p>No contact notes recorded.</p>
              <fieldset disabled className="my-3 grid gap-3">
                <label className="grid gap-1 text-sm">
                  Assigned staff
                  <select className="office-control">
                    <option>Unassigned</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  Request status
                  <select className="office-control">
                    <option>New</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  Contact note
                  <textarea className="office-control" />
                </label>
                <button className="min-h-11 rounded bg-powder">
                  Save Follow-up (disabled in preview)
                </button>
              </fieldset>
            </details>
            <button disabled className="mt-3 min-h-11 rounded bg-powder px-3 font-semibold">
              Contact Family
            </button>
          </article>
        </div>
      ) : (
        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="text-2xl">{OFFICE_SECTIONS.find(([id]) => id === section)?.[1]}</h2>
          <p className="mt-2 text-sm">
            Live tools are available only to authorized owners in Front Office.
          </p>
        </section>
      )}
    </FrontOfficeShell>
  );
}
