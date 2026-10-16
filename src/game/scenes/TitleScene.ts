import { Graphics, type DestroyOptions } from 'pixi.js';
import { AnimalAnimationController } from '../../animals/AnimalAnimationController';
import type { AnimalConfig } from '../../animals/AnimalConfig';
import { Scene } from './Scene';

export class TitleScene extends Scene {
  private readonly garden = new Graphics();
  private readonly portrait: AnimalAnimationController;
  private readonly overlay = document.createElement('section');
  private readonly button = document.createElement('button');
  private elapsed = 0;
  private activated = false;
  private readonly begin = (): void => {
    if (this.activated || this.destroyed) return;
    this.activated = true;
    this.button.disabled = true;
    this.onStart();
  };

  constructor(config: AnimalConfig, private readonly onStart: () => void) {
    super();
    this.portrait = new AnimalAnimationController(config);
    this.addChild(this.garden, this.portrait.sprite, this.portrait.sleepMark, this.portrait.welcomeMark);
    this.overlay.className = 'title-screen';
    this.overlay.setAttribute('aria-label', 'Paw Haven 타이틀');
    const copy = document.createElement('header');
    copy.className = 'title-copy';
    const title = document.createElement('h1');
    title.textContent = 'Paw Haven';
    const subtitle = document.createElement('p');
    subtitle.textContent = 'Welcome Home';
    const description = document.createElement('p');
    description.className = 'title-description';
    description.textContent = '당신을 기다리는 작은 정원';
    copy.append(title, subtitle, description);
    this.button.className = 'title-start';
    this.button.type = 'button';
    this.button.setAttribute('aria-label', '터치하거나 클릭해서 정원에 들어가기');
    const prompt = document.createElement('span');
    prompt.textContent = '화면을 터치해 시작하세요';
    this.button.append(prompt);
    this.button.addEventListener('click', this.begin);
    this.overlay.append(copy, this.button);
    const host = document.querySelector('#app');
    host?.classList.add('is-title');
    host?.append(this.overlay);
  }
  resize(width: number, height: number): void {
    const ground = height * 0.65;
    this.garden.clear()
      .rect(0, height * 0.5, width, height * 0.5).fill('#d1dfb7')
      .ellipse(width / 2, ground + 15, Math.min(width * 0.4, 330), height * 0.09).fill('#bed19f');
    this.portrait.sprite.position.set(width / 2, ground);
    const scale = height < 420 ? 0.48 : 0.8;
    this.portrait.sprite.scale.set(scale);
  }
  override update(seconds: number): void {
    this.elapsed += seconds;
    // Retain the scale chosen for the current viewport.
    const scale = this.portrait.sprite.scale.x;
    this.portrait.update('IDLE', this.elapsed, 1);
    this.portrait.sprite.scale.set(scale);
  }
  override destroy(options?: DestroyOptions): void {
    this.button.removeEventListener('click', this.begin);
    this.overlay.remove();
    document.querySelector('#app')?.classList.remove('is-title');
    super.destroy(options);
  }
}
