import { Graphics, type DestroyOptions } from 'pixi.js';
import { Scene } from './Scene';

export class TitleScene extends Scene {
  private readonly backdrop = new Graphics();
  private readonly overlay = document.createElement('section');
  private readonly button = document.createElement('button');
  private activated = false;
  private readonly begin = (): void => {
    if (this.activated || this.destroyed) return;
    this.activated = true;
    this.button.disabled = true;
    this.onStart();
  };

  constructor(private readonly onStart: () => void) {
    super();
    this.addChild(this.backdrop);
    this.overlay.className = 'title-screen';
    this.overlay.setAttribute('aria-label', 'Paw Haven 타이틀');
    const copy = document.createElement('header');
    copy.className = 'title-copy';
    const title = document.createElement('h1');
    title.textContent = 'Paw Haven';
    const subtitle = document.createElement('p');
    subtitle.textContent = 'Welcome Home';
    copy.append(title, subtitle);
    this.button.className = 'title-start';
    this.button.type = 'button';
    this.button.setAttribute('aria-label', '터치하거나 클릭해서 정원에 들어가기');
    const prompt = document.createElement('span');
    prompt.textContent = '화면을 터치해 시작하세요';
    this.button.append(prompt);
    this.button.addEventListener('click', this.begin);
    this.overlay.append(copy, this.button);
    document.querySelector('#app')?.append(this.overlay);
  }
  resize(width: number, height: number): void {
    this.backdrop.clear().rect(0, 0, width, height).fill('#edf0df');
  }
  override destroy(options?: DestroyOptions): void {
    this.button.removeEventListener('click', this.begin);
    this.overlay.remove();
    super.destroy(options);
  }
}
