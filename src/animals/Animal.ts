import { Container } from 'pixi.js';
import type { HomeItem } from '../home/HomeState';
import { HealingDialogue } from './HealingDialogue';
import type { AnimalAction, AnimalConfig } from './AnimalConfig';
import { AnimalAnimationController } from './AnimalAnimationController';
import { AnimalStateMachine } from './AnimalStateMachine';
import { WelcomeSequence } from '../systems/WelcomeSequence';
import type { AnimalVisualState, BehaviorMode } from './AnimalState';

export class Animal extends Container {
  private readonly animation: AnimalAnimationController;
  private readonly behavior: AnimalStateMachine;
  private readonly welcome: WelcomeSequence;
  private readonly dialogue: HealingDialogue;
  private touchCooldown = 0;
  private touches = 0;
  private inHome = false;
  get floorDepth(): number { return this.inHome && !this.welcoming ? this.behavior.depth : this.y; }
  get cushionId(): number | undefined { return this.behavior.restingCushion; }
  get touchBounds() { return this.animation.bodyHitArea; }
  get speechBubble() { return this.animation.welcomeMark; }
  setHome(width: number, height: number, items: readonly HomeItem[]): void {
    this.inHome = true;
    this.behavior.setFloor(width, height, this.y || height * 0.72);
    // Both seats share the approach/rest/sleep lifecycle and touch interruption.
    this.behavior.setCushions(items.filter(item => item.tab === 'Furniture' && (item.option === 4 || item.option === 5))
      .map(item => ({ id: item.id, x: width * item.x, y: height * item.y - (item.option === 5 ? 14 : 8), depth: height * item.y })));
    this.y = this.behavior.y;
  }
  private viewport = { width: 960, height: 540 };
  get state(): AnimalVisualState { return this.welcome.state ?? this.behavior.state; }
  get mode(): BehaviorMode { return this.behavior.mode; }
  get welcoming(): boolean { return this.welcome.active; }

  constructor(private readonly config: AnimalConfig, random: () => number = Math.random, nickname?: () => string | null | undefined) {
    super();
    this.behavior = new AnimalStateMachine(config.speed, config.behavior, random);
    this.welcome = new WelcomeSequence(config.speed, config.welcome);
    this.animation = new AnimalAnimationController(config);
    this.dialogue = new HealingDialogue(random, nickname);
    this.addChild(this.animation.sprite, this.animation.sleepMark, this.animation.welcomeMark);
    this.hitArea = this.animation.bodyHitArea;
    this.interactiveChildren = false;
    this.label = config.id;
  }

  startWelcome(): boolean {
    if (!this.welcome.start()) return false;
    this.behavior.setMode('idle');
    this.update(0);
    return true;
  }
  pet(): boolean {
    if (this.welcoming || this.touchCooldown > 0 || !this.behavior.canPet) return false;
    this.dialogue.start(true);
    this.behavior.pet(Math.max(1.5, this.dialogue.remainingTime));
    this.animation.restart();
    this.touchCooldown = 0.8;
    this.touches++;
    this.update(0);
    return true;
  }
  play(action: AnimalAction): boolean {
    if (this.welcoming || (action !== 'idle' && action !== 'walk') || !this.config.animations[action]) return false;
    this.dialogue.clear();
    this.behavior.setMode(action);
    this.update(0);
    return true;
  }
  resumeAutonomy(): void {
    if (this.welcoming) return;
    this.behavior.setMode('auto');
    this.update(0);
  }
  setBounds(width: number, ground: number, height = ground / 0.72): void {
    this.viewport = { width, height };
    const margin = Math.min(100, width * 0.24);
    const right = Math.max(margin, width - margin);
    this.behavior.setBounds(margin, right);
    this.welcome.setBounds(margin, right);
    this.x = this.welcoming ? this.welcome.x : this.behavior.x;
    if (this.inHome) this.y = this.behavior.y;
    this.y = ground;
  }
  update(seconds: number): void {
    if (Number.isFinite(seconds) && seconds > 0) {
      this.touchCooldown = Math.max(0, this.touchCooldown - seconds);
    }
    this.dialogue.update(seconds);
    if (this.welcoming) {
      this.welcome.update(seconds);
      this.behavior.setPosition(this.welcome.x, this.welcome.direction);
      if (!this.welcoming) this.behavior.setMode('auto');
    } else this.behavior.update(seconds);
    this.x = this.welcoming ? this.welcome.x : this.behavior.x;
    if (this.inHome) this.y = this.behavior.y;
    this.animation.update(
      this.state,
      this.welcoming ? this.welcome.elapsed : this.behavior.elapsed,
      this.welcoming ? this.welcome.direction : this.behavior.direction,
      this.welcoming ? 0 : this.behavior.progress,
      this.welcoming ? 0 : this.behavior.jumpHeight,
      seconds,
      undefined,
      undefined,
      this.dialogue.active ? { message: this.dialogue.message, remaining: this.dialogue.remainingTime, reaction: this.touches % 2 ? '♡' : '♪' } : undefined,
    );
    this.animation.welcomeMark.fitToViewport(this.x, this.y, this.viewport.width, this.viewport.height);

  }
}
