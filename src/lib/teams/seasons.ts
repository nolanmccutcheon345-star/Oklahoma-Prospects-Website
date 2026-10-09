export function teamSeasons(team: { seasons?: string[]; seasonLabel: string }): string[] {
  if (team.seasons?.length) return [...new Set(team.seasons)];
  const combined = /^(Spring|Summer|Fall|Winter)\s*&\s*(Spring|Summer|Fall|Winter)\s+(\d{4})$/i.exec(team.seasonLabel);
  if (team.seasonLabel.includes(" & ") && !combined) return team.seasonLabel.split(" & ");
  return combined ? [`${combined[1]} ${combined[3]}`, `${combined[2]} ${combined[3]}`] : team.seasonLabel ? [team.seasonLabel] : [];
}

export function seasonOptions(current: string[] = []) {
  const year = new Date().getFullYear();
  return [...new Set([...Array.from({length: 4}, (_, i) => ["Spring", "Summer", "Fall", "Winter"].map(s => `${s} ${year+i}`)).flat(), ...current])];
}
