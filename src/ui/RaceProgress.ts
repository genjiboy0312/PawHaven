import { t } from '../settings/i18n';

export interface RaceProgressEntry { id:string;name:string;x:number;finished:boolean }
/** Displayed positions only: this bar never assigns race places or accepts finishes. */
export class RaceProgress {
  readonly element=document.createElement('section');
  private readonly start=document.createElement('span');
  private readonly finish=document.createElement('span');
  private readonly track=document.createElement('div');
  private readonly markers=new Map<string,{element:HTMLElement;label:string}>();
  private nextSlot=0;
  constructor(private readonly owner:string){
    this.element.className='race-course-progress';this.element.setAttribute('role','group');
    const labels=document.createElement('div');labels.className='race-course-labels';labels.append(this.start,this.finish);
    this.track.className='race-course-track';this.element.append(labels,this.track);this.refreshLabels();
  }
  refreshLabels(){this.element.setAttribute('aria-label',t('raceProgress'));this.start.textContent=t('start');this.finish.textContent=t('finish');}
  update(entries:RaceProgressEntry[],start:number,finish:number){
    const ids=new Set(entries.map(entry=>entry.id));
    for(const [id,marker]of this.markers)if(!ids.has(id)){marker.element.remove();this.markers.delete(id);}
    const colors=['#b9846c','#779bb9','#9b89b5'];
    for(const entry of entries){
      let marker=this.markers.get(entry.id);
      if(!marker){
        const self=entry.id===this.owner,slot=self?0:++this.nextSlot;
        const element=document.createElement('span');element.className='race-course-marker';element.setAttribute('role','img');element.setAttribute('data-self',String(self));
        element.style.color=self?'#fff1ac':colors[(slot-1)%colors.length]!;
        // Fixed vertical lanes keep markers distinguishable at the shared starting point.
        element.style.top=`calc(50% + ${[0,-1.5,1.5,-0.7][slot%4]}cqh)`;
        const art=document.createElement('span');art.className=self?'race-course-paw':'race-course-dot';art.setAttribute('aria-hidden','true');
        if(self)for(let i=0;i<4;i++){const toe=document.createElement('i');art.append(toe);}
        const check=document.createElement('span');check.className='race-course-check';check.textContent='✓';check.setAttribute('aria-hidden','true');
        element.append(art,check);this.track.append(element);marker={element,label:''};this.markers.set(entry.id,marker);
      }
      const ratio=entry.finished?1:Number.isFinite(entry.x)&&finish>start?Math.max(0,Math.min(1,(entry.x-start)/(finish-start))):0;
      marker.element.style.left=(ratio*100).toFixed(2)+'%';marker.element.setAttribute('data-finished',String(entry.finished));
      const label=`${entry.name} · ${entry.finished?t('finish')+' ✓':Math.floor(ratio*100)+'%'}`;
      if(label!==marker.label){marker.label=label;marker.element.setAttribute('aria-label',label);marker.element.title=label;}
    }
  }
  destroy(){this.markers.clear();this.element.remove();}
}
