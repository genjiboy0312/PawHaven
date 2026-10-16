import { Container } from 'pixi.js';
import type { AnimalAction, AnimalConfig } from './AnimalConfig';
import { AnimalAnimationController } from './AnimalAnimationController';
import { AnimalStateMachine } from './AnimalStateMachine';
import { WelcomeSequence } from '../systems/WelcomeSequence';
import type { AnimalVisualState, BehaviorMode } from './AnimalState';

export class Animal extends Container {
  private readonly animation: AnimalAnimationController;
  private readonly behavior: AnimalStateMachine;
  private readonly welcome: WelcomeSequence;
  get state(): AnimalVisualState { return this.welcome.state ?? this.behavior.state; }
  get mode(): BehaviorMode { return this.behavior.mode; }
  get welcoming(): boolean { return this.welcome.active; }

  constructor(private readonly config: AnimalConfig, random: () => number = Math.random) {
    super();
    this.behavior = new AnimalStateMachine(config.speed, config.behavior, random);
    this.welcome = new WelcomeSequence(config.speed, config.welcome);
    this.animation = new AnimalAnimationController(config);
    this.addChild(this.animation.sprite, this.animation.sleepMark, this.animation.welcomeMark);
    this.label = config.id;
  }

  startWelcome(): boolean {
    if (!this.welcome.start()) return false;
    this.behavior.setMode('idle');
    this.update(0);
    return true;
  }
  play(action: AnimalAction): boolean {
    if (this.welcoming || (action !== 'idle' && action !== 'walk') || !this.config.animations[action]) return false;
    this.behavior.setMode(action);
    this.update(0);
    return true;
  }
  resumeAutonomy(): void {
    if (this.welcoming) return;
    this.behavior.setMode('auto');
    this.update(0);
  }
  setBounds(width: number, ground: number): void {
    const margin = Math.min(100, width * 0.24);
    const right = Math.max(margin, width - margin);
    this.behavior.setBounds(margin, right);
    this.welcome.setBounds(margin, right);
    this.x = this.welcoming ? this.welcome.x : this.behavior.x;
    this.y = ground;
  }
  update(seconds: number): void {
    if (this.welcoming) {
      this.welcome.update(seconds);
      this.behavior.setPosition(this.welcome.x, this.welcome.direction);
      if (!this.welcoming) this.behavior.setMode('auto');
    } else this.behavior.update(seconds);
    this.x = this.welcoming ? this.welcome.x : this.behavior.x;
    this.animation.update(
      this.state,
      this.welcoming ? this.welcome.elapsed : this.behavior.elapsed,
      this.welcoming ? this.welcome.direction : this.behavior.direction,
    );
  }
}
