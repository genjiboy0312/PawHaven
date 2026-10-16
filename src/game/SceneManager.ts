import type { Application } from 'pixi.js';
import type { Scene } from './scenes/Scene';

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
    this.current?.resize(this.app.screen.width, this.app.screen.height);
  }
  update(seconds: number): void { this.current?.update(seconds); }
  destroy(): void {
    this.current?.destroy({ children: true });
    this.current = undefined;
  }
}

