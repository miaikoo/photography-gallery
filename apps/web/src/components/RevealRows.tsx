"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

// Lives until a full reload, so going back to a page doesn't replay its reveal.
const seen = new Set<string>();
// Strict Mode runs the effect twice on the same tiles. Those must keep playing.
const started = new WeakSet<Element>();

export function RevealRows({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const keyOf = (tile: Element) => `${location.pathname}|${tile.getAttribute("href")}`;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const tile = entry.target as HTMLElement;
          tile.dataset.reveal = "in";
          seen.add(keyOf(tile));
          started.add(tile);
          observer.unobserve(tile);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );

    // A photo landing from a morph must not be clipped by its own tile.
    const morphing = Boolean((document as Document & { activeViewTransition?: unknown }).activeViewTransition);

    for (const tile of ref.current!.querySelectorAll<HTMLElement>(".photo-tile")) {
      if (started.has(tile)) continue;
      const key = keyOf(tile);
      const onScreen = tile.getBoundingClientRect().top < window.innerHeight;
      if (seen.has(key) || (morphing && onScreen)) {
        tile.dataset.reveal = "done";
        seen.add(key);
      } else if (tile.dataset.reveal === "in") {
        seen.add(key);
        started.add(tile);
      } else {
        observer.observe(tile);
      }
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="photo-rows">
      {children}
    </div>
  );
}
