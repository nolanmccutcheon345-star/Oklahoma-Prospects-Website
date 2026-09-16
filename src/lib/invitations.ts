import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {authMiddleware} from './auth/middleware';
export const getInvitations=createServerFn({method:'GET'}).middleware([authMiddleware]).handler(async({context})=>{const m=await import('./invitations.server');return m.pendingInvitations(context.userId);});
export const acceptClubInvitation=createServerFn({method:'POST'}).middleware([authMiddleware]).validator(z.object({id:z.string().uuid()}).strict()).handler(async({context,data})=>{const m=await import('./invitations.server');return m.acceptInvitation(context.userId,data.id);});
export const inviteGuardian=createServerFn({method:'POST'}).middleware([authMiddleware]).validator(z.object({email:z.string().trim().email().max(254),familyId:z.string().min(1).max(150)}).strict()).handler(async({context,data})=>{const m=await import('./invitations.server');return m.issueInvitation(context.userId,data.email,'parent',data.familyId);});
