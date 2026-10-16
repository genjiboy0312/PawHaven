import { Container, Graphics, Text, type DestroyOptions } from 'pixi.js';
import { AnimalAnimationController } from '../../animals/AnimalAnimationController';
import type { AnimalConfig } from '../../animals/AnimalConfig';
import { DummyRun } from '../DummyRun';
import { Scene } from './Scene';

export class PlayScene extends Scene {
  private readonly run = new DummyRun();
  private readonly world = new Container();
  private readonly pet = new Container();
  private readonly effect = new Graphics();
  private readonly animation: AnimalAnimationController;
  private readonly hud = document.createElement('section');
  private readonly victory = document.createElement('p');
  private readonly fade = document.createElement('div');
  private readonly stick = document.createElement('button');
  private readonly knob = document.createElement('span');
  private readonly keys = new Set<string>();
  private readonly abort = new AbortController();
  private axis = 0;
  private pointer: number | undefined;
  private elapsed = 0;
  private cameraX = 0;
  private returned = false;
  private readonly blur = (): void => { this.keys.clear(); this.axis = 0; this.pointer = undefined; this.knob.style.transform = ''; };

  constructor(config: AnimalConfig, private readonly onReturn: () => void) {
    super();
    this.animation = new AnimalAnimationController(config);
    this.addChild(new Graphics().rect(0, 0, 960, 540).fill('#dcebdc'), this.world);
    this.world.addChild(new Graphics().rect(0, 390, 2850, 150).fill('#b5cd99')
      .rect(0, 390, 2850, 6).fill('#78905c'));
    for (let x = 120; x <= 2520; x += 240) {
      this.world.addChild(new Graphics().rect(x, 410, 90, 3).fill('#90aa73'));
    }
    for (const [x, label] of [[120, 'START'], [2520, 'FINISH']] as const) {
      const flag = new Text({ text: label, style: { fontFamily: 'system-ui', fontSize: 23, fontWeight: 'bold', fill: '#455b3b' } });
      flag.position.set(x - 40, 240);
      this.world.addChild(new Graphics().rect(x, 275, 5, 115).fill('#657653'), flag);
    }
    this.world.addChild(this.pet);
    this.pet.addChild(this.animation.sprite, this.animation.sleepMark, this.animation.welcomeMark, this.effect);
    this.hud.className = 'play-hud';
    this.hud.setAttribute('aria-label', 'Game controls');
    this.stick.className = 'play-stick';
    this.stick.type = 'button';
    this.stick.setAttribute('aria-label', 'Movement joystick');
    this.knob.className = 'stick-knob';
    this.stick.append(this.knob);
    const actions = document.createElement('div');
    actions.className = 'play-actions';
    actions.append(this.button('Attack', () => this.run.startAttack()), this.button('Dash', () => this.run.startDash()), this.button('Jump', () => this.run.jump()));
    const settings = this.button('Settings');
    settings.classList.add('play-settings');
    settings.disabled = true;
    this.victory.className = 'play-victory';
    this.victory.textContent = 'Victory!';
    this.victory.hidden = true;
    this.victory.setAttribute('role', 'status');
    this.fade.className = 'scene-fade';
    this.fade.style.opacity = '0';
    this.hud.append(this.stick, actions, settings, this.victory, this.fade);
    document.querySelector('#app')?.append(this.hud);
    const signal = this.abort.signal;
    const move = (event: PointerEvent): void => {
      if (event.pointerId !== this.pointer) return;
      const rect = this.stick.getBoundingClientRect();
      const rotated = window.matchMedia('(orientation: portrait) and (any-pointer: coarse)').matches;
      const distance = rotated ? event.clientY - rect.top - rect.height / 2 : event.clientX - rect.left - rect.width / 2;
      this.axis = Math.max(-1, Math.min(1, distance / ((rotated ? rect.height : rect.width) * 0.3)));
      if (Math.abs(this.axis) < 0.12) this.axis = 0;
      this.knob.style.transform = `translateX(${this.axis * 65}%)`;
    };
    this.stick.addEventListener('pointerdown', (event) => {
      if (this.pointer !== undefined) return;
      this.pointer = event.pointerId; this.stick.setPointerCapture(event.pointerId); move(event);
    }, { signal });
    this.stick.addEventListener('pointermove', move, { signal });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      this.stick.addEventListener(name, (event) => { if (event.pointerId === this.pointer) this.blur(); }, { signal });
    }
    window.addEventListener('blur', this.blur, { signal });
    window.addEventListener('resize', this.blur, { signal });
    document.addEventListener('visibilitychange', this.blur, { signal });
    window.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyA', 'KeyD', 'KeyW', 'ShiftLeft', 'ShiftRight', 'KeyJ'].includes(event.code)) return;
      event.preventDefault(); this.keys.add(event.code);
      if (event.repeat) return;
      if (['Space', 'KeyW', 'ArrowUp'].includes(event.code)) this.run.jump();
      if (event.code.startsWith('Shift')) this.run.startDash();
      if (event.code === 'KeyJ') this.run.startAttack();
    }, { signal });
    window.addEventListener('keyup', (event) => { this.keys.delete(event.code); }, { signal });
  }
  private button(label: string, action?: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'play-circle'; button.textContent = label;
    button.addEventListener('pointerdown', (event) => { event.preventDefault(); action?.(); }, { signal: this.abort.signal });
    button.addEventListener('click', (event) => { if (event.detail === 0) action?.(); }, { signal: this.abort.signal });
    return button;
  }
  resize(_width: number, _height: number): void { this.render(0, 0); }
  override update(seconds: number): void {
    const keyboard = Number(this.keys.has('ArrowRight') || this.keys.has('KeyD')) - Number(this.keys.has('ArrowLeft') || this.keys.has('KeyA'));
    const axis = this.axis || keyboard;
    this.run.update(seconds, axis);
    this.elapsed += seconds;
    this.render(seconds, axis);
    if (this.run.returnReady && !this.returned) { this.returned = true; this.onReturn(); }
  }
  private render(seconds: number, axis: number): void {
    const run = this.run;
    const target = Math.max(0, Math.min(run.finish - 740, run.x - 280));
    this.cameraX += (target - this.cameraX) * (1 - Math.exp(-7 * seconds));
    this.world.x = -this.cameraX;
    this.pet.position.set(run.x, 390 - run.height);
    const action = run.action(axis);
    const progress = action === 'attack' ? 1 - run.attack / run.attackDuration
      : action === 'skill' ? 1 - run.dash / run.dashDuration
      : action === 'land' ? 1 - run.land / 0.16
      : action === 'jump' ? Math.min(0.49, Math.max(0, (440 - run.velocity) / 880)) : undefined;
    this.animation.update('IDLE', this.elapsed, run.direction, 0, 0, seconds, action, progress);
    this.effect.clear();
    if (!run.won && run.attack > 0) {
      this.effect.arc(run.direction * 65, -65, 48, -1.1, 1.1).stroke({ color: '#fff9e5', width: 7, alpha: 0.85 });
    }
    if (!run.won && run.dash > 0) {
      for (let i = 0; i < 3; i++) {
        this.effect.moveTo(-run.direction * 65, -32 - i * 18)
          .lineTo(-run.direction * (110 + i * 15), -32 - i * 18)
          .stroke({ color: '#fff9e5', width: 4, alpha: 0.7 });
      }
    }
    this.victory.hidden = !run.won;
    this.fade.style.opacity = String(run.fade);
    if (run.won) this.blur();
  }
  override destroy(options?: DestroyOptions): void {
    this.abort.abort(); this.hud.remove(); super.destroy(options);
  }
}