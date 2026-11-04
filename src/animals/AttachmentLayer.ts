import { Matrix, type Sprite } from 'pixi.js';
import type { AttachmentPose } from './AttachmentFit';

/** Pixi adapter: keep catalog, account and DOM-only consumers free of renderer imports. */
export function applyAttachmentPose(layer: Sprite, pose: AttachmentPose): void {
  layer.anchor.set(pose.anchorX, pose.anchorY);
  layer.setFromMatrix(new Matrix(pose.a, pose.b, pose.c, pose.d, pose.x, pose.y));
}
