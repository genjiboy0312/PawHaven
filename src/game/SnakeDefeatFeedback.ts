import { Container } from 'pixi.js';
import type { AnimalConfig } from '../animals/AnimalConfig';
import { ImpactBurst } from '../animals/ImpactBurst';
import type { PatrolSnake } from './PatrolSnake';
import { COURSE_GROUND } from './TrainingCourse';

/** Observes only this run's enemies. Resizing/rendering never replays a sound. */
export class SnakeDefeatFeedback extends Container {
  private readonly entries;
  constructor(snakes: readonly PatrolSnake[], frames: AnimalConfig['effects'], private readonly sound: () => void) {
    super();
    this.entries = snakes.map(snake => {
      const burst = new ImpactBurst(frames?.attack, 90, .7);
      this.addChild(burst); return { snake, burst, notified: false };
    });
  }
  observe(): void {
    let defeated = false;
    for (const entry of this.entries) if (entry.snake.defeated && !entry.notified) {
      entry.notified = true; defeated = true;
    }
    if (defeated) this.sound();
  }
  render(effects = true): void {
    for (const { snake, burst } of this.entries) {
      burst.position.set(snake.x, COURSE_GROUND - snake.height * .55);
      burst.update(snake.defeated ? snake.defeatAge : Infinity, effects);
    }
  }
}
