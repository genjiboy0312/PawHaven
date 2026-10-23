import type { SupabaseClient } from '@supabase/supabase-js';
export type ActivityState='offline'|'lobby'|'room'|'playing';
export interface FriendInvite {sender:string;nickname:string;room:string;name:string;ticket:string;expires:number}
export interface ActivitySnapshot {people:{id:string;state:ActivityState}[];invitations:FriendInvite[];cooldowns:{id:string;until:number}[];joined:string|null;now:number}
type Mode='lobby'|'playing';
type Transport=(action:string,target:string|null,mode:Mode,ticket:string|null,signal:AbortSignal)=>Promise<unknown>;
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const empty=():ActivitySnapshot=>({people:[],invitations:[],cooldowns:[],joined:null,now:0});
export function activityTransport(client:SupabaseClient,owner:string):Transport{
  return async(action,target,mode,ticket,signal)=>{
    const {data,error}=await client.auth.getSession();if(error)throw error;
    if(signal.aborted||data.session?.user.id!==owner)throw {code:'42501'};
    const result=await client.rpc('friend_activity',{p_action:action,p_target:target,p_mode:mode,p_ticket:ticket})
      .setHeader('Authorization','Bearer '+data.session.access_token).abortSignal(signal);
    if(result.error)throw result.error;return result.data;
  };
}
function parse(value:unknown):ActivitySnapshot{
  const v=value as ActivitySnapshot;
  if(!v||!Number.isFinite(v.now)||!Array.isArray(v.people)||v.people.length>100||!Array.isArray(v.invitations)||v.invitations.length>100||!Array.isArray(v.cooldowns)||v.cooldowns.length>100||v.joined!==null&&!uuid(v.joined))throw Error('invalid_activity');
  if(v.people.some(p=>!p||!uuid(p.id)||!['offline','lobby','room','playing'].includes(p.state))||
    v.invitations.some(i=>!i||!uuid(i.sender)||!uuid(i.room)||!uuid(i.ticket)||typeof i.nickname!=='string'||!/^[A-Za-z0-9가-힣_]{2,16}$/.test(i.nickname)||typeof i.name!=='string'||i.name.length>24||!Number.isFinite(i.expires))||
    v.cooldowns.some(c=>!c||!uuid(c.id)||!Number.isFinite(c.until)))throw Error('invalid_activity');
  return {people:v.people.map(p=>({...p})),invitations:v.invitations.map(i=>({...i})),cooldowns:v.cooldowns.map(c=>({...c})),joined:v.joined,now:v.now};
}
/** Account-scoped heartbeat and invite inbox; no public presence channel or local persistence. */
export class FriendActivity {
  snapshot=empty();busy=false;loaded=false;
  error:''|'setup'|'offline'|'auth'|'expired'|'busy'|'cooldown'|'unavailable'='';
  private readonly listeners=new Set<()=>void>();private events?:AbortController;private request?:AbortController;
  private timer?:ReturnType<typeof setTimeout>;private generation=0;private started=false;private disposed=false;
  private received=0;private snapshotMode?:Mode;
  constructor(readonly owner:string,private readonly transport:Transport,readonly mode:()=>Mode){}
  subscribe(fn:()=>void){this.listeners.add(fn);return()=>{this.listeners.delete(fn);};}
  private emit(){if(!this.disposed)this.listeners.forEach(fn=>fn());}
  get now(){return this.snapshot.now+Math.max(0,performance.now()-this.received);}
  state(id:string):ActivityState|'unknown'{return this.loaded&&!this.error&&performance.now()-this.received<15000?this.snapshot.people.find(p=>p.id===id)?.state??'unknown':'unknown';}
  cooling(id:string){return this.snapshot.cooldowns.some(c=>c.id===id&&c.until>this.now);}
  get invitations(){return this.error||this.snapshotMode!==this.mode()||this.mode()!=='lobby'?[]:this.snapshot.invitations.filter(i=>i.expires>this.now);}
  private readonly wake=()=>{if(typeof document==='undefined'||!document.hidden)void this.refresh();};
  start(){
    if(this.started||this.disposed)return;this.started=true;this.events=new AbortController();
    if(typeof window!=='undefined')for(const event of ['focus','online'])window.addEventListener(event,this.wake,{signal:this.events.signal});
    if(typeof document!=='undefined')document.addEventListener('visibilitychange',this.wake,{signal:this.events.signal});
    this.wake();
  }
  private schedule(){clearTimeout(this.timer);if(this.started&&!this.disposed)this.timer=setTimeout(()=>{if(typeof document!=='undefined'&&document.hidden)this.schedule();else this.wake();},this.error==='setup'?30000:this.error?10000:5000);}
  refresh(){return this.perform('poll');}
  command(action:'invite'|'accept'|'decline',target:string,ticket:string|null=null){
    if(!uuid(target)||target===this.owner||(action!=='invite'&&!uuid(ticket)))return Promise.resolve(false);
    return this.perform(action,target,ticket);
  }
  private async perform(action:string,target:string|null=null,ticket:string|null=null):Promise<boolean>{
    if(this.busy||this.disposed)return false;
    const generation=++this.generation,request=new AbortController(),mode=this.mode();this.request=request;
    const timeout=setTimeout(()=>request.abort(),12000);this.busy=true;this.error='';this.emit();
    try{
      const value=await this.transport(action,target,mode,ticket,request.signal);
      if(this.disposed||generation!==this.generation)return false;
      if(request.signal.aborted)throw Error('timeout');
      this.snapshot=parse(value);this.received=performance.now();this.snapshotMode=mode;this.loaded=true;return true;
    }catch(error){
      if(this.disposed||generation!==this.generation)return false;
      const {code,message=''}=error as {code?:string;message?:string};
      this.error=['42883','PGRST202','PGRST205'].includes(code??'')?'setup':code==='42501'?'auth':message.includes('invite_cooldown')?'cooldown'
        :message.includes('invite_player_busy')?'busy':message.includes('invite_expired')?'expired':['invite_room_unavailable','invite_not_friend','room_closed','room_unavailable','already_in_room'].some(s=>message.includes(s))?'unavailable':'offline';
      if(this.error==='auth'){this.snapshot=empty();this.loaded=false;}return false;
    }finally{
      clearTimeout(timeout);if(generation===this.generation){this.busy=false;this.request=undefined;this.emit();this.schedule();}
    }
  }
  destroy(){this.disposed=true;this.started=false;this.generation++;this.request?.abort();this.events?.abort();clearTimeout(this.timer);this.snapshot=empty();this.busy=false;this.listeners.clear();}
}
