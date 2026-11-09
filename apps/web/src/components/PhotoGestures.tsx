"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { classifySwipe, dampedOffset } from "@/lib/swipe";

type Props = {
  eventHref: string;
  prevHref?: string;
  nextHref?: string;
  children: ReactNode;
};

type Drag = { id: number; x: number; y: number; time: number };

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function PhotoGestures({ eventHref, prevHref, nextHref, children }: Props) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    if (ref.current) ref.current.dataset.gesturesReady = "";
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === "ArrowLeft" && prevHref) router.push(prevHref);
      else if (event.key === "ArrowRight" && nextHref) router.push(nextHref);
      else if (event.key === "Escape") router.push(eventHref);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, eventHref, prevHref, nextHref]);

  const settle = () => {
    const element = ref.current;
    if (!element) return;
    element.style.transition = prefersReducedMotion() ? "" : "transform 200ms var(--ease-out-strong)";
    element.style.transform = "";
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || drag.current) return;
    if ((window.visualViewport?.scale ?? 1) > 1.01) return; // Panning a zoomed page, not swiping.
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.style.transition = "";
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId || prefersReducedMotion()) return;
    const dx = event.clientX - drag.current.x;
    const atEnd = dx > 0 ? !prevHref : !nextHref;
    event.currentTarget.style.transform = `translateX(${dampedOffset(dx, atEnd)}px)`;
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (start?.id !== event.pointerId) return;
    drag.current = null;
    const direction = classifySwipe({
      dx: event.clientX - start.x,
      dy: event.clientY - start.y,
      ms: event.timeStamp - start.time,
    });
    const href = direction === "prev" ? prevHref : direction === "next" ? nextHref : undefined;
    settle();
    if (href) router.push(href);
  };

  const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    settle();
  };

  return (
    <div
      ref={ref}
      className="photo-gestures"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {children}
    </div>
  );
}
