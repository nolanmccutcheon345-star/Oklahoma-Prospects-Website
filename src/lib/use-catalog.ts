import { useEffect, useMemo, useState } from "react";
import {
  buildPublicCatalog,
  getServices,
  type ClubService,
  type PublicCatalog,
} from "@/lib/ops";

export function useLiveCatalog(): PublicCatalog {
  const [rows, setRows] = useState<ClubService[]>([]);
  useEffect(() => {
    getServices()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);
  return useMemo(() => buildPublicCatalog(rows), [rows]);
}
