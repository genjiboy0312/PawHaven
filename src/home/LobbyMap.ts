import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { SKY_COLORS, FLOOR_COLORS, type HomeItem, type HomeLook } from './HomeState';
import {gardenProp,gardenPropSprite,type GardenPropTextures} from './GardenProps';
export interface HomeTextures extends GardenPropTextures { background: Texture; floor: Texture; cushion: Texture; sofa?: Texture; noon?:Texture; sunset?:Texture; night?:Texture; cherry?:Texture }
/** Shared map renderer; every placed object owns its own view and persistent ID. */
export class LobbyMap extends Container {
  private readonly paint = new Graphics();
  readonly objects = new Container();
  private readonly views = new Map<number, Container>();
  private readonly backdrop?: Sprite;
  private readonly lawn?: Sprite;
  constructor(private readonly textures?: HomeTextures) {
    super(); this.addChild(this.paint);
    if (textures) {
      this.backdrop = new Sprite(textures.background); this.lawn = new Sprite(textures.floor);
      this.addChild(this.backdrop, this.lawn);
    }
    this.objects.sortableChildren = true; this.addChild(this.objects); this.label = 'lobby-map';
  }
  draw(width: number, height: number, look: HomeLook, items: readonly HomeItem[] = []): void {
    const g = this.paint;
    g.clear().rect(0, 0, width, height).fill(SKY_COLORS[look.Background])
      .rect(0, height * 0.44, width, height * 0.56).fill(FLOOR_COLORS[look.Floor]);
    if (look.Background) g.circle(width * 0.22, height * 0.2, 32).fill({ color: '#fff8df', alpha: 0.8 });
    if (this.backdrop && this.lawn) {
      const texture=[this.textures!.background,this.textures!.noon,this.textures!.sunset,this.textures!.night,this.textures!.cherry][look.Background];
      this.backdrop.visible = !!texture;if(texture)this.backdrop.texture=texture;
      this.backdrop.width = width; this.backdrop.height = height * 0.44;
      this.lawn.visible = look.Floor === 0; this.lawn.position.set(0, height * 0.44); this.lawn.width = width; this.lawn.height = height * 0.56;
    }
    for (const [id, view] of this.views) if (!items.some(item => item.id === id)) { view.destroy({ children: true }); this.views.delete(id); }
    for (const item of items) {
      let view = this.views.get(item.id);
      if (!view) {
        view = new Container(); view.label = String(item.id);
        const shape = new Graphics(); view.addChild(shape);
        if (item.tab === 'Furniture') {
          const cushion = item.option === 4 && !!this.textures;
          if (cushion) {
            const sprite = new Sprite(this.textures!.cushion); sprite.anchor.set(0.5, 0.75);
            sprite.width = 195; sprite.scale.y = sprite.scale.x; view.addChild(sprite);
          }
          if (item.option === 5 && this.textures?.sofa) {
            const sprite = new Sprite(this.textures.sofa); sprite.anchor.set(0.5, 0.9);
            sprite.width = 170; sprite.scale.y = sprite.scale.x; view.addChild(sprite);
          }
          this.drawFurniture(item.option, shape, cushion);
        } else {
          const id=gardenProp(item.tab,item.option),sprite=id&&this.textures?gardenPropSprite(id,this.textures):undefined;
          if(sprite)view.addChild(sprite);else this.drawEtc(item.option,shape);
        }
        this.views.set(item.id, view); this.objects.addChild(view);
      }
      view.position.set(width * item.x, height * item.y); view.zIndex = item.y;
    }
    this.objects.sortChildren();
  }
  private drawFurniture(option: number, g: Graphics, cushion: boolean): void {
    const x = 0, y = 0;
    if (option === 1) {
      g.roundRect(x - 70, y - 65, 140, 30, 5).fill('#aa8d6a')
        .rect(x - 75, y - 28, 150, 12).fill('#947957').rect(x - 58, y - 16, 9, 25).fill('#806e54').rect(x + 49, y - 16, 9, 25).fill('#806e54');
    } else if (option === 2) {
      g.poly([x - 25, y - 20, x + 25, y - 20, x + 18, y + 12, x - 18, y + 12]).fill('#b18e7e')
        .ellipse(x - 16, y - 45, 17, 29).fill('#7f9b72').ellipse(x + 12, y - 52, 18, 36).fill('#95ad80');
    } else if (option === 3) {
      g.ellipse(x, y - 35, 68, 18).fill('#b79d77').rect(x - 48, y - 28, 10, 40).fill('#8e795f').rect(x + 38, y - 28, 10, 40).fill('#8e795f');
    } else if (option === 4 && !cushion) {
      g.roundRect(x - 67, y - 30, 134, 48, 20).fill('#ad9da8').ellipse(x, y - 8, 52, 17).fill('#dfd4d9');
    } else if (option === 5 && !this.textures?.sofa) {
      g.roundRect(-82, -45, 164, 51, 22).fill('#36363c').ellipse(0, -19, 58, 20).fill('#f4f0e9');
    }
  }
  private drawEtc(option: number, g: Graphics): void {
    const ex = 0, y = 0;
    if (option === 1) {
      for (const offset of [-30, 0, 30]) {
        g.rect(ex + offset - 2, y - 12, 4, 29).fill('#7d986c');
        for (const [dx, dy] of [[-8, 0], [8, 0], [0, -8], [0, 8]]) g.circle(ex + offset + dx, y - 18 + dy, 7).fill('#d7a7ab');
        g.circle(ex + offset, y - 18, 5).fill('#eee0a0');
      }
    } else if (option === 2) {
      g.ellipse(ex, y + 12, 64, 15).fill('#c9b5a1');
      for (const offset of [-32, 0, 32]) g.ellipse(ex + offset, y + 7, 13, 8).fill('#e2d7c4');
    } else if (option === 3) {
      g.rect(ex - 4, y - 85, 8, 100).fill('#8b806a').roundRect(ex - 19, y - 93, 38, 40, 7).fill('#e6d39b');
    } else if (option === 4) {
      for (const offset of [-55, -20, 15, 50]) g.roundRect(ex + offset, y - 46, 12, 60, 3).fill('#ded5be');
      g.rect(ex - 60, y - 28, 130, 8).fill('#c9bea4');
    }
  }
}
