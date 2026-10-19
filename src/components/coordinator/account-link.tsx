import { useEffect, useState } from "react";
import { getCoordinatorEntry } from "@/lib/coordinator/api";

export function CoordinatorAccountLink() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      getCoordinatorEntry()
        .then((result) => {
          if (active) setAvailable(result.available);
        })
        .catch(() => {
          if (active) setAvailable(false);
        });
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  if (!available) return null;
  return (
    <nav aria-label="Program coordination" className="mx-auto max-w-3xl px-5 py-4">
      <a
        href="/coordinator"
        className="inline-flex min-h-12 items-center rounded bg-ink px-5 py-3 text-lg font-semibold text-white"
      >
        Coordinator Front Office
      </a>
      <p className="mt-2 text-sm">Open your approved baseball or softball program tools.</p>
    </nav>
  );
}
