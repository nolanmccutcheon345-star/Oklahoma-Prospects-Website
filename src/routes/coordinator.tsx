import { createFileRoute } from "@tanstack/react-router";
import { CoordinatorFrontOffice } from "@/components/coordinator/front-office";
import { pageHead } from "@/lib/seo";
export const Route = createFileRoute("/coordinator")({
  head: () =>
    pageHead("/coordinator", "Coordinator Front Office", "Authorized program operations.", true),
  component: CoordinatorFrontOffice,
});
