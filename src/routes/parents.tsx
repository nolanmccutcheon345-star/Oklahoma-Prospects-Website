import { createFileRoute, Link } from "@tanstack/react-router";
import { ContinueIn } from "@/components/continue-in";
import { PageHero } from "@/components/page-hero";
import { VisitChecklist } from "@/components/visit-checklist";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/parents")({ component: ParentsPage });

function ParentsPage() {
  return (
    <main id="main">
      <PageHero
        eyebrow="For families"
        title="Less searching."
        accent="More game time."
        copy="Waiver, check-in, uniforms, and member tools now live in one Visit flow — same Prospects system."
        actions={
          <Button asChild>
            <Link to="/more">Open visit tools</Link>
          </Button>
        }
      />
      <section className="mx-auto max-w-3xl px-5 py-8">
        <h2 className="text-3xl">First visit</h2>
        <div className="mt-5">
          <VisitChecklist />
        </div>
      </section>
      <section className="mx-auto grid max-w-3xl gap-3 px-5 pb-8">
        <ContinueIn dest="checkin" variant="outlineDark" className="w-full">
          Athlete check-in
        </ContinueIn>
        <ContinueIn dest="waiver" variant="outlineDark" className="w-full">
          Facility waiver
        </ContinueIn>
        <ContinueIn dest="uniform" variant="outlineDark" className="w-full">
          Uniform sizing
        </ContinueIn>
        <ContinueIn dest="members" variant="outlineDark" className="w-full">
          Member sign-in
        </ContinueIn>
      </section>
    </main>
  );
}
