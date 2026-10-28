import {bindAria,bindText,onLanguageChange,t,type TextKey} from '../settings/i18n';
import {MailboxClient,hasMailRewards,mailGroup,type PlayerMail} from '../mail/MailboxClient';
import {itemIcon} from './itemIcon';
import {homeIcon,homeItemName} from './homeIcon';
import {wearableItem} from '../animals/Wearables';
import {coinAmount} from './CoinAmount';

export class MailboxPopup {
 private overlay?:HTMLElement;private list?:HTMLElement;private detail?:HTMLElement;private footer?:HTMLElement;private selected?:string;
 private previousFocus?:HTMLElement;private blocked:{element:HTMLElement;inert:boolean}[]=[];private abort?:AbortController;
 private readonly unsubscribe?:()=>void;private readonly localeOff:()=>void;
 private couponForm?:HTMLFormElement;private couponInput?:HTMLInputElement;private couponSubmit?:HTMLButtonElement;
 constructor(private readonly pause:(paused:boolean)=>void,private readonly state:MailboxClient|undefined,private readonly login:()=>void){this.unsubscribe=state?.subscribe(()=>this.render());this.localeOff=onLanguageChange(()=>this.render());}
 private button(key:TextKey,action:()=>void){const b=document.createElement('button');b.type='button';b.className='settings-feedback';bindText(b,key);b.addEventListener('click',action);return b;}
 open(){
  if(this.overlay)return;const host=document.querySelector('#app');if(!host)return;this.abort=new AbortController();
  if(this.state)this.state.receipt=undefined;
  this.previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:undefined;
  this.blocked=Array.from(host.children).filter((e):e is HTMLElement=>e instanceof HTMLElement).map(element=>({element,inert:element.inert}));this.blocked.forEach(b=>{b.element.inert=true;});this.pause(true);
  const overlay=document.createElement('div');overlay.className='settings-overlay';this.overlay=overlay;
  const panel=document.createElement('section');panel.className='settings-panel mailbox-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');bindAria(panel,'mail');
  const title=document.createElement('h2');bindText(title,'mail');const close=this.button('close',()=>this.close());close.removeAttribute('data-i18n');close.textContent='×';close.className='settings-close';bindAria(close,'close');
  const content=document.createElement('div');content.className='settings-content mailbox-content';this.list=document.createElement('div');this.list.className='mailbox-list';this.detail=document.createElement('section');this.detail.className='mailbox-detail';content.append(this.list,this.detail);
  const coupon=document.createElement('form');coupon.className='mailbox-coupon';coupon.hidden=true;this.couponForm=coupon;
  const label=document.createElement('label');bindText(label,'couponCode');label.htmlFor='mailbox-coupon-code';
  const input=document.createElement('input');input.id='mailbox-coupon-code';input.maxLength=40;input.autocomplete='off';input.autocapitalize='characters';input.spellcheck=false;input.enterKeyHint='send';bindAria(input,'couponCode');this.couponInput=input;
  const submit=this.button('couponRedeem',()=>{});submit.type='submit';this.couponSubmit=submit;coupon.append(label,input,submit);
  coupon.addEventListener('submit',event=>{event.preventDefault();if(this.state?.busy||!input.value.trim())return;const code=input.value;void this.state?.run('redeem',code).then(ok=>{if(ok&&this.state?.snapshot?.outcome==='couponSent'&&input.value===code)input.value='';});},{signal:this.abort.signal});
  this.footer=document.createElement('footer');this.footer.className='mailbox-footer';panel.append(title,close,content,coupon,this.footer);overlay.append(panel);host.append(overlay);
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();this.close();}if(event.key!=='Tab')return;const controls=Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')).filter(e=>!e.closest('[hidden]'));if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus();}else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus();}},{signal:this.abort.signal});
  this.render();close.focus();void this.state?.run('load');
 }
 private paragraph(value:string){const p=document.createElement('p');p.textContent=value;return p;}
 private render(){
  if(!this.overlay||!this.list||!this.detail||!this.footer)return;const scroll=this.list.scrollTop;this.list.replaceChildren();this.detail.replaceChildren();this.footer.replaceChildren();
  const s=this.state;
  if(this.couponSubmit)this.couponSubmit.disabled=!s||s.busy;
  if(!s){this.detail.append(this.paragraph(t('mailLogin')),this.button('login',()=>{this.close();this.login();}));return;}
  if(s.error){const status=this.paragraph(t(s.error));status.setAttribute('role','status');this.footer.append(status,this.button('economyRetry',()=>void s.run('load')));}
  else if(s.busy){const status=this.paragraph(t('friendsLoading'));status.setAttribute('role','status');this.footer.append(status);}
  else if(s.receipt){
   const receipt=s.receipt,parts=[t('mailReceipt').replace('{count}',String(receipt.granted))],r=receipt.received;
   if(r){if(r.coins)parts.push(`${t('coins')} +${r.coins}`);if(r.snacks)parts.push(`${t('mailTreats')} +${r.snacks}`);if(r.items)parts.push(`${t('mailOutfits')} +${r.items}`);if(r.home)parts.push(`${t('mailHomeItems')} +${r.home}`);if(r.notices)parts.push(`${t('mailConfirmed')} ${r.notices}`);}
   else parts.push(t('mailReceived'));
   if(receipt.blocked)parts.push(t('mailCapacity'));
   const status=this.paragraph(parts.join(' · '));status.setAttribute('role','status');this.footer.append(status);
  }
  else if(s.snapshot?.outcome==='capacity')this.footer.append(this.paragraph(t('mailCapacity')));
  else if(s.snapshot?.outcome==='unavailable')this.footer.append(this.paragraph(t('mailUnavailable')));
  else if(s.snapshot?.outcome.startsWith('coupon')){const outcome=s.snapshot.outcome as TextKey;const status=this.paragraph(t(outcome));status.setAttribute('role','status');this.footer.append(status);}
  const rank=(mail:PlayerMail)=>mail.claimedAt?1:s.expired(mail)?2:0;
  const mails=[...(s.snapshot?.mail??[])].sort((a,b)=>rank(a)-rank(b)||Date.parse(b.createdAt)-Date.parse(a.createdAt)||a.id.localeCompare(b.id));
  if(!mails.length){this.detail.append(this.paragraph(t(s.snapshot?'mailEmpty':'friendsLoading')));}
  else{
   if(!mails.some(m=>m.id===this.selected))this.selected=mails[0]!.id;
   let previousGroup='';
   for(const mail of mails){
    const group=mailGroup(mail,s.expired(mail));
    if(group!==previousGroup){const heading=document.createElement('h3');heading.className='mailbox-group';heading.textContent=t(group);this.list.append(heading);previousGroup=group;}
    const row=this.button('mail',()=>{this.selected=mail.id;this.render();if(!mail.readAt)void s.run('read',mail.id);});row.className='mailbox-row';row.setAttribute('aria-pressed',String(mail.id===this.selected));row.disabled=s.busy;
    row.dataset.state=group;const title=document.createElement('strong');title.textContent=mail.kind==='attendance'?t('attendanceMailTitle'):mail.title;const status=document.createElement('span');status.textContent=t(group==='mailWaiting'&&!hasMailRewards(mail)?'mailConfirm':group);row.replaceChildren(title,status);this.list.append(row);
   }
   this.showMail(mails.find(m=>m.id===this.selected)!);
  }
  const refresh=this.button('friendsRefresh',()=>void s.run('load'));refresh.disabled=s.busy;
  const all=this.button('mailClaimAll',()=>void s.run('claim_all'));all.disabled=s.busy||!s.pending||!!s.error;
  const coupon=this.button('couponEntry',()=>{if(!this.couponForm)return;this.couponForm.hidden=!this.couponForm.hidden;coupon.setAttribute('aria-expanded',String(!this.couponForm.hidden));if(!this.couponForm.hidden)this.couponInput?.focus();});coupon.setAttribute('aria-expanded',String(!this.couponForm?.hidden));coupon.disabled=s.busy;
  this.footer.append(coupon,refresh,all);this.list.scrollTop=scroll;
 }
 private showMail(mail:PlayerMail){
  const s=this.state!,title=document.createElement('h3');title.textContent=mail.kind==='attendance'?t('attendanceMailTitle'):mail.title;
  const body=this.paragraph(mail.kind==='attendance'?t('attendanceMailBody').replace('{coins}',String(mail.rewards.coins??0)):mail.body);body.className='mailbox-body';
  const expires=this.paragraph(t('mailExpires')+' '+new Date(mail.expiresAt).toLocaleDateString());
  const rewards=document.createElement('div');rewards.className='mailbox-rewards';
  if(mail.rewards.coins){const coins=document.createElement('span');coinAmount(coins,mail.rewards.coins);rewards.append(coins);}
  if(mail.rewards.snacks)rewards.append(this.paragraph(`${t('mailTreats')} × ${mail.rewards.snacks}`));
  for(const item of mail.rewards.items??[]){const chip=document.createElement('div');chip.className='mailbox-item';const name=wearableItem(item.category,item.index)?.name;chip.append(itemIcon(item.category,item.index),this.paragraph(name?t(name):`${t(item.category)} #${item.index}`));rewards.append(chip);}
  for(const item of mail.rewards.home??[]){const chip=document.createElement('div');chip.className='mailbox-item';chip.append(homeIcon(item.category,item.index),this.paragraph(`${homeItemName(item.category,item.index)} × ${item.quantity}`));rewards.append(chip);}
  if(!rewards.childElementCount)rewards.append(this.paragraph(t('mailNotice')));
  const claim=this.button(mail.claimedAt?(hasMailRewards(mail)?'mailClaimed':'mailConfirmed'):s.expired(mail)?'mailExpired':hasMailRewards(mail)?'mailClaim':'mailConfirm',()=>void s.run('claim',mail.id));claim.disabled=s.busy||!!s.error||!!mail.claimedAt||s.expired(mail);this.detail!.append(title,body,expires,rewards,claim);
 }
 close(){if(!this.overlay)return;this.abort?.abort();this.overlay.remove();this.overlay=undefined;this.list=this.detail=this.footer=undefined;this.couponForm=this.couponInput=this.couponSubmit=undefined;this.blocked.forEach(b=>{b.element.inert=b.inert;});this.blocked=[];this.pause(false);if(this.previousFocus?.isConnected)this.previousFocus.focus();}
 destroy(){this.close();this.unsubscribe?.();this.localeOff();}
}
