import { useEffect, useRef } from "react";
import "./custom-cursor.css";

export default function CustomCursor() {
  const cursor = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = cursor.current!;
    const media = matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    let frame = 0;
    let x = -100, y = -100, dotX = -100, dotY = -100;
    let lastTime = 0;
    const hide = () => {
      root.classList.remove("visible", "clicking");
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
    };
    const animate = (time: number) => {
      const elapsed = lastTime ? Math.min(time - lastTime, 50) : 16.67;
      lastTime = time;
      const tight = 1 - Math.exp(-elapsed / 12);
      dotX += (x - dotX) * tight;
      dotY += (y - dotY) * tight;
      dot.current!.style.transform = `translate3d(${dotX}px, ${dotY}px, 0)`;
      if (Math.abs(x - dotX) + Math.abs(y - dotY) > 0.1) {
        frame = requestAnimationFrame(animate);
      } else {
        frame = 0;
        lastTime = 0;
      }
    };
    const move = (event: PointerEvent) => {
      if (!media.matches || event.pointerType !== "mouse") { hide(); return; }
      x = event.clientX;
      y = event.clientY;
      if (!root.classList.contains("visible")) {
        dotX = x;
        dotY = y;
      }
      const target = event.target instanceof Element ? event.target : null;
      root.classList.toggle("dark-surface", Boolean(target?.closest('[data-cursor-theme="dark"], .sidebar')));
      root.classList.add("visible");
      if (!frame) frame = requestAnimationFrame(animate);
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType === "mouse") root.classList.add("clicking");
      else hide();
    };
    const up = () => root.classList.remove("clicking");
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    window.addEventListener("blur", hide);
    document.documentElement.addEventListener("pointerleave", hide);
    media.addEventListener("change", hide);
    return () => {
      hide();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("blur", hide);
      document.documentElement.removeEventListener("pointerleave", hide);
      media.removeEventListener("change", hide);
    };
  }, []);

  return <div ref={cursor} className="custom-cursor" aria-hidden="true">
    <span ref={dot} className="custom-cursor-dot" />
  </div>;
}
