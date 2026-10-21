import { useEffect, useState } from "react";
import { getPublicProgramContent } from "@/lib/coordinator/api";
export function PublicProgramUpdates({ sport }: { sport: "baseball" | "softball" }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getPublicProgramContent>>>([]);
  useEffect(() => {
    let active = true;
    setRows([]);
    const load = () =>
      getPublicProgramContent({ data: sport })
        .then((r) => {
          if (active) setRows(r);
        })
        .catch(() => {
          if (active) setRows([]);
        });
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [sport]);
  if (!rows.length) return null;
  return (
    <section className="mx-auto grid max-w-5xl gap-4 px-5 py-10" aria-label="Program updates">
      <h2 className="text-3xl">Program Updates</h2>
      {rows.map((p) => (
        <article key={p.id} className="rounded-xl border border-line bg-white p-5">
          <h3 className="text-xl">{p.title}</h3>
          <p className="whitespace-pre-wrap">{p.body}</p>
        </article>
      ))}
    </section>
  );
}
