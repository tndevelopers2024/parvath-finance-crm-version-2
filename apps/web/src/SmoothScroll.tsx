import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

export default function SmoothScroll() {
  const instance = useRef<Lenis | null>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      instance.current?.destroy();
      instance.current = reducedMotion.matches ? null : new Lenis({
        autoRaf: true,
        autoToggle: true,
        lerp: 0.12,
        smoothWheel: true,
        syncTouch: false,
        allowNestedScroll: true,
        prevent: (node) => Boolean(node.closest('[role="dialog"], .sidebar, .search-results, textarea, select')),
      });
    };
    update();
    reducedMotion.addEventListener("change", update);
    return () => {
      reducedMotion.removeEventListener("change", update);
      instance.current?.destroy();
      instance.current = null;
    };
  }, []);

  useEffect(() => {
    instance.current?.scrollTo(0, { immediate: true });
  }, [pathname]);

  return null;
}
