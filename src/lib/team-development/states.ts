export const TEAM_DEV_COMPLETION_STATES = [
  "assigned","started","completed","missed","skipped_by_coach","modified","expired",
] as const;
export type TeamDevCompletionState=(typeof TEAM_DEV_COMPLETION_STATES)[number];

export type ComplianceItem = {
  state: TeamDevCompletionState;
  dueDate: string;
  completedOn?: string | null;
  isRtt?: boolean;
  superseded?: boolean;
  departedOn?: string | null;
  paused?: boolean;
};

export function isEligibleForCompliance(item:ComplianceItem) {
  if(item.isRtt||item.superseded||item.paused||item.state==="skipped_by_coach")return false;
  if(item.departedOn && item.dueDate>=item.departedOn)return false;
  return true;
}
function roundHalfUp(numerator:number,denominator:number) {
  return Math.floor((numerator*100*2+denominator)/(2*denominator));
}
export function compliance(items:ComplianceItem[]) {
  const eligible=items.filter(isEligibleForCompliance);
  if(!eligible.length)return {eligible:0,completed:0,onTime:0,completionPct:null,onTimePct:null};
  const completed=eligible.filter(i=>i.state==="completed").length;
  const onTime=eligible.filter(i=>i.state==="completed"&&Boolean(i.completedOn)&&i.completedOn!<=i.dueDate).length;
  return {
    eligible:eligible.length,completed,onTime,
    completionPct:roundHalfUp(completed,eligible.length),
    onTimePct:roundHalfUp(onTime,eligible.length),
  };
}

export function dailyTransition(input:{
  state:TeamDevCompletionState;
  dueDate:string;
  phaseEndDate:string;
  lateCreditWindowEnd:string;
  today:string;
  paused:boolean;
}):TeamDevCompletionState {
  if(input.paused||["completed","skipped_by_coach","expired"].includes(input.state))return input.state;
  if(input.today>input.phaseEndDate)return "expired";
  if(input.today>input.lateCreditWindowEnd)return "expired";
  if(input.today>input.dueDate && (input.state==="assigned"||input.state==="started"||input.state==="modified"))return "missed";
  return input.state;
}

export function lateCompletionDecision(input:{
  today:string;
  phaseEndDate:string;
  lateCreditWindowEnd:string;
  throwing:boolean;
  ceilingApproved:boolean;
  restSatisfied:boolean;
}) {
  if(input.today>input.phaseEndDate)return {ok:false as const,reason:"phase_ended" as const};
  if(input.today>input.lateCreditWindowEnd)return {ok:false as const,reason:"late_window_closed" as const};
  if(input.throwing&&(!input.ceilingApproved||!input.restSatisfied))return {ok:false as const,reason:"ceiling_block" as const};
  return {ok:true as const,isLate:true as const};
}
