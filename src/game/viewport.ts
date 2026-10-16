export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 540;

export function fitViewport(width: number, height: number) {
  const scale = Math.max(0, Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT));
  return {
    scale,
    x: (width - WORLD_WIDTH * scale) / 2,
    y: (height - WORLD_HEIGHT * scale) / 2,
  };
}
