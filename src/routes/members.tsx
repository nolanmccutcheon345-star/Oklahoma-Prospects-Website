import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/members")({
  beforeLoad: () => { throw redirect({ to: "/account", statusCode: 301 }); },
});
