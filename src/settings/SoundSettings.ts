export interface SoundPreferences { master: number; bgm: number; sfx: number; muted: boolean }
export type VolumeChannel = 'master' | 'bgm' | 'sfx';
const DEFAULTS: SoundPreferences = { master: 0.8, bgm: 0.6, sfx: 0.7, muted: false };
export const SOUND_STORAGE_KEY = 'pawhaven.sound.v1';

export class SoundSettings {
  private value: SoundPreferences = { ...DEFAULTS };
  constructor(private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    try {
      const saved: unknown = JSON.parse(storage?.getItem(SOUND_STORAGE_KEY) ?? 'null');
      if (saved && typeof saved === 'object') {
        for (const key of ['master', 'bgm', 'sfx'] as const) {
          const volume = (saved as Record<string, unknown>)[key];
          if (typeof volume === 'number' && Number.isFinite(volume)) this.value[key] = Math.max(0, Math.min(1, volume));
        }
        if (typeof (saved as Record<string, unknown>).muted === 'boolean') this.value.muted = (saved as SoundPreferences).muted;
      }
    } catch { /* Storage can be disabled or contain old data. */ }
  }
  get current(): SoundPreferences { return { ...this.value }; }
  volume(channel: VolumeChannel, volume: number): void {
    if (!Number.isFinite(volume)) return;
    this.value[channel] = Math.max(0, Math.min(1, volume)); this.save();
  }
  mute(muted: boolean): void { this.value.muted = muted; this.save(); }
  private save(): void { try { this.storage?.setItem(SOUND_STORAGE_KEY, JSON.stringify(this.value)); } catch { /* Session settings still work. */ } }
}