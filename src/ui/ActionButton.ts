import { bindAria, bindText } from '../settings/i18n';
export type ControlAction='attack'|'dash'|'jump';
/** Flat, scalable controls. The run model owns availability and cooldown timing. */
export class ActionButton {
  readonly element=document.createElement('button');
  private readonly ring=document.createElement('span');
  private readonly counter=document.createElement('span');
  constructor(readonly action:ControlAction){
    const button=this.element;button.type='button';button.className='play-circle action-button';button.setAttribute('data-action',action);bindAria(button,action);
    const icon=document.createElement('img');icon.className='control-icon';icon.src=`./assets/controls/${action}.svg`;icon.alt='';icon.draggable=false;icon.setAttribute('aria-hidden','true');
    const label=document.createElement('span');label.className='control-label';bindText(label,action);
    this.ring.className='control-ring';this.ring.setAttribute('aria-hidden','true');this.counter.className='control-cooldown';this.counter.setAttribute('aria-hidden','true');
    this.ring.hidden=this.counter.hidden=true;button.append(icon,label,this.ring,this.counter);
  }
  update(available:boolean,remaining=0,duration=1):void{
    if(this.element.disabled!==!available)this.element.disabled=!available;
    const cooling=this.action==='dash'&&remaining>0;
    this.ring.hidden=this.counter.hidden=!cooling;
    if(!cooling)return;
    const value=(Math.ceil(remaining*10)/10).toFixed(1)+'s';if(this.counter.textContent!==value)this.counter.textContent=value;
    const degrees=Math.max(0,Math.min(360,(1-remaining/duration)*360));
    this.ring.style.background=`conic-gradient(#d5a13a ${degrees}deg, transparent ${degrees}deg)`;
  }
}
