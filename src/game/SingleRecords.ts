import { COURSES, type CourseId } from './CourseCatalog';

export const SINGLE_RECORDS_KEY='pawhaven.single-records.v1';
export const SINGLE_GOALS=['finish','noFalls','time'] as const;
export type SingleGoal=typeof SINGLE_GOALS[number];
export interface SingleCompletion { newBest:boolean; goals:SingleGoal[]; newGoals:SingleGoal[] }
/** Local personal records only; not authoritative multiplayer rankings or rewards. */
export class SingleRecords {
  private readonly times:Partial<Record<CourseId,number>>={};
  private readonly earned:Partial<Record<CourseId,SingleGoal[]>>={};
  constructor(private readonly storage?:Pick<Storage,'getItem'|'setItem'>){
    try{
      const data=JSON.parse(storage?.getItem(SINGLE_RECORDS_KEY)??'null');
      if(![1,2].includes(data?.version)||!data.times||typeof data.times!=='object')return;
      for(const id of Object.keys(COURSES) as CourseId[]){
        const ms=data.times[id];if(!Number.isSafeInteger(ms)||ms<=0)continue;
        this.times[id]=ms;
        const saved=data.version===2&&Array.isArray(data.goals?.[id])?data.goals[id]:[];
        this.earned[id]=SINGLE_GOALS.filter(goal=>goal==='finish'||goal==='time'&&ms<=COURSES[id].goalSeconds*1000||goal==='noFalls'&&saved.includes(goal));
      }
    }catch{/* Keep personal records usable for this session when storage is unavailable. */}
  }
  best(map:CourseId):number|null{return Object.hasOwn(COURSES,map)?this.times[map]??null:null;}
  goals(map:CourseId):SingleGoal[]{return Object.hasOwn(COURSES,map)?[...(this.earned[map]??[])]:[];}
  record(map:CourseId,seconds:number):boolean{return this.apply(map,seconds).newBest;}
  complete(map:CourseId,seconds:number,falls:number):SingleCompletion{
    if(!Number.isSafeInteger(falls)||falls<0)return{newBest:false,goals:this.goals(map),newGoals:[]};
    return this.apply(map,seconds,falls);
  }
  private apply(map:CourseId,seconds:number,falls?:number):SingleCompletion{
    const ms=Math.round(seconds*1000);
    if(!Object.hasOwn(COURSES,map)||!Number.isFinite(seconds)||!Number.isSafeInteger(ms)||ms<=0)return{newBest:false,goals:this.goals(map),newGoals:[]};
    const previous=this.goals(map),newBest=ms<(this.times[map]??Infinity);
    const achieved=SINGLE_GOALS.filter(goal=>goal==='finish'||goal==='noFalls'&&falls===0||goal==='time'&&ms<=COURSES[map].goalSeconds*1000);
    const newGoals=achieved.filter(goal=>!previous.includes(goal));
    if(newBest)this.times[map]=ms;
    this.earned[map]=SINGLE_GOALS.filter(goal=>previous.includes(goal)||achieved.includes(goal));
    if(newBest||newGoals.length)try{this.storage?.setItem(SINGLE_RECORDS_KEY,JSON.stringify({version:2,times:this.times,goals:this.earned}));}catch{/* Keep progress in memory. */}
    return{newBest,goals:this.goals(map),newGoals};
  }
}
