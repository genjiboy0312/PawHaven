import { Container, Sprite, Texture } from 'pixi.js';
import type { AnimalConfig } from './AnimalConfig';

/** Independent raster effects keep their own padded bounds outside the body sprite. */
export class AnimalEffects extends Container {
  private readonly swipe = new Sprite(Texture.EMPTY);
  private readonly dust = new Sprite(Texture.EMPTY);
  readonly ghosts = Array.from({ length: 3 }, () => new Sprite(Texture.EMPTY));
  constructor(private readonly frames: AnimalConfig['effects']) {
    super();
    this.swipe.anchor.set(0.5); this.dust.anchor.set(0.5);
    this.addChild(this.dust, this.swipe);
    this.swipe.visible = this.dust.visible = false;
    for (const ghost of this.ghosts) { ghost.visible = false; ghost.tint = '#ffe1b3'; }
  }
  update(action: string, progress: number, direction: number, body: Sprite, speed: number): void {
    const attack = action === 'attack', dash = action === 'skill';
    for (const [name, sprite, visible, width, x, y] of [
      ['attack', this.swipe, attack, 190, 85, -72],
      ['skill', this.dust, dash, 270, -95, -35],
    ] as const) {
      const frames = this.frames?.[name];
      sprite.visible = visible && !!frames?.length;
      if (sprite.visible && frames) {
        sprite.texture = frames[Math.min(frames.length - 1, Math.floor(Math.max(0, progress) * frames.length))];
        const scale = width / sprite.texture.orig.width;
        sprite.scale.set(direction * scale, scale);
        sprite.position.set(direction * x, y);
      }
    }
    this.ghosts.forEach((ghost, index) => {
      ghost.visible = dash;
      if (!dash) return;
      ghost.texture = body.texture;
      ghost.anchor.copyFrom(body.anchor);
      ghost.scale.copyFrom(body.scale);
      ghost.position.set(body.x - direction * Math.max(25, Math.abs(speed) * 0.045) * (index + 1), body.y);
      ghost.alpha = (0.19 - index * 0.045) * Math.min(1, Math.max(0, 1 - progress) * 4);
    });
  }
}