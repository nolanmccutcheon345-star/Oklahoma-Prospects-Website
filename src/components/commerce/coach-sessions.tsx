import {BookedGuidedLesson} from "../pd/booked-guided-lesson";
import { LessonRecruitingMetrics } from "../lesson-recruiting-metrics";
import { StaffBookingChanges } from "./booking-changes";
import { useEffect, useState } from "react";
import { getCoachBookings } from "@/lib/commerce/portal-api";
import { Button } from "@/components/ui/button";
export function CoachSessions() {
  const [activeLesson,setActiveLesson]=useState<string|null>(null);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getCoachBookings>>>([]);
  const [error, setError] = useState("");
  async function load() {
    setRows(await getCoachBookings());
  }
  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Sessions could not load."));
  }, []);
  return (
    <section className="my-6 grid gap-4">
      {activeLesson&&<BookedGuidedLesson bookingId={activeLesson} onClose={()=>{setActiveLesson(null);void load();}}/>}
      <StaffBookingChanges />
      <h2 className="text-3xl">Paid sessions & assessment completion</h2>
      <p>
        Complete a session after it ends. Completing an assessment here unlocks the athlete’s
        ordinary lessons and packages.
      </p>
      {error ? (
        <p role="alert" className="text-maroon">
          {error}
        </p>
      ) : null}
      {!rows.length ? <p>No paid sessions assigned yet.</p> : null}
      {rows.map((row) => (
        <article key={row.id} data-booking-id={row.id} className="rounded-xl border p-4">
          <h3 className="text-xl">
            {row.athlete_name} · {row.product_id}
          </h3>
          <p>
            {new Date(row.starts_at).toLocaleString("en-US", { timeZone: "America/Chicago" })} ·{" "}
            {row.status}
          </p>
          <LessonRecruitingMetrics bookingId={row.id} />
          <Button onClick={()=>setActiveLesson(row.id)}>{row.status==='completed'?'Open saved lesson':'Open guided lesson'}</Button>
        </article>
      ))}
    </section>
  );
}
