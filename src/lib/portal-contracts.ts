import {z} from 'zod';
import {athleteRegistrationInput} from './athlete-registration-contracts';
const text=z.string().trim().max(120);
export const inquiryInput=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('contact'),requestId:z.string().uuid(),name:text.min(1),email:z.email(),phone:text,message:z.string().trim().min(3).max(5000)}).strict(),
 z.object({kind:z.enum(['tryout','team-inquiry']),requestId:z.string().uuid(),player:text.min(1),age:text.min(1),parent:text.min(1),phone:text.min(1),email:z.email(),positions:z.string().trim().max(200).default(''),notes:z.string().trim().max(5000),usssaStatus:z.enum(['','provided','unknown','not-registered']).default(''),usssaAthleteId:z.string().trim().max(30).default(''),sport:z.enum(['Baseball','Softball']),session:text,season:text.default(''),autoEnroll:z.boolean().default(false),preferredTeamId:text.default(''),preferredCoachId:text.default(''),requestType:z.enum(['scheduled','individual']).optional(),requestedEventId:z.union([z.literal(''),z.string().uuid()]).optional(),requestConsent:z.boolean().optional(),athleteProfile:athleteRegistrationInput.optional()}).strict(),
]).superRefine((input,ctx)=>{
 if(input.kind!=='tryout')return;
 if(!input.positions)ctx.addIssue({code:'custom',path:['positions'],message:'Enter your player’s positions, or enter New player / still learning.'});
 if(!input.notes)ctx.addIssue({code:'custom',path:['notes'],message:'Add player experience, goals or notes. Enter No additional notes if there is nothing else to share.'});
 if(!input.usssaStatus)ctx.addIssue({code:'custom',path:['usssaStatus'],message:'Choose whether you have a USSSA Player ID.'});
 if(input.usssaStatus==='provided'&&!/^\d+$/.test(input.usssaAthleteId))ctx.addIssue({code:'custom',path:['usssaAthleteId'],message:'Enter the numeric USSSA Player ID, or choose I don’t know it yet.'});
 if(input.usssaStatus!=='provided'&&input.usssaAthleteId)ctx.addIssue({code:'custom',path:['usssaAthleteId'],message:'Choose I have the Player ID to include an ID.'});
});
export const athleteInput=z.object({requestId:z.string().uuid(),name:text.min(1),birthDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),sport:z.enum(['baseball','softball']),throws:z.enum(['R','L']),bats:z.enum(['R','L'])}).strict();
export const waiverInput=z.object({athleteId:text.min(1),adultName:text.min(1),adultPhone:text.min(1),participantType:z.enum(['adult','minor']),emergencyName:text.min(1),emergencyPhone:text.min(1),signerName:text.min(1),relationship:z.enum(['self','parent','legal-guardian']),medicalNotes:z.string().trim().max(2000).default(''),consent:z.literal(true),rosterConsent:z.literal(true)}).strict();
