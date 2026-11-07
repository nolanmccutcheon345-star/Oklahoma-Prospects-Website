import { Facebook, Instagram } from "lucide-react";
import { LINKS } from "@/lib/club";

export function SocialLinks() {
  return (
    <nav aria-label="Prospects social media" className="flex flex-wrap gap-x-5 gap-y-2">
      <a
        className="inline-flex min-h-11 items-center gap-2 underline"
        href={LINKS.facebook}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Facebook className="size-5" aria-hidden="true" />
        Facebook<span className="sr-only"> (opens in a new tab)</span>
      </a>
      <a
        className="inline-flex min-h-11 items-center gap-2 underline"
        href={LINKS.instagram}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Instagram className="size-5" aria-hidden="true" />
        Instagram<span className="sr-only"> (opens in a new tab)</span>
      </a>
    </nav>
  );
}
