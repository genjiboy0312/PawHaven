export const CONTROL_IDS = ['joystick', 'attack', 'dash', 'jump'] as const;
export type ControlId = typeof CONTROL_IDS[number];
export interface ControlPoint { x: number; y: number }
export type ControlLayout = Record<ControlId, ControlPoint>;
export const CONTROL_WIDTH = { joystick: 13, attack: 9, dash: 9, jump: 11 } as const;
const defaults: ControlLayout = { joystick: { x: .12, y: .81 }, attack: { x: .785, y: .63 }, dash: { x: .915, y: .63 }, jump: { x: .85, y: .85 } };
export function copyControlLayout(layout: ControlLayout = defaults): ControlLayout {
  return Object.fromEntries(CONTROL_IDS.map(id => [id, { ...layout[id] }])) as ControlLayout;
}
// Reserve space for the largest supported button size, including the cooldown rim.
export function clampControlPoint(id: ControlId, point: ControlPoint): ControlPoint {
  const radius = CONTROL_WIDTH[id] / 200 * 1.2;
  return { x: Math.max(radius + .02, Math.min(1 - radius - .02, point.x)), y: Math.max(.46 + radius * 16 / 9, Math.min(1 - radius * 16 / 9 - .02, point.y)) };
}
function separated(layout: ControlLayout): boolean {
  return CONTROL_IDS.every((id, i) => CONTROL_IDS.slice(i + 1).every(other =>
    Math.hypot(layout[id].x - layout[other].x, (layout[id].y - layout[other].y) * 9 / 16) >= (CONTROL_WIDTH[id] + CONTROL_WIDTH[other]) / 200 * 1.2 + .008));
}
export function normalizeControlLayout(value: unknown): ControlLayout | undefined {
  if (!value || typeof value !== 'object') return;
  const layout = copyControlLayout();
  for (const id of CONTROL_IDS) {
    const point = (value as Record<string, ControlPoint>)[id];
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number' || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    layout[id] = clampControlPoint(id, point);
  }
  return separated(layout) ? layout : undefined;
}
export function moveControl(layout: ControlLayout, id: ControlId, point: ControlPoint): ControlLayout {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return layout;
  const next = copyControlLayout(layout); next[id] = clampControlPoint(id, point);
  return separated(next) ? next : layout;
}
export function controlPointer(x: number, y: number, rect: { left: number; top: number; width: number; height: number }, rotated: boolean, leftHanded: boolean): ControlPoint {
  const point = rotated ? { x: (y - rect.top) / rect.height, y: 1 - (x - rect.left) / rect.width } : { x: (x - rect.left) / rect.width, y: (y - rect.top) / rect.height };
  if (leftHanded) point.x = 1 - point.x;
  return point;
}
export function applyControlLayout(host: HTMLElement, preferences: { controlSize: number; leftHanded: boolean; controlLayout?: ControlLayout }): void {
  const layout = preferences.controlLayout ?? defaults;
  host.style.setProperty('--control-scale', String(preferences.controlSize));
  for (const id of CONTROL_IDS) {
    host.style.setProperty(`--${id}-x`, `${(preferences.leftHanded ? 1 - layout[id].x : layout[id].x) * 100}%`);
    host.style.setProperty(`--${id}-y`, `${layout[id].y * 100}%`);
  }
}
