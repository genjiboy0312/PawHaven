import { loadHome } from '../home/loadHome';
import type { HomeTextures } from '../home/LobbyMap';
import { HomeState } from '../home/HomeState';
import { HomeScene } from './scenes/HomeScene';
import { ShopState } from '../shop/ShopState';
import { ShopScene } from './scenes/ShopScene';
import { QuestPopup } from '../ui/QuestPopup';
import { FriendsPopup } from '../ui/FriendsPopup';
import { CharacterPresets } from '../animals/CharacterPresets';
import { CharacterSelection } from '../animals/CharacterSelection';
import { GameSettings, type GamePreferences } from '../settings/GameSettings';
import { setLanguage } from '../settings/i18n';
import { SoundSettings } from '../settings/SoundSettings';
import { SettingsPopup } from '../ui/SettingsPopup';
import { AudioSystem } from '../systems/AudioSystem';
import { createOutfit } from '../animals/OutfitState';
import { CharacterScene } from './scenes/CharacterScene';
import { PlayScene } from './scenes/PlayScene';
import { TitleScene } from './scenes/TitleScene';
import type { AnimalConfig } from '../animals/AnimalConfig';
import { loadMyeongrang } from '../animals/loadMyeongrang';
import { loadCorgi } from '../animals/loadCorgi';
import { Application, type Ticker } from 'pixi.js';
import { SceneManager } from './SceneManager';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { LobbyScene } from './scenes/LobbyScene';

export class Game {
  private homeTextures?: HomeTextures;
  private settings?: SettingsPopup;
  private quests?: QuestPopup;
  private friends?: FriendsPopup;
  private audio?: AudioSystem;
  private readonly outfit = createOutfit();
  private readonly app = new Application();
  private scenes: SceneManager | undefined;
  private disposed = false;
  private corgi: AnimalConfig | undefined;
  private myeongrang: AnimalConfig | undefined;
  private releaseFrames(): void {
    if (this.homeTextures) { Object.values(this.homeTextures).forEach(texture => texture.destroy(false)); this.homeTextures = undefined; }
    const configs = [this.corgi, this.myeongrang].filter((config): config is AnimalConfig => !!config);
    const textures = new Set(configs.flatMap(config => [...Object.values(config.animations).flatMap(animation => animation.frames),
      ...Object.values(config.effects ?? {}).flat(), ...(config.wardrobe ? [config.wardrobe.santaHat] : [])]));
    for (const texture of textures) if (!texture.destroyed) texture.destroy(false);
    this.corgi = this.myeongrang = undefined;
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
    const gameSettings = new GameSettings(storage);
    const presets = new CharacterPresets(storage);
    const commerce = new ShopState(storage);
    const home = new HomeState(storage);
    const character = new CharacterSelection(storage);
    const savedCharacter = character.restore(['corgi', 'myeongrang'], (category, index) => commerce.owns(category, index));
    Object.assign(this.outfit, savedCharacter.outfit);
    const applyGame = (value: GamePreferences): void => {
      host.style.setProperty('--control-scale', String(value.controlSize));
      host.classList.toggle('left-handed', value.leftHanded);
    };
    setLanguage(gameSettings.current.language); applyGame(gameSettings.current);
    this.audio = new AudioSystem(preferences.current);
    this.settings = new SettingsPopup(preferences, this.audio, paused => this.scenes?.setPaused(paused), gameSettings, applyGame);
    const openSettings = (): void => this.settings?.open();
    this.app.renderer.on('resize', this.resize);
    this.app.ticker.add(this.tick);
    document.addEventListener('visibilitychange', this.visibility);
    this.scenes.show(new BootScene());
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (this.disposed) return;
    const preload = new PreloadScene();
    this.scenes.show(preload);
    document.querySelector('#status')?.remove();
    const corgi = await loadCorgi((progress) => { if (!this.disposed) preload.setProgress(progress * 0.6); }, this.outfit);
    this.corgi = corgi;
    if (!this.disposed) this.myeongrang = await loadMyeongrang(corgi);
    if (!this.disposed) preload.setProgress(0.9);
    if (!this.disposed) this.homeTextures = await loadHome();
    if (this.disposed) { this.releaseFrames(); return; }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (this.disposed) return;
    let activePet = savedCharacter.petId === this.myeongrang?.id ? this.myeongrang : corgi;
    preload.setProgress(1);
    const pets = [{ config: corgi, name: 'Corgi', thumbnail: './assets/characters/corgi/corgi-idle-walk.png' },
      { config: this.myeongrang!, name: 'Myeongrang', thumbnail: './assets/characters/myeongrang/idle.png' }];
    const openShop = (tab: 'Style' | 'Pass' = 'Style'): void => {
      if (!this.disposed) this.scenes?.show(new ShopScene(activePet, commerce, () => lobby(true), () => { lobby(true); this.quests?.open('seasonPass'); }, tab));
    };
    this.friends = new FriendsPopup(paused => this.scenes?.setPaused(paused));
    this.quests = new QuestPopup(commerce, paused => this.scenes?.setPaused(paused), () => openShop('Pass'));
    const lobby = (returning = false): void => {
      if (this.disposed) return;
      this.scenes?.show(new LobbyScene(activePet, () => {
        if (!this.disposed) this.scenes?.show(new PlayScene(activePet, () => { commerce.completeRun(); lobby(true); }, { open: openSettings, preferences: () => gameSettings.current, sound: kind => { this.audio?.play(kind); if (gameSettings.current.vibration) navigator.vibrate?.(20); } }));
      }, returning, () => {
        if (!this.disposed) this.scenes?.show(new CharacterScene(activePet, this.outfit, () => lobby(true), { presets, pets, onLookChanged: look => { character.save(look); }, onPetChanged: config => { activePet = config; }, owns: (category, index) => commerce.owns(category, index) }));
      }, () => this.settings?.open(false), { click: () => this.audio?.play('click'), shop: () => openShop(), quest: () => this.quests?.open(), pet: () => { commerce.recordPet(); }, friends: () => this.friends?.open(), rewards: () => commerce.hasQuestRewards }, { state: home, textures: this.homeTextures, open: () => { if (!this.disposed) this.scenes?.show(new HomeScene(home, () => lobby(true), this.homeTextures)); } }));
    };
    this.scenes.show(new TitleScene(() => lobby()));

    this.visibility();
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('visibilitychange', this.visibility);
    if (!this.initialized) return;
    this.app.renderer.off('resize', this.resize);
    this.app.ticker.remove(this.tick);
    this.quests?.destroy();
    this.friends?.destroy();
    this.settings?.destroy();
    this.audio?.destroy();
    this.scenes?.destroy();
    this.releaseFrames();
    this.app.destroy(true, { children: true });
  }
}
