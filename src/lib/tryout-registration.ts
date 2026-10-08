import { TRYOUT_REQUEST_SESSION, TRYOUT_AGE_GROUPS } from "./club";

export function validateTryoutRegistration(
  input: { sport: string; age: string; session: string; season?: string; autoEnroll?: boolean },
  _today: string,
) {
  if (input.sport !== "Baseball" && input.sport !== "Softball") {
    throw new Error("Choose baseball or softball.");
  }
  if (!TRYOUT_AGE_GROUPS.some(group => group === input.age.trim())) {
    throw new Error("Enter the player's age group.");
  }
  if (input.autoEnroll && !input.season?.trim())
    throw new Error("Enter the season for automatic enrollment.");
  if (input.session !== TRYOUT_REQUEST_SESSION) {
    throw new Error("No scheduled session is selected. Refresh to request an individual tryout.");
  }
}
