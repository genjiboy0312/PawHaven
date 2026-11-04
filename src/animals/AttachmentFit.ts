import type { AnimalConfig, AnimationSet, HeadAnchor } from './AnimalConfig';
import type { AnimalAction } from './AnimalConfig';

export type AttachmentPoint = 'head' | 'neck' | 'collar';
export interface MountPoint { x: number; y: number }
/** Two points on the actual attachment seam, excluding margins, knots and loose ends. */
export interface AttachmentArt {
  width: number; height: number;
  mount: { back: MountPoint; front: MountPoint };
  /** Front cloth depth perpendicular to its seam, excluding loose tips. */
  depth?: number;
}
/** Pet anatomy calibration in neck-width units, shared by every collar item. */
export interface CollarDimensions { x: number; y: number; width: number; height?: number; rotation?: number }
export interface CollarFit extends CollarDimensions { poses?: Partial<Record<AnimalAction, Partial<CollarDimensions>>> }
export interface AttachmentTarget extends HeadAnchor { height?: number }
export interface AttachmentPose {
  x: number; y: number; scale: number; scaleY: number; rotation: number; anchorX: number; anchorY: number;
  a: number; b: number; c: number; d: number;
}

export function attachmentTarget(config: AnimalConfig, clip: NonNullable<AnimationSet['idle']>, frame: number, point: AttachmentPoint, action?: AnimalAction): AttachmentTarget | undefined {
  if (point === 'head') return clip.head?.[frame];
  const neck = clip.neck?.[frame];
  if (point === 'neck' || !neck) return neck;
  const base = config.collarFit;
  // A new pet needs anatomy calibration once; never silently guess its collar width.
  if (!base) return undefined;
  const key = action ?? (Object.keys(config.animations) as AnimalAction[]).find(key => config.animations[key] === clip);
  const fit = { ...base, ...(key ? base.poses?.[key] : undefined) };
  if (![fit.x, fit.y, fit.width, fit.rotation ?? 0].every(Number.isFinite) || fit.width <= 0 || (fit.height !== undefined && (!Number.isFinite(fit.height) || fit.height <= 0))) throw Error('Invalid collar calibration: ' + config.id);
  const angle = neck.rotation ?? 0, dx = fit.x * neck.width, dy = fit.y * neck.width;
  return { x: neck.x + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: neck.y + dx * Math.sin(angle) + dy * Math.cos(angle),
    width: neck.width * fit.width, ...(fit.height === undefined ? {} : {height: neck.width * fit.height}), rotation: angle + (fit.rotation ?? 0) };
}

/** Match seam width and optional cloth depth independently in seam-local coordinates. */
export function attachmentPose(art: AttachmentArt, target: AttachmentTarget): AttachmentPose {
  const { back, front } = art.mount;
  const dx = front.x - back.x, dy = front.y - back.y, width = Math.hypot(dx, dy);
  if (![art.width, art.height, width, target.width].every(n => Number.isFinite(n) && n > 0)
    || ![back.x, back.y, front.x, front.y, target.x, target.y, target.rotation ?? 0].every(Number.isFinite)
    || (art.depth !== undefined && (!Number.isFinite(art.depth) || art.depth <= 0))
    || (target.height !== undefined && (!Number.isFinite(target.height) || target.height <= 0))) {
    throw Error('Invalid wearable attachment geometry');
  }
  const scale = target.width / width;
  const scaleY = art.depth !== undefined && target.height !== undefined ? target.height / art.depth : scale;
  const sourceAngle = Math.atan2(dy, dx), targetAngle = target.rotation ?? 0;
  const cs = Math.cos(sourceAngle), ss = Math.sin(sourceAngle), ct = Math.cos(targetAngle), st = Math.sin(targetAngle);
  // R(target) * scale(width, depth) * R(source)^-1 keeps BOTH seam ends pinned.
  return { x: target.x, y: target.y, scale, scaleY,
    a: ct*scale*cs + st*scaleY*ss, b: st*scale*cs - ct*scaleY*ss,
    c: ct*scale*ss - st*scaleY*cs, d: st*scale*ss + ct*scaleY*cs,
    rotation: targetAngle - sourceAngle,
    anchorX: (back.x + front.x) / 2 / art.width, anchorY: (back.y + front.y) / 2 / art.height };
}
