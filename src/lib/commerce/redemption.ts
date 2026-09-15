import { z } from 'zod';
export const redemptionInput = z.object({
  requestId:z.string().uuid(),grantId:z.string().max(150),serviceId:z.string().max(80),
  coachId:z.string().max(100).optional(),date:z.string().max(10),time:z.string().max(5).optional(),
  laneId:z.string().max(30).optional(),duration:z.number().int().min(30).max(180).multipleOf(30).optional(),
  household:z.boolean().default(false),athleteCount:z.number().int().min(1).max(2).default(1),
  videoUrl:z.string().url().max(2000).optional(),
}).strict();
