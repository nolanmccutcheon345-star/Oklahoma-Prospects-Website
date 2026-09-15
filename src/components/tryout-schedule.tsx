import { TRYOUT_DAYS, TRYOUT_MAKEUP } from "@/lib/club";

export function TryoutSchedule() {
  return (
    <div className="grid gap-4">
      {TRYOUT_DAYS.map((day) => (
        <article key={day.date} className="overflow-hidden rounded-2xl bg-paper-2 shadow-border">
          <div className="border-t-4 border-maroon px-5 pt-5 pb-2">
            <h3 className="text-2xl">{day.weekday}</h3>
            <p className="text-sm text-muted">
              {new Intl.DateTimeFormat("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(`${day.date}T00:00:00Z`))}
            </p>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="text-xs tracking-widest text-muted uppercase">
              <tr>
                <th className="px-5 py-2 font-semibold">Age</th>
                <th className="px-5 py-2 font-semibold">Evaluation time</th>
              </tr>
            </thead>
            <tbody>
              {day.sessions.map((session) => (
                <tr key={session.age} className="border-t border-line">
                  <th className="px-5 py-3 font-display text-lg font-extrabold">
                    {session.age}
                  </th>
                  <td className="px-5 py-3">{session.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ))}
      <p className="rounded-xl bg-paper-2 px-5 py-4 text-sm shadow-border">
        <strong>Check in 15 minutes early.</strong> Makeup: {TRYOUT_MAKEUP.label}.
      </p>
    </div>
  );
}
