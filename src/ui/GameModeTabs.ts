import { courseMode, type GameMode, type CourseId } from '../game/CourseCatalog';
import { bindAria, bindText, type TextKey } from '../settings/i18n';
const MODE_TEXT = {
  race: { label: 'gameRace', goal: 'gameRaceGoal' },
  survival: { label: 'gameSurvival', goal: 'gameSurvivalGoal' },
  collection: { label: 'gameCollection', goal: 'gameCollectionGoal' },
} satisfies Record<GameMode, { label: TextKey; goal: TextKey }>;
export const gameModeLabel = (mode: GameMode): TextKey => MODE_TEXT[mode].label;
/** Shared mode filter for single selection, room creation and the host's map picker. */
export class GameModeTabs {
  readonly element = document.createElement('div');
  private readonly goal = document.createElement('p');
  private readonly buttons = new Map<GameMode, HTMLButtonElement>();
  private readonly abort = new AbortController();
  constructor(
    private mode: GameMode,
    private readonly changed: (mode: GameMode) => void,
    modes: readonly GameMode[] = ['race', 'survival'],
  ) {
    this.element.className = 'game-mode-filter';
    const nav = document.createElement('nav'); nav.className = 'game-mode-tabs'; nav.setAttribute('role', 'group'); bindAria(nav, 'gameTypes');
    for (const value of modes) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'commerce-primary';
      button.setAttribute('data-game-mode', value); bindText(button, gameModeLabel(value));
      button.addEventListener('click', () => {
        if (button.disabled || this.mode === value) return;
        this.mode = value; this.render(); this.changed(value);
      }, { signal: this.abort.signal });
      this.buttons.set(value, button); nav.append(button);
    }
    this.goal.className = 'game-mode-goal'; this.goal.setAttribute('aria-live', 'polite');
    this.element.append(nav, this.goal); this.render();
  }
  private render(): void {
    this.buttons.forEach((button, mode) => button.setAttribute('aria-pressed', String(mode === this.mode)));
    bindText(this.goal, MODE_TEXT[this.mode].goal);
  }
  focus(mode: GameMode): void { this.buttons.get(mode)?.focus(); }
  destroy(): void { this.abort.abort(); this.element.remove(); }
}
export function gameModeBadge(map: CourseId): HTMLElement {
  const mode = courseMode(map), badge = document.createElement('span');
  badge.className = 'game-mode-badge'; badge.setAttribute('data-game-mode', mode); bindText(badge, gameModeLabel(mode)); return badge;
}
