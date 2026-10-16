import { Graphics } from 'pixi.js';
import { outfitColor, type OutfitState } from './OutfitState';

/** Temporary shapes for checking equipment state before item artwork exists. */
export class AnimalOutfit extends Graphics {
  apply(outfit: OutfitState): void {
    this.clear();
    if (outfit.Hat) this.ellipse(20, -128, 26, 10).fill(outfitColor(outfit.Hat))
      .roundRect(-1, -144, 40, 16, 8).fill(outfitColor(outfit.Hat));
    if (outfit.Body) this.poly([10, -76, 48, -76, 27, -51]).fill(outfitColor(outfit.Body));
    if (outfit.Acc) this.circle(31, -55, 8).fill(outfitColor(outfit.Acc)).circle(31, -55, 3).fill('#faf8eb');
    if (outfit.Etc) this.poly([-48, -44, -64, -55, -64, -33]).fill(outfitColor(outfit.Etc))
      .poly([-48, -44, -32, -55, -32, -33]).fill(outfitColor(outfit.Etc));
  }
}