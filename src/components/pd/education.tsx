import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useDevelopment } from "@/lib/pd/context";
import {
  COURSE_DISCIPLINES,
  COURSES,
  TOTAL_LESSONS,
  coursesFor,
  lessonFor,
  moduleId,
  type CourseDiscipline,
  type EducationCourse,
} from "@/lib/pd/content/education";
import { cn } from "@/lib/utils";

function Panel({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-paper-2 shadow-border">
      <div className="pd-card">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
          {eyebrow}
        </p>
        <h3 className="mt-2 text-2xl">{title}</h3>
        <div className="mt-4">{children}</div>
      </div>
    </section>
  );
}

function Meter({ pct, label }: { pct: number; label: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted">{label}</span>
        <span className="pd-num font-display text-xl">{pct}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper">
        <div className="h-full bg-maroon" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

export function CoachEducation({
  email,
  name,
}: {
  email: string;
  name?: string;
}) {
  const { educationStats, educationFor, toggleEducation } = useDevelopment();
  const overall = educationStats(email);
  const [discipline, setDiscipline] = useState<CourseDiscipline | "All">("Pitching");
  const [courseId, setCourseId] = useState<string | null>(null);
  const [moduleIndex, setModuleIndex] = useState<number | null>(null);
  const courses = coursesFor(discipline);
  const course = COURSES.find((row) => row.id === courseId) ?? null;
  const lesson =
    course && moduleIndex != null ? lessonFor(course.id, moduleIndex) : undefined;
  const completed = useMemo(() => new Set(educationFor(email)), [educationFor, email]);

  if (lesson && course && moduleIndex != null) {
    const id = moduleId(course.id, moduleIndex);
    const done = completed.has(id);
    const last = moduleIndex >= course.modules.length - 1;
    return (
      <div className="pd-stack" data-education="reader" data-module-id={id}>
        <button
          type="button"
          className="pd-control min-h-11 text-left text-sm font-semibold text-maroon"
          onClick={() => setModuleIndex(null)}
        >
          Back to {course.title}
        </button>
        <Panel
          eyebrow={`${course.discipline} · ${course.level} · module ${moduleIndex + 1} of ${course.modules.length}`}
          title={lesson.title}
        >
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{lesson.body}</p>
        </Panel>
        <Panel eyebrow="Own this" title="Key points">
          <ul className="grid gap-2">
            {lesson.keys.map((row) => (
              <li key={row} className="pd-row rounded-xl bg-paper text-sm">
                {row}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel eyebrow="On the floor" title="Do this">
          <ul className="grid gap-2">
            {lesson.do.map((row) => (
              <li key={row} className="pd-row rounded-xl bg-paper text-sm">
                {row}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel eyebrow="Guardrails" title="Don’t">
          <ul className="grid gap-2">
            {lesson.dont.map((row) => (
              <li key={row} className="rounded-xl bg-maroon/15 px-3 py-2 text-sm">
                {row}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel eyebrow="Check" title="Assignment">
          <p className="text-sm">{lesson.assignment}</p>
          <div className="mt-4 grid gap-2">
            <Button
              type="button"
              variant={done ? "outlineDark" : "maroon"}
              onClick={() => toggleEducation(email, id)}
            >
              {done ? "Completed — tap to undo" : "Mark complete"}
            </Button>
            {!last ? (
              <Button
                type="button"
                variant="outlineDark"
                onClick={() => setModuleIndex(moduleIndex + 1)}
              >
                Next module
              </Button>
            ) : (
              <Button type="button" variant="outlineDark" onClick={() => setModuleIndex(null)}>
                Back to course
              </Button>
            )}
          </div>
        </Panel>
      </div>
    );
  }

  if (course) {
    const stats = educationStats(email, course.id);
    return (
      <div className="pd-stack" data-education="course" data-course-id={course.id}>
        <button
          type="button"
          className="pd-control min-h-11 text-left text-sm font-semibold text-maroon"
          onClick={() => {
            setCourseId(null);
            setModuleIndex(null);
          }}
        >
          All courses
        </button>
        <Panel eyebrow={`${course.discipline} · ${course.hours} hours`} title={course.title}>
          <Meter pct={stats.pct} label={`${stats.done} of ${stats.total} modules`} />
        </Panel>
        <ol className="grid gap-2">
          {course.modules.map((title, index) => {
            const id = moduleId(course.id, index);
            const done = completed.has(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  data-module-row={id}
                  onClick={() => setModuleIndex(index)}
                  className="pd-row min-h-11 w-full rounded-2xl bg-paper-2 text-left shadow-border"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-xl uppercase">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-semibold tracking-wide uppercase",
                        done ? "text-maroon" : "text-muted",
                      )}
                    >
                      {done ? "Done" : "Open"}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm">{title}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  return (
    <div className="pd-stack" data-education="catalog">
      <Panel
        eyebrow="Coach education"
        title={name ? `${name.split(" ")[0]}’s courses` : "Eight courses. Forty-seven modules."}
      >
        <p className="text-sm text-muted">
          Foundations then certification. Mark a module complete after you run the assignment.
        </p>
        <div className="mt-4">
          <Meter pct={overall.pct} label={`${overall.done} of ${TOTAL_LESSONS} modules`} />
        </div>
        <label className="mt-4 grid gap-1.5 text-sm font-semibold">
          Discipline
          <select
            className="pd-control min-h-11 w-full rounded-md border border-line bg-paper-2 px-3"
            value={discipline}
            onChange={(event) => setDiscipline(event.target.value as CourseDiscipline | "All")}
          >
            <option value="All">All</option>
            {COURSE_DISCIPLINES.map((row) => (
              <option key={row} value={row}>
                {row}
              </option>
            ))}
          </select>
        </label>
      </Panel>
      {courses.map((row) => (
        <CourseCard
          key={row.id}
          course={row}
          pct={educationStats(email, row.id).pct}
          onOpen={() => {
            setCourseId(row.id);
            setModuleIndex(null);
          }}
        />
      ))}
    </div>
  );
}

function CourseCard({
  course,
  pct,
  onOpen,
}: {
  course: EducationCourse;
  pct: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      data-course-id={course.id}
      onClick={onOpen}
      className="w-full rounded-2xl bg-paper-2 text-left shadow-border"
    >
      <div className="pd-card">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
          {course.discipline} · {course.level} · {course.hours} hr
        </p>
        <h3 className="mt-2 text-2xl">{course.title}</h3>
        <p className="mt-2 text-sm text-muted">{course.modules.length} modules</p>
        <div className="mt-3">
          <Meter pct={pct} label="Complete" />
        </div>
      </div>
    </button>
  );
}

export function CoachEducationProgress({
  coaches,
}: {
  coaches: { name: string; email: string; note?: string }[];
}) {
  const { educationStats } = useDevelopment();
  return (
    <section className="rounded-2xl bg-paper-2 shadow-border" data-education-admin="true">
      <div className="pd-card">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
          Coach education
        </p>
        <h3 className="mt-2 text-2xl">Module completion</h3>
        <p className="mt-2 text-sm text-muted">
          {TOTAL_LESSONS} modules across {COURSES.length} courses. Visible to admin only.
        </p>
        <ul className="mt-4 grid gap-2">
          {coaches.map((row) => {
            const stats = educationStats(row.email);
            return (
              <li
                key={row.email || row.name}
                className="pd-row rounded-xl bg-paper"
                data-coach-progress={row.email}
                data-progress-pct={stats.pct}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <strong>{row.name}</strong>
                  <span className="pd-num font-display text-2xl">{stats.pct}%</span>
                </span>
                <span className="mt-1 block text-sm text-muted">
                  {stats.done} / {stats.total}
                  {row.note ? ` · ${row.note}` : ""}
                </span>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-2">
                  <div className="h-full bg-maroon" style={{ width: `${stats.pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
