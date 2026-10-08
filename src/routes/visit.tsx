import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/visit")({
  beforeLoad: () => {
    throw redirect({ to: "/visits" });
  },
});
