import { bindAria, bindText } from '../settings/i18n';
import type { AnimalVisualState } from '../animals/AnimalState';

const ICONS = {
  home: '<path d="m9 30 23-19 23 19M16 27v27h32V27M27 54V37h11v17"/>',
  quest: '<path d="M20 14h24v40H16V14h4m3-4h18v9H23z"/><path d="m23 31 3 3 5-6m3 4h6M23 43h17"/>',
  character: '<path d="m21 20-9 8 7 10 5-4v19h24V34l5 4 7-10-9-8-8 5h-6z"/><path d="M27 39c0-6 10-6 10 0s-10 6-10 0z"/><path d="M26 32v1m6-2v1m6 0v1"/>',
  shop: '<path d="M17 27h30v27H17zM13 27l5-13h28l5 13"/><path d="M13 27c0 8 10 8 10 0 0 8 9 8 9 0 0 8 9 8 9 0 0 8 10 8 10 0M27 54V41h11v13"/>',
  settings: '<circle cx="32" cy="32" r="17"/><circle cx="32" cy="32" r="7"/><path d="M32 8v7m0 34v7M8 32h7m34 0h7M15 15l5 5m24 24 5 5M15 49l5-5m24-24 5-5"/>',
  friends: '<circle cx="25" cy="24" r="8"/><path d="M10 50v-5c0-13 30-13 30 0v5z"/><path d="M41 17a8 8 0 0 1 0 16m5 5c6 1 9 4 9 10v2h-9"/>',
  play: '<path d="m25 16 24 16-24 16z" fill="currentColor" stroke-linejoin="round"/>',
};
type MenuId = keyof typeof ICONS;

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
  private readonly clickSound?: () => void;

  constructor(onPlay?: () => void, fadeIn = false, onCharacter?: () => void, onSettings?: () => void, commerce?: { shop: () => void; quest: () => void; friends?: () => void; rewards?: () => boolean; click?: () => void; notice?: () => string; retry?: () => void; busy?: () => boolean }, onHome?: () => void, onPet?: () => void) {
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
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="none" stroke="#4f6445" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' + ICONS[id] + '</g></svg>',
    );
    const name = document.createElement('span');
    name.className = 'hud-label';
    bindText(name, id);
    button.append(image, name);
    return button;
  }
  update(state: AnimalVisualState): void {
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
