import { backAction } from './BackNavigation';
import { applyControlLayout, CONTROL_IDS, controlPointer, copyControlLayout, moveControl, type ControlId, type ControlLayout, type ControlPoint } from '../settings/ControlLayout';
import type { GamePreferences } from '../settings/GameSettings';
import { bindAria, bindText } from '../settings/i18n';
import { ActionButton } from './ActionButton';

export class ControlLayoutEditor {
  private readonly element = document.createElement('div');
  private readonly preview = document.createElement('div');
  private readonly abort = new AbortController();
  private readonly previousFocus: HTMLElement | undefined;
  private readonly wasInert: boolean;
  private draft: ControlLayout;
  private drag?: { id: ControlId; pointer: number; element: HTMLButtonElement; start: ControlLayout; offset: ControlPoint };
  private disposed = false;
  constructor(private readonly host: HTMLElement, private readonly parent: HTMLElement, private readonly preferences: GamePreferences, save: (layout: ControlLayout) => void, close: () => void) {
    this.draft = copyControlLayout(preferences.controlLayout);
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    this.wasInert = parent.inert; parent.inert = true;
    this.element.className = 'settings-overlay controls-layout-overlay'; backAction(this.element, close); this.element.setAttribute('role','dialog'); this.element.setAttribute('aria-modal','true'); bindAria(this.element,'controlLayout');
    const toolbar = document.createElement('div'); toolbar.className = 'controls-layout-toolbar';
    const heading = document.createElement('h2'); bindText(heading,'controlLayout');
    const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'commerce-primary'; bindText(reset,'controlLayoutReset');
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'commerce-primary'; bindText(cancel,'purchaseCancel');
    const done = document.createElement('button'); done.type = 'button'; done.className = 'commerce-primary'; bindText(done,'controlLayoutDone');
    reset.addEventListener('click',()=>{this.cancelDrag();this.draft=copyControlLayout();this.paint();},{signal:this.abort.signal});
    cancel.addEventListener('click',close,{signal:this.abort.signal});
    done.addEventListener('click',()=>{this.releaseDrag();save(copyControlLayout(this.draft));close();},{signal:this.abort.signal});
    toolbar.append(heading,reset,cancel,done);
    const hint = document.createElement('p'); hint.className = 'controls-layout-hint'; bindText(hint,'controlLayoutHint');
    this.preview.className = 'play-hud controls-layout-preview';
    const stick = document.createElement('button'); stick.type = 'button'; stick.className = 'play-stick'; bindAria(stick,'joystick');
    const knob = document.createElement('span'); knob.className = 'stick-knob'; stick.append(knob);
    const actions = document.createElement('div'); actions.className = 'play-actions';
    const buttons = { joystick: stick, attack: new ActionButton('attack').element, dash: new ActionButton('dash').element, jump: new ActionButton('jump').element };
    actions.append(buttons.attack,buttons.dash,buttons.jump); this.preview.append(stick,actions);
    for (const id of CONTROL_IDS) {
      const button = buttons[id]; button.setAttribute('data-layout-control',id);
      button.addEventListener('pointerdown',event=>{
        if(event.button!==0||this.drag)return;event.preventDefault();
        const point=this.point(event);
        this.drag={id,pointer:event.pointerId,element:button,start:copyControlLayout(this.draft),offset:{x:point.x-this.draft[id].x,y:point.y-this.draft[id].y}};
        button.focus();button.setPointerCapture(event.pointerId);
      },{signal:this.abort.signal});
      button.addEventListener('pointermove',event=>{
        if(this.drag?.pointer!==event.pointerId)return;
        const point=this.point(event);this.draft=moveControl(this.draft,id,{x:point.x-this.drag.offset.x,y:point.y-this.drag.offset.y});this.paint();
      },{signal:this.abort.signal});
      button.addEventListener('pointerup',event=>{if(this.drag?.pointer===event.pointerId)this.releaseDrag();},{signal:this.abort.signal});
      for(const name of ['pointercancel','lostpointercapture'] as const)button.addEventListener(name,event=>{if(this.drag?.pointer===event.pointerId)this.cancelDrag();},{signal:this.abort.signal});
      button.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();this.cancelDrag();
        const point=this.draft[id],direction=this.preferences.leftHanded?-1:1;
        this.draft=moveControl(this.draft,id,{x:point.x+(event.key==='ArrowLeft'?-.01:event.key==='ArrowRight' ? .01 : 0)*direction,y:point.y+(event.key==='ArrowUp'?-.01:event.key==='ArrowDown' ? .01 : 0)});this.paint();
      },{signal:this.abort.signal});
    }
    this.element.addEventListener('keydown',event=>{
      event.stopPropagation();
      if(event.key==='Escape'){event.preventDefault();close();}
      if(event.key==='Tab'){
        const controls=Array.from(this.element.querySelectorAll<HTMLButtonElement>('button')),first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    },{signal:this.abort.signal});
    for(const event of ['blur','resize'] as const)window.addEventListener(event,()=>this.cancelDrag(),{signal:this.abort.signal});
    this.element.append(this.preview,toolbar,hint);host.append(this.element);this.paint();done.focus();
  }
  private point(event: PointerEvent): ControlPoint { return controlPointer(event.clientX,event.clientY,this.host.getBoundingClientRect(),this.host.classList.contains('portrait-touch'),this.preferences.leftHanded); }
  private paint(): void { applyControlLayout(this.preview,{...this.preferences,controlLayout:this.draft}); }
  private releaseDrag(): void { const drag=this.drag;this.drag=undefined;if(drag?.element.hasPointerCapture(drag.pointer))drag.element.releasePointerCapture(drag.pointer); }
  private cancelDrag(): void { if(this.drag){this.draft=this.drag.start;this.releaseDrag();this.paint();} }
  destroy(): void {
    if(this.disposed)return;this.disposed=true;this.releaseDrag();this.abort.abort();this.element.remove();this.parent.inert=this.wasInert;
    if(this.previousFocus?.isConnected)this.previousFocus.focus();
  }
}
