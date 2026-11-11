import { bindAria, bindText, type TextKey } from '../settings/i18n';
import type { FirstHomeGuide } from '../game/FirstHomeGuide';

export interface FirstHomeActions {
  guide: FirstHomeGuide;
  play: () => Promise<boolean>;
  shop: () => void;
  home: () => void;
}

export class FirstHomeHint {
  readonly element = document.createElement('aside');
  private readonly text = document.createElement('p');
  private readonly action = document.createElement('button');
  private readonly abort = new AbortController();
  private readonly unsubscribe: () => void;
  private launching = false;

  constructor(private readonly options: FirstHomeActions, private readonly click?: () => void) {
    this.element.className = 'first-home-hint';
    this.text.setAttribute('role', 'status');
    this.action.type = 'button';
    this.action.className = 'commerce-primary';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'first-home-dismiss';
    close.textContent = '×';
    bindAria(close, 'firstHomeDismiss');
    close.addEventListener('click', () => { this.click?.(); options.guide.dismiss(); }, { signal: this.abort.signal });
    this.action.addEventListener('click', () => void this.activate(), { signal: this.abort.signal });
    this.element.append(this.text, this.action, close);
    this.unsubscribe = options.guide.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const step = this.options.guide.current;
    this.element.hidden = step === 'done';
    this.action.hidden = step === 'pet' || step === 'done';
    if (step === 'done') return;
    const messages: Record<typeof step, TextKey> = {
      pet: 'firstHomePet', race: 'firstHomeRace', shop: 'firstHomeShop', place: 'firstHomePlace',
    };
    bindText(this.text, messages[step]);
    if (step !== 'pet') bindText(this.action, step === 'race' ? 'firstHomePlay' : step === 'shop' ? 'firstHomeBrowse' : 'firstHomeOpen');
  }

  private async activate(): Promise<void> {
    const { guide, play, shop, home } = this.options;
    if (guide.current === 'shop') { this.click?.(); shop(); return; }
    if (guide.current === 'place') { this.click?.(); home(); return; }
    if (guide.current !== 'race' || this.launching) return;
    this.click?.();
    this.launching = this.action.disabled = true;
    try {
      if (await play()) return;
    } catch { /* Keep the regular Play button and the guided retry available. */ }
    if (this.abort.signal.aborted) return;
    this.launching = this.action.disabled = false;
    if (guide.current === 'race') bindText(this.text, 'runRetryFailed');
  }

  destroy(): void { this.unsubscribe(); this.abort.abort(); this.element.remove(); }
}
