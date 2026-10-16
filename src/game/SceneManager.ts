import type { Application } from 'pixi.js';
import type { Scene } from './scenes/Scene';
import { fitViewport, WORLD_HEIGHT, WORLD_WIDTH } from './viewport';

export class SceneManager {
  private current: Scene | undefined;
  constructor(private readonly app: Application) {}
  show(scene: Scene): void {
    this.current?.destroy({ children: true });
    this.current = scene;
    this.app.stage.addChild(scene);
    this.resize();
  }
  resize(): void {
    if (!this.current) return;
    const view = fitViewport(this.app.screen.width, this.app.screen.height);
    this.current.scale.set(view.scale);
    this.current.position.set(view.x, view.y);
    this.current.resize(WORLD_WIDTH, WORLD_HEIGHT);
  }
  update(seconds: number): void { this.current?.update(seconds); }
  destroy(): void {
    this.current?.destroy({ children: true });
    this.current = undefined;
  }
}
