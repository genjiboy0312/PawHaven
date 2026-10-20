import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnimalAction } from '../animals/AnimalConfig';
import type { CharacterPreset } from '../animals/CharacterPresets';
import type { CourseId } from '../game/CourseCatalog';
export interface Pose { x: number; height: number; direction: number; action: AnimalAction; progress: number; vx: number }
export interface RoomMember { id: string; name: string; look: CharacterPreset; ready: boolean; returned: boolean; pose: Pose }
export interface RoomSummary { id: string; name: string; map: CourseId; phase: 'waiting'|'countdown'|'playing'|'results'; count: number }
export interface Room extends Omit<RoomSummary,'count'> { host: string; round: string|null; startsAt: number|null; endsAt: number|null; members: RoomMember[]; racers: { id:string;name:string;time:number|null;left:boolean }[] }
export interface RoomSnapshot { room:Room|null; rooms:RoomSummary[]; now:number }
export const RACE_SYNC_MS=100;
type Transport = (action:string,room:string|null,payload:Record<string,unknown>,signal:AbortSignal)=>Promise<unknown>;
export function roomTransport(client: SupabaseClient, owner:string,saveLook?:()=>Promise<void>):Transport {
  return async(action,room,payload,signal)=>{
    // Cosmetic sync is best effort; room admission must not depend on cloud-save health.
    if(['create','join'].includes(action)&&saveLook){try{void saveLook().catch(()=>{});}catch{/* Use the last server-confirmed appearance. */}}
    const {data,error}=await client.auth.getSession();
    if(error) throw error;
    if(signal.aborted || data.session?.user.id!==owner) throw {code:'42501'};
    const result=await client.rpc('multiplayer_command',{p_action:action,p_room:room,p_payload:payload})
      .setHeader('Authorization','Bearer '+data.session.access_token).abortSignal(signal);
    if(result.error) throw result.error; return result.data;
  };
}
export class RoomClient {
  snapshot:RoomSnapshot={room:null,rooms:[],now:0}; busy=false; error:''|'setup'|'offline'|'rejected'='';
  rejection:''|'already_in_room'|'room_closed'|'room_unavailable'|'auth'='';
  pose?:()=>Pose;
  private finishPose?:Pose;
  private needsSync=false;
  notice:''|'restored'|'removed'|'round'='';
  recoverySerial=0;
  roundTripMS=0;
  private requestStarted=0;
  private revision=0;private listening=false;
  private receivedAt=0; private timer?:ReturnType<typeof setTimeout>; private work?:Promise<boolean>; private closed=false;
  private readonly abort=new AbortController(); private readonly listeners=new Set<()=>void>();
  constructor(readonly owner:string,private readonly transport:Transport){}
  get room(){return this.snapshot.room;}
  get reconnecting(){return this.needsSync;}
  get serverTime(){return this.snapshot.now+(this.receivedAt ? performance.now()-this.receivedAt : 0);}
  subscribe(fn:()=>void){this.listeners.add(fn);return()=>{this.listeners.delete(fn);};}
  private emit(){if(!this.closed)this.listeners.forEach(fn=>fn());}
  start(){
    if(!this.listening&&typeof window!=='undefined'&&typeof document!=='undefined'){
      this.listening=true;const options={signal:this.abort.signal};
      window.addEventListener('online',()=>this.reconnect(),options);
      window.addEventListener('offline',()=>this.reconnect(),options);
      window.addEventListener('focus',()=>this.reconnect(),options);
      document.addEventListener('visibilitychange',()=>this.reconnect(),options);
    }
    void this.poll();
  }
  reconnect(){if(this.closed)return;this.needsSync=true;this.revision++;clearTimeout(this.timer);this.emit();void this.poll();}
  clearNotice(){this.notice='';this.emit();}
  private async poll(){
    if(this.closed||this.busy||this.work)return;
    if(typeof document!=='undefined'&&document.hidden)return;
    if(typeof navigator!=='undefined'&&navigator.onLine===false){this.needsSync=true;this.error='offline';this.emit();this.schedule();return;}
    const room=this.room;
    if(this.needsSync){await this.send(room?'sync':'list');return;}
    if(this.finishPose&&room?.phase==='playing'&&!room.racers.find(r=>r.id===this.owner)?.time){await this.submitFinish();return;}
    const moving=room&&this.pose&&room.phase==='playing'&&!this.needsSync;
    await this.send(moving?'pose':room?'sync':'list',moving?{...this.pose!(),round:room.round}:{});
  }
  async command(action:string,payload:Record<string,unknown>={},roomId?:string):Promise<boolean>{
    if(this.closed||this.busy||(this.needsSync&&!['sync','list'].includes(action)))return false;
    this.busy=true;this.emit();
    try {if(this.work)await this.work;if(this.needsSync&&!['sync','list'].includes(action))return false;return await this.send(action,payload,roomId);}
    finally{this.busy=false;this.emit();this.schedule();}
  }
  private async send(action:string,payload:Record<string,unknown>={},roomId?:string):Promise<boolean>{
    clearTimeout(this.timer);if(this.closed)return false;
    const revision=this.revision;
    const started=performance.now();this.requestStarted=started;
    const task=(async()=>{
      try{
        const signal=AbortSignal.any([this.abort.signal,AbortSignal.timeout(12000)]);
        const data=await this.transport(action,roomId??this.room?.id??null,payload,signal) as RoomSnapshot;
        if(this.closed||revision!==this.revision)return false;
        if(!data||!Number.isFinite(data.now)||!Array.isArray(data.rooms)||data.rooms.length>80||
          (data.room && (!Array.isArray(data.room.members)||data.room.members.length>4||!['garden','practice'].includes(data.room.map))))throw Error('invalid_room');
        const previous=this.room;
        if(previous&&!data.room&&action!=='leave')this.notice='removed';
        else if(this.needsSync&&previous&&data.room&&previous.round&&previous.round!==data.room.round)this.notice='round';
        else if(this.needsSync&&data.room&&data.room.id===previous?.id)this.notice='restored';
        if(['create','join','leave'].includes(action))this.notice='';
        if(this.needsSync)this.recoverySerial++;
        if(data.room?.round!==previous?.round||data.room?.phase!=='playing'||data.room.racers.find(r=>r.id===this.owner)?.time!==null)this.finishPose=undefined;
        this.receivedAt=performance.now();this.roundTripMS=this.receivedAt-started;
        this.snapshot=data;this.error='';this.rejection='';this.needsSync=false;this.emit();return true;
      }catch(error){
        if(this.closed||revision!==this.revision)return false;
        const code=(error as {code?:string})?.code;
        const message=(error as {message?:string})?.message;
        this.rejection=code==='42501'?'auth':['already_in_room','room_closed','room_unavailable'].includes(message??'')?message as 'already_in_room'|'room_closed'|'room_unavailable':'';
        this.needsSync=true;
        this.error=['PGRST202','PGRST205','42883'].includes(code??'')?'setup': ['P0001','42501','23514'].includes(code??'')?'rejected':'offline';
        this.emit();return false;
      }
    })();
    this.work=task;
    try{return await task;}finally{if(this.work===task)this.work=undefined;this.schedule();}
  }
  private schedule(){
    clearTimeout(this.timer);if(this.closed||this.busy||(typeof document!=='undefined'&&document.hidden))return;
    const racing=this.pose&&['countdown','playing'].includes(this.room?.phase??'');
    const delay=racing?Math.max(16,RACE_SYNC_MS-(performance.now()-this.requestStarted)):1200;
    this.timer=setTimeout(()=>{void this.poll();},this.error?2500:this.needsSync?0:delay);
  }
  async finish(pose:Pose){
    this.finishPose=pose;return this.submitFinish();
  }
  private async submitFinish(){
    if(!this.room||this.needsSync)return false;
    const round=this.room.round;
    if(!await this.command('pose',{...this.finishPose,round}))return false;
    if(this.room?.round!==round||this.room.phase!=='playing'||this.room.racers.find(r=>r.id===this.owner)?.time!==null)return true;
    return this.command('finish',{round});
  }
  destroy(leave=true){
    if(this.closed)return;
    const room=this.room;this.closed=true;clearTimeout(this.timer);this.abort.abort();this.listeners.clear();this.pose=undefined;
    if(leave&&room)void this.transport('leave',room.id,{},AbortSignal.timeout(5000)).catch(()=>{});
  }
}
