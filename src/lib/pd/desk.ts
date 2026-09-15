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
    if (!file || typeof file !== "object" || !Array.isArray(file.athletes) || !Array.isArray(file.messages)) {
      throw new Error("Forbidden");
    }
    return { file };
  })
  .handler(async ({ context, data }) => {
    const { saveDeskForUser } = await import("./desk-impl.server");
    return saveDeskForUser(context.userId, data.file);
  });
