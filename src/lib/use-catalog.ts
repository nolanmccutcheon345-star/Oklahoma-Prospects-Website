import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildPublicCatalog,
  getServices,
  getPurchaseAvailability,
  type ClubService,
  type PublicCatalog,
} from "@/lib/ops";
export type LiveCatalog = PublicCatalog & {
  status: "loading" | "ready" | "error";
  retry: () => void;
};
export function useLiveCatalog(): LiveCatalog {
  const [rows, setRows] = useState<ClubService[]>([]);
  const [availability, setAvailability] = useState<PublicCatalog["purchaseAvailability"]>();
  const [status, setStatus] = useState<LiveCatalog["status"]>("loading");
  const requestId = useRef(0);
  const refresh = useCallback(() => {
    const id = ++requestId.current;
    setStatus("loading");
    setAvailability(undefined);
    // A failed request is not an empty catalog or a verified checkout outage.
    void Promise.all([getServices(), getPurchaseAvailability()])
      .then(([services, purchase]) => {
        if (requestId.current !== id) return;
        setRows(services);
        setAvailability(purchase);
        setStatus("ready");
      })
      .catch(() => {
        if (requestId.current === id) {
          setAvailability(undefined);
          setStatus("error");
        }
      });
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      requestId.current++;
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  return useMemo(
    () => ({
      ...buildPublicCatalog(rows),
      purchaseAvailability: availability,
      status,
      retry: refresh,
    }),
    [rows, availability, status, refresh],
  );
}
