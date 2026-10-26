import type { CourseSolid } from './TrainingCourse';

export const CROSSROADS_FINISH = 5700;
export const CROSSROADS_CHECKPOINT = 3350;
export const CROSSROADS_TARGETS = [3300, 5050] as const;
/** A forgiving lower lane and optional elevated jumping routes; both share one finish. */
export const CROSSROADS_COURSE: readonly CourseSolid[] = [
  { x: 0, width: 6000, top: 0, bottom: -300 },
  ...[
    [600,190,60], [860,230,120], [1220,360,150],
    [1740,400,150], [2300,400,150], [2860,300,100],
    [3500,180,60], [3760,200,120], [4120,360,150],
    [4640,300,150], [5100,190,80],
  ].map(([x,width,top]) => ({ x:x!, width:width!, top:top!, bottom:top!-20, oneWay:true })),
];
