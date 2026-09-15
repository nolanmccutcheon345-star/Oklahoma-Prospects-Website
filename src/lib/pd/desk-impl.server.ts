import { getSql } from "@/lib/db";
import {
  authorizeMessage,
  assertAthleteAccess,
  filterDevelopmentData,
  resolveViewerRole,
  scopeForViewer,
  type PdViewer,
} from "./access";
import { hydrateWorkingFile, mergeScopedFile, newFileId } from "./file";
import { seedDevelopment } from "./seed";
import { CLUB_DAY_ISO } from "./engines";
import type { DevelopmentData, Message } from "./types";

const FILE_ID = "club";

async function viewerFromUserId(userId: string): Promise<PdViewer> {
  const sql = await getSql();
  let email = "";
  let name = "";
  let playerName = "";
  let profileRole: string | null = null;
  try {
    const auth = await sql<{ email: string; name: string }>`
      select email, name from "user" where id = ${userId}
    `;
    email = (auth[0]?.email ?? "").toLowerCase();
    name = auth[0]?.name ?? "";
  } catch {
    /* user table may be missing in a partial migrate */
  }
  try {
    const profile = await sql<{
      email: string;
      name: string;
      player_name: string;
      role: string;
    }>`
      select email, name, player_name, role from profiles where user_id = ${userId}
    `;
    if (profile[0]) {
      email = (profile[0].email || email).toLowerCase();
      name = profile[0].name || name;
      playerName = profile[0].player_name || "";
      profileRole = profile[0].role;
    }
  } catch {
    /* profiles may be missing */
  }
  return {
    role: resolveViewerRole(email, profileRole),
    email,
    name,
    playerName,
  };
}

async function readWorkingFile(): Promise<DevelopmentData> {
  const seed = seedDevelopment();
  const sql = await getSql();
  try {
    const rows = await sql<{ payload: string }>`
      select payload from pd_working_file where id = ${FILE_ID}
    `;
    const raw = rows[0]?.payload;
    if (!raw) {
      await writeWorkingFile(seed);
      return seed;
    }
    const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as Partial<DevelopmentData>;
    return hydrateWorkingFile(parsed, seed);
  } catch {
    return seed;
  }
}

async function writeWorkingFile(data: DevelopmentData) {
  const sql = await getSql();
  const payload = JSON.stringify(data);
  await sql`
    insert into pd_working_file (id, payload, updated_at)
    values (${FILE_ID}, ${payload}, now())
    on conflict (id) do update set payload = excluded.payload, updated_at = now()
  `;
}

function scopedDesk(viewer: PdViewer, full: DevelopmentData) {
  const scope = scopeForViewer(viewer, full);
  return { viewer, scope, data: filterDevelopmentData(full, scope) };
}

export async function loadDeskForUser(userId: string) {
  const viewer = await viewerFromUserId(userId);
  const full = await readWorkingFile();
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
    createdAt: CLUB_DAY_ISO,
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
  const merged = mergeScopedFile(full, incoming, scope);
  await writeWorkingFile(merged);
  return { ok: true as const };
}
