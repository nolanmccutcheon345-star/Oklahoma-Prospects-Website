import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {authMiddleware} from '../auth/middleware';
const id=z.string().min(1).max(150);
export const saveBookingParticipants=createServerFn({method:'POST'}).middleware([authMiddleware]).validator(z.object({id,athleteIds:z.array(id).min(1).max(100)}).strict()).handler(async({context,data})=>{const m=await import('./operations.server');return m.setParticipants(context.userId,data.id,data.athleteIds);});
export const getEarnings=createServerFn({method:'GET'}).middleware([authMiddleware]).handler(async({context})=>{const m=await import('./operations.server');return m.earnings(context.userId);});
export const settleEarning=createServerFn({method:'POST'}).middleware([authMiddleware]).validator(z.object({id,reference:z.string().trim().min(4).max(150)}).strict()).handler(async({context,data})=>{const m=await import('./operations.server');return m.recordSettlement(context.userId,data.id,data.reference);});
export const getOfficeOperations=createServerFn({method:'GET'}).middleware([authMiddleware]).handler(async({context})=>{const m=await import('./operations.server');return m.officeOperations(context.userId);});
export const setServiceResources=createServerFn({method:'POST'}).middleware([authMiddleware]).validator(z.object({id,laneIds:z.array(z.string().max(30)).min(1).max(6)}).strict()).handler(async({context,data})=>{const m=await import('./operations.server');return m.saveServiceResources(context.userId,data.id,data.laneIds);});
