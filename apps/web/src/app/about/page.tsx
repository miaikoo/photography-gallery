import { PageHeading } from "@/components/PageHeading";
import { getSite } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ title: "About", description: "About miaikoo and this photo gallery." });

export default function AboutPage() {
  const { bio, instagramUrl } = getSite();

  return (
    <>
      <PageHeading title="about" />
      {bio && <p className="rise rise-late max-w-[65ch] text-base">{bio}</p>}
      {instagramUrl && (
        <p className="rise rise-late mt-3">
          <a href={instagramUrl} className="tag-link">
            Instagram
          </a>
        </p>
      )}
    </>
  );
}
