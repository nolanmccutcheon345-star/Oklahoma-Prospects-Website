import { z } from "zod";
const gameDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const d = new Date(s + "T12:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === s;
}, "Choose a real game date.");
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a valid local game time.");
export const gameEventInput = z.object({
 id: z.union([z.string().uuid(),z.literal("")]),
 revision: z.number().int().nonnegative(),
 sport: z.enum(["Baseball","Softball"]),
 ageGroup: z.string().trim().max(32),
 teamName: z.string().trim().min(2).max(100),
 opponent: z.string().trim().min(2).max(100),
 date: gameDate,
 startTime: clock,
 venue: z.string().trim().max(240),
 status: z.enum(["draft","scheduled","live","final","cancelled"]),
 ourRuns: z.number().int().min(0).max(999),
 oppRuns: z.number().int().min(0).max(999),
 inning: z.string().trim().max(60),
 videoId: z.string().trim().regex(/^$|^[A-Za-z0-9_-]{11}$/, "Use only the 11-character YouTube video ID."),
 videoKind: z.enum(["none","live","replay","highlight"]),
 mediaApproved: z.boolean(),
 published: z.boolean(),
}).strict().superRefine((g,ctx)=>{
 if((g.videoKind==="none") !== (g.videoId===""))
   ctx.addIssue({code:"custom",message:"A video ID and its video type must both be supplied.",path:["videoId"]});
 if(g.published && g.status==="draft")
   ctx.addIssue({code:"custom",message:"Draft games cannot be public.",path:["published"]});
 if(g.published && g.videoId && !g.mediaApproved)
   ctx.addIssue({code:"custom",message:"Confirm guardian/media publishing approvals before releasing video.",path:["mediaApproved"]});
 if(g.id==="" && g.revision!==0)
   ctx.addIssue({code:"custom",message:"New games must have revision zero.",path:["revision"]});
});
export type GameEventInput=z.infer<typeof gameEventInput>;
export type PublicGameEvent=Omit<GameEventInput,"mediaApproved"|"published"|"revision"> & {id:string;revision:number};
export type AdminGameEvent=GameEventInput;
export function videoEmbedUrl(videoId: string) {
 if(!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error("Invalid YouTube video ID.");
 return "https://www.youtube-nocookie.com/embed/"+videoId;
}
