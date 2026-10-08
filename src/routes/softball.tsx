import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/softball")({
  beforeLoad: () => {
    throw redirect({
      to: "/tryouts",
      search: { sport: "Softball" },
      hash: "register",
      statusCode: 301,
    });
  },
});
