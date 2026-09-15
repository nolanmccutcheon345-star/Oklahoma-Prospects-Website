import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/members")({
  component: () => <Navigate to="/account" />,
});
