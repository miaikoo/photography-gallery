import Link from "next/link";
import { CopyLink } from "./CopyLink";
import { ArrowIcon } from "./icons";

type Props = { prevHref?: string; nextHref?: string };

export function PhotoControls({ prevHref, nextHref }: Props) {
  return (
    <div className="photo-controls">
      {prevHref && (
        <Link href={prevHref} aria-label="Previous photo" className="control-link">
          <ArrowIcon direction="left" /> previous
        </Link>
      )}
      {nextHref && (
        <Link href={nextHref} aria-label="Next photo" className="control-link">
          next <ArrowIcon direction="right" />
        </Link>
      )}
      <span className="ml-auto">
        <CopyLink />
      </span>
    </div>
  );
}
