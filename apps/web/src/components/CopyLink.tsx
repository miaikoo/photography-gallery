"use client";

import { useEffect, useRef, useState } from "react";

const MESSAGE_MS = 2000;

export function CopyLink() {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    timer.current = setTimeout(() => setStatus("idle"), MESSAGE_MS);
  };

  return (
    <button type="button" onClick={copy} className="control-link">
      {status === "idle" ? "copy link" : <span role="status">{status === "copied" ? "Copied" : "Couldn't copy link"}</span>}
    </button>
  );
}
