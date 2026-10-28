import {Container} from 'pixi.js';
import {gardenPropSprite,GARDEN_PROPS,type GardenProp,type GardenPropTextures} from '../home/GardenProps';
import type {CourseId} from './CourseCatalog';
import {COURSE_GROUND} from './TrainingCourse';
/** Fixed sparse scenery only: no collisions, network messages or inventory ownership. */
export const COURSE_DECOR:Record<CourseId,readonly (readonly [GardenProp,number])[]>={
 cherry:[['cherryTree',350],['fence',1080],['cherryTree',2570],['cherryTree',4320],['fence',4860],['cherryTree',6010],['crate',6270]],
 practice:[['greenTree',300],['fence',1040],['cherryTree',1700],['crate',2320]],
 garden:[['greenTree',350],['fence',1080],['cherryTree',2570],['greenTree',4320],['fence',4860],['cherryTree',6010],['crate',6270]],
 forest:[['greenTree',300],['fence',980],['greenTree',2650],['cherryTree',5300],['fence',6900],['greenTree',8580],['crate',9900]],
 crossroads:[['greenTree',320],['fence',1620],['cherryTree',2800],['fence',3650],['greenTree',4900],['crate',5480]],
};
export function courseDecor(map:CourseId,textures:GardenPropTextures):Container{
 const layer=new Container();layer.label='course-decor';layer.eventMode='none';
 for(const [id,x]of COURSE_DECOR[map]){
  const spec=GARDEN_PROPS[id],width=spec.courseHeight*spec.frame[2]/spec.frame[3],sprite=gardenPropSprite(id,textures,width);
  if(sprite){sprite.position.set(x,COURSE_GROUND+2);layer.addChild(sprite);}
 }
 return layer;
}
