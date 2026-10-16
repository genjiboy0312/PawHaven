import { type DestroyOptions } from 'pixi.js';
import { Scene } from './Scene';

/** DOM lettering responds to webfont loading without caching a fallback canvas font. */
export class BootScene extends Scene {
  private readonly caption = document.createElement('p');
  constructor() {
    super();
    this.caption.className = 'boot-brand';
    this.caption.textContent = 'Paw Haven';
    document.querySelector('#app')?.append(this.caption);
  }
  resize(_width: number, _height: number): void {}
  override destroy(options?: DestroyOptions): void { this.caption.remove(); super.destroy(options); }
}
