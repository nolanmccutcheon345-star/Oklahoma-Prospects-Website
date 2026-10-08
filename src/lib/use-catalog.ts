import { useEffect, useMemo, useState } from "react";
import {
  buildPublicCatalog,
  getServices,
  getPurchaseAvailability,
  type ClubService,
  type PublicCatalog,
} from "@/lib/ops";

export function useLiveCatalog(): PublicCatalog {
  const [rows, setRows] = useState<ClubService[]>([]);
  const [availability, setAvailability] = useState<PublicCatalog["purchaseAvailability"]>();
  useEffect(() => {
    void getPurchaseAvailability().then(setAvailability).catch(() => setAvailability({ ready: true, scope: "disabled" }));
    getServices()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);
  return useMemo(() => ({ ...buildPublicCatalog(rows), purchaseAvailability: availability }), [rows, availability]);
}
