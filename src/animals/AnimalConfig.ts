import type { WelcomeConfig } from '../systems/WelcomeSequence';
import type { BehaviorProfile } from './AnimalState';
import type { Texture } from 'pixi.js';
import type { OutfitState } from './OutfitState';
export interface HeadAnchor { x: number; y: number; width: number; rotation?: number }

export const ACTIONS = [
  'idle', 'walk', 'run', 'jump', 'fall', 'land', 'doubleJump', 'attack',
  'hit', 'die', 'skill', 'emote', 'direction', 'climb', 'push', 'hurtLoop',
] as const;
export type AnimalAction = typeof ACTIONS[number];
export type AnimationSet = Partial<Record<AnimalAction, { frames: Texture[]; fps: number; scale?: number; anchorY?: number; head?: HeadAnchor[] }>>;
export interface AnimalConfig {
  id: string;
  speed: number;
  scale: number;
  animations: AnimationSet;
  wardrobe?: { santaHat: Texture; outfit: OutfitState };
  effects?: Partial<Record<'attack' | 'skill', Texture[]>>;
  behavior?: BehaviorProfile;
  welcome?: WelcomeConfig;
}
