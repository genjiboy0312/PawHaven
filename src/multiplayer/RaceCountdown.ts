/** startsAt is the shared movement-unlock time, never a per-device timer. */
export function raceCountdown(startsAt:number|null,now:number):string {
  if(startsAt===null)return '';
  const remaining=(startsAt-now)/1000;
  if(remaining>6)return '';
  if(remaining>1)return String(Math.ceil(remaining)-1);
  if(remaining>0)return 'Ready~';
  return remaining> -0.8?'Start!':'';
}
