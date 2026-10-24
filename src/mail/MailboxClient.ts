import type { SupabaseClient } from '@supabase/supabase-js';
import type { OutfitTab } from '../animals/OutfitState';
import { validHomeItem,type PlaceableTab } from '../home/HomeCatalog';
export interface MailRewards {coins?:number;snacks?:number;items?:{category:OutfitTab;index:number}[];home?:{category:PlaceableTab;index:number;quantity:number}[]}
export interface PlayerMail {id:string;title:string;body:string;rewards:MailRewards;createdAt:string;expiresAt:string;readAt:string|null;claimedAt:string|null}
export interface MailboxSnapshot {mail:PlayerMail[];pending:number;revision:number;now:string;outcome:string;granted:number;blocked:number}
type Action='load'|'read'|'claim'|'claim_all';
type Request={p_action:Action;p_mail_id:string|null};
type Transport=(request:Request,signal:AbortSignal)=>Promise<unknown>;
const integer=(v:unknown,max:number)=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=max;
const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const id=(v:unknown)=>typeof v==='string'&&/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(v);
export function parseMailbox(value:unknown):MailboxSnapshot{
 const s=value as MailboxSnapshot;
 if(!s||!Array.isArray(s.mail)||s.mail.length>100||!integer(s.pending,1e7)||!integer(s.revision,Number.MAX_SAFE_INTEGER)||!date(s.now)||!integer(s.granted,100)||!integer(s.blocked,100)||!['loaded','claimed','capacity','unavailable'].includes(s.outcome))throw Error('invalid_mailbox');
 const seen=new Set<string>();
 for(const m of s.mail){
  if(!id(m.id)||seen.has(m.id)||typeof m.title!=='string'||!m.title.length||Array.from(m.title).length>80||typeof m.body!=='string'||Array.from(m.body).length>2000||!date(m.createdAt)||!date(m.expiresAt)||(m.readAt!==null&&!date(m.readAt))||(m.claimedAt!==null&&!date(m.claimedAt)))throw Error('invalid_mail');seen.add(m.id);
  const r=m.rewards;
  if(!r||typeof r!=='object'||Array.isArray(r)||(r.coins!==undefined&&!integer(r.coins,100000))||(r.snacks!==undefined&&!integer(r.snacks,99)))throw Error('invalid_reward');
  if(r.items!==undefined&&(!Array.isArray(r.items)||r.items.length>20||r.items.some(i=>!i||!['Hat','Body','Acc','Etc'].includes(i.category)||!integer(i.index,20)||i.index<1)))throw Error('invalid_reward');
  if(r.home!==undefined&&(!Array.isArray(r.home)||r.home.length>20||r.home.some(i=>!i||!validHomeItem(i.category,i.index)||!integer(i.quantity,20)||i.quantity<1)))throw Error('invalid_reward');
 }
 return structuredClone(s);
}
export function mailboxTransport(client:SupabaseClient,owner:string):Transport{
 return async(request,signal)=>{
  const {data,error}=await client.auth.getSession();if(error)throw error;
  if(signal.aborted||data.session?.user.id!==owner)throw {code:'42501',message:'account_changed'};
  const response=await client.rpc('mailbox_command',request).setHeader('Authorization','Bearer '+data.session.access_token).abortSignal(signal);
  if(response.error)throw response.error;return response.data;
 };
}
/** Account-scoped observer; uncertain claims retry the same mail IDs, never client reward values. */
export class MailboxClient {
 snapshot?:MailboxSnapshot;busy=false;error:'mailSetup'|'mailOffline'|undefined;
 private pendingRequest?:Request;private readonly listeners=new Set<()=>void>();private readonly abort=new AbortController();private disposed=false;private timer?:ReturnType<typeof setInterval>;private syncedRevision=-1;private receivedAt=0;
 constructor(private readonly transport:Transport,private readonly refreshEconomy:()=>Promise<void>=async()=>{}){}
 subscribe(listener:()=>void){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
 private emit(){if(!this.disposed)this.listeners.forEach(fn=>fn());}
 get pending(){return this.snapshot?.pending??0;}
 expired(mail:PlayerMail){return Date.parse(mail.expiresAt)<=(this.snapshot?Date.parse(this.snapshot.now)+Date.now()-this.receivedAt:Date.now());}
 start(){if(this.timer||this.disposed)return;void this.run('load');this.timer=setInterval(()=>{if(!this.pendingRequest&&!this.busy)void this.run('load');},30000);}
 async run(action:Action,id:string|null=null){
  if(this.busy||this.disposed)return false;this.busy=true;this.error=undefined;
  const request=this.pendingRequest??{p_action:action,p_mail_id:id};this.pendingRequest=request;this.emit();
  try{
   const next=parseMailbox(await this.transport(request,this.abort.signal));if(this.disposed)return false;
   this.snapshot=next;this.receivedAt=Date.now();this.pendingRequest=undefined;
   if(next.revision!==this.syncedRevision){await this.refreshEconomy();if(this.disposed)return false;this.syncedRevision=next.revision;}
   return true;
  }catch(error){if(!this.disposed)this.error=['PGRST202','PGRST205','42883','42501'].includes((error as {code?:string})?.code??'')?'mailSetup':'mailOffline';return false;}
  finally{this.busy=false;this.emit();}
 }
 destroy(){if(this.disposed)return;this.disposed=true;clearInterval(this.timer);this.abort.abort();this.listeners.clear();}
}
