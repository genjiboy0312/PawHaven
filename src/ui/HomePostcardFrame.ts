import type { HomePostcards } from '../home/HomePostcards';
import { bindAria, bindText, t } from '../settings/i18n';
import { backAction } from './BackNavigation';

export class HomePostcardFrame {
  private readonly button = document.createElement('button');
  private readonly overlay = document.createElement('div');
  private readonly image = document.createElement('img');
  private readonly status = document.createElement('p');
  private readonly close = document.createElement('button');
  private readonly remove = document.createElement('button');
  private readonly abort = new AbortController();
  private reading?: AbortController;

  constructor(private readonly hud: HTMLElement, private readonly postcards: HomePostcards, private readonly target?: string) {
    const { signal } = this.abort;
    this.button.type = 'button';
    this.button.className = 'home-postcard-frame';
    this.button.hidden = true;
    bindText(this.button, 'postcardFrame');
    this.button.addEventListener('click', () => void this.open(), { signal });

    this.overlay.className = 'settings-overlay postcard-overlay';
    this.overlay.hidden = true;
    const panel = document.createElement('section');
    panel.className = 'settings-panel postcard-preview';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    bindAria(panel, 'postcardFrame');
    this.image.alt = t('postcardImage');
    this.status.className = 'postcard-share-status';
    this.status.setAttribute('role', 'status');
    this.close.type = this.remove.type = 'button';
    this.close.className = this.remove.className = 'commerce-primary';
    bindText(this.close, 'close');
    bindText(this.remove, 'postcardRemove');
    this.close.addEventListener('click', () => this.hide(), { signal });
    this.remove.addEventListener('click', () => void this.clear(), { signal });
    const actions = document.createElement('div');
    actions.className = 'postcard-preview-actions';
    actions.append(this.close, this.remove);
    panel.append(this.image, actions, this.status);
    this.overlay.append(panel);
    this.overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); this.hide(); }
      if (event.key !== 'Tab') return;
      event.preventDefault();
      (document.activeElement === this.close && !this.remove.hidden && !this.remove.disabled ? this.remove : this.close).focus();
    }, { signal });
    backAction(this.overlay, () => this.hide());
    this.hud.append(this.button);
    document.querySelector('#app')?.append(this.overlay);
    void this.postcards.exists(target, signal).then(exists => {
      if (!signal.aborted) this.button.hidden = !exists;
    }).catch(() => {});
  }

  private async open(): Promise<void> {
    if (!this.overlay.hidden || this.button.disabled) return;
    this.reading = new AbortController();
    const { signal } = this.reading;
    this.hud.inert = true;
    this.overlay.hidden = false;
    this.image.hidden = this.remove.hidden = true;
    this.status.hidden = false;
    bindText(this.status, 'postcardLoading');
    this.close.focus();
    try {
      const url = await this.postcards.image(this.target, signal);
      if (signal.aborted) return;
      if (!url) {
        this.button.hidden = true;
        this.hide();
        return;
      }
      this.image.src = url;
      this.image.hidden = false;
      this.status.hidden = true;
      this.remove.hidden = this.target !== undefined;
    } catch {
      if (!signal.aborted) bindText(this.status, 'postcardDisplayFailed');
    }
  }

  private async clear(): Promise<void> {
    if (this.target !== undefined || this.remove.disabled || this.remove.hidden) return;
    this.button.disabled = this.remove.disabled = true;
    this.close.focus();
    this.status.hidden = false;
    bindText(this.status, 'postcardLoading');
    const { signal } = this.abort;
    try {
      await this.postcards.set(null, signal);
      if (!signal.aborted) {
        this.button.hidden = true;
        if (!this.overlay.hidden) this.hide();
      }
    } catch {
      if (!signal.aborted) bindText(this.status, 'postcardDisplayFailed');
    } finally {
      this.button.disabled = this.remove.disabled = false;
      if (!signal.aborted && this.overlay.hidden && document.activeElement === document.body && !this.button.hidden) this.button.focus();
    }
  }

  private hide(): void {
    this.reading?.abort();
    this.image.removeAttribute('src');
    this.overlay.hidden = true;
    this.hud.inert = false;
    if (!this.button.hidden && !this.button.disabled) this.button.focus();
    else this.hud.querySelector<HTMLButtonElement>('button:not([disabled]):not([hidden])')?.focus();
  }

  destroy(): void {
    this.abort.abort();
    this.reading?.abort();
    this.overlay.remove();
    this.button.remove();
  }
}
