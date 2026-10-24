import type { SupabaseClient,RealtimeChannel } from '@supabase/supabase-js';
import { parkPose,type ParkPose,type ParkSnapshot } from './ParkModel';
/** Server membership/chat plus owner-authorized actor streams; one disposable client per visit. */
export class ParkClient {
 readonly session=crypto.randomUUID();
 snapshot:ParkSnapshot={counts:[0,0,0,0]}; channel=0; connected=false; error='';busy=false;
 readonly poses=new Map<string,ParkPose>();
 private readonly listeners=new Set<()=>void>();private readonly streams=new Map<string,RealtimeChannel>();
 private timer?:ReturnType<typeof setInterval>;private closed=false;private pending=false;private generation=0;private seq=0;
 private ready=new Set<string>();
 constructor(private readonly client:SupabaseClient,readonly owner:string){}
 subscribe(fn:()=>void){this.listeners.add(fn);return()=>{this.listeners.delete(fn);};}
 private emit(){this.listeners.forEach(fn=>fn());}
 private async request(action:string,channel=this.channel||1,text=''){
  const {data,error}=await this.client.rpc('park_command',{p_action:action,p_channel:channel,p_session:this.session,p_text:text});
  if(error)throw error;return data as ParkSnapshot;
 }
 async list(){try{const next=await this.request('list');if(this.closed)return;this.snapshot={...this.snapshot,counts:next.counts};this.error='';}catch{if(!this.closed)this.error='parkUnavailable';}if(!this.closed)this.emit();}
 async join(channel:number){
  if(this.busy||this.closed)return false;this.busy=true;this.emit();
  try{
   const next=await this.request('join',channel);
   if(this.closed){void this.request('leave',channel).catch(()=>{});return false;}
   this.clearStreams();this.channel=channel;this.snapshot=next;this.error='';this.poses.clear();await this.client.realtime.setAuth();
   if(this.closed)return false;this.syncStreams();clearInterval(this.timer);this.timer=setInterval(()=>void this.refresh(),2000);return true;
  }catch(error){this.error=String((error as {message?:string}).message).includes('park_full')?'parkFull':'parkUnavailable';return false;}
  finally{this.busy=false;this.emit();}
 }
 private async refresh(){
  if(this.pending||!this.channel||this.closed||this.busy)return;this.pending=true;const gen=this.generation;
  try{const next=await this.request('sync');if(this.closed||gen!==this.generation)return;this.snapshot=next;this.error='';this.syncStreams();}
  catch(error){if(!this.closed&&gen===this.generation){this.error=String((error as {message?:string}).message).includes('park_session_lost')?'parkSessionLost':'parkOffline';this.connected=false;}}
  finally{this.pending=false;if(!this.closed)this.emit();}
 }
 private syncStreams(){
  const members=this.snapshot.members??[],topics=new Set(members.map(m=>`paw-park:${this.channel}:${m.id}:${m.session}`));
  for(const [topic,stream]of this.streams)if(!topics.has(topic)){this.streams.delete(topic);this.ready.delete(topic);void this.client.removeChannel(stream).catch(()=>{});}
  const ids=new Set(members.map(m=>m.id));for(const id of this.poses.keys())if(!ids.has(id))this.poses.delete(id);
  for(const member of members){
   const topic=`paw-park:${this.channel}:${member.id}:${member.session}`;if(this.streams.has(topic))continue;
   this.poses.delete(member.id);const gen=this.generation;
   const stream=this.client.channel(topic,{config:{private:true,broadcast:{self:false,ack:false}}})
    .on('broadcast',{event:'pose'},event=>{
     if(this.closed||gen!==this.generation||!this.streams.has(topic)||member.id===this.owner)return;
     const pose=parkPose(event.payload),last=this.poses.get(member.id);
     if(pose&&(!last||pose.seq>last.seq))this.poses.set(member.id,pose);
    }).on('broadcast',{event:'chat'},()=>{if(!this.closed&&gen===this.generation&&this.streams.has(topic))void this.refresh();})
    .subscribe(status=>{if(this.closed||gen!==this.generation||!this.streams.has(topic))return;if(status==='SUBSCRIBED')this.ready.add(topic);else this.ready.delete(topic);this.connected=this.ready.size===this.streams.size&&this.ready.size>0;this.emit();});
   this.streams.set(topic,stream);
  }
  this.connected=this.ready.size===this.streams.size&&this.ready.size>0;
 }
 private ownTopic(){return `paw-park:${this.channel}:${this.owner}:${this.session}`;}
 send(pose:Omit<ParkPose,'seq'>){const topic=this.ownTopic();if(this.closed||this.error||!this.ready.has(topic))return;void this.streams.get(topic)?.send({type:'broadcast',event:'pose',payload:{...pose,seq:++this.seq}}).catch(()=>{});}
 async chat(text:string){
  if(this.closed||!this.channel||this.busy||!text.trim())return false;
  try{const gen=this.generation,next=await this.request('chat',this.channel,text);if(this.closed||gen!==this.generation)return false;this.snapshot=next;this.error='';this.emit();void this.streams.get(this.ownTopic())?.send({type:'broadcast',event:'chat',payload:{}}).catch(()=>{});return true;}
  catch{this.error='parkChatWait';this.emit();return false;}
 }
 private clearStreams(){this.generation++;for(const stream of this.streams.values())void this.client.removeChannel(stream).catch(()=>{});this.streams.clear();this.ready.clear();this.connected=false;}
 destroy(){if(this.closed)return;this.closed=true;clearInterval(this.timer);this.clearStreams();this.listeners.clear();if(this.channel)void this.request('leave').catch(()=>{});}
}
