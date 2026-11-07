import { COURSES, courseMode, type CourseId } from './CourseCatalog';

export const SINGLE_RECORDS_KEY='pawhaven.single-records.v1';
export const SINGLE_GOALS=['finish','noFalls','time'] as const;
export type SingleGoal=typeof SINGLE_GOALS[number];
export const SINGLE_RECORD_MAX_MS = 86400000;
export interface SingleRecordData { version: 2; times: Partial<Record<CourseId, number>>; goals: Partial<Record<CourseId, SingleGoal[]>> }
export interface SingleCompletion { newBest:boolean; goals:SingleGoal[]; newGoals:SingleGoal[] }
/** Personal progress, independent of competitive rankings and currency rewards. */
export class SingleRecords {
  private readonly listeners = new Set<() => void>();
  private readonly times:Partial<Record<CourseId,number>>={};
  private readonly earned:Partial<Record<CourseId,SingleGoal[]>>={};
  constructor(private readonly storage?:Pick<Storage,'getItem'|'setItem'>){
    try{
      const data=JSON.parse(storage?.getItem(SINGLE_RECORDS_KEY)??'null');
      if(![1,2].includes(data?.version)||!data.times||typeof data.times!=='object')return;
      for(const id of Object.keys(COURSES) as CourseId[]){
        if(courseMode(id)==='survival')continue;
        const ms=data.times[id];if(!Number.isSafeInteger(ms)||ms<=0||ms>SINGLE_RECORD_MAX_MS)continue;
        this.times[id]=ms;
        const saved=data.version===2&&Array.isArray(data.goals?.[id])?data.goals[id]:[];
        this.earned[id]=SINGLE_GOALS.filter(goal=>goal==='finish'||goal==='time'&&ms<=COURSES[id].goalSeconds*1000||goal==='noFalls'&&saved.includes(goal));
      }
    }catch{/* Keep personal records usable for this session when storage is unavailable. */}
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  snapshot(): SingleRecordData {
    return { version: 2, times: { ...this.times }, goals: Object.fromEntries(Object.entries(this.earned).map(([map, goals]) => [map, [...goals]])) };
  }
  merge(data: unknown): boolean {
    const source = new SingleRecords({ getItem: () => JSON.stringify(data), setItem() {} });
    let changed = false;
    for (const map of Object.keys(COURSES) as CourseId[]) {
      const best = source.best(map); if (best === null) continue;
      if (best < (this.times[map] ?? Infinity)) { this.times[map] = best; changed = true; }
      const goals = SINGLE_GOALS.filter(goal => this.goals(map).includes(goal) || source.goals(map).includes(goal));
      if (goals.length !== this.goals(map).length) { this.earned[map] = goals; changed = true; }
    }
    if (changed) this.persist();
    return changed;
  }
  private persist(): void {
    try { this.storage?.setItem(SINGLE_RECORDS_KEY, JSON.stringify(this.snapshot())); } catch { /* Keep this session's progress. */ }
    this.listeners.forEach(listener => listener());
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
    if(!Object.hasOwn(COURSES,map)||courseMode(map)==='survival'||!Number.isFinite(seconds)||!Number.isSafeInteger(ms)||ms<=0||ms>SINGLE_RECORD_MAX_MS)return{newBest:false,goals:this.goals(map),newGoals:[]};
    const previous=this.goals(map),newBest=ms<(this.times[map]??Infinity);
    const achieved=SINGLE_GOALS.filter(goal=>goal==='finish'||goal==='noFalls'&&falls===0||goal==='time'&&ms<=COURSES[map].goalSeconds*1000);
    const newGoals=achieved.filter(goal=>!previous.includes(goal));
    if(newBest)this.times[map]=ms;
    this.earned[map]=SINGLE_GOALS.filter(goal=>previous.includes(goal)||achieved.includes(goal));
    if(newBest||newGoals.length)this.persist();
    return{newBest,goals:this.goals(map),newGoals};
  }
}
