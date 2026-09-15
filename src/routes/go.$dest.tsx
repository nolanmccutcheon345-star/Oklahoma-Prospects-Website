import { createFileRoute, Navigate } from "@tanstack/react-router";
import { PORTALS, portalTarget, type PortalId } from "@/lib/portals";

const IDS = Object.keys(PORTALS) as PortalId[];

export const Route = createFileRoute("/go/$dest")({
  component: GoPage,
});

function isPortal(value: string): value is PortalId {
  return IDS.includes(value as PortalId);
}

function GoPage() {
  const { dest } = Route.useParams();
  const id = isPortal(dest) ? dest : "book";
  const target = portalTarget(id);
  if (target.to === "/pay") {
    return <Navigate to="/pay" search={target.search} replace />;
  }
  return <Navigate to={target.to} replace />;
}
