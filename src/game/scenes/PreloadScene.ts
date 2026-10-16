import { Graphics, Text } from 'pixi.js';
import { Scene } from './Scene';

export class PreloadScene extends Scene {
  private readonly caption = new Text({
    text: '정원을 준비하고 있어요…',
    style: { fontFamily: 'system-ui, sans-serif', fontSize: 18, fill: '#344b38' },
  });
  private readonly bar = new Graphics();
  private progress = 0;
  private viewWidth = 0;
  private viewHeight = 0;
  constructor() {
    super();
    this.caption.anchor.set(0.5);
    this.addChild(this.caption, this.bar);
  }
  setProgress(value: number): void {
    this.progress = Math.max(0, Math.min(value, 1));
    this.resize(this.viewWidth, this.viewHeight);
  }
  resize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
    this.caption.position.set(width / 2, height / 2 - 24);
    const size = Math.min(240, width - 48);
    this.bar.clear()
      .roundRect((width - size) / 2, height / 2 + 8, size, 6, 3).fill('#bdcbaa');
    if (this.progress > 0) {
      this.bar.roundRect((width - size) / 2, height / 2 + 8, size * this.progress, 6, 3).fill('#6a8654');
    }
  }
}


