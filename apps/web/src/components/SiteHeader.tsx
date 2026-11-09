import Link from "next/link";

const NAV = [
  { href: "/", label: "events" },
  { href: "/tags/", label: "tags" },
  { href: "/about/", label: "about" },
];

export function SiteHeader() {
  return (
    <header className="flex h-(--header) items-center justify-between px-(--gap)">
      <Link href="/" className="font-title text-[19px] sm:text-[23px]">
        miaikoo
      </Link>
      <nav aria-label="Main" className="flex gap-3 text-xs sm:gap-[18px] sm:text-[13.5px]">
        {NAV.map(({ href, label }) => (
          <Link key={label} href={href} className="muted-link">
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
