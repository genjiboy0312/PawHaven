import { AccountStorage } from '../account/AccountStorage';
import { PlayMenuPopup } from '../ui/PlayMenuPopup';
import { RoomClient, roomTransport } from '../multiplayer/RoomClient';
import { roomStream, lobbyStream } from '../multiplayer/RoomStream';
import type { CourseId } from './CourseCatalog';
import { AccountService } from '../account/AccountService';
import { createAccountClient } from '../account/client';
import { loadHome } from '../home/loadHome';
import type { HomeTextures } from '../home/LobbyMap';
import { HomeState } from '../home/HomeState';
import { HomeScene } from './scenes/HomeScene';
import { ShopState } from '../shop/ShopState';
import { EconomyClient } from '../shop/EconomyClient';
import { economyTransport } from '../shop/economyTransport';
import { ServerShopState } from '../shop/ServerShopState';
import type { CommerceState } from '../shop/CommerceState';
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
  private rooms?:RoomClient;
  private playMenu?:PlayMenuPopup;
  private account?: AccountService;
  private commerce?: CommerceState;
  private homeTextures?: HomeTextures;
  private settings?: SettingsPopup;
  private quests?: QuestPopup;
  private friends?: FriendsPopup;
  private audio?: AudioSystem;
  private readonly outfit = createOutfit();
  private readonly app = new Application();
  private scenes: SceneManager | undefined;
  private disposed = false;
  private readonly events = new AbortController();
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

    this.scenes.show(new BootScene());
    const playerStorage = new AccountStorage(storage);
    const accountClient = createAccountClient();
    this.account = new AccountService(playerStorage, accountClient);
    await this.account.initialize();
    if (this.disposed) return;
    let presets = new CharacterPresets(playerStorage);
    let character = new CharacterSelection(playerStorage);
    let releaseOwnership = (): void => undefined;
    const makeCommerce = (): CommerceState => {
      releaseOwnership();
      const owner = this.account?.user?.id;
      const state = owner && accountClient
        ? new ServerShopState(new EconomyClient(economyTransport(accountClient, owner))) : new ShopState(playerStorage);
      this.commerce = state;
      releaseOwnership = state.subscribe(() => {
        if (!state.entitlementsKnown || this.commerce !== state) return;
        const look = character.restore(['corgi', 'myeongrang'], (category, index) => state.owns(category, index));
        Object.assign(this.outfit, look.outfit);
      });
      return state;
    };
    let commerce = makeCommerce();
    let home = new HomeState(playerStorage);

    const savedCharacter = character.restore(['corgi', 'myeongrang'], (category, index) => !commerce.entitlementsKnown || commerce.owns(category, index));
    Object.assign(this.outfit, savedCharacter.outfit);
    const applyGame = (value: GamePreferences): void => {
      host.style.setProperty('--control-scale', String(value.controlSize));
      host.classList.toggle('left-handed', value.leftHanded);
    };
    setLanguage(gameSettings.current.language); applyGame(gameSettings.current);
    this.audio = new AudioSystem(preferences.current);
    this.settings = new SettingsPopup(preferences, this.audio, paused => this.scenes?.setPaused(paused), gameSettings, applyGame, this.account);
    const openSettings = (): void => this.settings?.open();
    this.app.renderer.on('resize', this.resize);
    this.app.ticker.add(this.tick);
    document.addEventListener('visibilitychange', this.visibility);

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
    const lobby = (returning = false, initialMenu?:'mode'|'multi'): void => {
      if (this.disposed) return;
      const runCommerce = commerce;
      let starting = false;
      const launch = async (origin: LobbyScene | PlayScene, map:CourseId='garden'): Promise<boolean> => {
        if (starting || !runCommerce.ready) return false;
        starting = true;
        try {
          if (!await runCommerce.beginRun() || this.disposed || commerce !== runCommerce || !this.scenes?.isCurrent(origin)) return false;
          let completion = Promise.resolve();
          const play = new PlayScene(activePet, () => lobby(true), {
            open: openSettings, preferences: () => gameSettings.current, map,
            sound: kind => { this.audio?.play(kind); if (gameSettings.current.vibration) navigator.vibrate?.(20); },
            complete: () => { completion = Promise.resolve(runCommerce.completeRun()); },
            retry: async () => { await completion; return launch(play,map); },
          });
          this.scenes.show(play); return true;
        } finally { starting = false; }
      };
      const openMenu=(page:'mode'|'multi'='mode'):void=>{
        if(this.disposed)return;
        const owner=this.account?.user?.id;
        const rooms=this.rooms??(owner&&accountClient?new RoomClient(owner,roomTransport(accountClient,owner,async()=>{
          if(this.account?.pendingSave&&this.account.canSave)await this.account.save();
        }),roomStream(accountClient,owner),lobbyStream(accountClient,owner)):undefined);
        this.rooms=rooms;
        const menu=new PlayMenuPopup(paused=>this.scenes?.setPaused(paused),{
          rooms,pets,single:map=>launch(scene,map),login:()=>this.settings?.openAccount(),
          race:(room,client)=>{
            const look=room.members.find(m=>m.id===client.owner)?.look;
            const original=look?.petId===this.myeongrang?.id?this.myeongrang!:corgi;
            const racePet={...original,wardrobe:original.wardrobe&&look?{...original.wardrobe,outfit:{...look.outfit}}:original.wardrobe};
            this.scenes?.show(new PlayScene(racePet,()=>{
              lobby(true,'multi');if(client.room?.phase==='results')void client.command('return');
            },{open:openSettings,preferences:()=>gameSettings.current,map:room.map,
              sound:kind=>{this.audio?.play(kind);},
              multiplayer:{client,pets:[corgi,this.myeongrang!],leave:()=>{client.destroy();this.rooms=undefined;lobby(true);}},
            }));
          },
          dismiss:keep=>{this.playMenu=undefined;if(!keep){rooms?.destroy();if(this.rooms===rooms)this.rooms=undefined;}},
        });
        this.playMenu=menu;menu.open(page);
      };
      const scene = new LobbyScene(activePet, () => openMenu(), returning, () => {
        if (!this.disposed) this.scenes?.show(new CharacterScene(activePet, this.outfit, () => lobby(true), { presets, pets, onLookChanged: look => { character.save(look); }, onPetChanged: config => { activePet = config; }, owns: (category, index) => commerce.owns(category, index), subscribe: callback => commerce.subscribe(callback) }));
      }, () => this.settings?.open(false), { click: () => this.audio?.play('click'), notice: () => commerce.message, retry: () => commerce.retry(), busy: () => commerce.busy, shop: () => openShop(), quest: () => this.quests?.open(), pet: () => { void commerce.recordPet(); }, friends: () => this.friends?.open(), rewards: () => commerce.hasQuestRewards }, { state: home, textures: this.homeTextures, open: () => { if (!this.disposed) this.scenes?.show(new HomeScene(home, () => lobby(true), this.homeTextures)); } }, () => this.account?.user ? this.account.nickname : null);
      this.scenes?.show(scene);
      if(initialMenu)openMenu(initialMenu);
    };
    this.account.onLoaded(() => {
      if (this.disposed) return;
      this.playMenu?.destroy();this.rooms?.destroy();this.rooms=undefined;
      const reopenSettings = this.settings?.opened;
      this.settings?.close();
      this.quests?.destroy(); this.friends?.destroy();
      presets = new CharacterPresets(playerStorage);
      home = new HomeState(playerStorage);
      commerce.destroy(); commerce = makeCommerce();
      character = new CharacterSelection(playerStorage);
      const look = character.restore(['corgi', 'myeongrang'], (category, index) => !commerce.entitlementsKnown || commerce.owns(category, index));
      Object.assign(this.outfit, look.outfit);
      activePet = look.petId === this.myeongrang?.id ? this.myeongrang! : corgi;
      this.friends = new FriendsPopup(paused => this.scenes?.setPaused(paused));
      this.quests = new QuestPopup(commerce, paused => this.scenes?.setPaused(paused), () => openShop('Pass'));
      lobby(true);
      if (reopenSettings) this.settings?.open(false);
    });
    window.addEventListener('online', () => { if (this.account?.storage.meta.dirty) void this.account.save(); }, { signal: this.events.signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.account?.storage.meta.dirty) void this.account.save(); }, { signal: this.events.signal });
    this.scenes.show(new TitleScene(() => lobby()));

    this.visibility();
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.playMenu?.destroy();this.rooms?.destroy();
    this.events.abort(); this.account?.destroy(); this.commerce?.destroy();
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
