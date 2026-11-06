import { Container, Graphics, Text } from 'pixi.js';
import { COURSE_GROUND, type CourseSolid } from './TrainingCourse';
import { GAME_FONT } from '../ui/GameFont';
/** Tile boundaries and warnings reuse the existing terrain; no generated artwork. */
export class SurvivalPlatformsView extends Container {
  private readonly views: { solid: CourseSolid; root: Container; frame: Graphics; mark: Text; warning?: boolean }[];
  constructor(solids: readonly CourseSolid[]) {
    super(); this.label = 'survival-platform-guides'; this.eventMode = 'none';
    this.views = solids.map(solid => {
      const root = new Container(), frame = new Graphics();
      const mark = new Text({ text: '!', style: { fontFamily: GAME_FONT, fontSize: 26, fill: '#a44d20', stroke: {color:'#fff4cf',width:3} } });
      mark.anchor.set(.5,1); mark.position.set(solid.width/2,-8); root.position.set(solid.x,COURSE_GROUND-solid.top);
      root.addChild(frame,mark); this.addChild(root); return { solid, root, frame, mark };
    }); this.update(0,false);
  }
  update(time: number, blink = true): void {
    for (const view of this.views) {
      const warning = view.solid.warning === true; view.root.visible = !view.solid.disabled;
      if (view.warning !== warning) {
        view.warning = warning; view.frame.clear().rect(1,1,view.solid.width-2,view.solid.top-view.solid.bottom-2)
          .stroke({color:warning?0xe7a237:0x668054,width:warning?4:1,alpha:warning?1:.7});
      }
      view.mark.visible = warning; view.mark.alpha = warning && blink ? .6 + .4*Math.abs(Math.sin(time*11)) : 1;
    }
  }
}
