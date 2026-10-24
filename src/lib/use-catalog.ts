import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  buildPublicCatalog,
  getServices,
  getPurchaseAvailability,
  type ClubService,
  type PublicCatalog,
} from "@/lib/ops";
export type LiveCatalog = PublicCatalog & {
  status: "loading" | "ready" | "error";
  checkoutStatus: "loading" | "ready" | "error";
  retry: () => void;
};
export type CatalogSnapshot = { catalog: PublicCatalog | null; failed: boolean };
const CatalogContext = createContext<LiveCatalog | null>(null);
function useCatalogResource(enabled: boolean, initial?: CatalogSnapshot): LiveCatalog {
  const [catalog, setCatalog] = useState<PublicCatalog>(
    () => initial?.catalog || buildPublicCatalog([]),
  );
  const [availability, setAvailability] = useState<PublicCatalog["purchaseAvailability"]>();
  const [status, setStatus] = useState<LiveCatalog["status"]>(
    initial?.catalog ? "ready" : initial?.failed ? "error" : "loading",
  );
  const [checkoutStatus, setCheckoutStatus] = useState<LiveCatalog["checkoutStatus"]>("loading");
  const requestId = useRef(0);
  const refresh = useCallback((catalogToo = true) => {
    const id = ++requestId.current;
    if (catalogToo) {
      setStatus("loading");
      void getServices()
        .then((rows: ClubService[]) => {
          if (requestId.current === id) {
            setCatalog(buildPublicCatalog(rows));
            setStatus("ready");
          }
        })
        .catch(() => {
          if (requestId.current === id) setStatus("error");
        });
    }
    setAvailability(undefined);
    setCheckoutStatus("loading");
    // Square readiness never hides successfully loaded prices or enables checkout on failure.
    void getPurchaseAvailability()
      .then((purchase) => {
        if (requestId.current === id) {
          setAvailability(purchase);
          setCheckoutStatus("ready");
        }
      })
      .catch(() => {
        if (requestId.current === id) setCheckoutStatus("error");
      });
  }, []);
  const retry = useCallback(() => refresh(), [refresh]);
  useEffect(() => {
    if (!enabled) return;
    if (initial?.catalog) {
      setCatalog(initial.catalog);
      setStatus("ready");
    }
    refresh(!initial?.catalog);
    window.addEventListener("focus", retry);
    const generation = requestId;
    return () => {
      generation.current++;
      window.removeEventListener("focus", retry);
    };
  }, [enabled, initial, refresh, retry]);
  return useMemo(
    () => ({ ...catalog, purchaseAvailability: availability, status, checkoutStatus, retry }),
    [catalog, availability, status, checkoutStatus, retry],
  );
}
export function CatalogProvider({
  initial,
  children,
}: {
  initial: CatalogSnapshot;
  children: ReactNode;
}) {
  const catalog = useCatalogResource(true, initial);
  return createElement(CatalogContext.Provider, { value: catalog }, children);
}
export function useLiveCatalog(): LiveCatalog {
  const shared = useContext(CatalogContext);
  const fallback = useCatalogResource(!shared);
  return shared || fallback;
}
