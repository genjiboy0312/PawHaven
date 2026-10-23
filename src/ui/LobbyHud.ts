import { bindAria, bindText } from '../settings/i18n';
import type { AnimalVisualState } from '../animals/AnimalState';

const ICONS = {
  home: '<path d="M16 29h32v23H16z" fill="#fff2d6"/><path d="m10 29 22-18 22 18-4 5-18-14-18 14z" fill="#e8ac93"/><path d="M27 52V37h10v15" fill="#b6cba1"/><path d="M21 23v-9h6"/>',
  quest: '<rect x="15" y="14" width="34" height="40" rx="5" fill="#b9cf9f"/><rect x="21" y="21" width="22" height="27" rx="2" fill="#fff9e7" stroke="none"/><rect x="24" y="10" width="16" height="11" rx="4" fill="#ecd095"/><path d="m25 34 5 5 10-12" stroke="#789461" stroke-width="4"/>',
  character: '',
  shop: '<rect x="15" y="26" width="34" height="27" rx="3" fill="#fff0d2"/><path d="m11 27 6-14h30l6 14" fill="#e6a28c"/><path d="M22 14v13m10-13v13m10-13v13" stroke="#fff3dc" stroke-width="6"/><path d="M11 27c0 7 10 7 10 0 0 7 11 7 11 0 0 7 11 7 11 0 0 7 10 7 10 0" fill="#e6a28c"/><path d="M27 53V39h11v14" fill="#b8cda5"/>',
  settings: '<path d="m27 10 10 0 2 7 5 3 7-2 5 9-5 5v5l5 5-5 9-7-2-5 3-2 6H27l-2-6-5-3-7 2-5-9 5-5v-5l-5-5 5-9 7 2 5-3z" fill="#b5cfd7" transform="translate(0 -2)"/><circle cx="32" cy="32" r="9" fill="#fff9e7"/>',
  friends: '',
  play: '<path d="M24 15q-4-2-4 3v28q0 5 4 3l25-15q4-2 0-4z" fill="#fffbee" stroke="#7e9953"/>',
};
type MenuId = keyof typeof ICONS;
const PET_ICONS:Partial<Record<MenuId,string>>={character:'./assets/icons/lobby-character.svg?v=20261024',friends:'./assets/icons/lobby-friends.png?v=20261024'};

export class LobbyHud {
  readonly element = document.createElement('section');
  private readonly status = document.createElement('p');
  private readonly petTarget = document.createElement('button');
  private readonly abort = new AbortController();
  private readonly economyNote = document.createElement('div');
  private readonly economyCaption = document.createElement('p');
  private readonly economyRetry = document.createElement('button');
  private readonly readNotice?: () => string;
  private readonly economyBusy?: () => boolean;
  private previousState: AnimalVisualState | undefined;
  private questButton?: HTMLButtonElement;
  private questReady?: boolean;
  private readonly rewards?: () => boolean;
  private readonly requestBadge=document.createElement('span');
  private friendsButton?:HTMLButtonElement;
  private requestCount=-1;
  private readonly requests?:()=>number;
  private readonly clickSound?: () => void;

