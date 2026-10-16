import { HomeState } from '../../home/HomeState';
import { LobbyMap } from '../../home/LobbyMap';
import { Graphics, type DestroyOptions } from 'pixi.js';
import { Animal } from '../../animals/Animal';
import type { AnimalConfig } from '../../animals/AnimalConfig';
import { LobbyHud } from '../../ui/LobbyHud';
import { Scene } from './Scene';

export class LobbyScene extends Scene {
  private readonly garden = new LobbyMap();
  private readonly shadow = new Graphics();
  private readonly animal: Animal;
  private readonly hud: LobbyHud;
  private welcomeStarted = false;

  constructor(config: AnimalConfig, onPlay?: () => void, returning = false, onCharacter?: () => void, onSettings?: () => void, commerce?: { shop: () => void; quest: () => void }, private readonly home?: { state: HomeState; open: () => void }) {
    super();
    this.hud = new LobbyHud(onPlay, returning, onCharacter, onSettings, commerce, home?.open);
    this.welcomeStarted = returning;
    this.animal = new Animal(config);
    this.addChild(this.garden, this.shadow, this.animal);
  }
  resize(width: number, height: number): void {
    const ground = height * 0.72;
    this.garden.draw(width, height, this.home?.state.current ?? { Background: 0, Floor: 0, Furniture: 0, Etc: 0 });
    this.animal.setBounds(width, ground);
    if (!this.welcomeStarted) {
      this.welcomeStarted = true;
      this.animal.startWelcome();
    }
    this.shadow.clear().ellipse(0, 0, 54, 9).fill({ color: '#566840', alpha: 0.13 });
    this.update(0);
  }
  override update(seconds: number): void {
    this.animal.update(seconds);
    this.shadow.position.set(this.animal.x, this.animal.y - 2);
    const jumping = this.animal.state === 'JUMP';
    this.shadow.scale.set(jumping ? 0.8 : 1);
    this.shadow.alpha = jumping ? 0.65 : 1;
    this.hud.update(this.animal.state);
  }
  override destroy(options?: DestroyOptions): void {
    this.hud.destroy();
    super.destroy(options);
  }
}
