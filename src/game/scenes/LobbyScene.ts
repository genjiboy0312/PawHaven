import { Graphics } from 'pixi.js';
import { Scene } from './Scene';

export class LobbyScene extends Scene {
  private readonly garden = new Graphics();
  constructor() {
    super();
    this.addChild(this.garden);
  }
  resize(width: number, height: number): void {
    this.garden.clear()
      .rect(0, height * 0.45, width, height * 0.55).fill('#c4d6a7')
      .ellipse(width * 0.5, height * 0.78, width * 0.46, height * 0.12).fill('#b7ce98');
  }
}

