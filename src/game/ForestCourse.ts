import type { CourseSolid } from './TrainingCourse';

export const FOREST_FINISH=10100;
export const FOREST_CHECKPOINT=5100;
/** A 30–40 second route: warm-up, two stepping stones, checkpoint, then run/jump intervals. */
export const FOREST_COURSE:readonly CourseSolid[]=[
  {x:0,width:2400,top:0,bottom:-300},
  {x:2540,width:1660,top:0,bottom:-300},
  {x:4320,width:180,top:24,bottom:0},
  {x:4630,width:180,top:50,bottom:28},
  {x:5000,width:1550,top:0,bottom:-300},
  {x:6730,width:1470,top:0,bottom:-300},
  {x:8360,width:2040,top:0,bottom:-300},
  {x:600,width:90,top:32,bottom:0},
  {x:1250,width:110,top:48,bottom:0},
  {x:2900,width:100,top:50,bottom:0},
  {x:5550,width:120,top:60,bottom:0},
  {x:7100,width:90,top:42,bottom:0},
  {x:7700,width:120,top:60,bottom:0},
  {x:8800,width:80,top:36,bottom:0},
  {x:9360,width:120,top:55,bottom:0},
];
export const FOREST_TARGETS=[1800,6000,9750] as const;
