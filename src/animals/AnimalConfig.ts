import type { WelcomeConfig } from '../systems/WelcomeSequence';
import type { BehaviorProfile } from './AnimalState';
import type { Texture } from 'pixi.js';

export const ACTIONS = [
  'idle', 'walk', 'run', 'jump', 'fall', 'land', 'doubleJump', 'attack',
  'hit', 'die', 'skill', 'emote', 'direction', 'climb', 'push', 'hurtLoop',
] as const;
export type AnimalAction = typeof ACTIONS[number];
export type AnimationSet = Partial<Record<AnimalAction, { frames: Texture[]; fps: number; scale?: number; anchorY?: number }>>;
export interface AnimalConfig {
  id: string;
  speed: number;
  scale: number;
  animations: AnimationSet;
  effects?: Partial<Record<'attack' | 'skill', Texture[]>>;
  behavior?: BehaviorProfile;
  welcome?: WelcomeConfig;
}
