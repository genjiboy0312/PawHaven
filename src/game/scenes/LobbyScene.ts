import { HomeState } from '../../home/HomeState';
import { LobbyMap, type HomeTextures } from '../../home/LobbyMap';
import { Graphics, RenderLayer, type DestroyOptions } from 'pixi.js';
import { Animal } from '../../animals/Animal';
import type { AnimalConfig } from '../../animals/AnimalConfig';
import { LobbyHud } from '../../ui/LobbyHud';
import { Scene } from './Scene';
import { SnackButton } from '../../ui/SnackButton';
import type { CommerceState } from '../../shop/CommerceState';

export class LobbyScene extends Scene {
  private readonly garden: LobbyMap;
  private readonly shadow = new Graphics();
  private readonly animal: Animal;
  private readonly hud: LobbyHud;
  private readonly depthLayer = new RenderLayer({ sortableChildren: true });
  private readonly expressionLayer = new RenderLayer();
  private viewWidth = 960;
  private viewHeight = 540;
  private seenRevision = -1;
  private welcomeStarted = false;
  private paused = false;
  private readonly snacks?:SnackButton;private feedReaction=false;

  override setPaused(paused: boolean): void { this.paused = paused; }

  constructor(config: AnimalConfig, onPlay?: () => void, returning = false, onCharacter?: () => void, onSettings?: () => void, commerce?: { shop: () => void; quest: () => void; pet?: () => void;snacks?:CommerceState; friends?: () => void; mail?:()=>void; mailPending?:()=>number; mailArrival?:()=>number; requests?:()=>number; rewards?: () => boolean; click?: () => void; notice?: () => string; retry?: () => void; busy?: () => boolean }, private readonly home?: { state: HomeState; textures?: HomeTextures; open: () => void }, nickname?: () => string | null | undefined, visit?:{name:string;leave:()=>void}) {
    super(); this.garden = new LobbyMap(home?.textures);
    const pet = (): void => { if (!this.paused && this.animal.pet()){commerce?.pet?.();this.snacks?.reveal();} };
    this.hud = new LobbyHud(onPlay, returning, onCharacter, onSettings, commerce, home?.open, pet,visit);
    this.welcomeStarted = returning;
    this.animal = new Animal(config, Math.random, nickname);
    if(commerce?.snacks){this.snacks=new SnackButton(commerce.snacks,config.id,()=>{this.feedReaction=true;},commerce.quest);this.hud.element.append(this.snacks.element);}
    // Animal owns a stable rectangular body target across animation frames.
    this.animal.eventMode = visit?'none':'static';
    this.animal.cursor = 'pointer';
    this.animal.on('pointerdown', event => {
      if (event.button === 0) pet();
    });
    this.addChild(this.garden, this.shadow, this.animal, this.depthLayer, this.expressionLayer);
    this.depthLayer.attach(this.shadow, this.animal);
    this.expressionLayer.attach(this.animal.children[1]!, this.animal.speechBubble);
  }
  resize(width: number, height: number): void {
    const ground = height * 0.72;
    this.viewWidth = width; this.viewHeight = height;
    this.animal.setBounds(width, ground, height);
    this.syncHome();
    if (!this.welcomeStarted) {
      this.welcomeStarted = true;
      this.animal.startWelcome();
    }
    this.shadow.clear().ellipse(0, 0, 54, 9).fill({ color: '#566840', alpha: 0.13 });
    this.update(0);
  }
  private syncHome(): void {
    const items = this.home?.state.items ?? [];
    this.garden.draw(this.viewWidth, this.viewHeight, this.home?.state.current ?? { Background: 0, Floor: 0 }, items);
    this.animal.setHome(this.viewWidth, this.viewHeight, items);
    this.depthLayer.attach(...this.garden.objects.children);
    this.seenRevision = this.home?.state.revision ?? 0;
  }
  override update(seconds: number): void {
    if (this.paused) return;
    if(this.feedReaction){this.feedReaction=false;this.animal.feed();}
    if ((this.home?.state.revision ?? 0) !== this.seenRevision) this.syncHome();
    this.animal.update(seconds);
    this.animal.zIndex = this.animal.floorDepth / this.viewHeight;
    this.shadow.zIndex = this.animal.zIndex - 0.001;
    this.depthLayer.sortRenderLayerChildren();
    this.shadow.position.set(this.animal.x, this.animal.y - 2);
    const jumping = this.animal.state === 'JUMP';
    this.shadow.scale.set(jumping ? 0.8 : 1);
    this.shadow.alpha = jumping ? 0.65 : 1;
    this.hud.update(this.animal.state);
    this.hud.placePet(this.animal.x, this.animal.y, this.animal.touchBounds, this.viewWidth, this.viewHeight, !this.animal.welcoming);
    const bubble=this.animal.speechBubble;let sx=this.animal.x+bubble.x+bubble.halfWidth+75;
    if(sx>this.viewWidth-100)sx=this.animal.x+bubble.x-bubble.halfWidth-75;
    this.snacks?.update(seconds,sx,this.animal.y+bubble.y+bubble.halfHeight-15,this.viewWidth,this.viewHeight);
  }
  override destroy(options?: DestroyOptions): void {
    this.snacks?.destroy();
    this.hud.destroy();
    super.destroy(options);
  }
}
