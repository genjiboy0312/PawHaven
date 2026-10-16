import type { WelcomeState } from '../systems/WelcomeSequence';
export const ANIMAL_STATES = ['IDLE', 'WANDER', 'REST', 'SLEEP', 'OBSERVE', 'JUMP', 'LAND', 'EMOTE'] as const;
export type AnimalState = typeof ANIMAL_STATES[number];
export type AnimalVisualState = AnimalState | WelcomeState;
export type BehaviorMode = 'auto' | 'idle' | 'walk';
export type DurationRange = readonly [number, number];
export interface BehaviorProfile {
  durations: Partial<Record<Exclude<AnimalState, 'WANDER'>, DurationRange>>;
  weights: Partial<Record<Exclude<AnimalState, 'IDLE' | 'LAND'>, number>>;
  wanderDistance: DurationRange;
}
export const CORGI_BEHAVIOR: BehaviorProfile = {
  durations: {
    IDLE: [1.6, 3.4], REST: [3, 5], SLEEP: [7, 11], OBSERVE: [2, 3.5],
    JUMP: [1.05, 1.25], LAND: [0.25, 0.35], EMOTE: [2.2, 3.4],
  },
  weights: { WANDER: 5, REST: 1, SLEEP: 0.5, OBSERVE: 1.5, JUMP: 2, EMOTE: 3 },
  wanderDistance: [80, 280],
};
