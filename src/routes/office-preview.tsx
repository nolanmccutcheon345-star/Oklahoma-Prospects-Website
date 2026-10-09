import { createFileRoute } from "@tanstack/react-router";
import { PageHero } from "@/components/page-hero";
import { pageHead } from "@/lib/seo";
import { useState } from "react";

export const Route = createFileRoute("/office-preview")({
  head: () => pageHead("/office-preview", "Front Office Design Preview", "Read-only design preview using fictional sample data.", true),
  component: FrontOfficePreview,
});

function FrontOfficePreview() {
  const [tab, setTab] = useState<"teams" | "overview">("teams");
  const teams = [
    { name: "Prospects 15U Maroon", sport: "Baseball", age: "15U", coach: "Jordan Sample", email: "jordan@example.com", staff: "Taylor Example — Assistant coach" },
    { name: "Prospects 14U Columbia", sport: "Softball", age: "14U", coach: "Casey Sample", email: "casey@example.com", staff: "Morgan Example — Pitching coach" },
  ];
  const field = "min-h-11 w-full rounded-md border border-line bg-paper-2 px-3 py-2 text-ink opacity-80";
  return <main id="main">
    <PageHero eyebrow="Front office" title="Admin front office" accent="Manage your academy." copy="Manage teams, coaches, payments, requests, and facility operations." image="/brand/team.jpg" compact />
    <div className="mx-auto max-w-5xl px-5 py-8">
      <div role="status" className="mb-5 rounded-xl border-2 border-maroon bg-paper p-4">
        <p className="font-bold">READ-ONLY DESIGN PREVIEW — NO SIGN-IN REQUIRED</p>
        <p className="text-sm">All teams, coach names, and emails below are fictional. Fields and save controls are disabled. This previews the proposed Front Office interface; it does not create or modify records.</p>
      </div>
      <nav aria-label="Front office admin tabs" className="mb-5 flex flex-wrap gap-2 rounded-xl bg-paper-2 p-3">
        <button type="button" onClick={() => setTab("teams")} aria-pressed={tab === "teams"} className={`min-h-11 rounded-md px-5 py-2 font-semibold ${tab === "teams" ? "bg-powder text-ink" : "border border-line bg-white text-ink"}`}>Teams & coaches</button>
        <button type="button" onClick={() => setTab("overview")} aria-pressed={tab === "overview"} className={`min-h-11 rounded-md px-5 py-2 font-semibold ${tab === "overview" ? "bg-powder text-ink" : "border border-line bg-white text-ink"}`}>Office overview</button>
      </nav>
      {tab === "teams" ? <section className="grid gap-5 rounded-2xl border-2 border-maroon bg-paper p-5">
        <h2 className="text-2xl font-bold">Teams & coaches administration</h2>
        <p className="text-sm text-muted">Create baseball or softball teams, build coach profiles, and assign head or assistant coaches to teams.</p>
        <section className="rounded-xl border border-line bg-white p-4">
          <h3 className="mb-3 text-xl font-semibold">Create baseball or softball team</h3>
          <fieldset disabled className="grid gap-3">
            <label className="grid gap-1 text-sm">Team name<input className={field} placeholder="Enter team name" /></label>
            <label className="grid gap-1 text-sm">Age group<select className={field} defaultValue="15U"><option>15U</option><option>14U</option><option>13U</option></select></label>
            <label className="grid gap-1 text-sm">Sport<select className={field} defaultValue="Baseball"><option>Baseball</option><option>Softball</option></select></label>
            <button className="min-h-11 rounded-md bg-powder px-5 font-semibold text-ink">Add team</button>
          </fieldset>
        </section>
        <section className="rounded-xl border border-line bg-white p-4">
          <h3 className="mb-3 text-xl font-semibold">Create coach profile</h3>
          <fieldset disabled className="grid gap-3">
            <label className="grid gap-1 text-sm">Coach full name<input className={field} placeholder="Coach full name" /></label>
            <label className="grid gap-1 text-sm">Coach sign-in email<input className={field} type="email" placeholder="coach@example.com" /></label>
            <label className="grid gap-1 text-sm">Role<select className={field} defaultValue="Assistant coach"><option>Head coach</option><option>Assistant coach</option><option>Pitching coach</option><option>Hitting coach</option></select></label>
            <label className="grid gap-1 text-sm">Assign to team<select className={field} defaultValue=""><option value="">Select team</option>{teams.map(t => <option key={t.name}>{t.name}</option>)}</select></label>
            <button className="min-h-11 rounded-md bg-powder px-5 font-semibold text-ink">Create coach profile & assign</button>
          </fieldset>
        </section>
        <section className="rounded-xl border border-line bg-white p-4">
          <h3 className="mb-3 text-xl font-semibold">Assign coaches to teams</h3>
          {teams.map(t => <article key={t.name} className="my-3 grid gap-2 rounded-lg border border-line p-3">
            <h4 className="font-semibold">{t.name} · {t.sport} · {t.age}</h4>
            <label className="grid gap-1 text-sm">Head coach<select disabled className={field} defaultValue={t.email}><option value={t.email}>{t.coach} ({t.email})</option><option>Unassigned</option></select></label>
            <p className="text-sm">Assigned staff: {t.staff}</p>
            <label className="grid gap-1 text-sm">Add existing coach<select disabled className={field}><option>Select existing coach</option></select></label>
          </article>)}
          <button disabled className="min-h-11 rounded-md bg-powder px-5 font-semibold text-ink opacity-60">Save assignments</button>
        </section>
      </section> : <section className="rounded-xl border border-line bg-white p-5"><h2 className="text-2xl font-semibold">Office overview</h2><p className="mt-2 text-sm">Tryout results · Requests · Payments · Promotions · Operations & reporting · Booking changes · Teams & coach assignments</p><p className="mt-3 text-sm text-muted">Overview shown for navigation review only. No real club information is loaded.</p></section>}
    </div>
  </main>;
}
