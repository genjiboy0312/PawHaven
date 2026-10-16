import { Graphics, type DestroyOptions } from 'pixi.js';
import { Animal } from '../../animals/Animal';
import type { AnimalConfig } from '../../animals/AnimalConfig';
import { Scene } from './Scene';

export class LobbyScene extends Scene {
  private readonly garden = new Graphics();
  private readonly shadow = new Graphics();
  private readonly animal: Animal;
  private readonly controls = document.createElement('section');
  private readonly idleButton = document.createElement('button');
  private readonly walkButton = document.createElement('button');
  private readonly idle = (): void => this.setMode('idle');
  private readonly walk = (): void => this.setMode('walk');

  constructor(config: AnimalConfig) {
    super();
    this.animal = new Animal(config);
    this.addChild(this.garden, this.shadow, this.animal);
    this.controls.className = 'animal-controls';
    this.controls.setAttribute('aria-label', '코기 동작 확인');
    const caption = document.createElement('p');
    caption.textContent = '작은 발걸음, 느긋한 하루';
    this.idleButton.textContent = '쉬기';
    this.walkButton.textContent = '걷기';
    this.idleButton.type = this.walkButton.type = 'button';
    this.idleButton.addEventListener('click', this.idle);
    this.walkButton.addEventListener('click', this.walk);
    this.controls.append(caption, this.idleButton, this.walkButton);
    document.querySelector('#app')?.append(this.controls);
    this.setMode('idle');
  }
  private setMode(mode: 'idle' | 'walk'): void {
    this.animal.play(mode);
    this.idleButton.setAttribute('aria-pressed', String(mode === 'idle'));
    this.walkButton.setAttribute('aria-pressed', String(mode === 'walk'));
  }
  resize(width: number, height: number): void {
    const ground = Math.max(180, height * 0.7);
    this.garden.clear()
      .rect(0, height * 0.45, width, height * 0.55).fill('#c4d6a7')
      .ellipse(width * 0.5, ground + 20, width * 0.46, height * 0.12).fill('#b7ce98');
    this.animal.setBounds(width, ground);
    this.shadow.clear().ellipse(0, 0, 54, 9).fill({ color: '#566840', alpha: 0.13 });
    this.update(0);
  }
  override update(seconds: number): void {
    this.animal.update(seconds);
    this.shadow.position.set(this.animal.x, this.animal.y - 2);
  }
  override destroy(options?: DestroyOptions): void {
    this.idleButton.removeEventListener('click', this.idle);
    this.walkButton.removeEventListener('click', this.walk);
    this.controls.remove();
    super.destroy(options);
  }
}
