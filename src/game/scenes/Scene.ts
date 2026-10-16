import { Container } from 'pixi.js';

export abstract class Scene extends Container {
  abstract resize(width: number, height: number): void;
  update(_seconds: number): void {}
}

