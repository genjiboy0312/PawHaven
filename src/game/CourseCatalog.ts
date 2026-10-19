import { ADVENTURE_COURSE, ADVENTURE_FINISH, ADVENTURE_CHECKPOINT, ADVENTURE_TARGETS } from './AdventureCourse';
import { TRAINING_COURSE } from './TrainingCourse';
export const COURSES = {
  garden: { title: 'mapGarden', seconds: '20–30s', solids: ADVENTURE_COURSE, finish: ADVENTURE_FINISH, checkpoint: ADVENTURE_CHECKPOINT, targets: ADVENTURE_TARGETS },
  practice: { title: 'mapPractice', seconds: '8–12s', solids: TRAINING_COURSE, finish: 2520, checkpoint: 1550, targets: [2050] },
} as const;
export type CourseId = keyof typeof COURSES;
