import { Link } from "@tanstack/react-router";
import type { AboutContent as AboutDocument } from "@/lib/website-content-contracts";
import { PageHero } from "./page-hero";
import { BrandImage } from "./brand-image";
import { Button } from "./ui/button";

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 leading-relaxed text-muted">
      {text
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((paragraph, index) => (
          <p key={index} className="whitespace-pre-line break-words">
            {paragraph}
          </p>
        ))}
    </div>
  );
}

/** The editor preview and public page render the same escaped, plain-text document. */
export function AboutContent({ content }: { content: AboutDocument }) {
  return (
    <div className="min-w-0 break-words">
      <PageHero
        eyebrow={content.eyebrow}
        title={content.title}
        copy={content.intro}
        image="/brand/facility.jpg"
      />
      <section className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-8 px-5 py-12 lg:grid-cols-2">
        <div className="min-w-0">
          <h2 className="text-4xl">{content.storyTitle}</h2>
          <Paragraphs text={content.story} />
        </div>
        <figure className="min-w-0 overflow-hidden rounded-2xl border border-line bg-paper-2">
          <BrandImage
            src="/brand/facility.jpg"
            alt="Indoor practice lanes at Prospects Sports Facility"
            width={1536}
            height={1152}
            className="aspect-[4/3] w-full object-cover"
          />
          <figcaption className="p-4">
            <Link
              to="/facility"
              className="inline-flex min-h-11 items-center font-semibold underline"
            >
              Explore the facility & rates
            </Link>
          </figcaption>
        </figure>
      </section>
      <section className="bg-paper-2 px-5 py-12">
        <div className="mx-auto max-w-6xl border-l-4 border-maroon pl-5">
          <h2 className="text-4xl">{content.missionTitle}</h2>
          <Paragraphs text={content.mission} />
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-12">
        <h2 className="text-4xl">{content.philosophyTitle}</h2>
        <Paragraphs text={content.philosophy} />
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/training">Find your training</Link>
          </Button>
          <Button asChild variant="outlineDark">
            <Link to="/teams">Explore our teams</Link>
          </Button>
          <Button asChild variant="outlineDark">
            <Link to="/contact">Contact us</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
