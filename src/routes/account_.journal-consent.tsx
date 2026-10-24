import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { pageHead } from "@/lib/seo";
import { getFamilyJournalConsents, withdrawJournalConsent } from "@/lib/journal/api";
export const Route = createFileRoute("/account_/journal-consent")({
  head: () =>
    pageHead(
      "/account/journal-consent",
      "Journal publication consent",
      "Manage your article-specific publication consent.",
      true,
    ),
  component: ConsentPage,
});
function ConsentPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getFamilyJournalConsents>>>([]),
    [message, setMessage] = useState("Loading consent records…");
  async function load() {
    try {
      setRows(await getFamilyJournalConsents());
      setMessage("");
    } catch {
      setMessage("Sign in with the verified guardian account to view these records.");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <main id="main" className="mx-auto max-w-3xl space-y-5 px-5 py-10">
      <h1 className="text-4xl">Journal publication consent</h1>
      <p>
        These permissions apply only to the listed article version. Withdrawing removes the affected
        article and its images from the Journal immediately.
      </p>
      <p role="status">{message}</p>
      {!message && !rows.length && (
        <p>No article-specific consent records are linked to your account.</p>
      )}
      {rows.map((r) => (
        <article key={r.id} className="space-y-3 rounded-xl border border-line bg-white p-5">
          <h2 className="text-2xl">{r.title}</h2>
          <p>
            Revision {r.revision} · {r.scope}
          </p>
          <p>{r.revoked_at ? "Consent withdrawn" : "Consent recorded"}</p>
          {!r.revoked_at && (
            <button
              className="rounded bg-powder px-4 py-3 font-semibold"
              onClick={async () => {
                try {
                  await withdrawJournalConsent({ data: { id: r.id } });
                  await load();
                  setMessage("Consent withdrawn.");
                } catch {
                  setMessage("Could not withdraw consent. Please retry.");
                }
              }}
            >
              Withdraw my consent
            </button>
          )}
        </article>
      ))}
      <a href="/account" className="underline">
        Back to Account
      </a>
    </main>
  );
}
