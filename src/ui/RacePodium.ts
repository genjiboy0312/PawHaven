import { Sprite } from 'pixi.js';
import { AnimalAnimationController } from '../animals/AnimalAnimationController';
import type { AnimalConfig } from '../animals/AnimalConfig';
import type { Room } from '../multiplayer/RoomClient';
import { t } from '../settings/i18n';

/** Uses the loaded atlas and wardrobe; no second WebGL renderer or animation timer. */
export class RacePodium {
  readonly element=document.createElement('div');
  readonly back=document.createElement('button');
  private readonly canvas=document.createElement('canvas');
  private readonly abort=new AbortController();
  private animation?:AnimalAnimationController;
  private elapsed=0;
  private bounds={x:0,y:-150,width:200,height:150};
  private readonly wasInert:boolean;
  constructor(racers:Room['racers'],members:Room['members'],owner:string,pets:AnimalConfig[],private readonly hud:HTMLElement,onReturn:()=>void){
    this.wasInert=hud.inert;hud.inert=true;
    this.element.className='race-podium-overlay';
    const panel=document.createElement('section');panel.className='settings-panel race-podium';
    panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',t('raceResults'));
    const title=document.createElement('h2');title.textContent=t('racePodiumTitle');panel.append(title);
    const sorted=[...racers].sort((a,b)=>(a.time??Infinity)-(b.time??Infinity));
    const winner=sorted.find(r=>r.time!==null);
    if(winner){
      const hero=document.createElement('div');hero.className='race-winner';hero.setAttribute('data-self',String(winner.id===owner));
      const place=document.createElement('strong');place.className='race-winner-place';place.textContent='1st';
      this.canvas.width=480;this.canvas.height=280;this.canvas.setAttribute('aria-hidden','true');
      const name=document.createElement('strong');name.className='race-winner-name';name.textContent=winner.name;
      hero.append(place,this.canvas,name);panel.append(hero);
      const member=members.find(m=>m.id===winner.id),original=pets.find(p=>p.id===member?.look.petId);
      if(original){
        const config={...original,wardrobe:original.wardrobe&&member?{...original.wardrobe,outfit:{...member.look.outfit}}:undefined};
        this.animation=new AnimalAnimationController(config);
        // Fit all frames once so celebrating never changes the character's display scale.
        const clip=config.animations.emote??config.animations.idle!;
        let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
        for(let i=0;i<clip.frames.length;i++){
          this.animation.update('EMOTE',0,1,0,0,1/clip.fps);
          const b=this.animation.sprite.getBounds();left=Math.min(left,b.x);top=Math.min(top,b.y);right=Math.max(right,b.x+b.width);bottom=Math.max(bottom,b.y+b.height);
        }
        this.bounds={x:left,y:top,width:Math.max(1,right-left),height:Math.max(1,bottom-top)};
        this.animation.restart();
      }
    }else{const note=document.createElement('p');note.className='race-no-winner';note.textContent=t('raceNoWinner');panel.append(note);}
    const list=document.createElement('div');list.className='race-podium-list';list.setAttribute('role','list');
    let place=0,last:number|null=null;
    sorted.forEach((racer,index)=>{
      if(racer.time!==null){if(racer.time!==last)place=index+1;last=racer.time;}
      if(racer.id===winner?.id)return;
      const row=document.createElement('div');row.className='race-result-row';row.setAttribute('role','listitem');row.setAttribute('data-self',String(racer.id===owner));
      const rank=document.createElement('span');rank.className='race-place';rank.textContent=racer.time===null?'DNF':String(place);
      const name=document.createElement('strong');name.className='race-result-name';name.textContent=racer.name;
      row.append(rank,name);list.append(row);
    });
    this.back.type='button';this.back.className='commerce-primary';this.back.textContent=t('returnRoom');
    this.back.addEventListener('click',onReturn,{signal:this.abort.signal});
    panel.addEventListener('keydown',event=>{if(event.key==='Tab'){event.preventDefault();this.back.focus();}},{signal:this.abort.signal});
    panel.append(list,this.back);this.element.append(panel);document.querySelector('#app')?.append(this.element);this.back.focus();
  }
  update(seconds:number,reduced=false){
    this.elapsed+=seconds;
    const animation=this.animation;if(!animation)return;
    animation.update('EMOTE',this.elapsed,1,0,0,reduced?0:seconds);
    const context=this.canvas.getContext?.('2d');if(!context)return;
    context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,this.canvas.width,this.canvas.height);context.imageSmoothingEnabled=false;
    const b=this.bounds,scale=Math.min(440/b.width,250/b.height);
    context.setTransform(scale,0,0,scale,(480-b.width*scale)/2-b.x*scale,(280-b.height*scale)/2-b.y*scale);
    this.draw(context,animation.sprite);
  }
  private draw(context:CanvasRenderingContext2D,sprite:Sprite){
    if(!sprite.visible)return;
    context.save();context.translate(sprite.x,sprite.y);context.rotate(sprite.rotation);context.scale(sprite.scale.x,sprite.scale.y);context.translate(-sprite.pivot.x,-sprite.pivot.y);
    const texture=sprite.texture,frame=texture.frame,trim=texture.trim,orig=texture.orig;
    const resource=texture.source.resource as CanvasImageSource|undefined;
    if(resource)context.drawImage(resource,frame.x,frame.y,frame.width,frame.height,(trim?.x??0)-sprite.anchor.x*orig.width,(trim?.y??0)-sprite.anchor.y*orig.height,frame.width,frame.height);
    for(const child of sprite.children)if(child instanceof Sprite)this.draw(context,child);
    context.restore();
  }
  destroy(){this.abort.abort();this.element.remove();this.hud.inert=this.wasInert;this.animation?.sprite.destroy({children:true});this.animation?.sleepMark.destroy();this.animation?.welcomeMark.destroy({children:true});}
}
