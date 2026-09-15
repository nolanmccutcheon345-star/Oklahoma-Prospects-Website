export type CourseLevel = "Foundations" | "Certification";

export type CourseDiscipline =
  | "Pitching"
  | "Hitting"
  | "Catching"
  | "Fielding"
  | "Baserunning";

export type EducationCourse = {
  id: string;
  discipline: CourseDiscipline;
  level: CourseLevel;
  title: string;
  hours: number;
  modules: string[];
};

export type CurriculumLesson = {
  title: string;
  body: string;
  keys: string[];
  do: string[];
  dont: string[];
  assignment: string;
};
