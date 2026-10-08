import { TRYOUT_REQUEST_SESSION } from "./club";

export function validateTryoutRegistration(
  input: { sport: string; age: string; session: string; season?: string; autoEnroll?: boolean },
  _today: string,
) {
  if (input.sport !== "Baseball" && input.sport !== "Softball") {
    throw new Error("Choose baseball or softball.");
  }
  if (!input.age.trim() || input.age.length > 120) {
    throw new Error("Enter the player's age group.");
  }
  if (input.autoEnroll && !input.season?.trim())
    throw new Error("Enter the season for automatic enrollment.");
  if (input.session !== TRYOUT_REQUEST_SESSION) {
    throw new Error("No scheduled session is selected. Refresh to request an individual tryout.");
  }
}
