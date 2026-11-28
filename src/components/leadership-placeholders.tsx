export function LeadershipPlaceholders() {
  return (
    <section className="mx-auto max-w-5xl px-5 py-10" aria-labelledby="leadership-heading">
      <h2 id="leadership-heading" className="text-3xl">
        Academy leadership
      </h2>
      <p className="mt-3 max-w-2xl text-sm text-muted">
        Portrait photos and biographies below are placeholders pending owner review. They are not
        published facts and should not be quoted as official bios.
      </p>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {[
          { name: "Steve McCutcheon", role: "Owner / Academy leadership" },
          { name: "Nolan McCutcheon", role: "Ownership / coaching leadership" },
        ].map((person) => (
          <article key={person.name} className="rounded-xl border border-line bg-paper p-5">
            <div
              className="flex size-24 items-center justify-center rounded-lg bg-paper-2 text-center text-xs font-semibold text-muted"
              aria-hidden="true"
            >
              Photo placeholder
            </div>
            <h3 className="mt-3 text-2xl">{person.name}</h3>
            <p className="text-sm font-semibold">{person.role}</p>
            <p className="mt-2 text-sm">
              [PLACEHOLDER — owner input needed] Biography to be provided by the owner. Do not treat
              this paragraph as a published biography.
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
