import { CLUB } from "@/lib/club";
import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/page-hero";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { PdErrorBoundary } from "@/components/pd/error-boundary";
import { CatalogAndBook } from "@/components/training-catalog";
import { CatalogProvider } from "@/lib/use-catalog";
import { getPublicCatalogSnapshot } from "@/lib/ops";
import { getPublicPeople } from "@/lib/person-api";
import type { PublicPerson } from "@/lib/person-contracts";
import { publicRequest } from "@/lib/public-request";

export const Route = createFileRoute("/training")({
  head: () =>
    pageHead(
      "/training",
      "Train & Player Development",
      `Assessments, private coaching, packages, and monthly development at ${CLUB.name}.`,
      false,
    ),
  validateSearch: (
    s: Record<string, unknown>,
  ): { view?: "lessons" | "plans"; instructor?: string } => ({
    view: s.view === "plans" ? "plans" : s.view === "lessons" ? "lessons" : undefined,
    instructor:
      typeof s.instructor === "string" && s.instructor.length <= 150 ? s.instructor : undefined,
  }),
  loader: async () => {
    const [catalog, people] = await Promise.all([
      getPublicCatalogSnapshot(),
      publicRequest(getPublicPeople()).catch(() => null),
    ]);
    return { catalog, people };
  },
  component: TrainingRoute,
});

const subscribeToHydration = () => () => {};
const clientHydrated = () => true;
const serverHydrated = () => false;

function TrainingRoute() {
  const initial = Route.useLoaderData();
  return (
    <CatalogProvider initial={initial.catalog}>
      <TrainingPage initialPeople={initial.people} />
    </CatalogProvider>
  );
}

function TrainingPage({ initialPeople }: { initialPeople: PublicPerson[] | null }) {
  const search = Route.useSearch();
  // Session resolution can finish before this route hydrates. Keep the server
  // and first client render identical before showing session-specific actions.
  const hydrated = useSyncExternalStore(subscribeToHydration, clientHydrated, serverHydrated);
  return (
    <main id="main">
      <PdErrorBoundary section="Train · catalog">
        <PageHero
          eyebrow="Player development"
          title="Train with purpose. Build your game."
          compact

          copy="Find the right training for your athlete. Explore private lessons, player assessments, and monthly development programs for baseball and softball."
          image="/brand/training.jpg"
          actions={
            <>
              <Button asChild>
                <a href="/training#find-training">Find My Training</a>
              </Button>
              <Button asChild variant="outline">
                <a href="/training?view=plans#memberships">Compare Monthly Plans</a>
              </Button>
              {hydrated && (
                <SignedOut>
                  <Button asChild variant="outline">
                    <Link to="/login" search={{ next: "/account" }}>
                      Member sign in
                    </Link>
                  </Button>
                </SignedOut>
              )}
              {hydrated && (
                <SignedIn>
                  <Button asChild variant="outline">
                    <Link to="/account" search={{ desk: "programs" }}>
                      My Training Plan
                    </Link>
                  </Button>
                </SignedIn>
              )}
            </>
          }
        />
        <CatalogAndBook
          view={search.view || "lessons"}
          instructor={search.instructor}
          initialPeople={initialPeople}
        />
      </PdErrorBoundary>
    </main>
  );
}
