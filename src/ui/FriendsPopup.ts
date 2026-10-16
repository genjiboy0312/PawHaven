import { bindAria, bindText, onLanguageChange, t, type TextKey } from '../settings/i18n';
const TABS = ['friendsList', 'addFriend', 'friendRequests'] as const;
/** Prototype overlay; no fabricated friends or network requests. */
export class FriendsPopup {
  private overlay?: HTMLElement;
  private content?: HTMLElement;
  private abort?: AbortController;
  private previousFocus?: HTMLElement;
  private blocked: { element: HTMLElement; inert: boolean }[] = [];
  private tab: typeof TABS[number] = 'friendsList';
  private readonly localeOff = onLanguageChange(() => this.render());
  constructor(private readonly pause: (paused: boolean) => void) {}
  open(): void {
    if (this.overlay) return;
    const host = document.querySelector<HTMLElement>('#app'); if (!host) return;
    this.abort = new AbortController(); const signal = this.abort.signal;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    this.blocked = Array.from(host.children).filter((element): element is HTMLElement => element instanceof HTMLElement)
      .map(element => ({ element, inert: element.inert }));
    this.blocked.forEach(item => { item.element.inert = true; }); this.pause(true);
    const overlay = document.createElement('div'); overlay.className = 'settings-overlay'; this.overlay = overlay;
    const panel = document.createElement('section'); panel.className = 'settings-panel friends-panel';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); bindAria(panel, 'friends');
    const heading = document.createElement('h2'); bindText(heading, 'friends');
    const close = document.createElement('button'); close.type = 'button'; close.className = 'settings-close'; close.textContent = '×'; bindAria(close, 'close');
    close.addEventListener('click', () => this.close(), { signal });
    const tabs = document.createElement('nav'); tabs.className = 'settings-tabs';
    for (const key of TABS) {
      const button = document.createElement('button'); button.type = 'button'; bindText(button, key);
      button.setAttribute('aria-pressed', String(key === this.tab));
      button.addEventListener('click', () => {
        this.tab = key; Array.from(tabs.children).forEach((item, index) => item.setAttribute('aria-pressed', String(TABS[index] === key))); this.render();
      }, { signal }); tabs.append(button);
    }
    this.content = document.createElement('div'); this.content.className = 'settings-content friends-content';
    panel.append(heading, close, tabs, this.content); overlay.append(panel); host.append(overlay);
    let backdrop = false;
    overlay.addEventListener('pointerdown', event => { backdrop = event.target === overlay; }, { signal });
    overlay.addEventListener('pointerup', event => { if (backdrop && event.target === overlay) this.close(); backdrop = false; }, { signal });
    overlay.addEventListener('pointercancel', () => { backdrop = false; }, { signal });
    overlay.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.close(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'));
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
    }, { signal });
    this.render(); close.focus();
  }
  private render(): void {
    if (!this.content) return;
    this.content.replaceChildren();
    const paragraph = (key: TextKey): void => { const p = document.createElement('p'); p.textContent = t(key); this.content!.append(p); };
    paragraph('friendsPrototype');
    if (this.tab === 'addFriend') {
      const search = document.createElement('input'); search.type = 'search'; search.disabled = true;
      search.placeholder = t('friendSearch'); search.setAttribute('aria-label', t('friendSearch'));
      this.content.append(search); paragraph('friendSearchSoon');
    } else paragraph(this.tab === 'friendsList' ? 'friendsEmpty' : 'requestsEmpty');
  }
  close(): void {
    if (!this.overlay) return;
    this.abort?.abort(); this.overlay.remove(); this.overlay = undefined; this.content = undefined;
    this.blocked.forEach(item => { item.element.inert = item.inert; }); this.blocked = []; this.pause(false);
    if (this.previousFocus?.isConnected) this.previousFocus.focus(); this.previousFocus = undefined;
  }
  destroy(): void { this.close(); this.localeOff(); }
}
