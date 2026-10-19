import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnimalAction } from '../animals/AnimalConfig';
import type { CharacterPreset } from '../animals/CharacterPresets';
import type { CourseId } from '../game/CourseCatalog';
export interface Pose { x: number; height: number; direction: number; action: AnimalAction; progress: number; vx: number }
export interface RoomMember { id: string; name: string; look: CharacterPreset; ready: boolean; returned: boolean; pose: Pose }
export interface RoomSummary { id: string; name: string; map: CourseId; phase: 'waiting'|'countdown'|'playing'|'results'; count: number }
export interface Room extends Omit<RoomSummary,'count'> { host: string; round: string|null; startsAt: number|null; endsAt: number|null; members: RoomMember[]; racers: { id:string;name:string;time:number|null;left:boolean }[] }
export interface RoomSnapshot { room:Room|null; rooms:RoomSummary[]; now:number }
type Transport = (action:string,room:string|null,payload:Record<string,unknown>,signal:AbortSignal)=>Promise<unknown>;
export function roomTransport(client: SupabaseClient, owner:string):Transport {
  return async(action,room,payload,signal)=>{
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
  pose?:()=>Pose;
  private finishPose?:Pose;
  private needsSync=false;
  private receivedAt=0; private timer?:ReturnType<typeof setTimeout>; private work?:Promise<boolean>; private closed=false;
  private readonly abort=new AbortController(); private readonly listeners=new Set<()=>void>();
  constructor(readonly owner:string,private readonly transport:Transport){}
  get room(){return this.snapshot.room;}
  get serverTime(){return this.snapshot.now+(this.receivedAt ? performance.now()-this.receivedAt : 0);}
  subscribe(fn:()=>void){this.listeners.add(fn);return()=>{this.listeners.delete(fn);};}
  private emit(){if(!this.closed)this.listeners.forEach(fn=>fn());}
  start(){void this.poll();}
  private async poll(){
    if(this.closed||this.busy||this.work)return;
    const room=this.room;
    if(this.finishPose&&room?.phase==='playing'&&!room.racers.find(r=>r.id===this.owner)?.time){await this.submitFinish();return;}
    const moving=room&&this.pose&&room.phase==='playing'&&!this.needsSync;
    await this.send(moving?'pose':room?'sync':'list',moving?{...this.pose!(),round:room.round}:{});
  }
  async command(action:string,payload:Record<string,unknown>={},roomId?:string):Promise<boolean>{
    if(this.closed||this.busy)return false;
    this.busy=true;this.emit();
    try {if(this.work)await this.work;return await this.send(action,payload,roomId);}
    finally{this.busy=false;this.emit();this.schedule();}
  }
  private async send(action:string,payload:Record<string,unknown>={},roomId?:string):Promise<boolean>{
    clearTimeout(this.timer);if(this.closed)return false;
    const task=(async()=>{
      try{
        const data=await this.transport(action,roomId??this.room?.id??null,payload,this.abort.signal) as RoomSnapshot;
        if(this.closed)return false;
        if(!data||!Number.isFinite(data.now)||!Array.isArray(data.rooms)||data.rooms.length>80||
          (data.room && (!Array.isArray(data.room.members)||data.room.members.length>4||!['garden','practice'].includes(data.room.map))))throw Error('invalid_room');
        if(data.room?.round!==this.room?.round)this.finishPose=undefined;
        this.snapshot=data;this.receivedAt=performance.now();this.error='';this.needsSync=false;this.emit();return true;
      }catch(error){
        if(this.closed)return false;
        const code=(error as {code?:string})?.code;
        this.needsSync=true;
        if(code==='42501')this.snapshot={...this.snapshot,room:null};
        this.error=['PGRST202','PGRST205','42883'].includes(code??'')?'setup': ['P0001','42501','23514'].includes(code??'')?'rejected':'offline';
        this.emit();return false;
      }
    })();
    this.work=task;
    try{return await task;}finally{if(this.work===task)this.work=undefined;this.schedule();}
  }
  private schedule(){
    clearTimeout(this.timer);if(this.closed||this.busy)return;
    this.timer=setTimeout(()=>{void this.poll();},this.error?2500:this.pose&&['countdown','playing'].includes(this.room?.phase??'')?300:1200);
  }
  async finish(pose:Pose){
    this.finishPose=pose;return this.submitFinish();
  }
  private async submitFinish(){
    if(!this.room)return;
    const round=this.room.round;
    if(!await this.command('pose',{...this.finishPose,round}))return false;
    return this.command('finish',{round});
  }
  destroy(leave=true){
    if(this.closed)return;
    const room=this.room;this.closed=true;clearTimeout(this.timer);this.abort.abort();this.listeners.clear();this.pose=undefined;
    if(leave&&room)void this.transport('leave',room.id,{},AbortSignal.timeout(5000)).catch(()=>{});
  }
}
