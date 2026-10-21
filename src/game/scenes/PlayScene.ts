import { bindAria, bindText, onLanguageChange, t, type TextKey } from '../../settings/i18n';
import type { GamePreferences } from '../../settings/GameSettings';
import { Container, Graphics, Text, type DestroyOptions } from 'pixi.js';
import { AnimalEffects } from '../../animals/AnimalEffects';
import { AnimalAnimationController } from '../../animals/AnimalAnimationController';
import type { AnimalConfig } from '../../animals/AnimalConfig';
import { DummyRun } from '../DummyRun';
import { COURSE_GROUND } from '../TrainingCourse';
import { courseTerrain, courseMarker, type CourseArt } from '../CourseArt';
import { COURSES, type CourseId } from '../CourseCatalog';
import type { RoomClient, Pose, Room } from '../../multiplayer/RoomClient';
import { raceResults } from '../../ui/RaceResults';
import { RacePodium } from '../../ui/RacePodium';
import { RaceProgress } from '../../ui/RaceProgress';
import { RemoteMotion } from '../../multiplayer/RemoteMotion';
import { raceCountdown } from '../../multiplayer/RaceCountdown';
import { cameraTarget, PLAY_GROUND_Y, PLAY_ZOOM } from '../PlayCamera';
import { Scene } from './Scene';

export class PlayScene extends Scene {
  private readonly run:DummyRun;
  private readonly courseEnd:number;
  private readonly peers=new Map<string,{box:Container;animation:AnimalAnimationController;effect:AnimalEffects;name:Text;motion:RemoteMotion}>();
  private readonly syncStatus=document.createElement('p');
  private readonly countdown=document.createElement('p');
  private readonly ranking=document.createElement('div');
  private readonly raceNote=document.createElement('p');
  private readonly raceMembers=new Map<string,Room['members'][number]>();
  private resultRoom?:Room;
  private resultSignature='';
  private podium?:RacePodium;
  private courseProgress?:RaceProgress;
  private recoverySeen=0;
  private sceneRendered=false;
  private loadAcknowledged=false;
  private loadPending=false;
  private startPoseSent=false;
  private readonly raceRound?:string|null;
  private readonly labels: { text: Text; key: 'start' | 'finish' | 'checkpoint' }[] = [];
  private readonly localeOff: () => void;
  private readonly world = new Container();
  private readonly nameLayer = new Container();
  private localName?:Text;
  private readonly pet = new Container();
  private readonly effect: AnimalEffects;
  private readonly animation: AnimalAnimationController;
  private readonly hud = document.createElement('section');
  private readonly victory = document.createElement('p');
  private readonly fade = document.createElement('div');
  private readonly result = document.createElement('section');
  private readonly stats = document.createElement('p');
  private readonly bestNote=document.createElement('p');
  private newBest=false;
  private readonly progress = document.createElement('p');
  private readonly retry = document.createElement('button');
  private readonly back = document.createElement('button');
  private readonly targetViews: Graphics[] = [];
  private readonly checkpointFlag = new Graphics();
  private checkpointLit?: boolean;
  private checkpointMarker?:ReturnType<typeof courseMarker>;
  private completed = false;
  private retrying = false;
  private retryFailed = false;
  private readonly stick = document.createElement('button');
  private readonly knob = document.createElement('span');
  private readonly keys = new Set<string>();
  private readonly abort = new AbortController();
  private paused = false;
  override setPaused(paused: boolean): void { this.paused = paused; this.blur(); }
  private axis = 0;
  private pointer: number | undefined;
  private elapsed = 0;
  private cameraX = 0;
  private returned = false;
  private readonly releaseStick = (): void => {
    const pointer = this.pointer;
    this.axis = 0; this.pointer = undefined; this.knob.style.transform = '';
    if (pointer !== undefined && this.stick.hasPointerCapture(pointer)) this.stick.releasePointerCapture(pointer);
  };
  private readonly blur = (): void => { this.keys.clear(); this.releaseStick(); };

