import { SOFTBALL_AGES, SOFTBALL_TRYOUT_SESSION, TRYOUT_AGES, TRYOUT_DAYS } from "./club";

export const BASEBALL_TRYOUT_SESSIONS = TRYOUT_DAYS.flatMap((day) =>
  day.sessions.map((session) => ({
    value: `${day.weekday} ${day.date} · ${session.age} · ${session.time}`,
    age: session.age,
    label: `${session.age} · ${day.weekday} ${session.time}`,
  })),
);

export function validateTryoutRegistration(
  input: { sport: string; age: string; session: string },
  today: string,
) {
  if (input.sport === "Softball") {
    if (!(SOFTBALL_AGES as readonly string[]).includes(input.age)) {
      throw new Error("Choose 10U, 12U, 14U, or 16U for softball tryouts.");
    }
    if (input.session !== SOFTBALL_TRYOUT_SESSION) {
      throw new Error("Softball tryout dates and times are to be announced. Please refresh and register again.");
    }
    return;
  }
  if (input.sport !== "Baseball" ||
      !(TRYOUT_AGES as readonly string[]).includes(input.age) ||
      !BASEBALL_TRYOUT_SESSIONS.some((session) => session.age === input.age && session.value === input.session)) {
    throw new Error("Choose a matching baseball age group and session. For other ages, use the team inquiry form.");
  }
  if (today > "2026-11-15") {
    throw new Error("These baseball tryouts have ended. Send a team inquiry for the next opportunity.");
  }
}
