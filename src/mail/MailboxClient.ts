import type { SupabaseClient } from '@supabase/supabase-js';
import type { OutfitTab } from '../animals/OutfitState';
import { validHomeItem,type PlaceableTab } from '../home/HomeCatalog';
export interface MailRewards {coins?:number;snacks?:number;items?:{category:OutfitTab;index:number}[];home?:{category:PlaceableTab;index:number;quantity:number}[]}
export interface PlayerMail {id:string;title:string;body:string;kind?:'attendance'|'system'|null;rewards:MailRewards;createdAt:string;expiresAt:string;readAt:string|null;claimedAt:string|null}
export interface MailReceipt {coins:number;snacks:number;items:number;home:number;notices:number}
export interface MailboxSnapshot {mail:PlayerMail[];pending:number;revision:number;now:string;outcome:string;granted:number;blocked:number;received?:MailReceipt}

export function hasMailRewards(mail:PlayerMail){const r=mail.rewards;return !!(r.coins||r.snacks||r.items?.length||r.home?.length);}
export function mailGroup(mail:PlayerMail,expired:boolean){return mail.claimedAt?'mailClaimed':expired?'mailExpired':'mailWaiting';}
type Action='load'|'read'|'claim'|'claim_all'|'redeem'|'attendance';
type Request={p_action:Action;p_mail_id:string|null;p_code?:string};
type Transport=(request:Request,signal:AbortSignal)=>Promise<unknown>;
const integer=(v:unknown,max:number)=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=max;
const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const id=(v:unknown)=>typeof v==='string'&&/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(v);
export function parseMailbox(value:unknown):MailboxSnapshot{
 const s=value as MailboxSnapshot;
 if(!s||!Array.isArray(s.mail)||s.mail.length>100||!integer(s.pending,1e7)||!integer(s.revision,Number.MAX_SAFE_INTEGER)||!date(s.now)||!integer(s.granted,100)||!integer(s.blocked,100)||!['loaded','claimed','capacity','unavailable','couponSent','couponUsed','couponInvalid','couponExpired','couponExhausted','couponSlow'].includes(s.outcome))throw Error('invalid_mailbox');
 const seen=new Set<string>();
 if(s.received!==undefined&&(!s.received||typeof s.received!=='object'||['coins','snacks','items','home','notices'].some(key=>!integer(s.received![key as keyof MailReceipt],1e7))))throw Error('invalid_receipt');
 for(const m of s.mail){
  if(!id(m.id)||seen.has(m.id)||m.kind!=null&&!['attendance','system'].includes(m.kind)||typeof m.title!=='string'||!m.title.length||Array.from(m.title).length>80||typeof m.body!=='string'||Array.from(m.body).length>2000||!date(m.createdAt)||!date(m.expiresAt)||(m.readAt!==null&&!date(m.readAt))||(m.claimedAt!==null&&!date(m.claimedAt)))throw Error('invalid_mail');seen.add(m.id);
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
  const token=data.session.access_token;
  const rpc=(name:string,args?:Record<string,unknown>)=>client.rpc(name,args).setHeader('Authorization','Bearer '+token).abortSignal(signal);
  let response=await (request.p_action==='attendance'?rpc('daily_attendance_mail'):request.p_action==='redeem'?rpc('redeem_coupon',{p_code:request.p_code}):rpc('mailbox_command',request));
  // A server awaiting the attendance migration must still allow existing mail claims.
  if(request.p_action==='attendance'&&['PGRST202','42883'].includes(response.error?.code??''))response=await rpc('mailbox_command',{p_action:'load',p_mail_id:null});
  if(response.error)throw response.error;return response.data;
 };
}
/** Account-scoped observer; uncertain claims retry the same mail IDs, never client reward values. */
export class MailboxClient {
 snapshot?:MailboxSnapshot;busy=false;error:'mailSetup'|'mailOffline'|undefined;
 arrivalVersion=0;receipt?:{granted:number;blocked:number;received?:MailReceipt};
 private newestMail=-Infinity;private readonly newestIds=new Set<string>();
 private attendanceRequested=false;
 private pendingRequest?:Request;private readonly listeners=new Set<()=>void>();private readonly abort=new AbortController();private disposed=false;private timer?:ReturnType<typeof setInterval>;private syncedRevision=-1;private receivedAt=0;
 constructor(private readonly transport:Transport,private readonly refreshEconomy:()=>Promise<void>=async()=>{}){}
 subscribe(listener:()=>void){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
 private emit(){if(!this.disposed)this.listeners.forEach(fn=>fn());}
 get pending(){return this.snapshot?.pending??0;}
 expired(mail:PlayerMail){return Date.parse(mail.expiresAt)<=(this.snapshot?Date.parse(this.snapshot.now)+Date.now()-this.receivedAt:Date.now());}
 start(){
  if(this.disposed)return;this.attendanceRequested=true;
  if(!this.pendingRequest&&!this.busy){this.attendanceRequested=false;void this.run('attendance');}
  if(!this.timer)this.timer=setInterval(()=>{if(!this.pendingRequest&&!this.busy)void this.run('load');},30000);
 }
 async run(action:Action,id:string|null=null){
  if(this.busy||this.disposed)return false;this.busy=true;this.error=undefined;
  const request=this.pendingRequest??(action==='redeem'?{p_action:action,p_mail_id:null,p_code:(id??'').trim().toUpperCase()}:{p_action:action,p_mail_id:id});this.pendingRequest=request;this.emit();
  try{
   const next=parseMailbox(await this.transport(request,this.abort.signal));if(this.disposed)return false;
   const initialized=!!this.snapshot;
   let arrived=false;
   for(const mail of [...next.mail].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt))){
    const created=Date.parse(mail.createdAt);
    if(created<this.newestMail)continue;
    if(created>this.newestMail){this.newestMail=created;this.newestIds.clear();}
    if(!this.newestIds.has(mail.id)&&initialized&&!mail.claimedAt&&Date.parse(mail.expiresAt)>Date.parse(next.now))arrived=true;
    this.newestIds.add(mail.id);
   }
   if(arrived)this.arrivalVersion++;
   if(request.p_action==='redeem')this.receipt=undefined;
   if(request.p_action==='claim'||request.p_action==='claim_all')this.receipt=next.granted?{granted:next.granted,blocked:next.blocked,received:next.received}:undefined;
   this.snapshot=next;this.receivedAt=Date.now();this.pendingRequest=undefined;
   if(next.revision!==this.syncedRevision){await this.refreshEconomy();if(this.disposed)return false;this.syncedRevision=next.revision;}
   return true;
  }catch(error){if(!this.disposed)this.error=['PGRST202','PGRST205','42883','42501'].includes((error as {code?:string})?.code??'')?'mailSetup':'mailOffline';return false;}
  finally{this.busy=false;this.emit();if(this.attendanceRequested&&!this.pendingRequest&&!this.disposed){this.attendanceRequested=false;void this.run('attendance');}}
 }
 destroy(){if(this.disposed)return;this.disposed=true;clearInterval(this.timer);this.abort.abort();this.listeners.clear();}
}