  constructor(onPlay?: () => void, fadeIn = false, onCharacter?: () => void, onSettings?: () => void, commerce?: { shop: () => void; quest: () => void; friends?: () => void; requests?:()=>number; rewards?: () => boolean; click?: () => void; notice?: () => string; retry?: () => void; busy?: () => boolean }, onHome?: () => void, onPet?: () => void) {
    this.requests=commerce?.requests;
    this.rewards = commerce?.rewards;
    this.clickSound = commerce?.click;
    this.readNotice = commerce?.notice; this.economyBusy = commerce?.busy;
    this.economyNote.className = 'lobby-economy-note'; this.economyNote.hidden = true; this.economyNote.setAttribute('role','status');
    this.economyRetry.type = 'button'; bindText(this.economyRetry, 'economyRetry');
    this.economyRetry.addEventListener('click', () => commerce?.retry?.(), { signal: this.abort.signal });
    this.economyNote.append(this.economyCaption, this.economyRetry);
    this.element.className = 'lobby-hud';
    this.element.setAttribute('aria-label', 'Lobby menu layout');
    const character = document.createElement('div');
    character.className = 'hud-character';
    const characterButton = this.menu('character', 'Character');
    if (onCharacter) {
      characterButton.disabled = false; bindAria(characterButton, 'character');
      characterButton.addEventListener('click', onCharacter, { once: true });
    }
    const home = this.menu('home', 'Home');
    if (onHome) { home.disabled = false; home.addEventListener('click', onHome, { once: true }); }
    character.append(characterButton, home);
    const utilities = document.createElement('nav');
    utilities.className = 'hud-utilities';
    utilities.setAttribute('aria-label', 'Lobby menu');
    const settings = this.menu('settings', 'Settings');
    if (onSettings) {
      settings.disabled = false; bindAria(settings, 'settings');
      settings.addEventListener('click', onSettings);
    }
    const quest = this.menu('quest', 'Quest'), shop = this.menu('shop', 'Shop');
    if (commerce) {
      quest.disabled = shop.disabled = false;
      quest.addEventListener('click', commerce.quest); shop.addEventListener('click', commerce.shop);
    }
    this.questButton = quest;
    const friends = this.menu('friends', 'Friends');
    this.friendsButton=friends;this.requestBadge.className='hud-request-badge';this.requestBadge.hidden=true;this.requestBadge.setAttribute('aria-hidden','true');friends.append(this.requestBadge);
    if (commerce?.friends) { friends.disabled = false; friends.addEventListener('click', commerce.friends); }
    utilities.append(quest, friends, shop, settings);
    const play = document.createElement('div');
    play.className = 'hud-play';
    const playButton = this.menu('play', 'Play');
    if (onPlay) {
      playButton.disabled = false;
      bindAria(playButton, 'play');
      playButton.addEventListener('click', onPlay);
    }
    play.append(playButton);
    this.status.className = 'sr-only';
    this.status.setAttribute('role', 'status');
    this.element.append(character, utilities, play, this.status);
    if (fadeIn) {
      const fade = document.createElement('div');
      fade.className = 'scene-fade fade-in';
      this.element.append(fade);
    }
    this.petTarget.type = 'button';
    this.petTarget.className = 'lobby-pet-target';
    bindAria(this.petTarget, 'petInteract');
    this.petTarget.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); onPet?.();
    }, { signal: this.abort.signal });
    this.petTarget.addEventListener('click', event => { if (event.detail === 0) onPet?.(); }, { signal: this.abort.signal });
    this.element.append(this.economyNote, this.petTarget);
    document.querySelector('#app')?.append(this.element);
  }

  private menu(id: MenuId, _label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hud-menu hud-menu-' + id;
    button.disabled = true;
    button.addEventListener('click', () => { if (!button.disabled) this.clickSound?.(); });
    button.setAttribute('data-menu', id);
    bindAria(button, id);
    const image = document.createElement('img');
    image.className = 'hud-icon';
    image.alt = '';
    image.src = PET_ICONS[id] ?? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="none" stroke="#917655" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + ICONS[id] + '</g></svg>',
    );
    const name = document.createElement('span');
    name.className = 'hud-label';
    bindText(name, id);
    button.append(image, name);
    return button;
  }
  update(state: AnimalVisualState): void {
    const value=this.requests?.()??0,count=Number.isFinite(value)?Math.max(0,Math.min(100,Math.floor(value))):0;
    if(count!==this.requestCount){this.requestCount=count;this.requestBadge.hidden=count===0;this.requestBadge.textContent=count>99?'99+':String(count);if(this.friendsButton)bindAria(this.friendsButton,count?'friendsRequestsReady':'friends');}
    const message = this.readNotice?.() ?? '';
    this.economyNote.hidden = !message; this.economyCaption.textContent = message;
    this.economyRetry.disabled = this.economyBusy?.() ?? false;
    const ready = this.rewards?.() ?? false;
    if (this.questButton && ready !== this.questReady) {
      this.questReady = ready;
      this.questButton.setAttribute('data-reward-ready', String(ready));
      bindAria(this.questButton, ready ? 'questRewardReady' : 'quest');
    }
    if (state !== this.previousState) {
      bindText(this.status, `state.${state}`);
      this.previousState = state;
    }
  }
  placePet(x: number, y: number, bounds: { x: number; y: number; width: number; height: number }, width: number, height: number, enabled: boolean): void {
    this.petTarget.disabled = !enabled;
    this.petTarget.setAttribute('style', 'left:' + (x + bounds.x) / width * 100 + '%;top:' + (y + bounds.y) / height * 100 +
      '%;width:' + bounds.width / width * 100 + '%;height:' + bounds.height / height * 100 + '%');
  }
  destroy(): void { this.abort.abort(); this.element.remove(); }
}
