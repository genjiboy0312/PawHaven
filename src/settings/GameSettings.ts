import type { Language } from './i18n';
export interface GamePreferences { language: Language; controlSize: number; leftHanded: boolean; vibration: boolean; effects: boolean; smoothCamera: boolean }
const defaults: GamePreferences = { language: 'en', controlSize: 1, leftHanded: false, vibration: false, effects: true, smoothCamera: true };
export const GAME_SETTINGS_KEY = 'pawhaven.settings.v1';
export class GameSettings {
  private value = { ...defaults };
  constructor(private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    try {
      const saved = JSON.parse(storage?.getItem(GAME_SETTINGS_KEY) ?? 'null') as Partial<GamePreferences> | null;
      if (saved && typeof saved === 'object') {
        if (saved.language === 'ko' || saved.language === 'en') this.value.language = saved.language;
        if (typeof saved.controlSize === 'number' && Number.isFinite(saved.controlSize)) this.value.controlSize = Math.max(0.8, Math.min(1.2, saved.controlSize));
        for (const key of ['leftHanded', 'vibration', 'effects', 'smoothCamera'] as const) if (typeof saved[key] === 'boolean') this.value[key] = saved[key];
      }
    } catch { /* Defaults remain usable without storage. */ }
  }
  get current(): GamePreferences { return { ...this.value }; }
  update(next: Partial<GamePreferences>): void {
    if (next.language === 'en' || next.language === 'ko') this.value.language = next.language;
    if (typeof next.controlSize === 'number' && Number.isFinite(next.controlSize)) this.value.controlSize = Math.max(0.8, Math.min(1.2, next.controlSize));
    for (const key of ['leftHanded', 'vibration', 'effects', 'smoothCamera'] as const) if (typeof next[key] === 'boolean') this.value[key] = next[key];
    try { this.storage?.setItem(GAME_SETTINGS_KEY, JSON.stringify(this.value)); } catch { /* Keep session values. */ }
  }
}