import { COURSES } from "./courses";
import { CURRICULUM_CONTENT } from "./curriculum-content";
import type { CourseDiscipline, CurriculumLesson, EducationCourse } from "./education-types";

export type { CourseDiscipline, CourseLevel, CurriculumLesson, EducationCourse } from "./education-types";
export { COURSES } from "./courses";
export { CURRICULUM_CONTENT } from "./curriculum-content";

export const COURSE_DISCIPLINES: CourseDiscipline[] = [
  "Pitching",
  "Hitting",
  "Catching",
  "Fielding",
  "Baserunning",
];

export const TOTAL_LESSONS = COURSES.reduce((sum, course) => sum + course.modules.length, 0);

if (TOTAL_LESSONS !== 47) {
  throw new Error(`PD education: expected 47 modules, got ${TOTAL_LESSONS}`);
}

for (const course of COURSES) {
  const lessons = CURRICULUM_CONTENT[course.id];
  if (!lessons || lessons.length !== course.modules.length) {
    throw new Error(
      `PD education: ${course.id} outline ${course.modules.length} vs content ${lessons?.length ?? 0}`,
    );
  }
}

export function moduleId(courseId: string, index: number) {
  return `${courseId}:${index}`;
}

export function parseModuleId(id: string) {
  const idx = id.lastIndexOf(":");
  if (idx < 0) return null;
  return { courseId: id.slice(0, idx), index: Number(id.slice(idx + 1)) };
}

export function lessonFor(courseId: string, index: number): CurriculumLesson | undefined {
  return CURRICULUM_CONTENT[courseId]?.[index];
}

export function coursesFor(discipline: CourseDiscipline | "All"): EducationCourse[] {
  if (discipline === "All") return COURSES;
  return COURSES.filter((row) => row.discipline === discipline);
}

export type ProgressStats = {
  done: number;
  total: number;
  pct: number;
};

export function progressOf(completed: Iterable<string>, courseId?: string): ProgressStats {
  const set = completed instanceof Set ? completed : new Set(completed);
  const ids = (courseId ? COURSES.filter((c) => c.id === courseId) : COURSES).flatMap((course) =>
    course.modules.map((_, index) => moduleId(course.id, index)),
  );
  const done = ids.filter((id) => set.has(id)).length;
  const total = ids.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { done, total, pct };
}

export function seedEducationProgress(): Record<string, string[]> {
  const pit1 = COURSES.find((c) => c.id === "pit-1")!.modules.map((_, i) => moduleId("pit-1", i));
  const pit2 = [0, 1, 2].map((i) => moduleId("pit-2", i));
  const hit1 = COURSES.find((c) => c.id === "hit-1")!.modules.map((_, i) => moduleId("hit-1", i));
  const cat1 = [0, 1].map((i) => moduleId("cat-1", i));
  return {
    "stevemccutcheon89@gmail.com": [...pit1, ...pit2],
    "lane@prospectsbaseball.club": [...hit1, ...cat1],
    "nolanmccutcheon@icloud.com": [moduleId("pit-1", 0), moduleId("pit-1", 1)],
  };
}
