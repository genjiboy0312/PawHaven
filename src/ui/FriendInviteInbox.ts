import { FriendActivity, type FriendInvite } from '../friends/FriendActivity';
import { onLanguageChange, t } from '../settings/i18n';
import { ConfirmPopup } from './ConfirmPopup';
/** Reuses the confirmation panel, keeping invitations out of gameplay and other dialogs. */
export class FriendInviteInbox {
  private popup?:ConfirmPopup;private current?:FriendInvite;private pending=false;private recovering=false;
  private readonly ignored=new Set<string>();private blocked:{element:HTMLElement;inert:boolean}[]=[];
  private readonly off:()=>void;private readonly localeOff:()=>void;
  constructor(private readonly client:FriendActivity,private readonly canShow:()=>boolean,private readonly pause:(value:boolean)=>void,private readonly joined:()=>void){
    this.off=client.subscribe(()=>this.update());this.localeOff=onLanguageChange(()=>this.describe());
  }
  private describe(){
    const note=this.popup?.element.querySelector<HTMLElement>('.confirm-panel>p');
    if(note&&this.current){note.removeAttribute('data-i18n');note.textContent=t('friendInviteNote').replace('{nickname}',this.current.nickname).replace('{room}',this.current.name);}
  }
  private update(){
    if(typeof document==='undefined')return;
    if(this.popup){
      if(!this.pending&&this.recovering&&this.current?.room===this.client.snapshot.joined){this.close();this.joined();return;}
      if(!this.pending&&(!this.canShow()||(!this.recovering&&!this.client.error&&!this.client.invitations.some(i=>i.ticket===this.current?.ticket))||this.current!.expires<=this.client.now)){this.close();return;}
      this.popup.element.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{b.disabled=this.pending||this.client.busy;});return;
    }
    if(!this.canShow()||this.client.busy||document.hidden)return;
    const invitation=this.client.invitations.find(i=>!this.ignored.has(i.ticket)),host=document.querySelector<HTMLElement>('#app');
    if(!invitation||!host)return;
    this.current=invitation;this.blocked=Array.from(host.children).filter((e):e is HTMLElement=>e instanceof HTMLElement).map(element=>({element,inert:element.inert}));
    this.blocked.forEach(b=>{b.element.inert=true;});this.pause(true);
    this.popup=new ConfirmPopup(document.createElement('div'),'friendInviteTitle','friendInviteNote','friendInviteAccept',()=>{void this.respond(true);},()=>{void this.respond(false);});
    this.popup.element.classList.add('friend-invite-inbox');
    const decline=this.popup.element.querySelector<HTMLElement>('.confirm-cancel');
    if(decline){decline.setAttribute('data-i18n','friendInviteDecline');decline.textContent=t('friendInviteDecline');}
    this.describe();
  }
  private async respond(accept:boolean){
    if(this.pending||this.client.busy||!this.current)return;
    const invitation=this.current;this.pending=true;this.update();
    const ok=await this.client.command(accept?'accept':'decline',invitation.sender,invitation.ticket);
    // Account changes may have destroyed the inbox while the response was in flight.
    if(this.current!==invitation)return;
    this.pending=false;
    if(!accept||ok){this.ignored.add(invitation.ticket);if(this.ignored.size>100)this.ignored.delete(this.ignored.values().next().value!);this.close();if(accept&&ok)this.joined();return;}
    this.recovering=this.client.error==='offline';
    const errors={setup:'friendInviteSetup',offline:'friendsOffline',auth:'friendsLogin',expired:'friendInviteExpired',busy:'friendInviteBusy',cooldown:'friendInviteSent',unavailable:'friendInviteUnavailable'} as const;
    const note=this.popup?.element.querySelector<HTMLElement>('.confirm-panel>p');
    if(note){const key=errors[this.client.error||'offline'];note.setAttribute('data-i18n',key);note.textContent=t(key);}
    this.popup?.element.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{b.disabled=false;});
  }
  private close(){this.popup?.destroy();this.popup=undefined;this.current=undefined;this.pending=false;this.recovering=false;this.blocked.forEach(b=>{b.element.inert=b.inert;});this.blocked=[];this.pause(false);}
  destroy(){this.off();this.localeOff();this.close();this.ignored.clear();}
}
