import type { ClubRecord, Player, Team } from "./types";

export const normalizeRosterIdentity = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
export function duplicateRosterPlayer(
  team: Pick<Team, "roster">,
  name: string,
  email: string,
  except = "",
) {
  const normalizedEmail = normalizeRosterIdentity(email);
  const matches = team.roster.filter(
    (p) =>
      p.id !== except &&
      normalizeRosterIdentity(p.name) === normalizeRosterIdentity(name) &&
      p.parents.some((parent) => normalizeRosterIdentity(parent.email) === normalizedEmail),
  );
  return matches.find(p => !p.withdrawn && !p.rosterRemoval) ?? matches[0];
}
/** Existing duplicate pairs may remain for manual review, but no write may introduce a new pair. */
export function assertNoNewRosterDuplicates(before: ClubRecord, after: ClubRecord) {
  for (const team of after.teams)
    for (const player of team.roster) {
      if (player.withdrawn) continue;
      const oldTeam = before.teams.find((t) => t.id === team.id);
      const prior = oldTeam?.roster.find((p) => p.id === player.id);
      for (const removed of oldTeam?.roster.filter((p) => p.rosterRemoval) || []) {
        const matches =
          normalizeRosterIdentity(removed.name) === normalizeRosterIdentity(player.name) &&
          player.parents.some(
            (p) =>
              p.email.trim() &&
              removed.parents.some(
                (x) => normalizeRosterIdentity(x.email) === normalizeRosterIdentity(p.email),
              ),
          );
        const alreadyActive =
          prior &&
          !prior.withdrawn &&
          normalizeRosterIdentity(prior.name) === normalizeRosterIdentity(player.name) &&
          prior.parents.some((p) =>
            removed.parents.some(
              (x) => normalizeRosterIdentity(x.email) === normalizeRosterIdentity(p.email),
            ),
          );
        if (matches && !alreadyActive)
          throw Error(
            "A removed matching roster identity already exists. Review the retained record; Save cannot recreate it.",
          );
      }
      for (const parent of player.parents) {
        if (!parent.email.trim()) continue;
        const candidates = team.roster.filter(
          (p) =>
            p.id !== player.id &&
            !p.withdrawn &&
            normalizeRosterIdentity(p.name) === normalizeRosterIdentity(player.name) &&
            p.parents.some(
              (x) => normalizeRosterIdentity(x.email) === normalizeRosterIdentity(parent.email),
            ),
        );
        for (const duplicate of candidates) {
          const old = before.teams.find((t) => t.id === team.id);
          const oldPlayer = old?.roster.find((p) => p.id === player.id);
          const oldDuplicate = old?.roster.find((p) => p.id === duplicate.id);
          const existed =
            oldPlayer &&
            oldDuplicate &&
            normalizeRosterIdentity(oldPlayer.name) ===
              normalizeRosterIdentity(oldDuplicate.name) &&
            oldPlayer.parents.some((p) =>
              oldDuplicate.parents.some(
                (x) => normalizeRosterIdentity(p.email) === normalizeRosterIdentity(x.email),
              ),
            );
          if (!existed)
            throw Error(
              `Duplicate roster player: ${duplicate.name} (${duplicate.id}). Open the existing record or cancel; no new player was created.`,
            );
        }
      }
    }
}
/** A normal Save cannot delete or resurrect a cleanup tombstone or change its audit. */
export function preserveRosterRemovals(before: ClubRecord, after: ClubRecord) {
  for (const team of before.teams)
    for (const player of team.roster) {
      if (!player.rosterRemoval) continue;
      const nextTeam = after.teams.find((t) => t.id === team.id);
      const next = nextTeam?.roster.find((p) => p.id === player.id);
      if (!nextTeam || !next)
        throw Error("Removed roster history must be retained. Reload the club.");
      next.withdrawn = true;
      next.rosterRemoval = structuredClone(player.rosterRemoval);
    }
}
export function assertSafeRosterMerge(survivor: Player, duplicate: Player) {
  if (survivor.id === duplicate.id || survivor.withdrawn || duplicate.withdrawn)
    throw Error("Choose two different active players.");
  if (
    !survivor.familyId ||
    survivor.familyId !== duplicate.familyId ||
    !duplicateRosterPlayer(
      { roster: [survivor] },
      duplicate.name,
      duplicate.parents[0]?.email || "",
    )
  )
    throw Error(
      "Identity conflict: merge requires the same player name and guardian household/email.",
    );
  if (
    duplicate.feeLock ||
    duplicate.planLock ||
    duplicate.agreement.signedAt ||
    duplicate.payments.length ||
    duplicate.credits.length ||
    duplicate.depositPaid ||
    duplicate.cards.length
  )
    throw Error(
      "The duplicate has financial or contract records. Financial consolidation requires separate review; nothing was changed.",
    );
  if (
    Object.values(duplicate.stats).some(Boolean) ||
    Object.values(duplicate.rsvp).some(Boolean) ||
    Object.values(duplicate.docs).some(Boolean) ||
    duplicate.order.submitted ||
    duplicate.rosterConsent?.signedAt
  )
    throw Error(
      "The duplicate has operational history. Review its records separately before consolidation; nothing was changed.",
    );
}
