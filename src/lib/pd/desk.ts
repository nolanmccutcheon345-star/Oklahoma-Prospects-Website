import {validateRecord} from "../record-validation";
import {emptyDevelopment} from "./empty";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { DevelopmentData } from "./types";

export const loadPdDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { loadDeskForUser } = await import("./desk-impl.server");
    return loadDeskForUser(context.userId);
  });

export const loadPdAthlete = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { athleteId: string }) => {
    const athleteId = typeof input?.athleteId === "string" ? input.athleteId.trim() : "";
    if (!athleteId || athleteId.length > 80) throw new Error("Forbidden");
    return { athleteId };
  })
  .handler(async ({ context, data }) => {
    const { loadAthleteForUser } = await import("./desk-impl.server");
    return loadAthleteForUser(context.userId, data.athleteId);
  });

export const writePdMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { athleteId: string; body: string; channel?: "family" | "coach" }) => {
    const athleteId = typeof input?.athleteId === "string" ? input.athleteId.trim() : "";
    const body = typeof input?.body === "string" ? input.body : "";
    const channel: "family" | "coach" = input?.channel === "coach" ? "coach" : "family";
    if (!athleteId || athleteId.length > 80) throw new Error("Forbidden");
    return { athleteId, body, channel };
  })
  .handler(async ({ context, data }) => {
    const { writeMessageForUser } = await import("./desk-impl.server");
    return writeMessageForUser(context.userId, data);
  });

export const savePdDesk = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { file: DevelopmentData }) => {
    const file = input?.file;
    validateRecord(file);
    const allowed=new Set([...Object.keys(emptyDevelopment()),"revision"]);
    if(Object.keys(file||{}).some(key=>!allowed.has(key)))throw new Error("Unknown working-record field.");
    if (!file || typeof file !== "object" || !Array.isArray(file.athletes) || !Array.isArray(file.messages)) {
      throw new Error("Forbidden");
    }
    if (!Number.isSafeInteger(file.revision) || JSON.stringify(file).length > 5_000_000) throw new Error("Invalid record.");
    for (const [key, value] of Object.entries(file)) {
      if (key === "policy" || key === "revision") continue;
      if (!Array.isArray(value) || value.some(row => !row || typeof row !== "object")) throw new Error("Invalid record.");
    }
    for(const key of ['athletes','families','coaches','cohorts'] as const){
      const rows=file[key];
      if(!Array.isArray(rows)||rows.some(row=>typeof row.id!=='string'||!row.id||row.id.length>150)||new Set(rows.map(row=>row.id)).size!==rows.length)throw new Error('Invalid or duplicate record identifiers.');
    }
    for(const cohort of file.cohorts)if(!Array.isArray(cohort.athleteIds)||cohort.athleteIds.some(id=>typeof id!=='string'||id.length>150))throw new Error('Invalid cohort members.');
    return { file };
  })
  .handler(async ({ context, data }) => {
    const { saveDeskForUser } = await import("./desk-impl.server");
    return saveDeskForUser(context.userId, data.file);
  });
