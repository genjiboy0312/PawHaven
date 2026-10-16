/** Fixed world zoom; DOM controls and scene overlays retain their original size. */
export const PLAY_ZOOM = 0.78;
export const PLAY_GROUND_Y = 365;
export function cameraTarget(x: number, courseEnd: number): number {
  return Math.max(0, Math.min(courseEnd - 960 / PLAY_ZOOM, x - 288 / PLAY_ZOOM));
}
