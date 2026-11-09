import Link from "next/link";

type Props = { title: string; detail?: string; tags?: string[] };

export function PageHeading({ title, detail, tags = [] }: Props) {
  return (
    <div className="flex flex-col gap-1 pb-3 sm:flex-row sm:items-end sm:justify-between sm:gap-8 sm:pb-[18px]">
      <h1 className="rise font-title text-[30px] leading-[1.04] sm:min-w-[55%] sm:flex-1 sm:text-[46px]">{title}</h1>
      {(detail || tags.length > 0) && (
        <div className="rise rise-late min-w-0 text-xs text-muted tabular-nums sm:text-right sm:text-[13px]">
          {detail && <p>{detail}</p>}
          {tags.length > 0 && (
            <p>
              {tags.map((tag, index) => (
                <span key={tag}>
                  {index > 0 && ", "}
                  <Link href={`/tags/${tag}/`} className="tag-link">
                    {tag}
                  </Link>
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
