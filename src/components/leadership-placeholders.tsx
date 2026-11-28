export function LeadershipPlaceholders() {
  return (
    <section className="mx-auto max-w-5xl px-5 py-10" aria-labelledby="leadership-heading">
      <h2 id="leadership-heading" className="text-3xl">
        Academy leadership
      </h2>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <article className="rounded-xl border border-line bg-paper p-5">
          <img
            src="/brand/steve-owner-website-photo.webp"
            alt="Steve McCutcheon at the ballpark"
            width={1296}
            height={1616}
            className="mb-4 h-auto w-full max-w-xs rounded-lg"
          />
          <h3 className="text-2xl">Steve McCutcheon</h3>
          <p className="text-sm font-semibold">Owner &amp; Founder</p>
          <p className="mt-3 text-sm">
            Steve founded Prospects Sports Academy in 2008 with one goal: help young ballplayers
            become great players — and even better people. Nearly two decades later, Prospects’
            25,000 sq. ft. indoor facility in Broken Arrow trains hundreds of baseball and softball
            players ages 6U–18U, with 7 indoor lanes, lessons, memberships, and competitive teams.
          </p>
          <blockquote className="mt-3 text-sm italic">
            “This is where dreams start — and players are made.”
          </blockquote>
        </article>
        <article className="rounded-xl border border-line bg-paper p-5">
          <div
            className="flex size-24 items-center justify-center rounded-lg bg-paper-2 text-center text-xs font-semibold text-muted"
            aria-hidden="true"
          >
            Photo placeholder
          </div>
          <h3 className="mt-3 text-2xl">Nolan McCutcheon</h3>
          <p className="text-sm font-semibold">Ownership / coaching leadership</p>
          <p className="mt-2 text-sm">Biography pending owner review.</p>
        </article>
      </div>
    </section>
  );
}
