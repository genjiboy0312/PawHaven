import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnimalAction } from '../animals/AnimalConfig';
import type { CharacterPreset } from '../animals/CharacterPresets';
import type { CourseId } from '../game/CourseCatalog';
import { COURSES } from '../game/CourseCatalog';
import type { RoomStream, StreamPose, LobbyStream } from './RoomStream';
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
  streamConnected=false;
  directConnected=false;
  private streamKey='';private closeStream?:ReturnType<RoomStream>;private startPosePending=false;
  private streamOffset?:number;
  private readonly streamed=new Map<string,StreamPose&{receivedAt:number}>();
  private readonly directOffsets=new Map<string,number>();
  private revision=0;private listening=false;
  private receivedAt=0; private timer?:ReturnType<typeof setTimeout>; private work?:Promise<boolean>; private closed=false;
  private requestAbort?:AbortController;
  private backgrounded=false;
  private clockSamples:{offset:number;rtt:number}[]=[];
  private clockOffset?:number;
  private lobbyKey='';private closeLobby?:()=>void;private lobbyConnected=false;private roomRefresh=false;
  private readonly abort=new AbortController(); private readonly listeners=new Set<()=>void>();
  constructor(readonly owner:string,private readonly transport:Transport,private readonly stream?:RoomStream,private readonly lobby?:LobbyStream){}
  get room(){return this.snapshot.room;}
  get reconnecting(){return this.needsSync;}
  get serverTime(){return this.clockOffset===undefined?this.snapshot.now:performance.now()+this.clockOffset;}
  subscribe(fn:()=>void){this.listeners.add(fn);return()=>{this.listeners.delete(fn);};}
  private emit(){if(!this.closed)this.listeners.forEach(fn=>fn());}
  start(){
    if(!this.listening&&typeof window!=='undefined'&&typeof document!=='undefined'){
      this.listening=true;const options={signal:this.abort.signal};
      this.backgrounded=document.hidden;
      window.addEventListener('online',()=>this.reconnect(),options);
      window.addEventListener('offline',()=>this.reconnect(),options);
      window.addEventListener('focus',()=>this.reconnect(),options);
      window.addEventListener('pagehide',()=>{this.backgrounded=true;this.reconnect();},options);
      window.addEventListener('pageshow',()=>{this.backgrounded=document.hidden;this.reconnect();},options);
      document.addEventListener('visibilitychange',()=>{this.backgrounded=document.hidden;this.reconnect();},options);
    }
    void this.poll();
  }
  reconnect(){
    if(this.closed)return;
    this.stopStream();this.stopLobby();this.needsSync=true;this.revision++;
    this.requestAbort?.abort();this.clockSamples=[];this.clockOffset=undefined;
    clearTimeout(this.timer);this.emit();void this.poll();
  }
  private stopLobby(){this.lobbyKey='';this.closeLobby?.();this.closeLobby=undefined;this.lobbyConnected=false;this.roomRefresh=false;}
  private syncLobby(){
    const room=this.room;if((room?.id??'')===this.lobbyKey)return;this.stopLobby();if(!room||!this.lobby)return;
    const key=room.id;this.lobbyKey=key;
    this.closeLobby=this.lobby(room,()=>{if(!this.closed&&this.lobbyKey===key){this.roomRefresh=true;this.schedule();}},connected=>{if(!this.closed&&this.lobbyKey===key)this.lobbyConnected=connected;});
  }
  peerPose(member:RoomMember):{pose:Pose;at:number;delay?:number}{
    const direct=this.streamed.get('direct:'+member.id);
    if(direct&&performance.now()-direct.receivedAt<500)return{pose:direct.pose,at:direct.at+this.directOffsets.get(member.id)!,delay:20};
    const sample=this.streamed.get(member.id);
    return this.streamConnected&&sample&&performance.now()-sample.receivedAt<1000?{pose:sample.pose,at:sample.at+this.streamOffset!}:{pose:member.pose,at:this.receivedAt};
  }
  private stopStream(){this.streamKey='';this.closeStream?.();this.closeStream=undefined;this.startPosePending=false;this.streamConnected=this.directConnected=false;this.streamed.clear();this.directOffsets.clear();this.streamOffset=undefined;}
  private syncStream(){
    const room=this.room,key=room?.round&&['countdown','playing'].includes(room.phase)?room.id+':'+room.round:'';
    if(key===this.streamKey)return;this.stopStream();if(!key||!room||!this.stream)return;
    this.streamKey=key;
    this.closeStream=this.stream(room,value=>{
      if(this.closed||this.needsSync||this.streamKey!==key)return;
      const sample=value as StreamPose,pose=sample?.pose;
      if(!sample||!Number.isFinite(sample.at)||sample.id===this.owner||!this.room?.members.some(member=>member.id===sample.id)||!pose)return;
      if(![pose.x,pose.height,pose.vx,pose.progress].every(Number.isFinite)||pose.x<120||pose.x>COURSES[room.map].finish||pose.height< -200||pose.height>300||Math.abs(pose.vx)>1800||pose.progress<0||pose.progress>1||![1,-1].includes(pose.direction)||!['idle','run','jump','fall','land','attack','skill'].includes(pose.action))return;
      const direct=sample.source==='direct',id=direct?'direct:'+sample.id:sample.id,previous=this.streamed.get(id);
      if(direct&&(typeof sample.session!=='string'||sample.session.length>64))return;
      const sameSession=!direct||sample.session===previous?.session;
      if(sameSession&&sample.at<=(previous?.at??-Infinity))return;
      const receivedAt=performance.now();
      if(direct)this.directOffsets.set(sample.id,Math.min(sameSession?(this.directOffsets.get(sample.id)??Infinity):Infinity,receivedAt-sample.at));
      else this.streamOffset=Math.min(this.streamOffset??Infinity,receivedAt-sample.at);
      this.streamed.set(id,{...sample,pose:{...pose},receivedAt});
    },connected=>{if(!this.closed&&this.streamKey===key){this.streamConnected=connected;}},
    ()=>!this.closed&&!this.needsSync&&!this.error&&['countdown','playing'].includes(this.room?.phase??'')?this.pose?.():undefined,
    connected=>{if(!this.closed&&this.streamKey===key&&this.directConnected!==connected){this.directConnected=connected;this.schedule();}});
  }
  clearNotice(){this.notice='';this.emit();}
  publishStartPose(){
    if(this.closed||this.needsSync||this.error||!this.room?.startsAt||this.serverTime<this.room.startsAt||!['countdown','playing'].includes(this.room.phase))return;
    this.closeStream?.flush?.();this.startPosePending=true;this.schedule();
  }
  private async poll(){
    if(this.closed||this.busy||this.work)return;
    if(this.backgrounded||typeof document!=='undefined'&&document.hidden)return;
    if(typeof navigator!=='undefined'&&navigator.onLine===false){this.needsSync=true;this.error='offline';this.emit();this.schedule();return;}
    const room=this.room;
    if(this.needsSync){await this.send(room?'sync':'list');return;}
    if(this.roomRefresh){this.roomRefresh=false;await this.send(room?'sync':'list');return;}
    if(this.finishPose&&room?.phase==='playing'&&!room.racers.find(r=>r.id===this.owner)?.time){await this.submitFinish();return;}
    const moving=room&&this.pose&&(room.phase==='playing'||room.phase==='countdown'&&room.startsAt!==null&&this.serverTime>=room.startsAt)&&!this.needsSync;
    this.startPosePending=false;
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
    const requestAbort=new AbortController();this.requestAbort=requestAbort;
    const started=performance.now();this.requestStarted=started;
    const task=(async()=>{
      try{
        const signal=AbortSignal.any([this.abort.signal,requestAbort.signal,AbortSignal.timeout(12000)]);
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
        this.clockSamples.push({rtt:this.roundTripMS,offset:data.now+this.roundTripMS/2-this.receivedAt});this.clockSamples=this.clockSamples.slice(-8);
        this.clockOffset=this.clockSamples.reduce((best,sample)=>sample.rtt<best.rtt?sample:best).offset;
        this.snapshot=data;this.error='';this.rejection='';this.needsSync=false;this.syncLobby();this.syncStream();this.emit();return true;
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
    try{return await task;}finally{if(this.work===task)this.work=undefined;if(this.requestAbort===requestAbort)this.requestAbort=undefined;this.schedule();}
  }
  private schedule(){
    clearTimeout(this.timer);if(this.closed||this.busy||this.backgrounded||(typeof document!=='undefined'&&document.hidden))return;
    const racing=this.pose&&['countdown','playing'].includes(this.room?.phase??'');
    const delay=racing?Math.max(16,(this.directConnected?800:RACE_SYNC_MS)-(performance.now()-this.requestStarted)):this.room?(this.lobbyConnected?600:300):1200;
    this.timer=setTimeout(()=>{void this.poll();},this.error?2500:this.needsSync||this.startPosePending?0:this.roomRefresh?30:delay);
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
    const room=this.room;this.closed=true;this.stopStream();this.stopLobby();clearTimeout(this.timer);this.abort.abort();this.listeners.clear();this.pose=undefined;
    if(leave&&room)void this.transport('leave',room.id,{},AbortSignal.timeout(5000)).catch(()=>{});
  }
}
