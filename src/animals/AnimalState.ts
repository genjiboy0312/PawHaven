import type { WelcomeState } from '../systems/WelcomeSequence';
export const ANIMAL_STATES = ['IDLE', 'WANDER', 'REST', 'SLEEP', 'OBSERVE'] as const;
export type AnimalState = typeof ANIMAL_STATES[number];
export type AnimalVisualState = AnimalState | WelcomeState;
export type BehaviorMode = 'auto' | 'idle' | 'walk';
export type DurationRange = readonly [number, number];
export interface BehaviorProfile {
  durations: Record<Exclude<AnimalState, 'WANDER'>, DurationRange>;
  weights: Record<Exclude<AnimalState, 'IDLE'>, number>;
  wanderDistance: DurationRange;
}
export const CORGI_BEHAVIOR: BehaviorProfile = {
  durations: { IDLE: [2, 4], REST: [4, 7], SLEEP: [8, 14], OBSERVE: [2.5, 4.5] },
  weights: { WANDER: 5, REST: 2, SLEEP: 1, OBSERVE: 2 },
  wanderDistance: [80, 300],
};
