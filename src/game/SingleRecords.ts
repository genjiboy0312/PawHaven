import { COURSES, type CourseId } from './CourseCatalog';

export const SINGLE_RECORDS_KEY='pawhaven.single-records.v1';
/** Local personal records only; not authoritative multiplayer rankings or rewards. */
export class SingleRecords {
  private readonly times:Partial<Record<CourseId,number>>={};
  constructor(private readonly storage?:Pick<Storage,'getItem'|'setItem'>){
    try{
      const data=JSON.parse(storage?.getItem(SINGLE_RECORDS_KEY)??'null');
      if(data?.version!==1||!data.times||typeof data.times!=='object')return;
      for(const id of Object.keys(COURSES) as CourseId[]){const ms=data.times[id];if(Number.isSafeInteger(ms)&&ms>0)this.times[id]=ms;}
    }catch{/* Keep personal records usable for this session when storage is unavailable. */}
  }
  best(map:CourseId):number|null{return this.times[map]??null;}
  record(map:CourseId,seconds:number):boolean{
    const ms=Math.round(seconds*1000);
    if(!Object.hasOwn(COURSES,map)||!Number.isFinite(seconds)||!Number.isSafeInteger(ms)||ms<=0||ms>=(this.times[map]??Infinity))return false;
    this.times[map]=ms;
    try{this.storage?.setItem(SINGLE_RECORDS_KEY,JSON.stringify({version:1,times:this.times}));}catch{/* Keep the new record in memory. */}
    return true;
  }
}
