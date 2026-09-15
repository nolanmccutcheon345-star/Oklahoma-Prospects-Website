import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/parents")({
  beforeLoad: () => {
    throw redirect({ to: "/more" });
  },
});
