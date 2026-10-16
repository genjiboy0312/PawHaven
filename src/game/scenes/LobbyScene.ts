import { Graphics, type DestroyOptions } from 'pixi.js';
import { Animal } from '../../animals/Animal';
import type { AnimalConfig } from '../../animals/AnimalConfig';
import type { AnimalVisualState, BehaviorMode } from '../../animals/AnimalState';
import { Scene } from './Scene';

const STATE_MESSAGES: Record<AnimalVisualState, string> = {
  NOTICE: '코기가 당신을 알아봤어요',
  APPROACH: '반가운 발걸음으로 다가와요',
  GREET: '어서 와요, 기다리고 있었어요',
  IDLE: '코기가 느긋하게 쉬고 있어요',
  WANDER: '코기가 정원을 산책하고 있어요',
  REST: '코기가 잠시 눈을 붙이고 있어요',
  SLEEP: '코기가 새근새근 자고 있어요',
  OBSERVE: '코기가 주변을 둘러보고 있어요',
};

export class LobbyScene extends Scene {
  private readonly garden = new Graphics();
  private readonly shadow = new Graphics();
  private readonly animal: Animal;
  private readonly controls = document.createElement('section');
  private readonly caption = document.createElement('p');
  private readonly buttons = new Map<BehaviorMode, HTMLButtonElement>();
  private readonly buttonCleanups: (() => void)[] = [];
  private previousState: AnimalVisualState | undefined;
  private welcomeStarted = false;

  constructor(config: AnimalConfig) {
    super();
    this.animal = new Animal(config);
    this.addChild(this.garden, this.shadow, this.animal);
    this.controls.className = 'animal-controls';
    this.controls.setAttribute('aria-label', '코기 생활');
    this.caption.setAttribute('role', 'status');
    this.controls.append(this.caption);
    const buttonBar = document.createElement('div');
    buttonBar.className = 'behavior-buttons';
    this.controls.append(buttonBar);
    const modes: [BehaviorMode, string][] = [['auto', '자유롭게'], ['idle', '쉬기'], ['walk', '걷기']];
    for (const [mode, label] of modes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      const listener = (): void => this.setMode(mode);
      button.addEventListener('click', listener);
      this.buttonCleanups.push(() => button.removeEventListener('click', listener));
      this.buttons.set(mode, button);
      buttonBar.append(button);
    }
    document.querySelector('#app')?.append(this.controls);
    this.setMode('auto');
  }
  private setMode(mode: BehaviorMode): void {
    if (this.animal.welcoming) return;
    if (mode === 'auto') this.animal.resumeAutonomy();
    else this.animal.play(mode);
    for (const [key, button] of this.buttons) {
      button.setAttribute('aria-pressed', String(key === mode));
    }
    this.update(0);
  }
  resize(width: number, height: number): void {
    const ground = Math.max(180, height * 0.7);
    this.garden.clear()
      .rect(0, height * 0.45, width, height * 0.55).fill('#c4d6a7')
      .ellipse(width * 0.5, ground + 20, width * 0.46, height * 0.12).fill('#b7ce98');
    this.animal.setBounds(width, ground);
    if (!this.welcomeStarted) {
      this.welcomeStarted = true;
      this.animal.startWelcome();
    }
    this.shadow.clear().ellipse(0, 0, 54, 9).fill({ color: '#566840', alpha: 0.13 });
    this.update(0);
  }
  override update(seconds: number): void {
    this.animal.update(seconds);
    for (const button of this.buttons.values()) button.disabled = this.animal.welcoming;
    this.shadow.position.set(this.animal.x, this.animal.y - 2);
    if (this.previousState !== this.animal.state) {
      this.caption.textContent = STATE_MESSAGES[this.animal.state];
      this.previousState = this.animal.state;
    }
  }
  override destroy(options?: DestroyOptions): void {
    for (const cleanup of this.buttonCleanups) cleanup();
    this.buttonCleanups.length = 0;
    this.controls.remove();
    super.destroy(options);
  }
}
