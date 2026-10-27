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
      instance.current = reducedMotion.matches
        ? null
        : new Lenis({
            autoRaf: true,
            autoToggle: true,
            lerp: 0.05,
            duration: 1.8,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -7 * t)),
            smoothWheel: true,
            wheelMultiplier: 1.0,
            touchMultiplier: 1.2,
            syncTouch: true,
            syncTouchLerp: 0.05,
            touchInertiaExponent: 1.5,
            allowNestedScroll: true,
            prevent: (node) =>
              Boolean(
                node.closest(
                  '[role="dialog"], .sidebar, .search-results, .client-combobox-dropdown, .product-select-popup, .date-popover, textarea, select',
                ),
              ),
          });
      (window as any).__lenis = instance.current;
    };
    update();
    reducedMotion.addEventListener("change", update);

    const resizeObserver = new ResizeObserver(() => {
      instance.current?.resize();
    });
    if (document.body) {
      resizeObserver.observe(document.body);
    }

    return () => {
      reducedMotion.removeEventListener("change", update);
      resizeObserver.disconnect();
      instance.current?.destroy();
      instance.current = null;
    };
  }, []);

  useEffect(() => {
    instance.current?.scrollTo(0, { immediate: true });
    const timer = setTimeout(() => {
      instance.current?.resize();
    }, 100);
    return () => clearTimeout(timer);
  }, [pathname]);

  return null;
}