  constructor(config: AnimalConfig, private readonly onReturn: () => void, private readonly settings?: { open: () => void; sound?: (kind: 'jump' | 'dash' | 'attack') => void; preferences?: () => GamePreferences; complete?: () => void; record?:(seconds:number)=>boolean; retry?: () => Promise<boolean>; map?:CourseId; art?:CourseArt; multiplayer?:{client:RoomClient;pets:AnimalConfig[];leave:()=>void} }) {
    super();
    const map=COURSES[settings?.map??'garden'];
    this.run=new DummyRun(map.solids,1/PLAY_ZOOM,{finish:map.finish,checkpoint:map.checkpoint,targets:map.targets,manualReturn:true});
    this.courseEnd=Math.max(...map.solids.map(s=>s.x+s.width));
    this.raceRound=settings?.multiplayer?.client.room?.round;
    this.recoverySeen=settings?.multiplayer?.client.recoverySerial??0;
    if(settings?.multiplayer?.client.room?.phase==='playing')this.restoreRacePose();
    this.localeOff = onLanguageChange(() => {this.labels.forEach(label => { label.text.text = t(label.key); });this.courseProgress?.refreshLabels();this.resultSignature='';});
    this.animation = new AnimalAnimationController(config);
    this.effect = new AnimalEffects(config.effects);
    const forest=settings?.map==='forest';
    this.addChild(new Graphics().rect(0, 0, 960, 540).fill(forest?'#dae7d9':'#dcebdc'), this.world);
    this.world.scale.set(PLAY_ZOOM);
    this.world.y = PLAY_GROUND_Y - COURSE_GROUND * PLAY_ZOOM;
    const terrain = settings?.art?courseTerrain(this.run.course,settings.art):new Graphics();
    if(forest){
      const trees=new Graphics();trees.label='forest-scenery';
      for(let x=180;x<this.courseEnd;x+=640){
        const height=210+(Math.floor(x/640)%3)*24;
        trees.rect(x-8,COURSE_GROUND-height+70,16,height-70).fill('#bbc7ac')
          .rect(x-34,COURSE_GROUND-height,68,44).fill('#bdd0b8')
          .rect(x-58,COURSE_GROUND-height+32,116,48).fill('#bdd0b8')
          .rect(x-78,COURSE_GROUND-height+68,156,44).fill('#bdd0b8');
      }
      this.world.addChild(trees);
    }
    if(terrain instanceof Graphics)for (const solid of this.run.course) {
      const y = COURSE_GROUND - solid.top;
      terrain.rect(solid.x, y, solid.width, solid.top - solid.bottom).fill(forest?(solid.top?'#b9ad85':'#a9c39b'):(solid.top ? '#c8b38a' : '#b5cd99'))
        .rect(solid.x, y, solid.width, 6).fill(forest?'#6f936e':(solid.top ? '#a48d65' : '#78905c'));
    }
    this.world.addChild(terrain);
    for (const [x, label] of [[120, 'start'], [map.checkpoint, 'checkpoint'], [map.finish, 'finish']] as const) {
      const flag = new Text({ text: t(label), style: { fontFamily: 'system-ui', fontSize: 23, fontWeight: 'bold', fill: '#455b3b' } });
      this.labels.push({ text: flag, key: label });
      flag.position.set(x - 40, 240);
      if(settings?.art){const marker=courseMarker(label,settings.art,x);this.world.addChild(marker,flag);if(label==='checkpoint')this.checkpointMarker=marker;}
      else this.world.addChild(new Graphics().rect(x, 275, 5, 115).fill('#657653'), flag);
    }
    this.checkpointFlag.position.set(map.checkpoint + 5, 275);
    this.checkpointFlag.visible=!settings?.art;this.world.addChild(this.checkpointFlag);
    for (const target of this.run.targets) {
      const view = new Graphics().rect(-22, -48, 44, 48).fill('#b88958')
        .rect(-18, -44, 36, 6).fill('#dbc198').rect(-3, -38, 6, 33).fill('#e8d7b2')
        .rect(-16, -24, 32, 6).fill('#e8d7b2');
      view.position.set(target.x, COURSE_GROUND);
      this.targetViews.push(view); this.world.addChild(view);
    }
    this.world.addChild(this.pet);
    this.pet.addChild(...this.effect.ghosts, this.animation.sprite, this.animation.sleepMark, this.animation.welcomeMark, this.effect);
    if(settings?.multiplayer){
      const mine=settings.multiplayer.client.room?.members.find(member=>member.id===settings.multiplayer?.client.owner);
      this.localName=this.playerName(mine?.name??'',true);this.nameLayer.addChild(this.localName);
      this.world.addChild(this.nameLayer);
    }
    this.hud.className = 'play-hud';
    bindAria(this.hud, 'gameControls');
    this.stick.className = 'play-stick';
    this.stick.type = 'button';
    bindAria(this.stick, 'joystick');
    this.knob.className = 'stick-knob';
    this.stick.append(this.knob);
    const actions = document.createElement('div');
    actions.className = 'play-actions';
    actions.append(this.button('attack', () => this.act('attack')), this.button('dash', () => this.act('dash')), this.button('jump', () => this.act('jump')));
    const settingsButton = document.createElement('button');
    settingsButton.type = 'button'; settingsButton.className = 'play-circle'; bindText(settingsButton, 'settings');
    settingsButton.addEventListener('click', () => { this.blur(); settingsButton.focus(); this.settings?.open(); }, { signal: this.abort.signal });
    settingsButton.classList.add('play-settings');
    settingsButton.disabled = !this.settings;
    this.victory.className = 'play-victory';
    bindText(this.victory, 'victory');
    this.victory.hidden = true;
    this.victory.setAttribute('role', 'status');
    this.fade.className = 'scene-fade';
    this.fade.style.opacity = '0';
    this.result.className = 'play-result'; this.result.hidden = true;
    this.result.setAttribute('role', 'group'); bindAria(this.result, 'runResults');
    this.retry.type = this.back.type = 'button';
    bindText(this.retry, 'playAgain'); bindText(this.back, 'returnLobby');
    this.retry.disabled = !this.settings?.retry;
    this.retry.addEventListener('click', () => this.leave(true), { signal: this.abort.signal });
    this.back.addEventListener('click', () => this.leave(false), { signal: this.abort.signal });
    this.bestNote.className='single-new-best';bindText(this.bestNote,'singleNewBest');this.bestNote.hidden=true;
    this.result.append(this.stats, this.bestNote, this.retry, this.back);
    this.progress.className = 'play-progress';
    this.hud.append(this.stick, actions, settingsButton, this.victory, this.fade);
    this.hud.append(this.result, this.progress);
    if(settings?.multiplayer){
      this.hud.classList.add('race-hud');
      this.courseProgress=new RaceProgress(settings.multiplayer.client.owner);this.hud.append(this.courseProgress.element);
      this.syncStatus.className='race-sync-status';this.hud.append(this.syncStatus);
      settings.multiplayer.client.pose=()=>this.pose();
      this.retry.hidden=true;bindText(this.back,'returnRoom');
      this.countdown.className='play-victory race-countdown';this.ranking.className='race-ranking';this.raceNote.className='race-result-note';
      this.raceNote.setAttribute('role','status');this.result.replaceChildren(this.ranking,this.raceNote,this.back);
      bindAria(this.result,'raceResults');
      const leave=this.button('leaveRoom',()=>settings.multiplayer?.leave());leave.className='play-circle race-leave';
      this.hud.append(this.countdown,leave);
    }
    document.querySelector('#app')?.append(this.hud);
    const signal = this.abort.signal;
    const move = (event: PointerEvent): void => {
      if (this.paused || event.pointerId !== this.pointer) return;
      const rect = this.stick.getBoundingClientRect();
      const rotated = document.querySelector('#app')?.classList.contains('portrait-touch')??false;
      const distance = rotated ? event.clientY - rect.top - rect.height / 2 : event.clientX - rect.left - rect.width / 2;
      this.axis = Math.max(-1, Math.min(1, distance / ((rotated ? rect.height : rect.width) * 0.3)));
      if (Math.abs(this.axis) < 0.12) this.axis = 0;
      this.knob.style.transform = `translateX(${this.axis * 65}%)`;
    };
    this.stick.addEventListener('pointerdown', (event) => {
      if (this.paused || event.button !== 0 || this.pointer !== undefined) return;
      this.pointer = event.pointerId; this.stick.setPointerCapture(event.pointerId); move(event);
    }, { signal });
    this.stick.addEventListener('pointermove', move, { signal });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      this.stick.addEventListener(name, (event) => { if (event.pointerId === this.pointer) this.releaseStick(); }, { signal });
    }
    window.addEventListener('blur', this.blur, { signal });
    window.addEventListener('resize', this.blur, { signal });
    document.addEventListener('visibilitychange', this.blur, { signal });
    window.addEventListener('keydown', (event) => {
      if (this.paused || this.podium) return;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyA', 'KeyD', 'KeyW', 'ShiftLeft', 'ShiftRight', 'KeyJ'].includes(event.code)) return;
      event.preventDefault(); this.keys.add(event.code);
      if (event.repeat) return;
      if (['Space', 'KeyW', 'ArrowUp'].includes(event.code)) this.act('jump');
      if (event.code.startsWith('Shift')) this.act('dash');
      if (event.code === 'KeyJ') this.act('attack');
    }, { signal });
    window.addEventListener('keyup', (event) => { this.keys.delete(event.code); }, { signal });
  }
  private leave(retry: boolean): void {
    if (!this.run.won || (this.retry.disabled && retry) || this.returned || this.back.disabled) return;
    this.retryFailed = false;
    this.retrying = retry; this.retry.disabled = this.back.disabled = true; this.run.leave();
  }
  private act(kind: 'jump' | 'dash' | 'attack'): void {
    if (this.paused || this.run.won || !this.raceStarted) return;
    const before = kind === 'jump' ? this.run.velocity : this.run[kind];
    if (kind === 'jump') this.run.jump();
    else if (kind === 'dash') this.run.startDash();
    else this.run.startAttack();
    const after = kind === 'jump' ? this.run.velocity : this.run[kind];
    if (after > before) this.settings?.sound?.(kind);
  }
  private button(label: TextKey, action?: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'play-circle'; bindText(button, label);
    button.addEventListener('pointerdown', (event) => { if (event.button !== 0) return; event.preventDefault(); action?.(); }, { signal: this.abort.signal });
    button.addEventListener('click', (event) => { if (event.detail === 0) action?.(); }, { signal: this.abort.signal });
    return button;
  }
  resize(_width: number, _height: number): void { this.render(0, 0); }
  private get raceStarted(){const client=this.settings?.multiplayer?.client;return !client||!client.reconnecting&&!client.error&&!!client.room&&client.room.round===this.raceRound&&client.serverTime>=(client.room.startsAt??Infinity)&&client.room.phase!=='results';}
  private pose():Pose{
    const action=this.run.action(this.run.horizontalVelocity),progress=action==='attack'?1-this.run.attack/this.run.attackDuration:action==='skill'?1-this.run.dash/this.run.dashDuration:action==='land'?1-this.run.land/0.16:action==='jump'?Math.min(0.49,Math.max(0,(440-this.run.velocity)/880)):0;
    return {x:this.run.x,height:this.run.height,direction:this.run.direction,action,progress,vx:this.run.horizontalVelocity};
  }
  private playerName(value:string,self=false):Text{
    const name=new Text({text:value,style:{fontFamily:'Jua, sans-serif',fontSize:22,fill:self?'#d7f4a8':'#fff9e5',stroke:{color:'#47513d',width:3,join:'round'}}});
    name.anchor.set(0.5,1);return name;
  }
  private restoreRacePose(){
    const client=this.settings?.multiplayer?.client,room=client?.room,mine=room?.members.find(member=>member.id===client?.owner);
    if(!client||!room||!mine||this.run.won)return;
    this.run.x=mine.pose.x;this.run.height=mine.pose.height;this.run.direction=mine.pose.direction;
    this.run.velocity=0;this.run.horizontalVelocity=0;this.run.dash=0;this.run.attack=0;this.run.land=0;
    const checkpoint=COURSES[this.settings?.map??'garden'].checkpoint;
    if(this.run.x>=checkpoint)this.run.checkpoint=checkpoint;
    if(room.startsAt)this.run.elapsed=Math.max(0,(client.serverTime-room.startsAt)/1000);
    if(room.racers.find(racer=>racer.id===client.owner)?.time!=null){this.run.victoryTime=0;this.completed=true;}
  }
  private network(seconds:number):boolean{
    const multi=this.settings?.multiplayer;if(!multi)return false;
    const client=multi.client,room=client.room;
    if(client.reconnecting||client.error)this.blur();
    if(!client.reconnecting&&!client.error&&(!room||room.round!==this.raceRound)){
      this.returned=true;this.onReturn();return true;
    }
    if(client.recoverySerial!==this.recoverySeen){
      this.recoverySeen=client.recoverySerial;this.blur();
      this.restoreRacePose();
    }
    if(room&&room.round===this.raceRound){for(const member of room.members)this.raceMembers.set(member.id,member);this.resultRoom=room;}
    if(this.sceneRendered&&!this.loadAcknowledged&&!this.loadPending&&!client.busy&&!client.reconnecting&&!client.error&&room?.round===this.raceRound&&room?.phase==='countdown'&&room.startsAt===null){
      this.loadPending=true;
      void client.command('loaded',{round:this.raceRound}).then(ok=>{if(ok)this.loadAcknowledged=true;}).finally(()=>{this.loadPending=false;});
    }
    const ended=!room||room.round!==this.raceRound||room.phase==='results';
    const ids=new Set(room?.members.filter(m=>m.id!==client.owner).map(m=>m.id));
    for(const [id,peer]of this.peers)if(!ids.has(id)){peer.name.destroy();peer.box.destroy({children:true});this.peers.delete(id);}
    for(const member of room?.members??[]){
      if(member.id===client.owner){if(this.localName)this.localName.text=member.name;continue;}
      let peer=this.peers.get(member.id);
      if(!peer){
        const original=multi.pets.find(p=>p.id===member.look.petId)??multi.pets[0]!;
        const config={...original,wardrobe:original.wardrobe?{...original.wardrobe,outfit:{...member.look.outfit}}:undefined};
        const animation=new AnimalAnimationController(config),effect=new AnimalEffects(config.effects),box=new Container(),name=this.playerName(member.name);
        box.tint=0xb0b0b0;box.addChild(...effect.ghosts,animation.sprite,animation.sleepMark,animation.welcomeMark,effect);box.position.set(member.pose.x,COURSE_GROUND-member.pose.height);
        this.nameLayer.addChild(name);
        this.world.addChildAt(box,this.world.getChildIndex(this.pet));peer={box,animation,effect,name,motion:new RemoteMotion()};this.peers.set(member.id,peer);
      }
      const sample=client.peerPose(member),pose=sample.pose;
      peer.motion.push(pose,sample.at);peer.motion.update(performance.now(),seconds,!client.error&&!client.reconnecting,sample.delay);
      peer.box.x=Math.max(120,Math.min(this.run.finish,peer.motion.x));peer.box.y=COURSE_GROUND-peer.motion.height;
      peer.name.text=member.name;peer.name.position.set(peer.box.x,peer.box.y-155);
      peer.animation.update('IDLE',this.elapsed,pose.direction,0,0,seconds,pose.action,['attack','skill','jump','land'].includes(pose.action)?pose.progress:undefined);
      peer.effect.update(pose.action,pose.progress,pose.direction,peer.animation.sprite,pose.vx);
      if(this.settings?.preferences?.().effects===false){peer.effect.visible=false;peer.effect.ghosts.forEach(g=>{g.visible=false;});}else peer.effect.visible=true;
    }
    const starting=room?.round===this.raceRound&&['countdown','playing'].includes(room?.phase??'');
    const cue=starting?raceCountdown(room?.startsAt??null,client.serverTime):'';
    const waiting=starting&&room?.startsAt===null;
    this.syncStatus.textContent=t(client.directConnected?'raceDirectSync':client.streamConnected?'raceLiveSync':'raceBasicSync');this.syncStatus.hidden=this.run.won;
    this.countdown.textContent=client.error||client.reconnecting?t('multiReconnecting'):waiting?t('raceLoading'):cue;
    this.countdown.setAttribute('data-error',String(!!client.error||client.reconnecting));
    this.countdown.setAttribute('data-waiting',String(!!waiting&&!client.error&&!client.reconnecting));
    this.countdown.hidden=!waiting&&!cue&&!client.error&&!client.reconnecting;
    if(ended&&!this.run.won)this.run.victoryTime=0;
    if(this.run.won){
      this.victory.textContent=t(!room?'multiOffline':room.phase==='waiting'?'raceCancelled':ended?'raceResults':'waitingOthers');
      this.back.disabled=!ended||client.reconnecting||!!client.error;
      const results=this.resultRoom,finished=room?.phase==='results';
      const signature=JSON.stringify([results?.racers,[...this.raceMembers.values()].map(member=>[member.id,member.look.petId]),finished]);
      if(signature!==this.resultSignature){
        this.resultSignature=signature;
        this.podium?.destroy();this.podium=undefined;
        if(finished)this.podium=new RacePodium(results?.racers??[],[...this.raceMembers.values()],client.owner,multi.pets,this.hud,()=>this.leave(false));
        else this.ranking.replaceChildren(raceResults(results?.racers??[],[...this.raceMembers.values()],client.owner,multi.pets,false));
        this.hud.setAttribute('data-podium',String(!!this.podium));
      }
      if(this.podium){this.podium.back.disabled=this.back.disabled;this.podium.update(seconds,this.settings?.preferences?.().effects===false);this.podium.element.style.opacity=String(1-this.run.fade);}
      const remaining=Math.max(0,Math.ceil(((room?.endsAt??client.serverTime)-client.serverTime)/1000));
      this.raceNote.textContent=client.error||client.reconnecting||!room?t('multiReconnecting'):finished?t('raceTogether'):room.phase==='waiting'?t('raceCancelled'):remaining?t('raceRemaining').replace('{seconds}',String(remaining)):t('raceChecking');
    }
    return false;
  }
  override update(seconds: number): void {
    if (this.paused || this.returned) return;
    if(this.network(seconds))return;
    const keyboard = Number(this.keys.has('ArrowRight') || this.keys.has('KeyD')) - Number(this.keys.has('ArrowLeft') || this.keys.has('KeyA'));
    const axis = this.axis || keyboard;
    const respawns = this.run.respawns;
    if(this.raceStarted||this.run.won)this.run.update(seconds, axis);
    if(this.settings?.multiplayer&&!this.startPoseSent&&this.raceStarted&&!this.run.won){this.startPoseSent=true;this.settings.multiplayer.client.publishStartPose();}
    const multi=this.settings?.multiplayer,room=multi?.client.room;
    if(this.courseProgress&&multi&&room){
      this.courseProgress.element.hidden=room.phase==='results';
      this.courseProgress.update(room.racers.filter(racer=>!racer.left||racer.time!==null).map(racer=>({
        id:racer.id,name:racer.name,finished:racer.time!==null,
        x:racer.id===multi.client.owner?this.run.x:this.peers.get(racer.id)?.box.x??room.members.find(member=>member.id===racer.id)?.pose.x??this.run.start,
      })),this.run.start,this.run.finish);
    }
    if (this.run.respawns !== respawns) { this.blur(); this.cameraX = cameraTarget(this.run.x, this.courseEnd); }
    this.elapsed += seconds;
    this.render(seconds, this.run.respawns === respawns ? axis : 0);
    this.sceneRendered=true;
    if (this.run.won && !this.completed) {
      this.completed = true;
      if(this.settings?.multiplayer&&this.run.x>=this.run.finish&&this.settings.multiplayer.client.room?.phase!=='results')void this.settings.multiplayer.client.finish(this.pose());
      else if(!this.settings?.multiplayer){this.newBest=this.settings?.record?.(this.run.elapsed)===true;this.bestNote.hidden=!this.newBest;this.settings?.complete?.();}
      this.back.focus?.();
    }
    if (this.run.returnReady && !this.returned) {
      this.returned = true;
      if (!this.retrying) this.onReturn();
      else void Promise.resolve().then(() => this.settings?.retry?.()).catch(() => false).then(ok => {
        if (ok || this.abort.signal.aborted) return;
        this.returned = false; this.run.cancelLeave();
        this.retry.disabled = this.back.disabled = false;
        this.retryFailed = true; this.stats.textContent = t('runRetryFailed'); this.fade.style.opacity = '0';
      });
    }
  }
  private render(seconds: number, axis: number): void {
    const run = this.run;
    const target = cameraTarget(run.x, this.courseEnd);
    const preferences = this.settings?.preferences?.();
    if (preferences?.smoothCamera === false) this.cameraX = target;
    else this.cameraX += (target - this.cameraX) * (1 - Math.exp(-9 * seconds));
    this.world.x = -this.cameraX * PLAY_ZOOM;
    this.pet.position.set(run.x, COURSE_GROUND - run.height);
    this.localName?.position.set(this.pet.x,this.pet.y-155);
    const action = run.action(axis);
    const progress = action === 'attack' ? 1 - run.attack / run.attackDuration
      : action === 'skill' ? 1 - run.dash / run.dashDuration
      : action === 'land' ? 1 - run.land / 0.16
      : action === 'jump' ? Math.min(0.49, Math.max(0, (440 - run.velocity) / 880)) : undefined;
    this.animation.update('IDLE', this.elapsed, run.direction, 0, 0, seconds, action, progress);
    this.effect.update(action, progress ?? 0, run.direction, this.animation.sprite, run.horizontalVelocity);
    this.effect.visible = preferences?.effects !== false;
    if (preferences?.effects === false) this.effect.ghosts.forEach(ghost => { ghost.visible = false; });
    this.victory.hidden = !run.won;
    this.result.hidden = !run.won;
    if(this.settings?.multiplayer)this.hud.setAttribute('data-results',String(run.won));
    const record = `${t('runTime')} ${(run.elapsed).toFixed(2)}s · ${t('runFalls')} ${run.respawns} · ${t('runTargets')} ${run.targets.filter(target => target.broken).length}/${run.targets.length}`;
    if (!this.returned) this.stats.textContent = this.retryFailed ? t('runRetryFailed') : record;
    this.progress.textContent = `${Math.floor((run.x - run.start) / (run.finish - run.start) * 100)}% · ${t('runTime')} ${run.elapsed.toFixed(1)}s${run.checkpoint > run.start ? ' · ' + t('checkpoint') + ' ✓' : ''}`;
    this.targetViews.forEach((view, index) => { view.visible = !run.targets[index]!.broken; });
    const active = run.checkpoint > run.start;
    if (this.checkpointLit !== active) {
      this.checkpointLit = active;
      if(this.checkpointMarker){this.checkpointMarker.alpha=active?1:.6;this.checkpointMarker.tint=active?0xffffff:0xaaa79e;}
      else this.checkpointFlag.clear().rect(0, 0, 45, 28).fill(active ? '#7dba79' : '#d7c392');
    }
    this.fade.style.opacity = String(Math.max(run.fade, 1 - Math.min(1, this.elapsed / 0.35)));
    if (run.won) this.blur();
  }
  override destroy(options?: DestroyOptions): void {
    this.courseProgress?.destroy();
    this.podium?.destroy();
    if(this.settings?.multiplayer)this.settings.multiplayer.client.pose=undefined;
    this.blur();
    this.localeOff(); this.abort.abort(); this.hud.remove(); super.destroy(options);
  }
}
