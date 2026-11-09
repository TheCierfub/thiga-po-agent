"use client";

import { useEffect } from "react";

/** La liste est derrière Suspense : le navigateur cherche l'ancre avant que la carte existe. */
export function HashScroll() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (!id) return;
    let frames = 0;
    let raf = 0;
    const tick = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: "start" });
        return;
      }
      if (frames++ < 12) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return null;
}
