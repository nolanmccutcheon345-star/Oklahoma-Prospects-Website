/** Poll read-only UI data only while it can be seen. Server authorization remains authoritative. */
export function startVisiblePolling(
  refresh: () => Promise<unknown>,
  intervalMs: number,
  browser: {
    document: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
    window: Pick<
      Window,
      "setInterval" | "clearInterval" | "addEventListener" | "removeEventListener"
    >;
  } = { document, window },
) {
  let stopped = false;
  let pending = false;
  const poll = async () => {
    if (stopped || pending || browser.document.visibilityState === "hidden") return;
    pending = true;
    try {
      await refresh();
    } catch {
      // Callers own their error UI. A rejected refresh must not stop later retries.
    } finally {
      pending = false;
    }
  };
  void poll();
  const timer = browser.window.setInterval(() => void poll(), intervalMs);
  browser.document.addEventListener("visibilitychange", poll);
  browser.window.addEventListener("focus", poll);
  return () => {
    stopped = true;
    browser.window.clearInterval(timer);
    browser.document.removeEventListener("visibilitychange", poll);
    browser.window.removeEventListener("focus", poll);
  };
}
