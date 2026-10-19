import { bindAria, bindText, onLanguageChange, t, type TextKey } from '../../settings/i18n';
import type { GamePreferences } from '../../settings/GameSettings';
import { Container, Graphics, Text, type DestroyOptions } from 'pixi.js';
import { AnimalEffects } from '../../animals/AnimalEffects';
import { AnimalAnimationController } from '../../animals/AnimalAnimationController';
import type { AnimalConfig } from '../../animals/AnimalConfig';
import { DummyRun } from '../DummyRun';
import { COURSE_GROUND } from '../TrainingCourse';
import { COURSES, type CourseId } from '../CourseCatalog';
import type { RoomClient, Pose, Room } from '../../multiplayer/RoomClient';
import { raceResults } from '../../ui/RaceResults';
import { cameraTarget, PLAY_GROUND_Y, PLAY_ZOOM } from '../PlayCamera';
import { Scene } from './Scene';

export class PlayScene extends Scene {
  private readonly run:DummyRun;
  private readonly courseEnd:number;
  private readonly peers=new Map<string,{box:Container;animation:AnimalAnimationController;effect:AnimalEffects;name:Text}>();
  private readonly countdown=document.createElement('p');
  private readonly ranking=document.createElement('div');
  private readonly raceNote=document.createElement('p');
  private readonly raceMembers=new Map<string,Room['members'][number]>();
  private resultRoom?:Room;
  private resultSignature='';
  private readonly raceRound?:string|null;
  private readonly labels: { text: Text; key: 'start' | 'finish' | 'checkpoint' }[] = [];
  private readonly localeOff: () => void;
  private readonly world = new Container();
  private readonly pet = new Container();
  private readonly effect: AnimalEffects;
  private readonly animation: AnimalAnimationController;
  private readonly hud = document.createElement('section');
  private readonly victory = document.createElement('p');
  private readonly fade = document.createElement('div');
  private readonly result = document.createElement('section');
  private readonly stats = document.createElement('p');
  private readonly progress = document.createElement('p');
  private readonly retry = document.createElement('button');
  private readonly back = document.createElement('button');
  private readonly targetViews: Graphics[] = [];
  private readonly checkpointFlag = new Graphics();
  private checkpointLit?: boolean;
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

