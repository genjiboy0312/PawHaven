import { sound } from '@pixi/sound';
import type { SoundPreferences } from '../settings/SoundSettings';

/** Tiny synthesized prototype sounds; no external audio assets or downloads. */
export class AudioSystem {
  private context?: AudioContext;
  private master?: GainNode;
  private bgm?: GainNode;
  private sfx?: GainNode;
  private preferences: SoundPreferences;
  private disposed = false;
  constructor(preferences: SoundPreferences) { this.preferences = preferences; this.apply(preferences); }
  apply(preferences: SoundPreferences): void {
    this.preferences = { ...preferences };
    sound.volumeAll = preferences.muted ? 0 : preferences.master;
    if (this.context && this.master && this.bgm && this.sfx) {
      const now = this.context.currentTime;
      this.master.gain.setTargetAtTime(preferences.muted ? 0 : preferences.master, now, 0.015);
      this.bgm.gain.setTargetAtTime(preferences.bgm, now, 0.015);
      this.sfx.gain.setTargetAtTime(preferences.sfx, now, 0.015);
    }
  }
  private init(): AudioContext | undefined {
    if (this.disposed || typeof AudioContext === 'undefined') return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain(); this.master.connect(this.context.destination);
        this.bgm = this.context.createGain(); this.bgm.connect(this.master);
        this.sfx = this.context.createGain(); this.sfx.connect(this.master);
        this.apply(this.preferences);
      }
      void this.context.resume().catch(() => undefined);
      return this.context;
    } catch { return; }
  }
  play(kind: 'click' | 'jump' | 'dash' | 'attack' | 'hit' | 'bgm'): void {
    const context = this.init();
    if (!context || !this.sfx || !this.bgm) return;
    const notes = kind === 'bgm' ? [262, 330, 392, 330] : [kind === 'jump' ? 420 : kind === 'dash' ? 180 : kind === 'attack' ? 240 : kind === 'hit' ? 520 : 660];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator(), gain = context.createGain();
      const time = context.currentTime + index * 0.2, duration = kind === 'bgm' ? 0.22 : kind === 'hit' ? .075 : 0.11;
      oscillator.type = kind === 'attack' || kind === 'hit' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, time);
      oscillator.frequency.exponentialRampToValueAtTime(kind === 'jump' ? frequency * 1.6 : kind === 'hit' ? 170 : frequency * 0.8, time + duration);
      gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(0.12, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
      oscillator.connect(gain); gain.connect(kind === 'bgm' ? this.bgm! : this.sfx!);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(time); oscillator.stop(time + duration + 0.02);
    });
  }
  visibility(hidden: boolean): void {
    if (this.context) void (hidden ? this.context.suspend() : this.context.resume()).catch(() => undefined);
  }
  destroy(): void {
    this.disposed = true;
    if (this.context) void this.context.close().catch(() => undefined);
    sound.stopAll();
  }
}
