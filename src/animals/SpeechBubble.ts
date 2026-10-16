import { Container, Graphics, Text, type DestroyOptions } from 'pixi.js';

/** Screen-upright expression bubble shared by lobby and character previews. */
export class SpeechBubble extends Container {
  private readonly plate = new Graphics();
  private readonly caption = new Text({
    text: '', style: { fontFamily: 'system-ui, sans-serif', fontSize: 18, fontWeight: '600', fill: '#59605b' },
  });
  private age = 0;
  get text(): string { return this.caption.text; }

  constructor() {
    super();
    this.caption.anchor.set(0.5);
    this.addChild(this.plate, this.caption);
    this.visible = false;
    this.eventMode = 'none';
  }

  present(message: string, seconds: number, hold = false): void {
    const changed = message !== this.text;
    if (changed) {
      this.caption.text = message;
      this.age = 0;
      // Avoid measuring a canvas: symbols and localized greetings have bounded widths.
      const width = Math.min(240, Math.max(40, Array.from(message).reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 18 : 10), 24)));
      this.plate.clear()
        .roundRect(-width / 2, -18, width, 36, 10).fill('#ffffff').stroke({ color: '#a9afaa', width: 1.3 })
        .moveTo(-5, 17).lineTo(1, 25).lineTo(7, 17).fill('#ffffff')
        .moveTo(-5, 18).lineTo(1, 25).lineTo(7, 18).stroke({ color: '#a9afaa', width: 1.3 });
    }
    if (!changed && Number.isFinite(seconds) && seconds > 0) this.age += seconds;
    const lifetime = hold ? Infinity : 1.1;
    this.visible = !!message && this.age < lifetime;
    this.alpha = Math.max(0, Math.min(1, (lifetime - this.age) / 0.2));
    const entrance = Math.min(1, this.age / 0.14);
    this.scale.set(0.9 + 0.1 * (1 - (1 - entrance) ** 3));
  }

  override destroy(options?: DestroyOptions): void {
    super.destroy(typeof options === 'boolean' ? { children: true, texture: options, textureSource: options } : { ...options, children: true });
  }
}
