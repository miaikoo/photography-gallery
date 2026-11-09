type Props = { direction: "left" | "right" };

export function ArrowIcon({ direction }: Props) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
      <path d={direction === "left" ? "M13 7H1M6 2 1 7l5 5" : "M1 7h12M8 2l5 5-5 5"} />
    </svg>
  );
}
