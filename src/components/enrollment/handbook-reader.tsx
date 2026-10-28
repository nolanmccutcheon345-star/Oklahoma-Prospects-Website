import { useState } from "react";
import type { HandbookVersion } from "@/lib/enrollment/contracts";
export function HandbookReader({ documents }: { documents: HandbookVersion[] }) {
  const [search, setSearch] = useState("");
  return (
    <div className="grid gap-6">
      <label className="print:hidden">
        Find a policy
        <input
          className="mt-1 min-h-11 w-full rounded border p-3"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Attendance, travel, development…"
        />
      </label>
      <button
        type="button"
        className="min-h-11 justify-self-start rounded border px-4 print:hidden"
        onClick={() => window.print()}
      >
        Print / save PDF
      </button>
      {documents.length === 0 ? (
        <p>No handbook has been published yet. The office is preparing the 2027 edition.</p>
      ) : (
        documents.map((d) => (
          <article
            key={d.documentId + ":" + d.version}
            className="rounded-2xl border border-line bg-white p-5"
          >
            <h2 className="text-3xl">{d.content.title}</h2>
            <p className="mt-2 text-sm text-muted">
              Version {d.version} · Effective {d.effectiveOn}
              {d.status === "draft" ? " · Draft — not for signature" : ""}
            </p>
            {d.content.sections
              .filter((s) => (s.title + " " + s.body).toLowerCase().includes(search.toLowerCase()))
              .map((s, i) => (
                <section key={i} className="mt-6 break-inside-avoid">
                  <h3 className="text-xl">{s.title}</h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-7">{s.body}</p>
                </section>
              ))}
          </article>
        ))
      )}
    </div>
  );
}
