import { t } from '../settings/i18n';

export async function enterLandscape():Promise<void>{
  if(typeof window==='undefined'||!window.matchMedia?.('(any-pointer: coarse)').matches)return;
  try{
    if(!document.fullscreenElement)await document.documentElement.requestFullscreen?.();
    const orientation=window.screen?.orientation as (ScreenOrientation&{lock?:(value:'landscape')=>Promise<void>})|undefined;
    await orientation?.lock?.('landscape');
  }catch{/* Unsupported or denied: keep the rotated game and natural-direction input editor. */}
}

export function portraitTouch():boolean{
  if(!window.matchMedia?.('(any-pointer: coarse)').matches)return false;
  const type=window.screen?.orientation?.type;
  if(type)return type.startsWith('portrait');
  const angle=(window as Window&{orientation?:number}).orientation;
  if(typeof angle==='number')return angle%180===0;
  return window.screen?window.screen.width<window.screen.height:!!window.matchMedia?.('(orientation: portrait)').matches;
}

/** Keep CSS rotation independent of keyboard viewport resizing; native input lives outside #app. */
export function installMobileViewport(host:HTMLElement):()=>void{
  const abort=new AbortController(),options={signal:abort.signal};
  let editor:HTMLElement|undefined,source:HTMLInputElement|undefined,copy:HTMLInputElement|undefined;
  let wasInert=false,observer:MutationObserver|undefined;
  const close=(commit=true)=>{
    if(!editor)return;
    const original=source,value=copy?.value,oldEditor=editor;
    copy?.blur();editor=undefined;source=copy=undefined;observer?.disconnect();observer=undefined;oldEditor.remove();host.inert=wasInert;
    if(commit&&original?.isConnected&&value!==undefined){original.value=value;original.dispatchEvent(new Event('input',{bubbles:true}));original.dispatchEvent(new Event('change',{bubbles:true}));}
    original?.closest?.('[role="dialog"]')?.querySelector<HTMLElement>('button')?.focus();
  };
  const layout=()=>{
    host.classList.toggle('portrait-touch',portraitTouch());
    if(editor){const view=window.visualViewport;editor.style.top=(view?.offsetTop??0)+'px';editor.style.height=(view?.height??window.innerHeight)+'px';}
    else if(document.activeElement instanceof HTMLElement)focus({target:document.activeElement});
  };
  const focus=(event:Pick<FocusEvent,'target'>)=>{
    const target=event.target;
    if(editor||!(target instanceof HTMLElement)||target.tagName!=='INPUT'||!host.contains(target)||!portraitTouch())return;
    const input=target as HTMLInputElement;
    if(!['text','search','email','password','url','tel','number',''].includes(input.type))return;
    source=input;wasInert=host.inert;host.inert=true;
    editor=document.createElement('section');editor.className='mobile-text-editor';editor.setAttribute('role','dialog');editor.setAttribute('aria-modal','true');editor.setAttribute('aria-label',t('textEntry'));
    const panel=document.createElement('div');panel.className='mobile-text-panel';
    const label=document.createElement('label');label.textContent=input.getAttribute('aria-label')||input.placeholder||t('textEntry');
    copy=document.createElement('input');copy.type=input.type;copy.value=input.value;copy.placeholder=input.placeholder;copy.enterKeyHint='done';copy.autocomplete=input.autocomplete;copy.inputMode=input.inputMode;
    if(input.maxLength>=0)copy.maxLength=input.maxLength;
    label.append(copy);
    const done=document.createElement('button');done.type='button';done.textContent=t('inputDone');done.addEventListener('click',()=>close());
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent=t('close');cancel.addEventListener('click',()=>close(false));
    panel.append(label,done,cancel);editor.append(panel);document.body.append(editor);layout();
    editor.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();close(false);}
      else if(event.key==='Enter'&&!event.isComposing){event.preventDefault();close();}
      else if(event.key==='Tab'){
        if(event.shiftKey&&document.activeElement===copy){event.preventDefault();cancel.focus();}
        else if(!event.shiftKey&&document.activeElement===cancel){event.preventDefault();copy?.focus();}
      }
    });
    if(typeof MutationObserver!=='undefined'){observer=new MutationObserver(()=>{if(!source?.isConnected)close(false);});observer.observe(host,{childList:true,subtree:true});}
    copy.focus();try{copy.setSelectionRange(input.selectionStart,input.selectionEnd);}catch{/* Numeric/email inputs may not support selection. */}
  };
  document.addEventListener('focusin',focus,options);window.addEventListener('resize',layout,options);
  document.addEventListener('fullscreenchange',layout,options);
  window.screen?.orientation?.addEventListener('change',layout,options);
  window.visualViewport?.addEventListener('resize',layout,options);window.visualViewport?.addEventListener('scroll',layout,options);
  layout();return()=>{abort.abort();close(false);host.classList.remove('portrait-touch');};
}
