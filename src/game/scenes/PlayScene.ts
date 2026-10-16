import { bindAria, bindText, onLanguageChange, t, type TextKey } from '../../settings/i18n';
import type { GamePreferences } from '../../settings/GameSettings';
import { Container, Graphics, Text, type DestroyOptions } from 'pixi.js';
import { AnimalEffects } from '../../animals/AnimalEffects';
import { AnimalAnimationController } from '../../animals/AnimalAnimationController';
import type { AnimalConfig } from '../../animals/AnimalConfig';
import { DummyRun } from '../DummyRun';
import { COURSE_GROUND, TRAINING_COURSE } from '../TrainingCourse';
import { cameraTarget, PLAY_GROUND_Y, PLAY_ZOOM } from '../PlayCamera';
import { Scene } from './Scene';

export class PlayScene extends Scene {
  private readonly run = new DummyRun(TRAINING_COURSE, 1 / PLAY_ZOOM);
  private readonly courseEnd = Math.max(...this.run.course.map(solid => solid.x + solid.width));
  private readonly labels: { text: Text; key: 'start' | 'finish' }[] = [];
  private readonly localeOff: () => void;
  private readonly world = new Container();
  private readonly pet = new Container();
  private readonly effect: AnimalEffects;
  private readonly animation: AnimalAnimationController;
  private readonly hud = document.createElement('section');
  private readonly victory = document.createElement('p');
  private readonly fade = document.createElement('div');
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

  constructor(config: AnimalConfig, private readonly onReturn: () => void, private readonly settings?: { open: () => void; sound?: (kind: 'jump' | 'dash' | 'attack') => void; preferences?: () => GamePreferences }) {
    super();
    this.localeOff = onLanguageChange(() => this.labels.forEach(label => { label.text.text = t(label.key); }));
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
    for (const [x, label] of [[120, 'start'], [2520, 'finish']] as const) {
      const flag = new Text({ text: t(label), style: { fontFamily: 'system-ui', fontSize: 23, fontWeight: 'bold', fill: '#455b3b' } });
      this.labels.push({ text: flag, key: label });
      flag.position.set(x - 40, 240);
      this.world.addChild(new Graphics().rect(x, 275, 5, 115).fill('#657653'), flag);
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
    this.hud.append(this.stick, actions, settingsButton, this.victory, this.fade);
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
  private act(kind: 'jump' | 'dash' | 'attack'): void {
    if (this.paused || this.run.won) return;
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
  override update(seconds: number): void {
    if (this.paused) return;
    const keyboard = Number(this.keys.has('ArrowRight') || this.keys.has('KeyD')) - Number(this.keys.has('ArrowLeft') || this.keys.has('KeyA'));
    const axis = this.axis || keyboard;
    const respawns = this.run.respawns;
    this.run.update(seconds, axis);
    if (this.run.respawns !== respawns) { this.blur(); this.cameraX = 0; }
    this.elapsed += seconds;
    this.render(seconds, this.run.respawns === respawns ? axis : 0);
    if (this.run.returnReady && !this.returned) { this.returned = true; this.onReturn(); }
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
    this.fade.style.opacity = String(run.fade);
    if (run.won) this.blur();
  }
  override destroy(options?: DestroyOptions): void {
    this.blur();
    this.localeOff(); this.abort.abort(); this.hud.remove(); super.destroy(options);
  }
}