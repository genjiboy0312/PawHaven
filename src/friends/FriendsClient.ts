import type { SupabaseClient } from '@supabase/supabase-js';
export type FriendAction='send'|'accept'|'reject'|'cancel'|'remove';
export interface Friend { id:string;nickname:string;relation:'none'|'friend'|'incoming'|'outgoing' }
export interface FriendsSnapshot { friends:Friend[];incoming:Friend[];outgoing:Friend[];matches:Friend[] }
type Transport=(action:string,target:string|null,query:string,signal:AbortSignal)=>Promise<unknown>;
const empty=():FriendsSnapshot=>({friends:[],incoming:[],outgoing:[],matches:[]});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function friendsTransport(client:SupabaseClient,owner:string):Transport{
  return async(action,target,query,signal)=>{
    const {data,error}=await client.auth.getSession();
    if(error)throw error;
    if(signal.aborted||data.session?.user.id!==owner)throw {code:'42501'};
    const result=await client.rpc('friends_command',{p_action:action,p_target:target,p_query:query})
      .setHeader('Authorization','Bearer '+data.session.access_token).abortSignal(signal);
    if(result.error)throw result.error;return result.data;
  };
}
function snapshot(value:unknown,owner:string):FriendsSnapshot{
  if(!value||typeof value!=='object')throw Error('invalid_snapshot');
  const result=empty();
  for(const key of ['friends','incoming','outgoing','matches'] as const){
    const rows=(value as FriendsSnapshot)[key];
    if(!Array.isArray(rows)||rows.length>(key==='matches'?20:key==='outgoing'?20:100))throw Error('invalid_snapshot');
    const ids=new Set<string>();
    result[key]=rows.filter(row=>{
      if(!row||typeof row.id!=='string'||!uuid.test(row.id)||typeof row.nickname!=='string'||!/^[A-Za-z0-9가-힣_]{2,16}$/.test(row.nickname)||!['none','friend','incoming','outgoing'].includes(row.relation)||ids.has(row.id))throw Error('invalid_snapshot');
      if(key!=='matches'&&row.relation!==(key==='friends'?'friend':key))throw Error('invalid_snapshot');
      ids.add(row.id);return row.id!==owner;
    }).map(row=>({...row}));
  }
  return result;
}
export class FriendsClient {
  snapshot=empty();busy=false;loaded=false;query='';
  error:''|'setup'|'offline'|'auth'|'query'|'nickname'|'limit'|'incoming'|'notFound'='';
  private readonly listeners=new Set<()=>void>();
  private generation=0;private disposed=false;private started=false;
  private request?:AbortController;private timer?:ReturnType<typeof setTimeout>;private events?:AbortController;
  constructor(readonly owner:string,private readonly transport:Transport){}
  subscribe(fn:()=>void){this.listeners.add(fn);return()=>{this.listeners.delete(fn);};}
  private emit(){if(!this.disposed)this.listeners.forEach(fn=>fn());}
  private readonly focus=()=>{if(typeof document==='undefined'||!document.hidden)void this.refresh();};
  start():void{
    if(this.started||this.disposed)return;this.started=true;this.events=new AbortController();
    if(typeof window!=='undefined')for(const event of ['focus','online'])window.addEventListener(event,this.focus,{signal:this.events.signal});
    if(typeof document!=='undefined')document.addEventListener('visibilitychange',this.focus,{signal:this.events.signal});
    this.focus();this.schedule();
  }
  private schedule(){clearTimeout(this.timer);if(this.started)this.timer=setTimeout(()=>{this.focus();this.schedule();},8000);}
  stop():void{this.started=false;clearTimeout(this.timer);this.events?.abort();this.request?.abort();this.generation++;this.busy=false;}
  refresh():Promise<boolean>{return this.perform('list');}
  search(query:string):Promise<boolean>{
    if(this.busy||this.disposed)return Promise.resolve(false);
    const next=query.trim();if(!/^[A-Za-z0-9가-힣_]{2,16}$/.test(next)){this.error='query';this.emit();return Promise.resolve(false);}
    this.query=next;this.snapshot.matches=[];return this.perform('search');
  }
  command(action:FriendAction,target:string):Promise<boolean>{
    if(!uuid.test(target)||target===this.owner)return Promise.resolve(false);
    return this.perform(action,target);
  }
  private async perform(action:string,target:string|null=null):Promise<boolean>{
    if(this.busy||this.disposed)return false;
    const generation=++this.generation,request=new AbortController();this.request=request;
    const timeout=setTimeout(()=>request.abort(),15000);this.busy=true;this.error='';this.emit();
    try{
      const result=await this.transport(action,target,this.query,request.signal);
      if(this.disposed||generation!==this.generation)return false;
      if(request.signal.aborted)throw Error('request_timeout');
      this.snapshot=snapshot(result,this.owner);this.loaded=true;return true;
    }catch(error){
      if(this.disposed||generation!==this.generation)return false;
      const {code,message=''}=error as {code?:string;message?:string};
      this.error=['42883','PGRST202','PGRST205'].includes(code??'')?'setup':code==='42501'?'auth'
        :message.includes('friend_invalid_query')?'query':message.includes('friend_nickname_required')?'nickname'
        :message.includes('friend_limit')?'limit':message.includes('friend_incoming')?'incoming'
        :message.includes('friend_not_found')||message.includes('friend_invalid_target')?'notFound':'offline';
      if(this.error==='auth'){this.snapshot=empty();this.loaded=false;}
      return false;
    }finally{
      clearTimeout(timeout);if(generation===this.generation){this.busy=false;this.emit();}
    }
  }
  destroy():void{this.stop();this.disposed=true;this.snapshot=empty();this.listeners.clear();}
}
