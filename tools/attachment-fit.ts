// Development-only page: npm run dev -> /tools/attachment-fit.html. Not shipped by Vite build.
import { Application, Assets, Container, Graphics, Sprite, Text } from 'pixi.js';
import { loadCorgi } from '../src/animals/loadCorgi';
import { loadMyeongrang } from '../src/animals/loadMyeongrang';
import { loadTuxedo } from '../src/animals/loadTuxedo';
import { AnimalAnimationController } from '../src/animals/AnimalAnimationController';
import { attachmentTarget, attachmentPose, applyAttachmentPose } from '../src/animals/AttachmentFit';
import { KARAKUSA_SCARF_ART } from '../src/animals/CollarFits';
import type { AnimalAction } from '../src/animals/AnimalConfig';
import { GAME_FONT } from '../src/ui/GameFont';
await document.fonts.load('20px Jua');
const app = new Application();
await app.init({ width: 1500, height: 504, background: 0xf5f1e6, antialias: false });
document.body.append(app.canvas);
const shared = await loadCorgi(() => {});
const pets = [await loadMyeongrang(shared), shared, await loadTuxedo(shared)];
const texture = await Assets.load('/Resources/Karakusa_Bandana_Fitted_Prototype.png');
texture.source.scaleMode = 'nearest';
const actors = pets.map((config, i) => {
  const box = new Container(); box.position.set(250+i*500, 370); box.scale.set(2); app.stage.addChild(box);
  const animal = new AnimalAnimationController(config); box.addChild(animal.sprite);
  const scarf = new Sprite(texture), guides = new Graphics(); animal.sprite.addChild(scarf, guides);
  const label = new Text({text:['명랑이','코기','턱시도 고양이'][i],style:{fontFamily:GAME_FONT,fontSize:26,fill:0x665a45}});
  label.anchor.set(.5);label.position.set(250+i*500,430);app.stage.addChild(label);
  return {config,animal,scarf,guides};
});
const select = document.querySelector<HTMLSelectElement>('#action')!;
const slider = document.querySelector<HTMLInputElement>('#frame')!;
const guidesInput = document.querySelector<HTMLInputElement>('#guides')!;
for (const key of Object.keys(shared.animations)) select.add(new Option(key,key));
let direction = 1;
function pose(action: AnimalAction, frame = 0, facing = direction) {
  direction = facing; select.value = action;
  slider.max = String(Math.max(...pets.map(p => p.animations[action]?.frames.length ?? 1))-1);slider.value=String(frame);
  document.querySelector('#number')!.textContent = String(frame+1);
  for (const {config,animal,scarf,guides} of actors) {
    const clip = config.animations[action] ?? config.animations.idle!;
    const index = frame % clip.frames.length;
    animal.update('IDLE',0,direction,0,0,0,action,(index+.01)/clip.frames.length);
    const target = attachmentTarget(config,clip,index,'collar');
    scarf.visible = !!target;
    if (target) applyAttachmentPose(scarf,attachmentPose(KARAKUSA_SCARF_ART,target));
    guides.clear(); guides.visible=guidesInput.checked;
    if(target){const dx=Math.cos(target.rotation??0)*target.width/2,dy=Math.sin(target.rotation??0)*target.width/2;
      guides.moveTo(target.x-dx,target.y-dy).lineTo(target.x+dx,target.y+dy).stroke({width:1,color:0xff4080});}
  }
  app.renderer.render(app.stage);
}
select.onchange=()=>pose(select.value as AnimalAction);
slider.oninput=()=>pose(select.value as AnimalAction,Number(slider.value));
guidesInput.onchange=()=>pose(select.value as AnimalAction,Number(slider.value));
document.querySelector<HTMLButtonElement>('#direction')!.onclick=()=>pose(select.value as AnimalAction,Number(slider.value),-direction);
pose('idle');
Object.assign(window,{attachmentQA:{pose,actors,app,ready:true}});
