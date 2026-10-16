import { Text } from 'pixi.js';
import { Scene } from './Scene';

export class BootScene extends Scene {
  private readonly caption = new Text({
    text: 'Paw Haven',
    style: { fontFamily: 'Georgia, serif', fontSize: 36, fill: '#344b38' },
  });
  constructor() {
    super();
    this.caption.anchor.set(0.5);
    this.addChild(this.caption);
  }
  resize(width: number, height: number): void {
    this.caption.position.set(width / 2, height / 2);
  }
}