  constructor(config: AnimalConfig, private readonly onReturn: () => void, private readonly settings?: { open: () => void; sound?: (kind: 'jump' | 'dash' | 'attack') => void; preferences?: () => GamePreferences; complete?: () => void; retry?: () => Promise<boolean>; map?:CourseId; multiplayer?:{client:RoomClient;pets:AnimalConfig[];leave:()=>void} }) {
    super();
    const map=COURSES[settings?.map??'garden'];
    this.run=new DummyRun(map.solids,1/PLAY_ZOOM,{finish:map.finish,checkpoint:map.checkpoint,targets:map.targets,manualReturn:true});
    this.courseEnd=Math.max(...map.solids.map(s=>s.x+s.width));
    this.raceRound=settings?.multiplayer?.client.room?.round;
    this.localeOff = onLanguageChange(() => {this.labels.forEach(label => { label.text.text = t(label.key); });this.resultSignature='';});
    this.animation = new AnimalAnimationController(config);
    this.effect = new AnimalEffects(config.effects);
    this.addChild(new Graphics().rect(0, 0, 960, 540).fill('#dcebdc'), this.world);
    this.world.scale.set(PLAY_ZOOM);
    this.world.y = PLAY_GROUND_Y - COURSE_GROUND * PLAY_ZOOM;
    const terrain = new Graphics();
    for (const solid of this.run.course) {
      const y = COURSE_GROUND - solid.top;
      terrain.rect(solid.x, y, solid.width, solid.top - solid.bottom).fill(solid.top ? '#c8b38a' : '#b5cd99')
        .rect(solid.x, y, solid.width, 6).fill(solid.top ? '#a48d65' : '#78905c');
    }
    this.world.addChild(terrain);
    for (const [x, label] of [[120, 'start'], [map.checkpoint, 'checkpoint'], [map.finish, 'finish']] as const) {
      const flag = new Text({ text: t(label), style: { fontFamily: 'system-ui', fontSize: 23, fontWeight: 'bold', fill: '#455b3b' } });
      this.labels.push({ text: flag, key: label });
      flag.position.set(x - 40, 240);
      this.world.addChild(new Graphics().rect(x, 275, 5, 115).fill('#657653'), flag);
    }
    this.checkpointFlag.position.set(map.checkpoint + 5, 275);
    this.world.addChild(this.checkpointFlag);
    for (const target of this.run.targets) {
      const view = new Graphics().rect(-22, -48, 44, 48).fill('#b88958')
        .rect(-18, -44, 36, 6).fill('#dbc198').rect(-3, -38, 6, 33).fill('#e8d7b2')
        .rect(-16, -24, 32, 6).fill('#e8d7b2');
      view.position.set(target.x, COURSE_GROUND);
      this.targetViews.push(view); this.world.addChild(view);
    }
    this.world.addChild(this.pet);
    this.pet.addChild(...this.effect.ghosts, this.animation.sprite, this.animation.sleepMark, this.animation.welcomeMark, this.effect);
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
    this.result.append(this.stats, this.retry, this.back);
    this.progress.className = 'play-progress';
    this.hud.append(this.stick, actions, settingsButton, this.victory, this.fade);
    this.hud.append(this.result, this.progress);
    if(settings?.multiplayer){
      this.hud.classList.add('race-hud');
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
      const rotated = window.matchMedia('(orientation: portrait) and (any-pointer: coarse)').matches;
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
      if (this.paused) return;
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
  private get raceStarted(){const client=this.settings?.multiplayer?.client;return !client||!!client.room&&client.room.round===this.raceRound&&client.serverTime>=(client.room.startsAt??Infinity)&&client.room.phase!=='results';}
  private pose():Pose{
    const action=this.run.action(this.run.horizontalVelocity),progress=action==='attack'?1-this.run.attack/this.run.attackDuration:action==='skill'?1-this.run.dash/this.run.dashDuration:action==='land'?1-this.run.land/0.16:action==='jump'?Math.min(0.49,Math.max(0,(440-this.run.velocity)/880)):0;
    return {x:this.run.x,height:this.run.height,direction:this.run.direction,action,progress,vx:this.run.horizontalVelocity};
  }
  private network(seconds:number){
    const multi=this.settings?.multiplayer;if(!multi)return;
    const client=multi.client,room=client.room;
    if(room&&room.round===this.raceRound){for(const member of room.members)this.raceMembers.set(member.id,member);this.resultRoom=room;}
    const ended=!room||room.round!==this.raceRound||room.phase==='results';
    const ids=new Set(room?.members.filter(m=>m.id!==client.owner).map(m=>m.id));
    for(const [id,peer]of this.peers)if(!ids.has(id)){peer.box.destroy({children:true});this.peers.delete(id);}
    for(const member of room?.members??[]){
      if(member.id===client.owner)continue;
      let peer=this.peers.get(member.id);
      if(!peer){
        const original=multi.pets.find(p=>p.id===member.look.petId)??multi.pets[0]!;
        const config={...original,wardrobe:original.wardrobe?{...original.wardrobe,outfit:{...member.look.outfit}}:undefined};
        const animation=new AnimalAnimationController(config),effect=new AnimalEffects(config.effects),box=new Container(),name=new Text({text:member.name,style:{fontFamily:'Jua, sans-serif',fontSize:18,fill:'#655d50'}});
        name.anchor.set(0.5);name.y=-155;box.addChild(...effect.ghosts,animation.sprite,animation.sleepMark,animation.welcomeMark,effect,name);box.position.set(member.pose.x,COURSE_GROUND-member.pose.height);
        this.world.addChildAt(box,this.world.getChildIndex(this.pet));peer={box,animation,effect,name};this.peers.set(member.id,peer);
      }
      const pose=member.pose,age=Math.min(0.35,Math.max(0,(client.serverTime-client.snapshot.now)/1000));
      const targetX=Math.max(120,Math.min(this.run.finish,pose.x+pose.vx*age));
      const mix=1-Math.exp(-12*seconds);peer.box.x+=(targetX-peer.box.x)*mix;peer.box.y+=(COURSE_GROUND-pose.height-peer.box.y)*mix;
      peer.animation.update('IDLE',this.elapsed,pose.direction,0,0,seconds,pose.action,['attack','skill','jump','land'].includes(pose.action)?pose.progress:undefined);
      peer.effect.update(pose.action,pose.progress,pose.direction,peer.animation.sprite,pose.vx);
      if(this.settings?.preferences?.().effects===false){peer.effect.visible=false;peer.effect.ghosts.forEach(g=>{g.visible=false;});}else peer.effect.visible=true;
    }
    const startIn=room?.startsAt?Math.max(0,Math.ceil((room.startsAt-client.serverTime)/1000)):0;
    this.countdown.textContent=client.error?t('multiOffline'):startIn?String(startIn):'';
    this.countdown.setAttribute('data-error',String(!!client.error));
    this.countdown.hidden=!startIn&&!client.error;
    if(ended&&!this.run.won)this.run.victoryTime=0;
    if(this.run.won){
      this.victory.textContent=t(!room?'multiOffline':room.phase==='waiting'?'raceCancelled':ended?'raceResults':'waitingOthers');
      this.back.disabled=!ended;
      const results=this.resultRoom,finished=room?.phase==='results';
      const signature=JSON.stringify([results?.racers,[...this.raceMembers.values()].map(member=>[member.id,member.look.petId]),finished]);
      if(signature!==this.resultSignature){this.resultSignature=signature;this.ranking.replaceChildren(raceResults(results?.racers??[],[...this.raceMembers.values()],client.owner,multi.pets,finished));}
      const remaining=Math.max(0,Math.ceil(((room?.endsAt??client.serverTime)-client.serverTime)/1000));
      this.raceNote.textContent=client.error||!room?t('multiOffline'):finished?t('raceTogether'):room.phase==='waiting'?t('raceCancelled'):remaining?t('raceRemaining').replace('{seconds}',String(remaining)):t('raceChecking');
    }
  }
  override update(seconds: number): void {
    if (this.paused || this.returned) return;
    const keyboard = Number(this.keys.has('ArrowRight') || this.keys.has('KeyD')) - Number(this.keys.has('ArrowLeft') || this.keys.has('KeyA'));
    const axis = this.axis || keyboard;
    const respawns = this.run.respawns;
    if(this.raceStarted||this.run.won)this.run.update(seconds, axis);
    this.network(seconds);
    if (this.run.respawns !== respawns) { this.blur(); this.cameraX = cameraTarget(this.run.x, this.courseEnd); }
    this.elapsed += seconds;
    this.render(seconds, this.run.respawns === respawns ? axis : 0);
    if (this.run.won && !this.completed) {
      this.completed = true;
      if(this.settings?.multiplayer&&this.run.x>=this.run.finish&&this.settings.multiplayer.client.room?.phase!=='results')void this.settings.multiplayer.client.finish(this.pose());
      else if(!this.settings?.multiplayer)this.settings?.complete?.();
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
      this.checkpointFlag.clear().rect(0, 0, 45, 28).fill(active ? '#7dba79' : '#d7c392');
    }
    this.fade.style.opacity = String(Math.max(run.fade, 1 - Math.min(1, this.elapsed / 0.35)));
    if (run.won) this.blur();
  }
  override destroy(options?: DestroyOptions): void {
    if(this.settings?.multiplayer)this.settings.multiplayer.client.pose=undefined;
    this.blur();
    this.localeOff(); this.abort.abort(); this.hud.remove(); super.destroy(options);
  }
}
