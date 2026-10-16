import type { OutfitState } from '../../animals/OutfitState';
import { Graphics, type DestroyOptions } from 'pixi.js';
import { Animal } from '../../animals/Animal';
import type { AnimalConfig } from '../../animals/AnimalConfig';
import { LobbyHud } from '../../ui/LobbyHud';
import { Scene } from './Scene';

export class LobbyScene extends Scene {
  private readonly garden = new Graphics();
  private readonly shadow = new Graphics();
  private readonly animal: Animal;
  private readonly hud: LobbyHud;
  private welcomeStarted = false;

  constructor(config: AnimalConfig, onPlay?: () => void, returning = false, onCharacter?: () => void, outfit?: OutfitState) {
    super();
    this.hud = new LobbyHud(onPlay, returning, onCharacter);
    this.welcomeStarted = returning;
    this.animal = new Animal(config);
    if (outfit) this.animal.setOutfit(outfit);
    this.addChild(this.garden, this.shadow, this.animal);
  }
  resize(width: number, height: number): void {
    const ground = height * 0.72;
    this.garden.clear()
      .rect(0, height * 0.44, width, height * 0.56).fill('#c4d6a7')
      .ellipse(width * 0.5, ground + 24, width * 0.44, height * 0.13).fill('#b7ce98');
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
