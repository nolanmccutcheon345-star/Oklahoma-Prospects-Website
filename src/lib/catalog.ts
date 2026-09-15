import {
  MEMBERSHIPS_INIT,
  PACKAGES_INIT,
  SERVICES_INIT,
  requiresAssessment,
} from "@/lib/pd/content/commerce";

export type LessonService = {
  id: string;
  name: string;
  discipline: "Pitching" | "Hitting" | "Catching" | "Fielding";
  price: number;
  minutes: number;
  purpose: string;
  entry?: boolean;
  group?: boolean;
  coachSplit: number;
  requiresAssessment: boolean;
};

export const LESSON_CATALOG: LessonService[] = SERVICES_INIT.map((item) => ({
  id: item.id,
  name: item.name,
  discipline: item.discipline,
  price: item.price,
  minutes: item.duration,
  purpose: item.purpose,
  entry: "entry" in item ? item.entry : undefined,
  group: "group" in item ? item.group : undefined,
  coachSplit: item.coachSplit,
  requiresAssessment: requiresAssessment(item),
}));

export const LESSON_PACKAGES = PACKAGES_INIT.map((item) => ({
  id: item.id,
  name: item.name,
  credits: item.credits,
  minutes: /30/.test(item.name) ? 30 : 60,
  price: item.price,
  expiresDays: item.expiresDays,
}));

export const DEVELOPMENT_PLANS = MEMBERSHIPS_INIT.map((item) => ({
  id: item.id,
  tier: item.tier,
  name: item.name,
  price: item.price,
  lessons: item.lessons,
  minutes: item.minutes,
  remote: item.remote,
  rollover: item.rollover,
  detail: item.blurb,
  includes: [...item.includes],
}));

export const DRILL_LIBRARY = [
  {
    focus: "Hitting",
    name: "Tee path + contact point",
    detail: "3 rounds of 8. Pause at contact. Film from open side.",
  },
  {
    focus: "Hitting",
    name: "Opposite-field tee",
    detail: "Keep the barrel through the middle. 20 swings.",
  },
  {
    focus: "Pitching",
    name: "Balance hold",
    detail: "Hold the lift for 2 seconds. 3 sets of 8.",
  },
  {
    focus: "Pitching",
    name: "Command down and glove side",
    detail: "20 pitches. Chart strikes. Film from center field.",
  },
  {
    focus: "Fielding",
    name: "Right-left-field",
    detail: "Ground balls to both sides. Quick feet, soft hands.",
  },
  {
    focus: "Catching",
    name: "Block and recover",
    detail: "12 balls in the dirt. Stay square. Recover to throw.",
  },
] as const;

export { ASSESSMENT_PRODUCTS as ASSESSMENT_IDS } from "./pricing";

export function findLesson(id: string) {
  return LESSON_CATALOG.find((item) => item.id === id);
}

export function findPackage(id: string) {
  return LESSON_PACKAGES.find((item) => item.id === id);
}

export function findDevelopmentPlan(id: string) {
  return DEVELOPMENT_PLANS.find((item) => item.id === id);
}

export function lessonNeedsAssessment(id: string) {
  return findLesson(id)?.requiresAssessment === true;
}
