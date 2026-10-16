import { Container } from 'pixi.js';
import type { AnimalAction, AnimalConfig } from './AnimalConfig';
import { AnimalAnimationController } from './AnimalAnimationController';
import { AnimalStateMachine } from './AnimalStateMachine';
import type { AnimalState, BehaviorMode } from './AnimalState';

export class Animal extends Container {
  private readonly animation: AnimalAnimationController;
  private readonly behavior: AnimalStateMachine;
  get state(): AnimalState { return this.behavior.state; }
  get mode(): BehaviorMode { return this.behavior.mode; }

  constructor(private readonly config: AnimalConfig, random: () => number = Math.random) {
    super();
    this.behavior = new AnimalStateMachine(config.speed, config.behavior, random);
    this.animation = new AnimalAnimationController(config);
    this.addChild(this.animation.sprite, this.animation.sleepMark);
    this.label = config.id;
  }

  play(action: AnimalAction): boolean {
    if ((action !== 'idle' && action !== 'walk') || !this.config.animations[action]) return false;
    this.behavior.setMode(action);
    this.update(0);
    return true;
  }
  resumeAutonomy(): void {
    this.behavior.setMode('auto');
    this.update(0);
  }
  setBounds(width: number, ground: number): void {
    const margin = Math.min(100, width * 0.24);
    this.behavior.setBounds(margin, Math.max(margin, width - margin));
    this.x = this.behavior.x;
    this.y = ground;
  }
  update(seconds: number): void {
    this.behavior.update(seconds);
    this.x = this.behavior.x;
    this.animation.update(this.state, this.behavior.elapsed, this.behavior.direction);
  }
}
