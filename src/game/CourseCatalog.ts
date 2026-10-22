import { ADVENTURE_COURSE, ADVENTURE_FINISH, ADVENTURE_CHECKPOINT, ADVENTURE_TARGETS } from './AdventureCourse';
import { TRAINING_COURSE } from './TrainingCourse';
import { FOREST_COURSE, FOREST_FINISH, FOREST_CHECKPOINT, FOREST_TARGETS } from './ForestCourse';
export const COURSES = {
  garden: { title: 'mapGarden', description:'mapGardenDescription', seconds: '20–30s', goalSeconds:30, multiplayer:true, playerCombat:false, solids: ADVENTURE_COURSE, finish: ADVENTURE_FINISH, checkpoint: ADVENTURE_CHECKPOINT, targets: ADVENTURE_TARGETS },
  practice: { title: 'mapPractice', description:'mapPracticeDescription', seconds: '8–12s', goalSeconds:12, multiplayer:true, playerCombat:false, solids: TRAINING_COURSE, finish: 2520, checkpoint: 1550, targets: [2050] },
  forest: { title:'mapForest', description:'mapForestDescription', seconds:'30–40s', goalSeconds:40, multiplayer:false, playerCombat:false, solids:FOREST_COURSE, finish:FOREST_FINISH, checkpoint:FOREST_CHECKPOINT, targets:FOREST_TARGETS },
} as const;
export type CourseId = keyof typeof COURSES;
