import type { AnimalConfig, AnimationSet, HeadAnchor } from './AnimalConfig';
import type { Sprite } from 'pixi.js';

export type AttachmentPoint = 'head' | 'neck' | 'collar';
export interface MountPoint { x: number; y: number }
/** Two points on the actual attachment seam, excluding margins, knots and loose ends. */
export interface AttachmentArt {
  width: number; height: number;
  mount: { back: MountPoint; front: MountPoint };
}
/** Pet anatomy calibration in neck-width units, shared by every collar item. */
export interface CollarFit { x: number; y: number; width: number; rotation?: number }
export interface AttachmentPose {
  x: number; y: number; scale: number; rotation: number; anchorX: number; anchorY: number;
}

export function attachmentTarget(config: AnimalConfig, clip: NonNullable<AnimationSet['idle']>, frame: number, point: AttachmentPoint): HeadAnchor | undefined {
  if (point === 'head') return clip.head?.[frame];
  const neck = clip.neck?.[frame];
  if (point === 'neck' || !neck) return neck;
  const fit = config.collarFit;
  // A new pet needs anatomy calibration once; never silently guess its collar width.
  if (!fit) return undefined;
  if (![fit.x, fit.y, fit.width, fit.rotation ?? 0].every(Number.isFinite) || fit.width <= 0) throw Error('Invalid collar calibration: ' + config.id);
  const angle = neck.rotation ?? 0, dx = fit.x * neck.width, dy = fit.y * neck.width;
  return { x: neck.x + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: neck.y + dx * Math.sin(angle) + dy * Math.cos(angle),
    width: neck.width * fit.width, rotation: angle + (fit.rotation ?? 0) };
}

/** Register the art seam to the animal seam with one uniform scale, without stretching. */
export function attachmentPose(art: AttachmentArt, target: HeadAnchor): AttachmentPose {
  const { back, front } = art.mount;
  const dx = front.x - back.x, dy = front.y - back.y, width = Math.hypot(dx, dy);
  if (![art.width, art.height, width, target.width].every(n => Number.isFinite(n) && n > 0)
    || ![back.x, back.y, front.x, front.y, target.x, target.y, target.rotation ?? 0].every(Number.isFinite)) {
    throw Error('Invalid wearable attachment geometry');
  }
  return { x: target.x, y: target.y, scale: target.width / width,
    rotation: (target.rotation ?? 0) - Math.atan2(dy, dx),
    anchorX: (back.x + front.x) / 2 / art.width, anchorY: (back.y + front.y) / 2 / art.height };
}

export function applyAttachmentPose(layer: Sprite, pose: AttachmentPose): void {
  layer.anchor.set(pose.anchorX, pose.anchorY);
  layer.position.set(pose.x, pose.y);
  layer.scale.set(pose.scale);
  layer.rotation = pose.rotation;
}
