import { bindAria, bindText, onLanguageChange, t, type TextKey } from '../settings/i18n';
import { FriendsClient, type Friend, type FriendAction } from '../friends/FriendsClient';
import { ConfirmPopup } from './ConfirmPopup';
const TABS = ['friendsList', 'addFriend', 'friendRequests'] as const;
/** Reuses the existing popup; its account-owned client owns all server state. */
export class FriendsPopup {
  private overlay?: HTMLElement;
  private content?: HTMLElement;
  private abort?: AbortController;
  private previousFocus?: HTMLElement;
  private blocked: { element: HTMLElement; inert: boolean }[] = [];
  private tab: typeof TABS[number] = 'friendsList';
  private panel?:HTMLElement;private tabs?:HTMLElement;private unsubscribe?:()=>void;
  private draft='';private search?:HTMLInputElement;private confirm?:ConfirmPopup;
  private readonly localeOff = onLanguageChange(() => this.render());
  constructor(private readonly pause: (paused: boolean) => void,private readonly client?:FriendsClient,private readonly account?:()=>void,private readonly nickname?:()=>string|null) {}
  open(): void {
    if (this.overlay) return;
    const host = document.querySelector<HTMLElement>('#app'); if (!host) return;
    this.abort = new AbortController(); const signal = this.abort.signal;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    this.blocked = Array.from(host.children).filter((element): element is HTMLElement => element instanceof HTMLElement)
      .map(element => ({ element, inert: element.inert }));
    this.blocked.forEach(item => { item.element.inert = true; }); this.pause(true);
    const overlay = document.createElement('div'); overlay.className = 'settings-overlay'; this.overlay = overlay;
    const panel = document.createElement('section'); panel.className = 'settings-panel friends-panel';
    this.panel=panel;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); bindAria(panel, 'friends');
    const heading = document.createElement('h2'); bindText(heading, 'friends');
    const close = document.createElement('button'); close.type = 'button'; close.className = 'settings-close'; close.textContent = '×'; bindAria(close, 'close');
    close.addEventListener('click', () => this.close(), { signal });
    const tabs = document.createElement('nav'); tabs.className = 'settings-tabs';
    this.tabs=tabs;
    for (const key of TABS) {
      const button = document.createElement('button'); button.type = 'button'; bindText(button, key);
      button.setAttribute('aria-pressed', String(key === this.tab));
      button.addEventListener('click', () => {
        this.tab = key; Array.from(tabs.children).forEach((item, index) => item.setAttribute('aria-pressed', String(TABS[index] === key))); this.render();
      }, { signal }); tabs.append(button);
    }
    this.content = document.createElement('div'); this.content.className = 'settings-content friends-content';
    panel.append(heading, close, tabs, this.content); overlay.append(panel); host.append(overlay);
    let backdrop = false;
    overlay.addEventListener('pointerdown', event => { backdrop = event.target === overlay; }, { signal });
    overlay.addEventListener('pointerup', event => { if (backdrop && event.target === overlay) this.close(); backdrop = false; }, { signal });
    overlay.addEventListener('pointercancel', () => { backdrop = false; }, { signal });
    overlay.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.close(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'));
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
    }, { signal });
    this.unsubscribe=this.client?.subscribe(()=>this.render());
    this.render();if(!this.nickname||this.nickname())this.client?.start();close.focus();
  }
  private render(): void {
    if (!this.content) return;
    const focused=this.search===document.activeElement,start=this.search?.selectionStart,end=this.search?.selectionEnd,scroll=this.content.scrollTop;
    this.content.replaceChildren();
    this.search=undefined;
    const paragraph = (key: TextKey): void => { const p = document.createElement('p'); p.textContent = t(key); this.content!.append(p); };
    if(this.tabs)Array.from(this.tabs.children).forEach((button,index)=>{button.textContent=t(TABS[index])+(TABS[index]==='friendRequests'&&this.client?.snapshot.incoming.length?' ('+this.client.snapshot.incoming.length+')':'');button.setAttribute('aria-pressed',String(TABS[index]===this.tab));});
    const button=(key:TextKey,run:()=>void)=>{const b=document.createElement('button');b.type='button';b.className='commerce-primary';b.textContent=t(key);b.disabled=!!this.client?.busy;b.addEventListener('click',run);return b;};
    if(!this.client||(this.nickname&&!this.nickname())){
      paragraph(this.client?'friendsNickname':'friendsLogin');
      if(this.account)this.content.append(button('Account',()=>{this.close();this.account?.();}));
      if(this.tab==='addFriend'){const input=document.createElement('input');input.type='search';input.disabled=true;input.placeholder=t('friendSearch');bindAria(input,'friendSearch');this.content.append(input);}
      else paragraph(this.tab==='friendsList'?'friendsEmpty':'requestsEmpty');
      return;
    }
    const client=this.client;
    const toolbar=document.createElement('div');toolbar.className='friend-toolbar';toolbar.append(button('friendsRefresh',()=>{void client.refresh();}));
    const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const errors={setup:'friendsSetup',offline:'friendsOffline',auth:'friendsLogin',query:'friendsQuery',nickname:'friendsNickname',limit:'friendsLimit',incoming:'friendsIncoming',notFound:'friendsNotFound'} as const;
    status.textContent=client.error?t(errors[client.error]):client.busy?t('friendsLoading'):'';toolbar.append(status);this.content.append(toolbar);
    const row=(friend:Friend,actions:{key:TextKey;action:FriendAction}[])=>{
      const item=document.createElement('section');item.className='daily-quest friend-row';
      const name=document.createElement('strong');name.textContent=friend.nickname;
      const controls=document.createElement('div');controls.className='friend-actions';
      for(const {key,action}of actions)controls.append(button(key,()=>{
        if(action!=='remove'){void client.command(action,friend.id);return;}
        if(this.confirm||!this.panel)return;
        const close=()=>{this.confirm?.destroy();this.confirm=undefined;};
        this.confirm=new ConfirmPopup(this.panel,'friendsRemoveTitle','friendsRemoveNote','friendsRemove',()=>{close();void client.command('remove',friend.id);},close);
      }));
      if(!actions.length){const state=document.createElement('span');state.textContent=t(friend.relation==='friend'?'friendsList':'friendsPending');controls.append(state);}
      item.append(name,controls);this.content!.append(item);
    };
    if (this.tab === 'addFriend') {
      const form=document.createElement('form');form.className='friend-search';form.noValidate=true;
      const input=document.createElement('input');this.search=input;input.type='search';input.maxLength=16;input.value=this.draft;input.placeholder=t('friendSearch');bindAria(input,'friendSearch');
      input.addEventListener('input',()=>{this.draft=input.value;});
      const submit=button('friendsSearch',()=>{});submit.type='submit';
      form.addEventListener('submit',event=>{event.preventDefault();void client.search(this.draft);});form.append(input,submit);this.content.append(form);
      paragraph('friendsQuery');
      if(client.query){const query=document.createElement('p');query.className='friend-search-query';query.textContent=t('friendsResultsFor').replace('{query}',client.query);this.content.append(query);}
      if(client.query&&!client.busy&&!client.error&&!client.snapshot.matches.length)paragraph('friendsNoResults');
      client.snapshot.matches.forEach(friend=>row(friend,friend.relation==='none'?[{key:'friendsSend',action:'send'}]:friend.relation==='incoming'?[{key:'friendsAccept',action:'accept'}]:[]));
    } else if(this.tab==='friendRequests'){
      const received=document.createElement('h3');received.textContent=t('friendsReceived');this.content.append(received);
      if(client.loaded&&!client.snapshot.incoming.length)paragraph('requestsEmpty');
      client.snapshot.incoming.forEach(friend=>row(friend,[{key:'friendsAccept',action:'accept'},{key:'friendsDecline',action:'reject'}]));
      const sent=document.createElement('h3');sent.textContent=t('friendsSent');this.content.append(sent);
      if(client.loaded&&!client.snapshot.outgoing.length)paragraph('friendsSentEmpty');
      client.snapshot.outgoing.forEach(friend=>row(friend,[{key:'friendsCancel',action:'cancel'}]));
    }else{
      if(client.loaded&&!client.snapshot.friends.length)paragraph('friendsEmpty');
      client.snapshot.friends.forEach(friend=>row(friend,[{key:'friendsRemove',action:'remove'}]));
    }
    this.content.scrollTop=scroll;
    if(focused&&this.search){this.search.focus();if(start!=null&&end!=null)this.search.setSelectionRange?.(start,end);}
  }
  close(): void {
    if (!this.overlay) return;
    this.confirm?.destroy();this.confirm=undefined;this.unsubscribe?.();this.unsubscribe=undefined;this.client?.stop();
    this.abort?.abort(); this.overlay.remove(); this.overlay = undefined; this.content = undefined;
    this.blocked.forEach(item => { item.element.inert = item.inert; }); this.blocked = []; this.pause(false);
    if (this.previousFocus?.isConnected) this.previousFocus.focus(); this.previousFocus = undefined;
    this.panel=this.tabs=undefined;this.search=undefined;
  }
  destroy(): void { this.close(); this.client?.destroy();this.localeOff(); }
}
