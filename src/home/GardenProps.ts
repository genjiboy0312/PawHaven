import {Assets,Rectangle,Sprite,Texture} from 'pixi.js';
/** One asset definition for shop icons, editable homes and course scenery. PNGs stay untouched. */
export const GARDEN_PROPS={
 greenTree:{option:5,file:'assets/home/small-green-tree.png',source:[1254,1254],frame:[135,227,1018,875],width:142,courseHeight:110},
 cherryTree:{option:6,file:'assets/home/small-cherry-tree.png',source:[1254,1254],frame:[133,224,1022,878],width:142,courseHeight:110},
 fence:{option:4,file:'assets/home/low-wooden-fence.png',source:[1983,793],frame:[331,260,1322,341],width:158,courseHeight:30},
 crate:{option:7,file:'assets/items/wooden-box.png',source:[1295,1214],frame:[363,353,568,561],width:62,courseHeight:40},
} as const;
export type GardenProp=keyof typeof GARDEN_PROPS;
export type GardenPropTextures=Partial<Record<GardenProp,Texture>>;
export function gardenProp(tab:string,index:number):GardenProp|undefined{return tab==='Etc'?(Object.keys(GARDEN_PROPS) as GardenProp[]).find(id=>GARDEN_PROPS[id].option===index):undefined;}
export async function loadGardenProps():Promise<GardenPropTextures>{
 return Object.fromEntries(await Promise.all((Object.keys(GARDEN_PROPS) as GardenProp[]).map(async id=>{
  const spec=GARDEN_PROPS[id],image=await Assets.load<Texture>(import.meta.env.BASE_URL+spec.file);image.source.scaleMode='nearest';
  return[id,new Texture({source:image.source,frame:new Rectangle(...spec.frame)})];
 })));
}
export function gardenPropSprite(id:GardenProp,textures:GardenPropTextures,width:number=GARDEN_PROPS[id].width):Sprite|undefined{
 const texture=textures[id];if(!texture)return;const sprite=new Sprite(texture);sprite.label='garden-prop-'+id;sprite.anchor.set(.5,1);sprite.scale.set(width/texture.width);return sprite;
}
