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
import { KeyboardChatDock } from '../../ui/KeyboardChatDock';
import { ParkProfilePopup } from '../../ui/ParkProfilePopup';
import type { FriendsClient } from '../../friends/FriendsClient';
import {ParkEmoteMenu,PARK_EMOTE_MESSAGES,PARK_EMOTE_MARKS} from '../../ui/ParkEmoteMenu';
import {ParkParticipants} from '../../ui/ParkParticipants';

/** Shared lobby art, wardrobe renderer and touch controls; park owns only social movement. */
export class ParkScene extends Scene {
 private readonly map:LobbyMap;
 private readonly world=new Container();private readonly actorLayer=new Container();
 private readonly actors=new Map<string,{box:Container;animation:AnimalAnimationController;name:Text;signature:string;x:number;y:number;height:number;message?:string;until:number}>();
 private readonly hud=document.createElement('section');private readonly header=document.createElement('header');
 private readonly status=document.createElement('p');private readonly picker=document.createElement('section');
 private readonly chat=document.createElement('section');private readonly log=document.createElement('div');
 private readonly chatForm=document.createElement('form');private readonly chatDock:KeyboardChatDock;
 private readonly input=document.createElement('input');private readonly sendButton=document.createElement('button');
 private readonly stick=document.createElement('button');private readonly knob=document.createElement('span');
 private readonly jumpButton=new ActionButton('jump');private readonly abort=new AbortController();
 private readonly keys=new Set<string>();private readonly unsubscribe:()=>void;private readonly localeOff:()=>void;
 private playerX=900;private playerY:number=PARK_WORLD.spawnY;private jumpHeight=0;private velocity=0;private direction=1;private axis=0;private axisY=0;private pointer?:number;
 private camera=parkCamera(this.playerX,this.playerY);
 private paused=false;private elapsed=0;private sent=0;private chatAt=-Infinity;private sending=false;private lastMessage=0;
 private choosing=true;private signature='';private historyLoaded=false;
 private readonly profile:ParkProfilePopup;
 private whisperTarget?:ParkMember;
 private readonly recipient=document.createElement('button');
 private friendOff?:()=>void;private blockedIds=new Set<string>();private blockSignature='';
 private readonly emotions:ParkEmoteMenu;
 private readonly participants:ParkParticipants;
 constructor(private readonly client:ParkClient,private readonly pets:AnimalConfig[],private readonly onReturn:()=>void,textures?:HomeTextures,private readonly openSettings:()=>void=()=>{},private readonly friends?:FriendsClient){
  super();this.map=new LobbyMap(textures);this.actorLayer.sortableChildren=true;this.world.addChild(this.map,this.actorLayer);this.addChild(this.world);
  this.profile=new ParkProfilePopup(client.owner,pets,friends,member=>{
   this.whisperTarget=member;this.client.chatError='';this.refresh();this.input.focus({preventScroll:true});
  },true);
  this.emotions=new ParkEmoteMenu(kind=>{
   if(!this.active()||this.jumpHeight>0)return false;
   this.blur();this.chatDock.reset();return this.client.emote(kind);
  });
  this.participants=new ParkParticipants(pets,client.owner,id=>this.openProfile(id));
  this.world.position.set(-this.camera.x,-this.camera.y);
  this.hud.className='play-hud park-hud';
  this.header.className='park-header';this.status.className='park-status';this.status.setAttribute('role','status');
  this.picker.className='settings-panel park-picker';this.picker.setAttribute('role','dialog');bindAria(this.picker,'parkChannels');
  this.chat.className='park-chat';this.log.className='park-chat-log';this.log.setAttribute('role','log');this.log.setAttribute('aria-live','polite');
  const form=this.chatForm;this.input.maxLength=100;this.input.autocomplete='off';bindAria(this.input,'parkMessage');this.input.setAttribute('data-park-input','true');
  this.sendButton.type='submit';bindText(this.sendButton,'parkSend');this.sendButton.className='commerce-primary';
  form.append(this.input,this.sendButton);form.addEventListener('submit',event=>{event.preventDefault();void this.sendChat();},{signal:this.abort.signal});
  this.input.enterKeyHint='send';
  this.input.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.isComposing)event.preventDefault();if(event.key==='Escape'){event.preventDefault();this.input.blur();this.chatDock.reset();}},{signal:this.abort.signal});
  this.recipient.type='button';this.recipient.className='park-whisper-target';this.recipient.hidden=true;
  this.recipient.addEventListener('click',()=>{this.whisperTarget=undefined;this.client.chatError='';this.refresh();},{signal:this.abort.signal});
  this.input.addEventListener('focus',()=>{this.blur();this.emotions.close();this.participants.close();},{signal:this.abort.signal});this.chat.append(this.log,this.recipient,form);
  this.chatDock=new KeyboardChatDock(this.chat,this.input);
  this.stick.type='button';this.stick.className='play-stick';bindAria(this.stick,'joystick');this.knob.className='stick-knob';this.stick.append(this.knob);
  const actions=document.createElement('div');actions.className='play-actions';actions.append(this.jumpButton.element);
  this.jumpButton.element.addEventListener('pointerdown',event=>{event.preventDefault();this.jump();},{signal:this.abort.signal});
  this.hud.append(this.header,this.status,this.stick,actions,this.chat,this.picker,this.emotions.element,this.participants.element);document.querySelector('#app')?.append(this.hud);
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
  this.friendOff=friends?.subscribe(()=>this.syncBlocks());this.syncBlocks();friends?.start();
 }
 private syncBlocks(){
  if(this.destroyed)return;const ids=this.friends?.snapshot.blocked?.map(f=>f.id).sort()??[],signature=JSON.stringify(ids);
  if(signature===this.blockSignature)return;this.blockSignature=signature;this.blockedIds=new Set(ids);
  this.log.replaceChildren();this.lastMessage=0;this.historyLoaded=false;
  for(const [id,actor]of this.actors)if(this.blockedIds.has(id)){actor.message=undefined;actor.until=0;}
  this.refresh();
 }
 private button(key:Parameters<typeof t>[0],action:()=>void){const b=document.createElement('button');b.type='button';b.className='commerce-primary';bindText(b,key);b.addEventListener('click',action,{signal:this.abort.signal});return b;}
 private active(){return !this.paused&&!this.choosing&&!this.profile.isOpen&&!!this.client.channel&&!this.client.error&&!this.client.busy;}
 private blur(){this.keys.clear();this.axis=this.axisY=0;const pointer=this.pointer;this.pointer=undefined;this.knob.style.transform='';if(pointer!==undefined&&this.stick.hasPointerCapture(pointer))this.stick.releasePointerCapture(pointer);}
 private jump(){if(this.active()&&this.jumpHeight===0)this.velocity=440;}
 override setPaused(paused:boolean){this.paused=paused;this.blur();if(paused){this.emotions.close();this.participants.close();}}
 private async choose(channel:number){
  this.blur();this.chatDock.reset();if(await this.client.join(channel)){this.whisperTarget=undefined;this.choosing=false;this.lastMessage=0;this.historyLoaded=false;this.log.replaceChildren();this.input.value='';this.playerX=620+(Number.parseInt(this.client.owner.slice(0,4),16)%6)*115;this.playerY=PARK_WORLD.spawnY;this.camera=parkCamera(this.playerX,this.playerY);this.jumpHeight=this.velocity=0;this.signature='';this.refresh();}
 }
 private refresh(){
  if(this.destroyed)return;
  const c=this.client;
  this.input.placeholder=t('parkMessage');
  this.participants.update(c.channel,c.snapshot.members??[],this.active(),this.blockedIds);
  const signature=JSON.stringify([c.channel,c.snapshot.counts,c.busy,c.error,c.connected,this.choosing]);
  if(signature!==this.signature){
   this.signature=signature;this.header.replaceChildren();
   const settings=this.button('settings',()=>{this.blur();this.chatDock.reset();this.emotions.close();this.participants.close();this.openSettings();});settings.classList.add('park-settings');
   this.header.append(this.participants.toggle,this.button('parkChannels',()=>{this.choosing=true;this.emotions.close();this.participants.close();this.chatDock.reset();this.blur();this.signature='';this.refresh();void c.list();}),this.button('leaveRoom',this.onReturn),this.emotions.toggle,settings);
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
  if(!c.channel){this.profile.close();return;}
  const members=c.snapshot.members??[];
  const target=this.whisperTarget,blocked=!!target&&this.blockedIds.has(target.id),missing=!!target&&!members.some(m=>m.id===target.id&&m.session===target.session);
  this.recipient.hidden=!target;this.recipient.textContent=target?t('parkWhisperTo').replace('{name}',target.name)+' ×':'';
  this.recipient.setAttribute('aria-label',t('parkWhisperCancel'));
  this.sendButton.disabled=this.sending||missing||blocked;
  this.status.textContent=blocked?t('friendsBlockedNotice'):missing?t('parkWhisperLeft'):c.chatError?t(c.chatError as 'parkChatWait'):c.error?t(c.error as 'parkUnavailable'):c.channel&&!c.connected?t('parkConnecting'):'';
  if(this.profile.memberId&&!members.some(m=>m.id===this.profile.memberId))this.profile.close();
  for(const [id,actor]of this.actors)if(!members.some(m=>m.id===id)){actor.box.destroy({children:true});this.actors.delete(id);}
  for(const member of members)this.actor(member);
  const initial=!this.historyLoaded;this.historyLoaded=true;
  for(const message of c.snapshot.messages??[]){
   if(message.id<=this.lastMessage)continue;this.lastMessage=message.id;
   if(this.blockedIds.has(message.user_id))continue;
   if(message.recipient_id&&message.user_id!==c.owner&&message.recipient_id!==c.owner)continue;
   const row=document.createElement('p'),name=document.createElement('button');name.type='button';name.className='park-chat-name';
   const outgoing=!!message.recipient_id&&message.user_id===c.owner;
   const id=outgoing?message.recipient_id!:message.user_id;
   name.textContent=outgoing?message.recipient_name??message.name:message.name;
   name.addEventListener('click',()=>this.openProfile(id));
   if(message.recipient_id){const prefix=document.createElement('span');prefix.className='park-chat-prefix';bindText(prefix,outgoing?'parkWhisperSent':'parkWhisperReceived');row.append(prefix);row.className='park-whisper-row';}
   const text=document.createElement('span');text.textContent=': '+message.message;row.append(name,text);this.log.append(row);while(this.log.childElementCount>30)this.log.firstElementChild?.remove();
   const actor=this.actors.get(message.user_id);if(actor&&!initial&&!message.recipient_id){actor.message=message.message;actor.until=this.elapsed+6;}
  }
  this.log.scrollTop=this.log.scrollHeight;
 }
 private openProfile(id:string){
  const member=this.client.snapshot.members?.find(m=>m.id===id);
  if(!member){this.status.textContent=t('parkPlayerLeft');return;}
  this.blur();this.emotions.close();this.participants.close();this.chatDock.reset();this.profile.open(member);
 }
 private actor(member:ParkMember){
  const signature=JSON.stringify([member.session,member.look,member.name]),old=this.actors.get(member.id);if(old?.signature===signature)return;
  old?.box.destroy({children:true});
  const source=this.pets.find(p=>p.id===member.look?.petId)??this.pets[0];
  const outfit={...createOutfit(),...member.look?.outfit};
  const config={...source,wardrobe:source.wardrobe?{...source.wardrobe,outfit}:undefined};
  const animation=new AnimalAnimationController(config),box=new Container();box.scale.set(.7);
  box.eventMode='static';box.cursor='pointer';box.hitArea=animation.bodyHitArea;box.interactiveChildren=false;
  box.on('pointertap',event=>{
   if(event.button!==0||!this.active())return;
   const current=this.client.snapshot.members?.find(m=>m.id===member.id);if(!current)return;
   this.openProfile(current.id);
  });
  if(member.id!==this.client.owner)animation.sprite.tint=0xc9c9c9;
  const name=new Text({text:member.name,style:{fontFamily:GAME_FONT,fontSize:18,fill:member.id===this.client.owner?'#665039':'#67685d',stroke:{color:'#fff9e9',width:2}}});name.anchor.set(.5);name.y=-145;
  box.addChild(animation.sprite,animation.welcomeMark,name);this.actorLayer.addChild(box);
  this.actors.set(member.id,{box,animation,name,signature,x:this.playerX,y:this.playerY,height:0,until:0});
 }
 private async sendChat(){
  if(this.sending||!this.active()||this.elapsed-this.chatAt<2||!this.input.value.trim())return;
  const target=this.whisperTarget;if(target&&this.blockedIds.has(target.id)){this.status.textContent=t('friendsBlockedNotice');return;}if(target&&!this.client.snapshot.members?.some(m=>m.id===target.id&&m.session===target.session)){this.status.textContent=t('parkWhisperLeft');return;}
  this.sending=true;this.sendButton.disabled=true;const text=this.input.value.trim();
  if(await this.client.chat(text,target?.id)){if(this.input.value.trim()===text&&this.whisperTarget?.id===target?.id){this.input.value='';this.input.blur();}this.chatAt=this.elapsed;const me=this.actors.get(this.client.owner);if(me&&!target){me.message=text;me.until=this.elapsed+6;}}
  this.sending=false;if(!this.destroyed)this.refresh();
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
   const emotion=this.blockedIds.has(id)?undefined:this.client.getEmote(id);
   const speech=a.until>this.elapsed?{message:a.message!,remaining:a.until-this.elapsed}:emotion?{message:t(PARK_EMOTE_MESSAGES[emotion.kind]),remaining:(emotion.until-Date.now())/1000,reaction:PARK_EMOTE_MARKS[emotion.kind]}:undefined;
   a.animation.update('IDLE',this.elapsed,p?.direction??1,0,0,dt,airborne?'jump':peerMoving?'run':emotion?'emote':'idle',undefined,speech);
   a.animation.welcomeMark.y-=45;
   a.animation.welcomeMark.fitToViewport((a.x-this.camera.x)/.7,(a.y-a.height-this.camera.y)/.7,960/.7,540/.7);
  }
  this.jumpButton.update(this.active()&&this.jumpHeight===0);
  this.emotions.update(this.active()&&this.jumpHeight===0,this.client.canEmote);
  this.participants.setEnabled(this.active());
 }
 override destroy(options?:DestroyOptions){this.participants.destroy();this.emotions.destroy();this.friendOff?.();this.profile.destroy();this.blur();this.chatDock.destroy();this.abort.abort();this.unsubscribe();this.localeOff();this.client.destroy();this.hud.remove();super.destroy(options);}
}
