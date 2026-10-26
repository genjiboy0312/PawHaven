import { ADVENTURE_COURSE, ADVENTURE_FINISH, ADVENTURE_CHECKPOINT, ADVENTURE_TARGETS } from './AdventureCourse';
import { TRAINING_COURSE } from './TrainingCourse';
import { FOREST_COURSE, FOREST_FINISH, FOREST_CHECKPOINT, FOREST_TARGETS } from './ForestCourse';
import { CROSSROADS_COURSE, CROSSROADS_FINISH, CROSSROADS_CHECKPOINT, CROSSROADS_TARGETS } from './CrossroadsCourse';
export const COURSES = {
  garden: { title: 'mapGarden', description:'mapGardenDescription', time:'morning', seconds: '20–30s', goalSeconds:30, multiplayer:true, playerCombat:false, solids: ADVENTURE_COURSE, finish: ADVENTURE_FINISH, checkpoint: ADVENTURE_CHECKPOINT, targets: ADVENTURE_TARGETS },
  practice: { title: 'mapPractice', description:'mapPracticeDescription', time:'noon', seconds: '8–12s', goalSeconds:12, multiplayer:true, playerCombat:false, solids: TRAINING_COURSE, finish: 2520, checkpoint: 1550, targets: [2050] },
  forest: { title:'mapForest', description:'mapForestDescription', time:'night', seconds:'30–40s', goalSeconds:40, multiplayer:false, playerCombat:false, solids:FOREST_COURSE, finish:FOREST_FINISH, checkpoint:FOREST_CHECKPOINT, targets:FOREST_TARGETS },
  crossroads: { title:'mapCrossroads', description:'mapCrossroadsDescription', time:'sunset', seconds:'18–24s', goalSeconds:24, multiplayer:true, playerCombat:false, solids:CROSSROADS_COURSE, finish:CROSSROADS_FINISH, checkpoint:CROSSROADS_CHECKPOINT, targets:CROSSROADS_TARGETS },
} as const;
export type CourseId = keyof typeof COURSES;
