import { useEffect, type RefObject } from "react";

/** Keep scroll clearance in sync with wrapped text, fonts and responsive chrome. */
export function useStickyHeight(
  ref: RefObject<HTMLElement | null>,
  property: "--header-height" | "--booking-review-height",
  active = true,
) {
  useEffect(() => {
    const element = ref.current;
    if (!element || !active) return;
    const root = document.documentElement;
    const measure = () => {
      const style = window.getComputedStyle(element);
      const pinned = style.position === "sticky" || style.position === "fixed";
      const height = pinned ? Math.ceil(element.getBoundingClientRect().height) : 0;
      root.style.setProperty(property, `${height}px`);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    // Editing a field puts the booking action back in document flow, including
    // on mobile keyboards whose visual viewport differs from the layout viewport.
    document.addEventListener("focusin", measure);
    document.addEventListener("focusout", measure);
    measure();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("focusin", measure);
      document.removeEventListener("focusout", measure);
      root.style.removeProperty(property);
    };
  }, [ref, property, active]);
}
