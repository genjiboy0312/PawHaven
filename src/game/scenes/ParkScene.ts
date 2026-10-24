import { Container,Text,type DestroyOptions } from 'pixi.js';
import { Scene } from './Scene';
import { LobbyMap,type HomeTextures } from '../../home/LobbyMap';
import { AnimalAnimationController } from '../../animals/AnimalAnimationController';
import type { AnimalConfig } from '../../animals/AnimalConfig';
import { createOutfit } from '../../animals/OutfitState';
import { ActionButton } from '../../ui/ActionButton';
import { bindAria,bindText,t,onLanguageChange } from '../../settings/i18n';
import { PARK_CHANNELS,PARK_WORLD,parkCamera,parkStep,type ParkMember } from '../../park/ParkModel';
import { ParkClient } from '../../park/ParkClient';
import { GAME_FONT } from '../../ui/GameFont';

/** Shared lobby art, wardrobe renderer and touch controls; park owns only social movement. */
export class ParkScene extends Scene {
 private readonly map:LobbyMap;
 private readonly world=new Container();private readonly actorLayer=new Container();
 private readonly actors=new Map<string,{box:Container;animation:AnimalAnimationController;name:Text;signature:string;x:number;y:number;height:number;message?:string;until:number}>();
 private readonly hud=document.createElement('section');private readonly header=document.createElement('header');
 private readonly status=document.createElement('p');private readonly picker=document.createElement('section');
 private readonly chat=document.createElement('section');private readonly log=document.createElement('div');
 private readonly chatForm=document.createElement('form');private readonly composeButton=document.createElement('button');private readonly historyButton=document.createElement('button');
 private readonly input=document.createElement('input');private readonly sendButton=document.createElement('button');
 private readonly stick=document.createElement('button');private readonly knob=document.createElement('span');
 private readonly jumpButton=new ActionButton('jump');private readonly abort=new AbortController();
 private readonly keys=new Set<string>();private readonly unsubscribe:()=>void;private readonly localeOff:()=>void;
 private playerX=900;private playerY:number=PARK_WORLD.spawnY;private jumpHeight=0;private velocity=0;private direction=1;private axis=0;private axisY=0;private pointer?:number;
 private camera=parkCamera(this.playerX,this.playerY);
 private paused=false;private elapsed=0;private sent=0;private chatAt=-Infinity;private sending=false;private lastMessage=0;
 private choosing=true;private signature='';private hiddenLog=true;private composerOpen=false;private historyLoaded=false;
 constructor(private readonly client:ParkClient,private readonly pets:AnimalConfig[],private readonly onReturn:()=>void,textures?:HomeTextures,private readonly openSettings:()=>void=()=>{}){
  super();this.map=new LobbyMap(textures);this.actorLayer.sortableChildren=true;this.world.addChild(this.map,this.actorLayer);this.addChild(this.world);
  this.world.position.set(-this.camera.x,-this.camera.y);
  this.hud.className='play-hud park-hud';
  this.header.className='park-header';this.status.className='park-status';this.status.setAttribute('role','status');
  this.picker.className='settings-panel park-picker';this.picker.setAttribute('role','dialog');bindAria(this.picker,'parkChannels');
  this.chat.className='park-chat';this.log.className='park-chat-log';this.log.setAttribute('role','log');this.log.setAttribute('aria-live','polite');
  const toolbar=document.createElement('div');toolbar.className='park-chat-toolbar';
  this.composeButton.type=this.historyButton.type='button';this.composeButton.className=this.historyButton.className='commerce-primary';bindText(this.composeButton,'parkWrite');bindText(this.historyButton,'parkHistory');
  this.composeButton.addEventListener('click',()=>{this.setComposer(!this.composerOpen);if(this.composerOpen)this.input.focus();},{signal:this.abort.signal});
  this.historyButton.addEventListener('click',()=>{this.hiddenLog=!this.hiddenLog;this.renderChat();},{signal:this.abort.signal});toolbar.append(this.composeButton,this.historyButton);
  const form=this.chatForm;this.input.maxLength=100;this.input.autocomplete='off';bindAria(this.input,'parkMessage');this.input.setAttribute('data-park-input','true');
  this.sendButton.type='submit';bindText(this.sendButton,'parkSend');this.sendButton.className='commerce-primary';
  const closeComposer=this.button('close',()=>{this.setComposer(false);this.composeButton.focus();});closeComposer.textContent='×';closeComposer.removeAttribute('data-i18n');bindAria(closeComposer,'close');closeComposer.classList.add('park-compose-close');
  form.append(this.input,this.sendButton,closeComposer);form.addEventListener('submit',event=>{event.preventDefault();void this.sendChat();},{signal:this.abort.signal});
  this.input.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.isComposing)event.preventDefault();if(event.key==='Escape'){event.preventDefault();this.setComposer(false);this.composeButton.focus();}},{signal:this.abort.signal});
  this.input.addEventListener('focus',()=>this.blur(),{signal:this.abort.signal});this.chat.append(toolbar,this.log,form);this.renderChat();
  this.stick.type='button';this.stick.className='play-stick';bindAria(this.stick,'joystick');this.knob.className='stick-knob';this.stick.append(this.knob);
  const actions=document.createElement('div');actions.className='play-actions';actions.append(this.jumpButton.element);
  this.jumpButton.element.addEventListener('pointerdown',event=>{event.preventDefault();this.jump();},{signal:this.abort.signal});
  this.hud.append(this.header,this.status,this.stick,actions,this.chat,this.picker);document.querySelector('#app')?.append(this.hud);
  const move=(event:PointerEvent)=>{
   if(event.pointerId!==this.pointer)return;const r=this.stick.getBoundingClientRect(),rotated=document.querySelector('#app')?.classList.contains('portrait-touch');
   const dx=rotated?event.clientY-r.top-r.height/2:event.clientX-r.left-r.width/2;
   const dy=rotated?-(event.clientX-r.left-r.width/2):event.clientY-r.top-r.height/2;
   this.axis=dx/((rotated?r.height:r.width)*.3);this.axisY=dy/((rotated?r.width:r.height)*.3);
   const length=Math.max(1,Math.hypot(this.axis,this.axisY));this.axis/=length;this.axisY/=length;
   if(Math.hypot(this.axis,this.axisY)<.12)this.axis=this.axisY=0;
   this.knob.style.transform=`translate(${this.axis*65}%,${this.axisY*65}%)`;
  };
  this.stick.addEventListener('pointerdown',event=>{if(!this.active()||event.button!==0||this.pointer!==undefined)return;this.pointer=event.pointerId;this.stick.setPointerCapture(event.pointerId);move(event);},{signal:this.abort.signal});
  this.stick.addEventListener('pointermove',move,{signal:this.abort.signal});
  for(const name of ['pointerup','pointercancel','lostpointercapture'] as const)this.stick.addEventListener(name,event=>{if(event.pointerId===this.pointer)this.blur();},{signal:this.abort.signal});
  window.addEventListener('keydown',event=>{
   if(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement||!this.active())return;
   if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS','Space'].includes(event.code)){event.preventDefault();this.keys.add(event.code);if(!event.repeat&&event.code==='Space')this.jump();}
  },{signal:this.abort.signal});
  window.addEventListener('keyup',event=>{this.keys.delete(event.code);},{signal:this.abort.signal});
  window.addEventListener('blur',()=>this.blur(),{signal:this.abort.signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.blur();},{signal:this.abort.signal});
  this.unsubscribe=client.subscribe(()=>this.refresh());this.localeOff=onLanguageChange(()=>{this.signature='';this.refresh();});this.refresh();void client.list();
 }
 private button(key:Parameters<typeof t>[0],action:()=>void){const b=document.createElement('button');b.type='button';b.className='commerce-primary';bindText(b,key);b.addEventListener('click',action,{signal:this.abort.signal});return b;}
 private setComposer(open:boolean){this.composerOpen=open;if(!open)this.input.blur();else this.blur();this.renderChat();}
 private renderChat(){this.chatForm.hidden=!this.composerOpen;this.log.hidden=this.hiddenLog;this.composeButton.setAttribute('aria-expanded',String(this.composerOpen));this.historyButton.setAttribute('aria-expanded',String(!this.hiddenLog));this.chat.dataset.expanded=String(this.composerOpen||!this.hiddenLog);}
 private active(){return !this.paused&&!this.choosing&&!!this.client.channel&&!this.client.error&&!this.client.busy;}
 private blur(){this.keys.clear();this.axis=this.axisY=0;const pointer=this.pointer;this.pointer=undefined;this.knob.style.transform='';if(pointer!==undefined&&this.stick.hasPointerCapture(pointer))this.stick.releasePointerCapture(pointer);}
 private jump(){if(this.active()&&this.jumpHeight===0)this.velocity=440;}
 override setPaused(paused:boolean){this.paused=paused;this.blur();}
 private async choose(channel:number){
  this.blur();if(await this.client.join(channel)){this.choosing=false;this.lastMessage=0;this.historyLoaded=false;this.log.replaceChildren();this.input.value='';this.hiddenLog=true;this.setComposer(false);this.playerX=620+(Number.parseInt(this.client.owner.slice(0,4),16)%6)*115;this.playerY=PARK_WORLD.spawnY;this.camera=parkCamera(this.playerX,this.playerY);this.jumpHeight=this.velocity=0;this.signature='';this.refresh();}
 }
 private refresh(){
  if(this.destroyed)return;
  const c=this.client;
  this.input.placeholder=t('parkMessage');
  const signature=JSON.stringify([c.channel,c.snapshot.counts,c.busy,c.error,c.connected,this.choosing]);
  if(signature!==this.signature){
   this.signature=signature;this.header.replaceChildren();
   const title=document.createElement('strong');title.textContent=t('park')+(c.channel?` ${c.channel} · ${c.snapshot.members?.length??0}/8`:'');
   const settings=this.button('settings',()=>{this.blur();this.setComposer(false);this.openSettings();});settings.classList.add('park-settings');
   this.header.append(title,this.button('parkChannels',()=>{this.choosing=true;this.setComposer(false);this.blur();this.signature='';this.refresh();void c.list();}),this.button('leaveRoom',this.onReturn),settings);
   this.status.textContent=c.error?t(c.error as 'parkUnavailable'):c.channel&&!c.connected?t('parkConnecting'):'';
   this.picker.hidden=!this.choosing;this.picker.replaceChildren();
   if(this.choosing){
    const heading=document.createElement('h2');bindText(heading,'parkChannels');const grid=document.createElement('div');grid.className='park-channel-grid';this.picker.append(heading,grid);
    for(const channel of PARK_CHANNELS){const button=this.button('park',()=>{void this.choose(channel);});button.textContent=`${t('park')} ${channel} · ${c.snapshot.counts[channel-1]??0}/8`;button.disabled=c.busy||((c.snapshot.counts[channel-1]??0)>=8&&c.channel!==channel);grid.append(button);}
    if(c.channel)this.picker.append(this.button('back',()=>{this.choosing=false;this.signature='';this.refresh();}));
   }
  }
  this.chat.hidden=!c.channel||this.choosing;
  this.stick.disabled=!this.active();this.jumpButton.update(this.active()&&this.jumpHeight===0);
  if(!c.channel)return;
  const members=c.snapshot.members??[];
  for(const [id,actor]of this.actors)if(!members.some(m=>m.id===id)){actor.box.destroy({children:true});this.actors.delete(id);}
  for(const member of members)this.actor(member);
  const initial=!this.historyLoaded;this.historyLoaded=true;
  for(const message of c.snapshot.messages??[]){
   if(message.id<=this.lastMessage)continue;this.lastMessage=message.id;
   const row=document.createElement('p');row.textContent=`${message.name}: ${message.message}`;this.log.append(row);while(this.log.childElementCount>30)this.log.firstElementChild?.remove();
   const actor=this.actors.get(message.user_id);if(actor&&!initial){actor.message=message.message;actor.until=this.elapsed+6;}
  }
  this.log.scrollTop=this.log.scrollHeight;
 }
 private actor(member:ParkMember){
  const signature=JSON.stringify([member.session,member.look,member.name]),old=this.actors.get(member.id);if(old?.signature===signature)return;
  old?.box.destroy({children:true});
  const source=this.pets.find(p=>p.id===member.look?.petId)??this.pets[0];
  const outfit={...createOutfit(),...member.look?.outfit};
  const config={...source,wardrobe:source.wardrobe?{...source.wardrobe,outfit}:undefined};
  const animation=new AnimalAnimationController(config),box=new Container();box.scale.set(.7);
  if(member.id!==this.client.owner)animation.sprite.tint=0xc9c9c9;
  const name=new Text({text:member.name,style:{fontFamily:GAME_FONT,fontSize:18,fill:member.id===this.client.owner?'#665039':'#67685d',stroke:{color:'#fff9e9',width:2}}});name.anchor.set(.5);name.y=-145;
  box.addChild(animation.sprite,animation.welcomeMark,name);this.actorLayer.addChild(box);
  this.actors.set(member.id,{box,animation,name,signature,x:this.playerX,y:this.playerY,height:0,until:0});
 }
 private async sendChat(){
  if(this.sending||!this.active()||this.elapsed-this.chatAt<2||!this.input.value.trim())return;
  this.sending=true;this.sendButton.disabled=true;const text=this.input.value.trim();
  if(await this.client.chat(text)){if(this.input.value.trim()===text){this.input.value='';this.setComposer(false);this.composeButton.focus();}this.chatAt=this.elapsed;const me=this.actors.get(this.client.owner);if(me){me.message=text;me.until=this.elapsed+6;}}
  this.sending=false;if(!this.destroyed)this.sendButton.disabled=false;
 }
 resize(_width:number,_height:number){this.map.draw(PARK_WORLD.width,PARK_WORLD.height,{Background:0,Floor:0});}
 override update(dt:number){
  this.elapsed+=dt;let axis=0,axisY=0;
  if(this.active()&&document.activeElement!==this.input){
   axis=this.axis||((this.keys.has('ArrowRight')||this.keys.has('KeyD')?1:0)-(this.keys.has('ArrowLeft')||this.keys.has('KeyA')?1:0));
   axisY=this.axisY||((this.keys.has('ArrowDown')||this.keys.has('KeyS')?1:0)-(this.keys.has('ArrowUp')||this.keys.has('KeyW')?1:0));
  }
  if(axis)this.direction=axis>0?1:-1;
  const step=parkStep(this.playerX,this.playerY,this.jumpHeight,this.velocity,axis,axisY,dt);this.playerX=step.x;this.playerY=step.y;this.jumpHeight=step.height;this.velocity=step.velocity;
  const target=parkCamera(this.playerX,this.playerY),blend=1-Math.exp(-dt*10);this.camera.x+=(target.x-this.camera.x)*blend;this.camera.y+=(target.y-this.camera.y)*blend;
  this.world.position.set(-this.camera.x,-this.camera.y);
  const moving=!!(axis||axisY);
  this.sent+=dt;if(this.sent>=.08&&this.client.channel){this.sent=0;this.client.send({x:this.playerX,y:this.playerY,height:this.jumpHeight,direction:this.direction,moving});}
  for(const [id,a]of this.actors){
   const own=id===this.client.owner,p=own?{x:this.playerX,y:this.playerY,height:this.jumpHeight,direction:this.direction,moving}:this.client.poses.get(id);
   if(p){const blend=own?1:1-Math.exp(-dt*18);a.x+=(p.x-a.x)*blend;a.y+=(p.y-a.y)*blend;a.height+=(p.height-a.height)*blend;}
   a.box.position.set(a.x,a.y-a.height);a.box.zIndex=a.y;
   const airborne=(p?.height??0)>0,peerMoving=p?.moving??false;
   a.animation.update('IDLE',this.elapsed,p?.direction??1,0,0,dt,airborne?'jump':peerMoving?'run':'idle',undefined,a.until>this.elapsed?{message:a.message!,remaining:a.until-this.elapsed}:undefined);
   a.animation.welcomeMark.y-=45;
   a.animation.welcomeMark.fitToViewport((a.x-this.camera.x)/.7,(a.y-a.height-this.camera.y)/.7,960/.7,540/.7);
  }
  this.jumpButton.update(this.active()&&this.jumpHeight===0);
 }
 override destroy(options?:DestroyOptions){this.blur();this.abort.abort();this.unsubscribe();this.localeOff();this.client.destroy();this.hud.remove();super.destroy(options);}
}
