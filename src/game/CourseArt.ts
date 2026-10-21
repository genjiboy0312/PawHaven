import { Assets, Container, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';
import { COURSE_GROUND, type CourseSolid } from './TrainingCourse';

export type CourseMarkerId='start'|'checkpoint'|'finish';
interface ImageSpec {file:string;width:number;height:number}
export interface CourseArtManifest {
  version:1;tileWorldSize:number;
  tiles:Record<'grass'|'soil',ImageSpec>;
  markers:Record<CourseMarkerId,ImageSpec&{frame:{x:number;y:number;width:number;height:number};foot:{x:number;y:number};visibleHeight:number}>;
}
export interface CourseArt {
  grass:Texture;soil:Texture;tileWorldSize:number;
  markers:Record<CourseMarkerId,{texture:Texture;anchorX:number;anchorY:number;visibleHeight:number}>;
}
/** Frame extraction happens at runtime; generated PNGs remain unchanged in Resources. */
export function createCourseArt(images:Record<'grass'|'soil'|CourseMarkerId,Texture>,manifest:CourseArtManifest):CourseArt {
  if(manifest.version!==1||!Number.isFinite(manifest.tileWorldSize)||manifest.tileWorldSize<=0)throw Error('invalid_course_art');
  const markers={} as CourseArt['markers'];
  for(const id of ['grass','soil','start','checkpoint','finish'] as const){
    const spec=id==='grass'||id==='soil'?manifest.tiles[id]:manifest.markers[id],image=images[id];
    if(image.width!==spec.width||image.height!==spec.height)throw Error('course_art_dimensions');
    image.source.scaleMode='nearest';
  }
  for(const id of ['start','checkpoint','finish'] as const){
    const {frame,foot,visibleHeight}=manifest.markers[id];
    if(![frame.x,frame.y,frame.width,frame.height,foot.x,foot.y,visibleHeight].every(Number.isFinite)||frame.x<0||frame.y<0||frame.width<=0||frame.height<=0||frame.x+frame.width>images[id].width||frame.y+frame.height>images[id].height||visibleHeight<=0||foot.x<frame.x||foot.x>frame.x+frame.width||foot.y<frame.y||foot.y>frame.y+frame.height)throw Error('invalid_course_marker');
    markers[id]={texture:new Texture({source:images[id].source,frame:new Rectangle(frame.x,frame.y,frame.width,frame.height)}),anchorX:(foot.x-frame.x)/frame.width,anchorY:(foot.y-frame.y)/frame.height,visibleHeight};
  }
  return {grass:images.grass,soil:images.soil,tileWorldSize:manifest.tileWorldSize,markers};
}
export async function loadCourseArt():Promise<CourseArt>{
  const base=import.meta.env.BASE_URL+'assets/course/';
  const manifest=await Assets.load<CourseArtManifest>(base+'frames.json');
  const ids=['grass','soil','start','checkpoint','finish'] as const;
  const entries=await Promise.all(ids.map(async id=>[id,await Assets.load<Texture>(base+(id==='grass'||id==='soil'?manifest.tiles[id].file:manifest.markers[id].file))] as const));
  return createCourseArt(Object.fromEntries(entries) as Record<typeof ids[number],Texture>,manifest);
}
export function courseTerrain(solids:readonly CourseSolid[],art:CourseArt):Container {
  const view=new Container();view.label='course-terrain';
  for(const solid of solids){
    const height=solid.top-solid.bottom;
    for(const [texture,tileHeight]of [[art.soil,height],[art.grass,Math.min(art.tileWorldSize,height)]] as const){
      const tile=new TilingSprite({texture,width:solid.width,height:tileHeight,roundPixels:true});
      tile.position.set(solid.x,COURSE_GROUND-solid.top);tile.tileScale.set(art.tileWorldSize/texture.width,art.tileWorldSize/texture.height);view.addChild(tile);
    }
  }
  return view;
}
export function courseMarker(id:CourseMarkerId,art:CourseArt,x:number):Sprite {
  const marker=art.markers[id],sprite=new Sprite(marker.texture);sprite.label='course-'+id;
  sprite.anchor.set(marker.anchorX,marker.anchorY);sprite.scale.set(110/marker.visibleHeight);sprite.position.set(x,COURSE_GROUND);return sprite;
}
