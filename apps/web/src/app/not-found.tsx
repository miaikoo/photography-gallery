import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <>
      <h1 className="font-title mb-3 text-3xl sm:text-[46px] sm:leading-[1.04]">Page not found.</h1>
      <Link href="/" className="tag-link">
        Back to all events
      </Link>
    </>
  );
}
