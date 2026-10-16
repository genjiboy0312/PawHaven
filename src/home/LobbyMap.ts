import { Container, Graphics } from 'pixi.js';
import { SKY_COLORS, FLOOR_COLORS, type HomeLook } from './HomeState';

/** Same map renderer for the lobby and the pet-free Home editor. */
export class LobbyMap extends Container {
  private readonly paint = new Graphics();
  constructor() { super(); this.addChild(this.paint); this.label = 'lobby-map'; }
  draw(width: number, height: number, look: HomeLook): void {
    const ground = height * 0.72, g = this.paint;
    g.clear().rect(0, 0, width, height).fill(SKY_COLORS[look.Background])
      .rect(0, height * 0.44, width, height * 0.56).fill(FLOOR_COLORS[look.Floor]);
    if (look.Background) {
      g.circle(width * 0.22, height * 0.2, 32).fill({ color: '#fff8df', alpha: 0.8 });
      g.ellipse(width * 0.45, height * 0.44, width * 0.3, height * 0.12).fill({ color: '#95ac89', alpha: 0.18 });
    }
    const x = width * 0.21, y = ground - 10;
    if (look.Furniture === 1) {
      g.roundRect(x - 70, y - 65, 140, 30, 5).fill('#aa8d6a')
        .rect(x - 75, y - 28, 150, 12).fill('#947957').rect(x - 58, y - 16, 9, 25).fill('#806e54').rect(x + 49, y - 16, 9, 25).fill('#806e54');
    } else if (look.Furniture === 2) {
      g.poly([x - 25, y - 20, x + 25, y - 20, x + 18, y + 12, x - 18, y + 12]).fill('#b18e7e')
        .ellipse(x - 16, y - 45, 17, 29).fill('#7f9b72').ellipse(x + 12, y - 52, 18, 36).fill('#95ad80');
    } else if (look.Furniture === 3) {
      g.ellipse(x, y - 35, 68, 18).fill('#b79d77').rect(x - 48, y - 28, 10, 40).fill('#8e795f').rect(x + 38, y - 28, 10, 40).fill('#8e795f');
    } else if (look.Furniture === 4) {
      g.roundRect(x - 67, y - 30, 134, 48, 20).fill('#ad9da8').ellipse(x, y - 8, 52, 17).fill('#dfd4d9');
    }
    const ex = width * 0.47;
    if (look.Etc === 1) {
      for (const offset of [-30, 0, 30]) {
        g.rect(ex + offset - 2, y - 12, 4, 29).fill('#7d986c');
        for (const [dx, dy] of [[-8, 0], [8, 0], [0, -8], [0, 8]]) g.circle(ex + offset + dx, y - 18 + dy, 7).fill('#d7a7ab');
        g.circle(ex + offset, y - 18, 5).fill('#eee0a0');
      }
    } else if (look.Etc === 2) {
      g.ellipse(ex, y + 12, 64, 15).fill('#c9b5a1');
      for (const offset of [-32, 0, 32]) g.ellipse(ex + offset, y + 7, 13, 8).fill('#e2d7c4');
    } else if (look.Etc === 3) {
      g.rect(ex - 4, y - 85, 8, 100).fill('#8b806a').roundRect(ex - 19, y - 93, 38, 40, 7).fill('#e6d39b');
    } else if (look.Etc === 4) {
      for (const offset of [-55, -20, 15, 50]) g.roundRect(ex + offset, y - 46, 12, 60, 3).fill('#ded5be');
      g.rect(ex - 60, y - 28, 130, 8).fill('#c9bea4');
    }
  }
}