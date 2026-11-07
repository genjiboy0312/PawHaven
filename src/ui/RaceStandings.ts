import { t } from '../settings/i18n';
import { compareCoinRushScores } from '../multiplayer/CoinRushRanking';

export interface StandingEntry { id:string; name:string; x:number; time:number|null; score?:number }
/** Provisional distance order only; server-accepted finish times always take priority. */
export class RaceStandings {
  readonly element=document.createElement('section');
  private readonly heading=document.createElement('span');
  private readonly list=document.createElement('ol');
  private order:string[]=[];
  private elapsed=.2;
  private connected=true;
  private signature='';
  constructor(private readonly owner:string, private readonly collectionTotal?:number){
    this.element.className='race-live-standings';this.element.setAttribute('role','group');
    this.element.setAttribute('data-stale','false');
    this.list.className='race-live-list';this.element.append(this.heading,this.list);this.refreshLabels();
  }
  refreshLabels():void{
    const label=t(!this.connected?'racePlacesSyncing':this.collectionTotal?'coinRushLiveScores':'raceLivePlaces');
    this.heading.textContent=label;this.element.setAttribute('aria-label',label);
    for(const row of Array.from(this.list.children) as HTMLElement[])this.labelRow(row);
  }
  private labelRow(row:HTMLElement):void{
    if(this.collectionTotal){
      row.setAttribute('aria-label',Array.from(row.children).map(child=>child.textContent).join(' · '));
      return;
    }
    row.setAttribute('aria-label',`${row.children[0]?.textContent} · ${row.children[1]?.textContent}${row.getAttribute('data-finished')==='true'?' · '+t('finish'):''}`);}
  update(entries:StandingEntry[],start:number,finish:number,seconds:number,connected=true):void{
    if(this.connected!==connected){this.connected=connected;this.elapsed=.2;this.element.setAttribute('data-stale',String(!connected));this.refreshLabels();}
    if(!connected)return;
    this.elapsed+=Math.max(0,Number.isFinite(seconds)?seconds:0);
    if(this.elapsed<.2)return;
    this.elapsed=0;
    const previous=new Map(this.order.map((id,index)=>[id,index]));
    const bounded=(x:number)=>Number.isFinite(x)?Math.max(start,Math.min(finish,x)):start;
    const sorted=entries.slice(0,4).map((entry,index)=>({...entry,time:entry.time!==null&&Number.isFinite(entry.time)&&entry.time>=0?entry.time:null,position:bounded(entry.x),stable:previous.get(entry.id)??4+index})).sort((a,b)=>{
      if(this.collectionTotal)return compareCoinRushScores({score:a.score??0,time:a.time},{score:b.score??0,time:b.time})||a.id.localeCompare(b.id);
      if(a.time!==null&&b.time===null)return -1;
      if(a.time===null&&b.time!==null)return 1;
      return (a.time!==null&&b.time!==null?a.time-b.time:b.position-a.position)||a.stable-b.stable;
    });
    this.order=sorted.map(entry=>entry.id);
    const signature=JSON.stringify(sorted.map(entry=>[entry.id,entry.name,entry.time,entry.score]));
    if(signature===this.signature)return;this.signature=signature;
    let place=0,lastTime:number|null=null;
    const rows=sorted.map((entry,index)=>{
      if (this.collectionTotal) {
        const previous=sorted[index-1];
        if (!previous || entry.score!==previous.score || entry.time!==previous.time) place=index+1;
      } else if(entry.time===null||entry.time!==lastTime)place=index+1;
      lastTime=entry.time;
      const row=document.createElement('li');row.setAttribute('data-id',entry.id);row.setAttribute('data-self',String(entry.id===this.owner));row.setAttribute('data-finished',String(entry.time!==null));
      const rank=document.createElement('span');rank.className='race-live-place';rank.textContent=String(place);
      const name=document.createElement('span');name.className='race-live-name';name.textContent=entry.name;name.title=entry.name;
      const check=document.createElement('span');check.className='race-live-check';check.textContent=this.collectionTotal?`${entry.score??0}/${this.collectionTotal}`:entry.time!==null?'✓':'';check.setAttribute('aria-hidden','true');
      row.append(rank,name,check);this.labelRow(row);return row;
    });
    this.list.replaceChildren(...rows);
  }
  destroy():void{this.order=[];this.element.remove();}
}
