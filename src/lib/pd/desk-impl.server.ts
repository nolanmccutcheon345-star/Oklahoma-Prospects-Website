import { getSql, type Sql } from "@/lib/db";
import { clubIdentity } from "@/lib/identity.server";
import {
  authorizeMessage,
  assertAthleteAccess,
  familyForViewer,
  filterDevelopmentData,
  scopeForViewer,
  type PdViewer,
} from "./access";
import { hydrateWorkingFile, mergeScopedFile, newFileId } from "./file";
import { emptyDevelopment } from "./empty";
import { seedDevelopment } from "./seed";
import type { DevelopmentData, Family, Message } from "./types";

import { withCommerceRecords } from "../commerce/development.server";
import { currentCatalogPrice } from "../pricing";

const FILE_ID = "club";

async function viewerFromUserId(userId: string): Promise<PdViewer> {
  return clubIdentity(userId);
}

export async function readWorkingFile(): Promise<DevelopmentData> {
  const sql = await getSql();
  const [row] = await sql<{ payload: string; revision: number }>`select payload, revision from pd_working_file where id = ${FILE_ID}`;
  const empty = emptyDevelopment();
  // Curriculum/catalog defaults are public. Never manufacture athletes or household data.
  const defaults = seedDevelopment();
  empty.services = defaults.services.map(currentCatalogPrice);
  empty.packages = defaults.packages.map(currentCatalogPrice);
  empty.memberships = defaults.memberships.map(currentCatalogPrice);
  empty.videoStandards = defaults.videoStandards;
  if (!row) return withCommerceRecords(sql, { ...empty, revision: 0 });
  const parsed = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  return withCommerceRecords(sql, { ...hydrateWorkingFile(parsed, empty), revision: row.revision });
}

export async function writeWorkingFile(data: DevelopmentData, transaction?:Sql) {
  const sql = transaction || await getSql();
  const revision = data.revision ?? 0;
  const payload = JSON.stringify({ ...data, revision: revision + 1 });
  const rows = await sql<{ revision: number }>`insert into pd_working_file (id, payload, revision, updated_at)
    values (${FILE_ID}, ${payload}, ${revision + 1}, now())
    on conflict (id) do update set payload = excluded.payload, revision = excluded.revision, updated_at = now()
    where pd_working_file.revision = ${revision}
    returning revision`;
  if (!rows.length) throw new Error("Another editor saved changes. Reload the latest record before saving again.");
  data.revision = rows[0].revision;
  return rows[0].revision;
}

function scopedDesk(viewer: PdViewer, full: DevelopmentData) {
  const scope = scopeForViewer(viewer, full);
  return { viewer, scope, data: filterDevelopmentData(full, scope) };
}

async function provisionViewer(viewer: PdViewer, full: DevelopmentData): Promise<DevelopmentData> {
  if (!viewer.email) return full;
  if (viewer.role === "admin") {
    const email = viewer.email.trim().toLowerCase();
    if (email && !full.coaches.some((row) => row.email.trim().toLowerCase() === email)) {
      const next = {
        ...full,
        coaches: [
          ...full.coaches,
          {
            id: `c-${email.replace(/[^a-z0-9]/g, "").slice(0, 18) || "admin"}`,
            name: viewer.name || "Admin",
            email,
            specialties: [] as string[],
            active: true,
          },
        ],
      };
      await writeWorkingFile(next);
      return next;
    }
    return full;
  }
  if (viewer.role === "coach") {
    const email = viewer.email.trim().toLowerCase();
    if (full.coaches.some((row) => row.email.trim().toLowerCase() === email)) return full;
    const next = {
      ...full,
      coaches: [
        ...full.coaches,
        {
          id: `c-${email.replace(/[^a-z0-9]/g, "").slice(0, 18) || "staff"}`,
          name: viewer.name || "Coach",
          email,
          specialties: [] as string[],
          active: true,
        },
      ],
    };
    await writeWorkingFile(next);
    return next;
  }
  if (familyForViewer(viewer, full)) return full;
  const family: Family = {
    id: `fam-${(viewer as PdViewer & {userId:string}).userId}`,
    name: "Your household", parentName: viewer.name, email: viewer.email,
    phone: "", athleteIds: [], plan: {type:"none",lessonCredits:0},
  };
  const next = {...full,families:[...full.families,family]};
  await writeWorkingFile(next);
  return next;
}

export async function loadDeskForUser(userId: string) {
  const viewer = await viewerFromUserId(userId);
  const full = await provisionViewer(viewer, await readWorkingFile());
  const { data } = scopedDesk(viewer, full);
  return { viewer, data };
}

export async function loadAthleteForUser(userId: string, athleteId: string) {
  const viewer = await viewerFromUserId(userId);
  const full = await readWorkingFile();
  const { scope, data } = scopedDesk(viewer, full);
  assertAthleteAccess(scope, athleteId);
  const athlete = data.athletes.find((row) => row.id === athleteId);
  if (!athlete) throw new Error("Forbidden");
  return { viewer, athleteId, ok: true as const };
}

export async function writeMessageForUser(
  userId: string,
  input: { athleteId: string; body: string; channel?: "family" | "coach" },
) {
  const viewer = await viewerFromUserId(userId);
  const full = await readWorkingFile();
  const scope = scopeForViewer(viewer, full);
  const allowed = authorizeMessage(scope, input);
  const message: Message = {
    id: newFileId("msg"),
    athleteId: allowed.athleteId,
    body: allowed.body,
    channel: allowed.channel === "coach" ? "coach" : "family",
    fromName: viewer.name || (viewer.role === "coach" ? "Coach" : "Parent"),
    fromRole: viewer.role,
    createdAt: new Date().toISOString(),
  };
  await writeWorkingFile({
    ...full,
    messages: [message, ...full.messages],
  });
  return { ok: true as const, message };
}

export async function saveDeskForUser(userId: string, incoming: DevelopmentData) {
  const viewer = await viewerFromUserId(userId);
  const full = await readWorkingFile();
  const scope = scopeForViewer(viewer, full);
  if (incoming.revision !== full.revision) throw new Error("Another editor saved changes. Reload before saving again.");
  const signedMessages=incoming.messages.map(row=>full.messages.find(old=>old.id===row.id)||({...row,fromRole:viewer.role,fromName:viewer.name,createdAt:new Date().toISOString()}));
  const merged = mergeScopedFile(full, {...incoming,messages:signedMessages}, scope);
  const sql = await getSql();
  return sql.transaction(async tx=>{
  const revision = await writeWorkingFile(merged,tx);
  for (const athlete of merged.athletes) {
    if (scope.athleteIds !== "all" && !scope.athleteIds.has(athlete.id)) continue;
    await tx`update club_athletes set name = ${`${athlete.firstName} ${athlete.lastName}`.trim()},
      birth_date = ${athlete.birthDate || null}, coach_ids = ${JSON.stringify(athlete.coachIds)}::jsonb where id = ${athlete.id}`;
  }
  return { ok: true as const, revision };
  });
}
