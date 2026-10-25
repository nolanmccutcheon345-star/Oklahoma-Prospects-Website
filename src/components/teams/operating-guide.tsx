import { operatingGuides } from "@/lib/teams/operating-policy";
export function TeamOperatingGuide({ audience }: { audience: "family" | "staff" | "owner" }) {
  const rows =
    audience === "owner"
      ? [...operatingGuides.owner, ...operatingGuides.staff]
      : operatingGuides[audience];
  return (
    <details className="rounded-xl border border-line bg-white p-4">
      <summary className="min-h-11 cursor-pointer font-bold">Team operating guide</summary>
      <p className="my-3 text-sm text-muted">
        Operating guidance does not change an existing accepted agreement. Financial decisions
        remain with Steve and Nolan unless they expressly delegate that authority.
      </p>
      <dl className="grid gap-4">
        {rows.map(([title, body]) => (
          <div key={title}>
            <dt className="font-semibold">{title}</dt>
            <dd className="mt-1 text-sm">{body}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
