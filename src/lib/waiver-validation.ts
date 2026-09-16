import { chicagoDate, validDate } from './scheduling';
export function validateWaiverSigner(birthDate:string|null, participantType:'adult'|'minor', relationship:string, now=new Date()) {
 const today=chicagoDate(now);
 if(!birthDate||!validDate(birthDate)||birthDate>today)throw new Error('Add a valid athlete date of birth before signing.');
 const eighteenth=`${Number(birthDate.slice(0,4))+18}${birthDate.slice(4)}`;
 const minor=today<eighteenth;
 if(participantType!==(minor?'minor':'adult'))throw new Error('Participant type must match the athlete’s date of birth.');
 if(minor&&!['parent','legal-guardian'].includes(relationship))throw new Error('A parent or legal guardian must sign for a minor.');
 if(!minor&&relationship!=='self')throw new Error('An adult participant must sign their own waiver.');
}
