import { bindAria, bindText, type TextKey } from '../settings/i18n';

/** Small reusable confirmation using the existing panel and action styles. */
export class ConfirmPopup {
  readonly element=document.createElement('div');
  private readonly abort=new AbortController();
  private readonly wasInert:boolean;
  private readonly opener:HTMLElement|undefined;
  constructor(private readonly parent:HTMLElement,title:TextKey,note:TextKey,confirm:TextKey,proceed:()=>void,cancel:()=>void){
    this.wasInert=parent.inert;parent.inert=true;
    this.opener=document.activeElement instanceof HTMLElement?document.activeElement:undefined;
    this.element.className='settings-overlay confirm-overlay';
    const panel=document.createElement('section');panel.className='settings-panel purchase-panel confirm-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');bindAria(panel,title);
    const heading=document.createElement('h2');bindText(heading,title);
    const text=document.createElement('p');bindText(text,note);
    const actions=document.createElement('div');actions.className='purchase-actions';
    const back=document.createElement('button');back.type='button';back.className='commerce-primary confirm-cancel';bindText(back,'purchaseCancel');
    const accept=document.createElement('button');accept.type='button';accept.className='commerce-primary confirm-accept';bindText(accept,confirm);
    const close=document.createElement('button');close.type='button';close.className='settings-close';close.textContent='×';bindAria(close,'close');
    back.addEventListener('click',cancel,{signal:this.abort.signal});close.addEventListener('click',cancel,{signal:this.abort.signal});accept.addEventListener('click',proceed,{signal:this.abort.signal});
    panel.addEventListener('keydown',event=>{
      event.stopPropagation();
      if(event.key==='Escape'){event.preventDefault();cancel();return;}
      if(event.key!=='Tab')return;
      const buttons=[close,back,accept];
      if(event.shiftKey&&document.activeElement===close){event.preventDefault();accept.focus();}
      else if(!event.shiftKey&&document.activeElement===accept){event.preventDefault();close.focus();}
      else if(!buttons.includes(document.activeElement as HTMLButtonElement)){event.preventDefault();back.focus();}
    },{signal:this.abort.signal});
    actions.append(back,accept);panel.append(heading,close,text,actions);this.element.append(panel);
    document.querySelector('#app')?.append(this.element);back.focus();
  }
  destroy():void{
    this.abort.abort();this.element.remove();this.parent.inert=this.wasInert;
    if(this.opener?.isConnected)this.opener.focus();
    else {const fallback=this.parent.querySelector<HTMLButtonElement>('.play-menu-exit')??this.parent.querySelector<HTMLButtonElement>('.settings-close');if(fallback&&!fallback.hidden&&!fallback.disabled)fallback.focus();}
  }
}
