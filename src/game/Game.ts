import { AccountStorage } from '../account/AccountStorage';
import { PlayMenuPopup } from '../ui/PlayMenuPopup';
import { GAME_FONT } from '../ui/GameFont';
import { MailboxClient,mailboxTransport } from '../mail/MailboxClient';
import { MailboxPopup } from '../ui/MailboxPopup';
import { ParkClient } from '../park/ParkClient';
import { ParkScene } from './scenes/ParkScene';
import { RoomClient, roomTransport } from '../multiplayer/RoomClient';
import { RoomInvitation } from '../multiplayer/RoomInvitation';
import { roomStream, lobbyStream } from '../multiplayer/RoomStream';
import type { CourseId } from './CourseCatalog';
import { SingleRecords } from './SingleRecords';
import { loadCourseArt, type CourseArt } from './CourseArt';
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
import { FriendsClient, friendsTransport } from '../friends/FriendsClient';
import {readFriendHome} from '../friends/FriendHome';
import {loadSnakeArt,type SnakeArt} from './SnakeView';
import { FriendActivity, activityTransport } from '../friends/FriendActivity';
import { FriendInviteInbox } from '../ui/FriendInviteInbox';
import { CharacterPresets } from '../animals/CharacterPresets';
import { CharacterSelection } from '../animals/CharacterSelection';
import { GameSettings, type GamePreferences } from '../settings/GameSettings';
import { setLanguage } from '../settings/i18n';
import { SoundSettings } from '../settings/SoundSettings';
import { SettingsPopup } from '../ui/SettingsPopup';
import { AppInstall } from '../ui/AppInstall';
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
  private readonly installation = new AppInstall();
  private rooms?:RoomClient;
  private mailClient?:MailboxClient;private mailbox?:MailboxPopup;
  private playMenu?:PlayMenuPopup;
  private account?: AccountService;
  private commerce?: CommerceState;
  private homeTextures?: HomeTextures;
  private courseArt?:CourseArt;
  private snakeArt?:SnakeArt;
  private settings?: SettingsPopup;
  private quests?: QuestPopup;
  private friends?: FriendsPopup;
  private friendActivity?:FriendActivity;
  private friendClient?:FriendsClient;
  private friendInbox?:FriendInviteInbox;
  private audio?: AudioSystem;
  private readonly outfit = createOutfit();
  private readonly app = new Application();
  private scenes: SceneManager | undefined;
  private disposed = false;
  private readonly events = new AbortController();
  private corgi: AnimalConfig | undefined;
  private myeongrang: AnimalConfig | undefined;
  private releaseFrames(): void {
    if(this.snakeArt){[...this.snakeArt.move,...this.snakeArt.tongue].forEach(texture=>texture.destroy(false));this.snakeArt=undefined;}
    if(this.courseArt){[this.courseArt.grass,this.courseArt.soil,...Object.values(this.courseArt.markers).map(marker=>marker.texture)].forEach(texture=>{if(!texture.destroyed)texture.destroy(false);});this.courseArt=undefined;}
    if (this.homeTextures) { Object.values(this.homeTextures).forEach(texture => texture.destroy(false)); this.homeTextures = undefined; }
    const configs = [this.corgi, this.myeongrang].filter((config): config is AnimalConfig => !!config);
    const textures = new Set(configs.flatMap(config => [...Object.values(config.animations).flatMap(animation => animation.frames),
      ...Object.values(config.effects ?? {}).flat(), ...(config.wardrobe ? [config.wardrobe.santaHat,...[config.wardrobe.topHat,config.wardrobe.bowTie].filter((texture):texture is NonNullable<typeof texture>=>!!texture)] : [])]));
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
    await document.fonts.load(`18px ${GAME_FONT}`).catch(()=>{});
    if(this.disposed)return;
    this.app.canvas.setAttribute('aria-label', 'Paw Haven 정원');
    this.scenes = new SceneManager(this.app);
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Session-only settings. */ }
    let invitationStorage:Storage|undefined;
    try { invitationStorage=window.sessionStorage; } catch { /* Keep the invitation in the URL. */ }
    const invitation=new RoomInvitation(window.location.href,invitationStorage);
    const clearInvitation=():void=>{
      invitation.clear();
      const url=new URL(window.location.href);url.searchParams.delete('room');
      try{window.history.replaceState(window.history.state,'',url.href);}catch{/* The in-memory invitation is still cleared. */}
    };
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
        home.revision++;
        const look = character.restore(['corgi', 'myeongrang'], (category, index) => state.owns(category, index));
        Object.assign(this.outfit, look.outfit);
      });
      return state;
    };
    let commerce = makeCommerce();
    let home = new HomeState(playerStorage, (tab, index) => commerce.entitlementsKnown ? commerce.homeOwned(tab, index) : undefined);
    let records = new SingleRecords(playerStorage);

    const savedCharacter = character.restore(['corgi', 'myeongrang'], (category, index) => !commerce.entitlementsKnown || commerce.owns(category, index));
    Object.assign(this.outfit, savedCharacter.outfit);
    const applyGame = (value: GamePreferences): void => {
      host.style.setProperty('--control-scale', String(value.controlSize));
      host.classList.toggle('left-handed', value.leftHanded);
    };
    setLanguage(gameSettings.current.language); applyGame(gameSettings.current);
    this.audio = new AudioSystem(preferences.current);
    this.settings = new SettingsPopup(preferences, this.audio, paused => this.scenes?.setPaused(paused), gameSettings, applyGame, this.account, this.installation);
    const openSettings = (): void => this.settings?.open();
    this.app.renderer.on('resize', this.resize);
    this.app.ticker.add(this.tick);
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('pageshow', this.visibility, { signal: this.events.signal });

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
    if (!this.disposed) this.courseArt = await loadCourseArt();
    if (!this.disposed) this.snakeArt = await loadSnakeArt();
    if (this.disposed) { this.releaseFrames(); return; }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (this.disposed) return;
    let activePet = savedCharacter.petId === this.myeongrang?.id ? this.myeongrang : corgi;
    preload.setProgress(1);
    const pets = [{ config: corgi, name: 'Corgi', thumbnail: './assets/characters/corgi/corgi-idle-walk.png' },
      { config: this.myeongrang!, name: 'Myeongrang', thumbnail: './assets/characters/myeongrang/idle.png' }];
    const openShop = (tab: 'Style' | 'Pass' = 'Style'): void => {
      if (!this.disposed) this.scenes?.show(new ShopScene(activePet, commerce, () => lobby(true), () => { lobby(true); this.quests?.open('seasonPass'); }, tab,(category,index)=>{
        if(!commerce.entitlementsKnown||!commerce.owns(category,index))return;
        this.outfit[category]=index;character.save({petId:activePet.id,outfit:this.outfit});
      }));
    };
    let inGame=false;let currentLobby:LobbyScene|undefined;
    const saveRoomLook=async()=>{if(this.account?.pendingSave)await this.account.save();};
    const showFriendHome=(saved:Awaited<ReturnType<typeof readFriendHome>>,leave:()=>void)=>{
      const source=saved.character.petId===this.myeongrang?.id?this.myeongrang!:corgi;
      const config={...source,wardrobe:source.wardrobe?{...source.wardrobe,outfit:{...saved.character.outfit}}:undefined};
      this.scenes?.show(new LobbyScene(config,undefined,true,undefined,undefined,undefined,{state:saved.home,textures:this.homeTextures,open:()=>{}},undefined,{name:saved.nickname,leave}));
    };
    const showPark=(channel?:number)=>{
      const owner=this.account?.user?.id;if(this.disposed||!owner||!accountClient)return;
      const park=new ParkScene(new ParkClient(accountClient,owner),[corgi,this.myeongrang!],()=>lobby(true),this.homeTextures,openSettings,this.friendClient,{
        channel,visit:async(id,originChannel,signal)=>{
          const saved=await readFriendHome(accountClient,owner,id,signal);
          if(signal.aborted||this.disposed||this.account?.user?.id!==owner||!this.scenes?.isCurrent(park))return;
          showFriendHome(saved,()=>showPark(originChannel));
        }
      });
      inGame=true;this.scenes?.show(park);void this.friendActivity?.refresh();
    };
    const makeActivity=()=>{
      const owner=this.account?.user?.id;
      if(!owner||!accountClient)return;
      const activity=new FriendActivity(owner,activityTransport(accountClient,owner,saveRoomLook),()=>inGame?'playing':'lobby');
      this.friendActivity=activity;
      this.friendInbox=new FriendInviteInbox(activity,()=>!!currentLobby&&!!this.scenes?.isCurrent(currentLobby)&&!this.rooms?.room&&!document.hidden&&!document.querySelector('#app > .settings-overlay:not(.friend-invite-inbox)'),
        paused=>this.scenes?.setPaused(paused),()=>{lobby(true,'multi');});
      activity.start();
    };
    const makeFriends=()=>{
      this.friendClient=this.account?.user&&accountClient?new FriendsClient(this.account.user.id,friendsTransport(accountClient,this.account.user.id)):undefined;
      return new FriendsPopup(paused=>this.scenes?.setPaused(paused||!!this.playMenu),this.friendClient,
        ()=>this.settings?.openAccount(),()=>this.account?.nickname??null,this.friendActivity,()=>{const room=this.rooms?.room;return !!room&&room.host===this.account?.user?.id&&room.phase==='waiting'&&room.members.length<4;},true,{
          available:()=>!!currentLobby&&!!this.scenes?.isCurrent(currentLobby)&&!this.playMenu&&!this.rooms?.room,
          open:async(id,signal)=>{
            const owner=this.account?.user?.id,origin=currentLobby;if(!owner||!accountClient||!origin||!this.scenes?.isCurrent(origin))return;
            const saved=await readFriendHome(accountClient,owner,id,signal);
            if(signal.aborted||this.disposed||this.account?.user?.id!==owner||!this.scenes?.isCurrent(origin))return;
            this.friends?.close();
            showFriendHome(saved,()=>lobby(true));
          }
        });
    };
    const makeMailbox=()=>{
      const owner=this.account?.user?.id,state=commerce;
      this.mailClient=owner&&accountClient?new MailboxClient(mailboxTransport(accountClient,owner),async()=>{if(state instanceof ServerShopState)await state.reload();}):undefined;
      return new MailboxPopup(paused=>this.scenes?.setPaused(paused),this.mailClient,()=>this.settings?.openAccount());
    };
    this.mailbox=makeMailbox();
    makeActivity();
    this.friends = makeFriends();
    this.quests = new QuestPopup(commerce, paused => this.scenes?.setPaused(paused), () => openShop('Pass'));
    const lobby = (returning = false, initialMenu?:'mode'|'multi'): void => {
      if (this.disposed) return;
      inGame=false;
      this.mailClient?.start();
      if(this.account?.nickname)this.friendClient?.start();
      const runCommerce = commerce;
      let starting = false;
      const launch = async (origin: LobbyScene | PlayScene, map:CourseId='garden'): Promise<boolean> => {
        if (starting || !runCommerce.ready) return false;
        starting = true;
        try {
          if (!await runCommerce.beginRun() || this.disposed || commerce !== runCommerce || !this.scenes?.isCurrent(origin)) return false;
          let completion = Promise.resolve();
          const runRecords=records;
          const play = new PlayScene(activePet, () => lobby(true), {
            open: openSettings, preferences: () => gameSettings.current, map,art:this.courseArt,snakeArt:this.snakeArt,
            sound: kind => { this.audio?.play(kind); if (gameSettings.current.vibration) navigator.vibrate?.(20); },
            complete: () => { completion = Promise.resolve(runCommerce.completeRun()); },
            record:(seconds,falls)=>runRecords.complete(map,seconds,falls),goals:()=>runRecords.goals(map),
            retry: async () => { await completion; return launch(play,map); },
          });
          inGame=true;this.friendClient?.stop();this.scenes.show(play);void this.friendActivity?.refresh();return true;
        } finally { starting = false; }
      };
      const openMenu=(page:'mode'|'multi'='mode'):void=>{
        if(this.disposed)return;
        const owner=this.account?.user?.id;
        const rooms=this.rooms??(owner&&accountClient?new RoomClient(owner,roomTransport(accountClient,owner,saveRoomLook),roomStream(accountClient,owner),lobbyStream(accountClient,owner)):undefined);
        this.rooms=rooms;
        const menu=new PlayMenuPopup(paused=>this.scenes?.setPaused(paused),{
          invitation:invitation.room?{id:invitation.room,dismiss:clearInvitation}:undefined,
          rooms,pets,nickname:()=>this.account?.nickname,best:map=>records.best(map),goals:map=>records.goals(map),single:map=>launch(scene,map),login:()=>this.settings?.openAccount(),
          inviteFriends:()=>this.friends?.open(),
          park:()=>{
            if(!owner||!accountClient||!this.account?.nickname){this.settings?.openAccount();return;}
            const enter=async()=>{
              await saveRoomLook();
              if(this.disposed||!this.scenes?.isCurrent(scene)||this.account?.user?.id!==owner)return;
              showPark();
            };void enter().catch(()=>this.settings?.openAccount());
          },
          race:(room,client)=>{
            this.friends?.close();this.friendClient?.stop();inGame=true;void this.friendActivity?.refresh();
            const look=room.members.find(m=>m.id===client.owner)?.look;
            const original=look?.petId===this.myeongrang?.id?this.myeongrang!:corgi;
            const racePet={...original,wardrobe:original.wardrobe&&look?{...original.wardrobe,outfit:{...look.outfit}}:original.wardrobe};
            this.scenes?.show(new PlayScene(racePet,()=>{
              lobby(true,'multi');if(client.room?.phase==='results')void client.command('return');
            },{open:openSettings,preferences:()=>gameSettings.current,map:room.map,art:this.courseArt,
              sound:kind=>{this.audio?.play(kind);},
              multiplayer:{client,pets:[corgi,this.myeongrang!],leave:()=>{client.destroy();this.rooms=undefined;lobby(true);},
                failed:()=>{client.destroy();this.rooms=undefined;lobby(true,'multi');}},
            }));
          },
          dismiss:keep=>{this.playMenu=undefined;if(!keep){rooms?.destroy();if(this.rooms===rooms)this.rooms=undefined;}},
        });
        this.playMenu=menu;menu.open(page);
      };
      const scene = new LobbyScene(activePet, () => openMenu(), returning, () => {
        if (!this.disposed) this.scenes?.show(new CharacterScene(activePet, this.outfit, () => lobby(true), { presets, pets, onLookChanged: look => { character.save(look); }, onPetChanged: config => { activePet = config; }, owns: (category, index) => commerce.owns(category, index), subscribe: callback => commerce.subscribe(callback) }));
      }, () => this.settings?.open(false), { click: () => this.audio?.play('click'), notice: () => commerce.message, retry: () => commerce.retry(), busy: () => commerce.busy, shop: () => openShop(), quest: () => this.quests?.open(), pet: () => { void commerce.recordPet(); }, snacks: commerce, friends: () => this.friends?.open(), mail:()=>this.mailbox?.open(), mailPending:()=>this.mailClient?.pending??0, requests: () => this.friendClient?.snapshot.incoming.length ?? 0, rewards: () => commerce.hasQuestRewards }, { state: home, textures: this.homeTextures, open: () => { if (!this.disposed) this.scenes?.show(new HomeScene(home, () => lobby(true), this.homeTextures, callback => commerce.subscribe(callback))); } }, () => this.account?.user ? this.account.nickname : null);
      currentLobby=scene;this.scenes?.show(scene);void this.friendActivity?.refresh();
      if(initialMenu)openMenu(initialMenu);
    };
    this.account.onLoaded(() => {
      if (this.disposed) return;
      this.playMenu?.destroy();this.rooms?.destroy();this.rooms=undefined;
      const reopenSettings = this.settings?.opened;
      this.settings?.close();
      this.friendInbox?.destroy();this.friendActivity?.destroy();this.friendInbox=undefined;this.friendActivity=undefined;
      this.quests?.destroy(); this.friends?.destroy();this.mailbox?.destroy();this.mailClient?.destroy();
      presets = new CharacterPresets(playerStorage);
      home = new HomeState(playerStorage, (tab, index) => commerce.entitlementsKnown ? commerce.homeOwned(tab, index) : undefined);
      records = new SingleRecords(playerStorage);
      commerce.destroy(); commerce = makeCommerce();
      character = new CharacterSelection(playerStorage);
      const look = character.restore(['corgi', 'myeongrang'], (category, index) => !commerce.entitlementsKnown || commerce.owns(category, index));
      Object.assign(this.outfit, look.outfit);
      activePet = look.petId === this.myeongrang?.id ? this.myeongrang! : corgi;
      inGame=false;makeActivity();this.friends = makeFriends();
      this.mailbox=makeMailbox();
      this.quests = new QuestPopup(commerce, paused => this.scenes?.setPaused(paused), () => openShop('Pass'));
      const resumeInvitation=!!invitation.room&&!!this.account?.user&&this.account.status!=='loading';
      lobby(true,resumeInvitation?'multi':undefined);
      if (reopenSettings&&!resumeInvitation) this.settings?.open(false);
    });
    window.addEventListener('online', () => { if (this.account?.storage.meta.dirty) void this.account.save(); }, { signal: this.events.signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.account?.storage.meta.dirty) void this.account.save(); }, { signal: this.events.signal });
    this.scenes.show(new TitleScene(() => lobby(false,invitation.room?'multi':undefined)));

    this.visibility();
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.installation.destroy();
    this.mailbox?.destroy();this.mailClient?.destroy();
    this.friendInbox?.destroy();this.friendActivity?.destroy();
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
