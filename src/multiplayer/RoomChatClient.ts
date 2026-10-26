import type {SupabaseClient} from '@supabase/supabase-js';
export interface RoomMessage {id:string;sender:string;name:string;text:string;at:string}
type Transport=(action:'list'|'send',text:string,nonce:string|null,signal:AbortSignal)=>Promise<unknown>;
type Live=(changed:()=>void)=>()=>void;
export function roomChatConnection(client:SupabaseClient,owner:string,room:string){
 const transport:Transport=async(action,text,nonce,signal)=>{
  const {data,error}=await client.auth.getSession();if(error)throw error;
  if(signal.aborted||data.session?.user.id!==owner)throw Error('account_changed');
  const result=await client.rpc('room_chat_command',{p_room:room,p_action:action,p_text:text,p_nonce:nonce}).setHeader('Authorization','Bearer '+data.session.access_token).abortSignal(signal);
  if(result.error)throw result.error;return result.data;
 };
 const live:Live=changed=>{
  let closed=false,channel:ReturnType<SupabaseClient['channel']>|undefined;
  void(async()=>{try{const {data}=await client.auth.getSession();if(closed||data.session?.user.id!==owner)return;await client.realtime.setAuth();if(closed)return;
   channel=client.channel('paw-chat:'+room,{config:{private:true}}).on('broadcast',{event:'message'},()=>{if(!closed)changed();}).subscribe(status=>{if(!closed&&status==='SUBSCRIBED')changed();});
  }catch{/* Polling remains available. */}})();
  return()=>{closed=true;if(channel)void client.removeChannel(channel).catch(()=>{});};
 };
 return new RoomChatClient(transport,live);
}
export class RoomChatClient {
 messages:RoomMessage[]=[];sending=false;loaded=false;error:''|'roomChatSetup'|'roomChatOffline'|'roomChatSlow'='';
 private readonly listeners=new Set<()=>void>();private readonly abort=new AbortController();private timer?:ReturnType<typeof setInterval>;private closeLive?:()=>void;private closed=false;
 private loading=false;private refreshAgain=false;private version=0;private pending?:{text:string;nonce:string};
 constructor(private readonly transport:Transport,private readonly live?:Live){}
 subscribe(fn:()=>void){this.listeners.add(fn);return()=>{this.listeners.delete(fn);};}
 private emit(){if(!this.closed)this.listeners.forEach(fn=>fn());}
 start(){if(this.closed||this.timer)return;this.closeLive=this.live?.(()=>void this.refresh());void this.refresh();this.timer=setInterval(()=>void this.refresh(),5000);}
 private accept(value:unknown){
  if(!Array.isArray(value)||value.length>30)throw Error('invalid_chat');
  const ids=new Set<string>();
  for(const m of value as RoomMessage[]){if(!m||typeof m.id!=='string'||ids.has(m.id)||typeof m.sender!=='string'||typeof m.name!=='string'||!m.name||m.name.length>100||typeof m.text!=='string'||!m.text||Array.from(m.text).length>100||typeof m.at!=='string'||!Number.isFinite(Date.parse(m.at)))throw Error('invalid_chat');ids.add(m.id);}
  this.messages=structuredClone(value);this.loaded=true;
 }
 private failure(error:unknown){const e=error as {code?:string;message?:string};this.error=e.message?.includes('chat_slow')?'roomChatSlow':['PGRST202','42883','42P01'].includes(e.code??'')?'roomChatSetup':'roomChatOffline';}
 async refresh(){
  if(this.closed)return;if(this.loading||this.sending){this.refreshAgain=true;return;}
  this.loading=true;const version=this.version;
  try{const data=await this.transport('list','',null,this.abort.signal);if(!this.closed&&version===this.version){this.accept(data);if(this.error!=='roomChatSlow')this.error='';}}
  catch(error){if(!this.closed&&version===this.version)this.failure(error);}
  finally{this.loading=false;this.emit();if(this.refreshAgain&&!this.closed&&!this.sending){this.refreshAgain=false;void this.refresh();}}
 }
 async send(text:string){
  text=text.trim();if(this.closed||this.sending||!text||Array.from(text).length>100)return false;
  this.sending=true;this.error='';this.version++;this.pending=this.pending?.text===text?this.pending:{text,nonce:crypto.randomUUID()};this.emit();
  try{const data=await this.transport('send',text,this.pending.nonce,this.abort.signal);if(this.closed)return false;this.accept(data);this.pending=undefined;return true;}
  catch(error){if(!this.closed)this.failure(error);return false;}
  finally{this.sending=false;this.emit();if(this.refreshAgain&&!this.closed){this.refreshAgain=false;void this.refresh();}}
 }
 destroy(){this.closed=true;this.abort.abort();clearInterval(this.timer);this.closeLive?.();this.listeners.clear();this.messages=[];this.pending=undefined;}
}
