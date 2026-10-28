import type {DevelopmentData} from '../pd/types';

/** Missing coach IDs must never match unassigned bookings or earnings. */
export function assignedCoachIdFor(viewer:{role:string;email:string;canInstruct?:boolean},file:DevelopmentData) {
 const coach=file.coaches.find(c=>c.active!==false&&c.email.trim().toLowerCase()===viewer.email.trim().toLowerCase());
 if(viewer.role==='admin')return coach?.id||'';
 if((viewer.role!=='coach'&&!viewer.canInstruct)||!coach)throw new Error('An active coach assignment is required. Contact the club administrator.');
 return coach.id;
}
