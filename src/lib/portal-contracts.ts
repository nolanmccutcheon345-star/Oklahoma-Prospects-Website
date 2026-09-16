import {z} from 'zod';
const text=z.string().trim().max(120);
export const inquiryInput=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('contact'),requestId:z.string().uuid(),name:text.min(1),email:z.email(),phone:text,message:z.string().trim().min(3).max(5000)}).strict(),
 z.object({kind:z.enum(['tryout','team-inquiry']),requestId:z.string().uuid(),player:text.min(1),age:text.min(1),parent:text.min(1),phone:text.min(1),email:z.email(),notes:z.string().max(5000),sport:z.enum(['Baseball','Softball']),session:text}).strict(),
]);
export const athleteInput=z.object({requestId:z.string().uuid(),name:text.min(1),birthDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),sport:z.enum(['baseball','softball']),throws:z.enum(['R','L']),bats:z.enum(['R','L'])}).strict();
export const waiverInput=z.object({athleteId:text.min(1),adultName:text.min(1),adultPhone:text.min(1),participantType:z.enum(['adult','minor']),emergencyName:text.min(1),emergencyPhone:text.min(1),signerName:text.min(1),relationship:z.enum(['self','parent','legal-guardian']),medicalNotes:z.string().trim().max(2000).default(''),consent:z.literal(true)}).strict();
