import { bindText } from '../../settings/i18n';
import { Graphics, type DestroyOptions } from 'pixi.js';
import { Scene } from './Scene';

export class PreloadScene extends Scene {
  private readonly caption = document.createElement('p');
  private readonly bar = new Graphics();
  private progress = 0;
  private viewWidth = 0;
  private viewHeight = 0;
  constructor() {
    super();
    this.caption.className = 'loading-caption';
    this.caption.setAttribute('role', 'status');
    bindText(this.caption, 'loading');
    document.querySelector('#app')?.append(this.caption);
    this.addChild(this.bar);
  }
  override destroy(options?: DestroyOptions): void { this.caption.remove(); super.destroy(options); }
  setProgress(value: number): void {
    this.progress = Math.max(0, Math.min(value, 1));
    this.resize(this.viewWidth, this.viewHeight);
  }
  resize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
    const size = Math.max(0, Math.min(240, width - 48));
    this.bar.clear()
      .roundRect((width - size) / 2, height / 2 + 8, size, 8, 4).fill('#e6d8b3');
    if (this.progress > 0) {
      this.bar.roundRect((width - size) / 2, height / 2 + 8, size * this.progress, 8, 4).fill('#abc97b');
    }
  }
}


