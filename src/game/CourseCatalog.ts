import { SURVIVAL_COURSE } from './SurvivalArena';
import { ADVENTURE_COURSE, ADVENTURE_FINISH, ADVENTURE_CHECKPOINT, ADVENTURE_TARGETS } from './AdventureCourse';
import { TRAINING_COURSE } from './TrainingCourse';
import { FOREST_COURSE, FOREST_FINISH, FOREST_CHECKPOINT, FOREST_TARGETS } from './ForestCourse';
import { CROSSROADS_COURSE, CROSSROADS_FINISH, CROSSROADS_CHECKPOINT, CROSSROADS_TARGETS } from './CrossroadsCourse';
// Cherry prototype reuses the tested garden route; theme assets are independent of lobby ownership.
export const COURSES = {
  garden: { mode:'race', title: 'mapGarden', description:'mapGardenDescription', time:'morning', seconds: '20–30s', goalSeconds:30, multiplayer:true, playerCombat:false, solids: ADVENTURE_COURSE, finish: ADVENTURE_FINISH, checkpoint: ADVENTURE_CHECKPOINT, targets: ADVENTURE_TARGETS },
  practice: { mode:'race', title: 'mapPractice', description:'mapPracticeDescription', time:'noon', seconds: '8–12s', goalSeconds:12, multiplayer:true, playerCombat:false, solids: TRAINING_COURSE, finish: 2520, checkpoint: 1550, targets: [2050] },
  forest: { mode:'race', title:'mapForest', description:'mapForestDescription', time:'night', seconds:'30–40s', goalSeconds:40, multiplayer:false, playerCombat:false, solids:FOREST_COURSE, finish:FOREST_FINISH, checkpoint:FOREST_CHECKPOINT, targets:FOREST_TARGETS },
  crossroads: { mode:'race', title:'mapCrossroads', description:'mapCrossroadsDescription', time:'sunset', seconds:'18–24s', goalSeconds:24, multiplayer:true, playerCombat:false, solids:CROSSROADS_COURSE, finish:CROSSROADS_FINISH, checkpoint:CROSSROADS_CHECKPOINT, targets:CROSSROADS_TARGETS },
  cherry: { mode:'race', title:'mapCherry',description:'mapCherryDescription',time:'cherry',seconds:'20–30s',goalSeconds:30,multiplayer:false,playerCombat:false,solids:ADVENTURE_COURSE,finish:ADVENTURE_FINISH,checkpoint:ADVENTURE_CHECKPOINT,targets:ADVENTURE_TARGETS },
  survival: { mode:'survival', title:'mapSurvival',description:'mapSurvivalDescription',time:'noon',seconds:'30s / 60s',goalSeconds:30,multiplayer:true,playerCombat:false,solids:SURVIVAL_COURSE,finish:1080,checkpoint:0,targets:[] },
} as const;
export type CourseId = keyof typeof COURSES;

export const GAME_MODES = ['race', 'survival'] as const;
export type GameMode = typeof GAME_MODES[number];
export function courseMode(map: CourseId): GameMode { return COURSES[map].mode; }
