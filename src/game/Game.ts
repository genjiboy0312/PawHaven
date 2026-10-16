import { SoundSettings } from '../settings/SoundSettings';
import { SettingsPopup } from '../ui/SettingsPopup';
import { AudioSystem } from '../systems/AudioSystem';
import { createOutfit } from '../animals/OutfitState';
import { CharacterScene } from './scenes/CharacterScene';
import { PlayScene } from './scenes/PlayScene';
import { TitleScene } from './scenes/TitleScene';
import type { AnimalConfig } from '../animals/AnimalConfig';
import { loadCorgi } from '../animals/loadCorgi';
import { Application, type Ticker } from 'pixi.js';
import { SceneManager } from './SceneManager';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { LobbyScene } from './scenes/LobbyScene';

export class Game {
  private settings?: SettingsPopup;
  private audio?: AudioSystem;
  private readonly outfit = createOutfit();
  private readonly app = new Application();
  private scenes: SceneManager | undefined;
  private disposed = false;
  private corgi: AnimalConfig | undefined;
  private releaseFrames(): void {
    if (!this.corgi) return;
    const textures = new Set([...Object.values(this.corgi.animations).flatMap((animation) => animation.frames),
      ...Object.values(this.corgi.effects ?? {}).flat()]);
    for (const texture of textures) texture.destroy(false);
    this.corgi = undefined;
  }
  private initialized = false;
  private readonly resize = (): void => this.scenes?.resize();
  private readonly tick = (ticker: Ticker): void => {
    this.scenes?.update(Math.min(ticker.deltaMS / 1000, 0.05));
  };
  private readonly visibility = (): void => {
    this.audio?.visibility(document.hidden);
    if (document.hidden) this.app.stop();
    else this.app.start();
  };

  async start(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host, background: '#edf0db', preference: 'webgl',
      resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true,
      antialias: false,
    });
    this.initialized = true;
    if (this.disposed) { this.app.destroy(true, { children: true }); return; }
    host.appendChild(this.app.canvas);
    this.app.canvas.setAttribute('aria-label', 'Paw Haven 정원');
    this.scenes = new SceneManager(this.app);
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Session-only settings. */ }
    const preferences = new SoundSettings(storage);
    this.audio = new AudioSystem(preferences.current);
    this.settings = new SettingsPopup(preferences, this.audio, paused => this.scenes?.setPaused(paused));
    const openSettings = (): void => this.settings?.open();
    this.app.renderer.on('resize', this.resize);
    this.app.ticker.add(this.tick);
    document.addEventListener('visibilitychange', this.visibility);
    this.scenes.show(new BootScene());
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (this.disposed) return;
    const preload = new PreloadScene();
    this.scenes.show(preload);
    const corgi = await loadCorgi((progress) => { if (!this.disposed) preload.setProgress(progress); });
    this.corgi = corgi;
    if (this.disposed) { this.releaseFrames(); return; }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (this.disposed) return;
    const lobby = (returning = false): void => {
      if (this.disposed) return;
      this.scenes?.show(new LobbyScene(corgi, () => {
        if (!this.disposed) this.scenes?.show(new PlayScene(corgi, () => lobby(true), { open: openSettings, sound: kind => this.audio?.play(kind) }));
      }, returning, () => {
        if (!this.disposed) this.scenes?.show(new CharacterScene(corgi, this.outfit, () => lobby(true)));
      }, openSettings));
    };
    this.scenes.show(new TitleScene(() => lobby()));
    document.querySelector('#status')?.remove();
    this.visibility();
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('visibilitychange', this.visibility);
    if (!this.initialized) return;
    this.app.renderer.off('resize', this.resize);
    this.app.ticker.remove(this.tick);
    this.settings?.destroy();
    this.audio?.destroy();
    this.scenes?.destroy();
    this.releaseFrames();
    this.app.destroy(true, { children: true });
  }
}
