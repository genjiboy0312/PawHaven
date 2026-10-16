/** Ten seconds from start to finish at normal speed. */
export class DummyRun {
  readonly speed = 240;
  readonly start = 120;
  readonly finish = 2520;
  x = this.start;
  height = 0;
  direction = 1;
  velocity = 0;
  dash = 0;
  dashCooldown = 0;
  attack = 0;
  victoryTime = -1;
  get won(): boolean { return this.victoryTime >= 0; }
  get returnReady(): boolean { return this.victoryTime >= 1.9; }
  get fade(): number { return Math.max(0, Math.min(1, (this.victoryTime - 1.5) / 0.4)); }
  jump(): void { if (!this.won && this.height === 0) this.velocity = 440; }
  startDash(): void {
    if (!this.won && this.dashCooldown <= 0) { this.dash = 0.22; this.dashCooldown = 0.8; }
  }
  startAttack(): void { if (!this.won) this.attack = 0.3; }
  update(seconds: number, axis: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    if (this.won) { this.victoryTime += seconds; return; }
    const input = Math.max(-1, Math.min(1, axis));
    if (input) this.direction = Math.sign(input);
    this.x = Math.max(this.start, Math.min(this.finish,
      this.x + (this.dash > 0 ? this.direction * 2.5 : input) * this.speed * seconds));
    this.dash = Math.max(0, this.dash - seconds);
    this.dashCooldown = Math.max(0, this.dashCooldown - seconds);
    this.attack = Math.max(0, this.attack - seconds);
    if (this.height > 0 || this.velocity > 0) {
      this.height = Math.max(0, this.height + this.velocity * seconds - 490 * seconds * seconds);
      this.velocity -= 980 * seconds;
      if (this.height === 0) this.velocity = 0;
    }
    if (this.x >= this.finish) { this.victoryTime = 0; this.height = 0; this.velocity = 0; }
  }
}