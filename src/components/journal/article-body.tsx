import { useState, type ReactNode } from "react";
import { safeLink, type JournalBlock } from "@/lib/journal/contracts";
/** Small explicit text grammar. Raw HTML is always escaped by React. */
export function InlineText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const expression = /(\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\[([^\]\n]+)\]\(([^)\s]+)\))/g;
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(text))) {
    parts.push(text.slice(start, match.index));
    const key = match.index;
    if (match[2]) parts.push(<strong key={key}>{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={key}>{match[3]}</em>);
    else if (safeLink.safeParse(match[5]).success)
      parts.push(
        <a key={key} href={match[5]} className="underline" rel="noopener noreferrer">
          {match[4]}
        </a>,
      );
    else parts.push(match[4]);
    start = expression.lastIndex;
  }
  parts.push(text.slice(start));
  return <>{parts}</>;
}
export function ArticleBody({
  blocks,
  credits = [],
}: {
  blocks: JournalBlock[];
  credits?: { id: string; credit: string }[];
}) {
  return (
    <div className="journal-body space-y-6 break-words text-base leading-8 sm:text-lg">
      {blocks.map((b, i) => {
        if (b.type === "paragraph")
          return (
            <p key={i} className="whitespace-pre-wrap">
              <InlineText text={b.text} />
            </p>
          );
        if (b.type === "heading") {
          const Tag = b.level === 2 ? "h2" : "h3";
          return (
            <Tag key={i} className={b.level === 2 ? "pt-5 text-3xl" : "pt-3 text-2xl"}>
              {b.text}
            </Tag>
          );
        }
        if (b.type === "list") {
          const Tag = b.ordered ? "ol" : "ul";
          return (
            <Tag key={i} className={`space-y-2 pl-7 ${b.ordered ? "list-decimal" : "list-disc"}`}>
              {b.items.map((s, j) => (
                <li key={j}>
                  <InlineText text={s} />
                </li>
              ))}
            </Tag>
          );
        }
        if (b.type === "image")
          return (
            <figure key={i}>
              <img
                src={`/api/journal/images/${b.mediaId}`}
                alt={b.alt}
                loading="lazy"
                width="1280"
                height="854"
                className="h-auto w-full rounded-xl"
              />
              <figcaption className="mt-2 text-sm text-muted">
                {b.caption}{" "}
                {credits.find((c) => c.id === b.mediaId)?.credit && (
                  <>· Credit: {credits.find((c) => c.id === b.mediaId)!.credit}</>
                )}
              </figcaption>
            </figure>
          );
        if (b.type === "video") return <JournalVideo key={i} url={b.url} title={b.title} />;
        if (b.type === "table")
          return (
            <div
              key={i}
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Article table"
            >
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {b.headers.map((h, j) => (
                      <th key={j} scope="col" className="border-b p-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j}>
                      {r.map((c, k) => (
                        <td key={k} className="border-b p-3">
                          <InlineText text={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        if (b.type === "quote")
          return (
            <blockquote key={i} className="border-l-4 border-maroon pl-5 text-xl">
              <p>
                <InlineText text={b.text} />
              </p>
              <footer className="text-sm">— {b.attribution}</footer>
            </blockquote>
          );
        return (
          <aside key={i} className="rounded-xl border-l-4 border-powder bg-white p-6">
            <h3 className="text-2xl">{b.title}</h3>
            <p className="whitespace-pre-wrap">
              <InlineText text={b.text} />
            </p>
          </aside>
        );
      })}
    </div>
  );
}

function JournalVideo({ url, title }: { url: string; title: string }) {
  const [loaded, setLoaded] = useState(false);
  const youtube = /(?:v=|youtu\.be\/)([\w-]{11})$/.exec(url),
    vimeo = /vimeo\.com\/(\d+)$/.exec(url);
  const src = youtube
    ? `https://www.youtube-nocookie.com/embed/${youtube[1]}`
    : vimeo
      ? `https://player.vimeo.com/video/${vimeo[1]}?dnt=1`
      : null;
  return (
    <aside className="rounded-xl border border-line bg-white p-5">
      {loaded && src ? (
        <iframe
          src={src}
          title={title}
          className="aspect-video w-full"
          loading="lazy"
          allow="fullscreen; picture-in-picture"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-presentation"
        />
      ) : (
        <>
          <h3 className="text-xl">{title}</h3>
          <p className="my-3 text-sm text-muted">
            Loading this video connects to its external provider. You can also open it directly.
          </p>
          {src && (
            <button className="mr-4 rounded bg-powder px-4 py-2" onClick={() => setLoaded(true)}>
              Load video
            </button>
          )}
        </>
      )}
      <a className="mt-3 inline-block underline" href={url} rel="noopener noreferrer">
        Watch on video provider
      </a>
    </aside>
  );
}
