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
import { publicRequest } from "./public-request";
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
  const shownRef = useRef(Boolean(initial?.catalog));
  const checkoutReadyRef = useRef(false);
  const lastSilentAt = useRef(0);
  const refresh = useCallback((catalogToo = true, silent = false) => {
    const id = ++requestId.current;
    const preserveCatalog = shownRef.current;
    if (catalogToo && !preserveCatalog) setStatus("loading");
    if (catalogToo) {
      void publicRequest(getServices())
        .then((rows: ClubService[]) => {
          if (requestId.current !== id) return;
          setCatalog(buildPublicCatalog(rows));
          setStatus("ready");
          shownRef.current = true;
        })
        .catch(() => {
          if (requestId.current === id && !shownRef.current) setStatus("error");
        });
    }
    const preserveCheckout = silent && checkoutReadyRef.current;
    if (!preserveCheckout) {
      setAvailability(undefined);
      setCheckoutStatus("loading");
    }
    // Square readiness never hides successfully loaded prices or enables checkout on failure.
    void publicRequest(getPurchaseAvailability())
      .then((purchase) => {
        if (requestId.current !== id) return;
        setAvailability(purchase);
        setCheckoutStatus("ready");
        checkoutReadyRef.current = true;
      })
      .catch(() => {
        if (requestId.current !== id || preserveCheckout) return;
        setCheckoutStatus("error");
        checkoutReadyRef.current = false;
      });
  }, []);
  const retry = useCallback(() => refresh(), [refresh]);
  useEffect(() => {
    if (!enabled) return;
    if (initial?.catalog) {
      setCatalog(initial.catalog);
      setStatus("ready");
      shownRef.current = true;
    }
    refresh(!initial?.catalog);
    lastSilentAt.current = Date.now();
    const onVisible = () => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastSilentAt.current < 60_000) return;
      lastSilentAt.current = now;
      refresh(true, true);
    };
    document.addEventListener("visibilitychange", onVisible);
    const generation = requestId;
    return () => {
      generation.current++;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, initial, refresh]);
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
