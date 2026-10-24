import { Container, Graphics, Text, type DestroyOptions } from 'pixi.js';
import { GAME_FONT } from '../ui/GameFont';

// Conservative font widths keep layout deterministic before Pixi creates a canvas.
const glyphWidth = (char: string): number => char === ' ' ? 5 : char.charCodeAt(0) > 255 ? 18 : 10;
const lineWidth = (line: string): number => Array.from(line).reduce((sum, char) => sum + glyphWidth(char), 0);

export function wrapSpeech(message: string, maxWidth = 272): string {
  const lines: string[] = [];
  for (const paragraph of message.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && lineWidth(line + ' ' + word) > maxWidth) { lines.push(line.trimEnd()); line = ''; }
      for (const char of Array.from(word)) {
        if (line && lineWidth(line + char) > maxWidth) { lines.push(line.trimEnd()); line = ''; }
        line += char;
      }
      // Preserve spaces between words while allowing a long future nickname to wrap.
      line += ' ';
    }
    lines.push(line.trimEnd());
  }
  return lines.join('\n');
}

/** Appearance and viewport placement are independent from dialogue content/timing. */
export class SpeechBubble extends Container {
  private readonly plate = new Graphics();
  private readonly tail = new Graphics();
  private readonly caption = new Text({
    text: '', style: { fontFamily: GAME_FONT, fontSize: 18, fontWeight: '400', lineHeight: 25, align: 'center', fill: '#59605b' },
  });
  private readonly reaction = new Text({
    text: '', style: { fontFamily: GAME_FONT, fontSize: 22, fill: '#c5838a' },
  });
  private reactionAge = 0;
  get reactionText(): string { return this.reaction.text; }
  private tailX = NaN;
  private age = 0;
  private source = '';
  private bubbleWidth = 40;
  get halfWidth(){return this.bubbleWidth/2;}
  halfHeight = 18;
  get text(): string { return this.source; }
  get displayText(): string { return this.caption.text; }

  constructor() {
    super();
    this.caption.anchor.set(0.5);
    this.reaction.anchor.set(0.5);
    this.addChild(this.plate, this.tail, this.caption, this.reaction);
    this.visible = false;
    this.eventMode = 'none';
  }

  present(message: string, seconds: number, hold = false, lifetime = 1.1, remaining?: number, reaction = ''): void {
    const changed = message !== this.source;
    if (changed) {
      this.source = message;
      const wrapped = wrapSpeech(message);
      this.caption.text = wrapped;
      this.age = 0;
      const lines = wrapped.split('\n');
      this.bubbleWidth = Math.max(40, ...lines.map(line => lineWidth(line) + 24));
      const header = lines.length > 1 ? 28 : 0;
      this.halfHeight = lines.length === 1 ? 18 : (lines.length * 25 + 20 + header) / 2;
      this.caption.y = header / 2;
      this.reaction.y = -this.halfHeight + 19;
      this.plate.clear().roundRect(-this.bubbleWidth / 2, -this.halfHeight, this.bubbleWidth, this.halfHeight * 2, 10)
        .fill('#ffffff').stroke({ color: '#a9afaa', width: 1.3 });
      this.tailX = NaN;
      this.drawTail(0);
    }
    if (!changed && Number.isFinite(seconds) && seconds > 0) this.age += seconds;
    if (reaction !== this.reaction.text) { this.reaction.text = reaction; this.reactionAge = 0; }
    else if (Number.isFinite(seconds) && seconds > 0) this.reactionAge += seconds;
    this.reaction.visible = !!reaction;
    const pop = Math.min(1, this.reactionAge / 0.25);
    this.reaction.scale.set(1 + Math.sin(pop * Math.PI) * 0.22);
    const end = hold ? Infinity : lifetime;
    const timeLeft = remaining ?? end - this.age;
    this.visible = !!message && timeLeft > 0;
    this.alpha = Math.max(0, Math.min(1, timeLeft / 0.25));
    const entrance = Math.min(1, this.age / 0.14);
    this.scale.set(0.9 + 0.1 * (1 - (1 - entrance) ** 3));
  }

  fitToViewport(animalX: number, animalY: number, width: number, height: number): void {
    const halfWidth = this.bubbleWidth / 2 + 12, halfHeight = this.halfHeight + 12;
    const targetX = Math.max(halfWidth, Math.min(width - halfWidth, animalX + this.x));
    this.x = targetX - animalX;
    this.y = Math.max(halfHeight - animalY, Math.min(height - halfHeight - animalY, this.y));
    this.drawTail(Math.max(-this.bubbleWidth / 2 + 16, Math.min(this.bubbleWidth / 2 - 16, -this.x)));
  }

  private drawTail(x: number): void {
    if (x === this.tailX) return;
    this.tailX = x;
    const y = this.halfHeight;
    this.tail.clear().moveTo(x - 6, y - 1).lineTo(x, y + 8).lineTo(x + 6, y - 1).fill('#ffffff')
      .moveTo(x - 6, y).lineTo(x, y + 8).lineTo(x + 6, y).stroke({ color: '#a9afaa', width: 1.3 });
  }

  override destroy(options?: DestroyOptions): void {
    super.destroy({ ...(typeof options === 'object' ? options : {}), children: true });
  }
}
