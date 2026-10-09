import type { StaffMember, Team } from "./types";
const emailKey = (email: string) => email.trim().toLowerCase();
export function isAssignedCoach(team: Team, email: string): boolean {
  const key = emailKey(email);
  return Boolean(key) && (emailKey(team.coachEmail) === key || team.staff.some(member => emailKey(member.email) === key));
}
export function assignedAssistantCoaches(team: Team): StaffMember[] {
  const seen = new Set<string>([emailKey(team.coachEmail)]);
  return team.staff.filter(member => {
    const key = emailKey(member.email);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function addAssistantCoach(team: Team, staff: StaffMember): Team {
  if (!staff.email.trim()) throw new Error("Enter the coach's sign-in email.");
  if (isAssignedCoach(team, staff.email))
    throw new Error("This coach is already assigned to this team.");
  return { ...team, staff: [...team.staff, { ...staff, email: emailKey(staff.email) }] };
}
export function assignHeadCoach(team: Team, coach?: { name: string; email: string }): Team {
  if (!coach) return { ...team, headCoach: "", coachEmail: "" };
  if (!coach.name.trim() || !coach.email.includes("@")) throw new Error("Select a valid coach.");
  // Do not destroy historical staff payroll/compliance records. Existing
  // duplicate entries are hidden as assistants, not silently deleted.
  return { ...team, headCoach: coach.name.trim(), coachEmail: emailKey(coach.email) };
}
