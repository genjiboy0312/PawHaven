import type { AnimalVisualState } from '../animals/AnimalState';

const MESSAGES: Record<AnimalVisualState, string> = {
  NOTICE: '코기가 당신을 알아봤어요', APPROACH: '코기가 다가와요', GREET: '반갑게 인사해요',
  IDLE: '느긋하게 쉬고 있어요', WANDER: '정원을 산책해요', REST: '잠시 눈을 붙여요',
  SLEEP: '새근새근 자고 있어요', OBSERVE: '주변을 둘러봐요',
  JUMP: '폴짝 뛰어올라요', LAND: '사뿐히 내려앉아요', EMOTE: '기분을 표현해요',
};
const ICONS = {
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
  private previousState: AnimalVisualState | undefined;

  constructor() {
    this.element.className = 'lobby-hud';
    this.element.setAttribute('aria-label', 'Lobby menu layout');
    const character = document.createElement('div');
    character.className = 'hud-character';
    character.append(this.menu('character', 'Character'));
    const utilities = document.createElement('nav');
    utilities.className = 'hud-utilities';
    utilities.setAttribute('aria-label', 'Lobby menu');
    utilities.append(this.menu('friends', 'Friends'), this.menu('shop', 'Shop'), this.menu('settings', 'Settings'));
    const play = document.createElement('div');
    play.className = 'hud-play';
    play.append(this.menu('play', 'Play'));
    this.status.className = 'sr-only';
    this.status.setAttribute('role', 'status');
    this.element.append(character, utilities, play, this.status);
    document.querySelector('#app')?.append(this.element);
  }

  private menu(id: MenuId, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hud-menu hud-menu-' + id;
    button.disabled = true;
    button.setAttribute('data-menu', id);
    button.setAttribute('aria-label', label + ' (coming soon)');
    const image = document.createElement('img');
    image.className = 'hud-icon';
    image.alt = '';
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="none" stroke="#4f6445" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' + ICONS[id] + '</g></svg>',
    );
    const name = document.createElement('span');
    name.className = 'hud-label';
    name.textContent = label;
    button.append(image, name);
    return button;
  }
  update(state: AnimalVisualState): void {
    if (state !== this.previousState) {
      this.status.textContent = MESSAGES[state];
      this.previousState = state;
    }
  }
  destroy(): void { this.element.remove(); }
}
