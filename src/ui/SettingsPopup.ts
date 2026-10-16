import { type SoundPreferences, SoundSettings } from '../settings/SoundSettings';

interface SettingsAudio {
  apply(preferences: SoundPreferences): void;
  play(kind: 'click' | 'bgm'): void;
}
export class SettingsPopup {
  private element?: HTMLElement;
  private panel?: HTMLElement;
  private content?: HTMLElement;
  private tabs?: HTMLElement;
  private abort?: AbortController;
  private pageAbort?: AbortController;
  private previousFocus?: HTMLElement;
  private blocked: { element: HTMLElement; inert: boolean }[] = [];
  private tab: 'Sound' | 'Account' = 'Sound';
  get opened(): boolean { return !!this.element; }
  preferences() { return this.store.current; }
  constructor(private readonly store: SoundSettings, private readonly audio: SettingsAudio, private readonly pause: (paused: boolean) => void) {}
  open(): void {
    if (this.opened) return;
    const host = document.querySelector<HTMLElement>('#app');
    if (!host) return;
    this.abort = new AbortController();
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    this.blocked = Array.from(host.children).filter((item): item is HTMLElement => item instanceof HTMLElement).map(element => ({ element, inert: element.inert }));
    for (const item of this.blocked) item.element.inert = true;
    this.pause(true); this.audio.play('click');
    this.element = document.createElement('div'); this.element.className = 'settings-overlay';
    this.panel = document.createElement('section'); this.panel.className = 'settings-panel';
    this.panel.setAttribute('role', 'dialog'); this.panel.setAttribute('aria-modal', 'true'); this.panel.setAttribute('aria-label', 'Settings');
    const heading = document.createElement('h2'); heading.textContent = 'Settings';
    const close = this.button('×', () => this.close()); close.className = 'settings-close'; close.setAttribute('aria-label', 'Close settings');
    this.tabs = document.createElement('nav'); this.tabs.className = 'settings-tabs'; this.tabs.setAttribute('aria-label', 'Settings categories');
    for (const label of ['Sound', 'Account'] as const) this.tabs.append(this.button(label, () => { this.tab = label; this.render(); }));
    this.content = document.createElement('div'); this.content.className = 'settings-content';
    this.panel.append(heading, close, this.tabs, this.content); this.element.append(this.panel); host.append(this.element);
    this.element.addEventListener('click', event => { if (event.target === this.element) this.close(); }, { signal: this.abort.signal });
    this.element.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.close(); return; }
      if (event.key !== 'Tab') return;
      const controls = Array.from(this.panel!.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }, { signal: this.abort.signal });
    this.render(); close.focus();
  }
  private button(label: string, action: () => void, signal = this.abort!.signal): HTMLButtonElement {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', action, { signal }); return button;
  }
  private render(): void {
    if (!this.content || !this.tabs) return;
    for (const button of Array.from(this.tabs.children)) button.setAttribute('aria-pressed', String(button.textContent === this.tab));
    this.pageAbort?.abort(); this.pageAbort = new AbortController();
    this.content.replaceChildren();
    if (this.tab === 'Account') {
      const title = document.createElement('p'); title.className = 'settings-guest'; title.textContent = 'Playing as Guest';
      const hint = document.createElement('p'); hint.textContent = 'Account login and cloud saves are coming soon.';
      const login = document.createElement('button'); login.type = 'button'; login.textContent = 'Login'; login.disabled = true;
      this.content.append(title, hint, login); return;
    }
    const preferences = this.store.current;
    for (const [channel, label] of [['master', 'Master'], ['bgm', 'BGM'], ['sfx', 'SFX']] as const) {
      const row = document.createElement('label'); row.className = 'settings-volume';
      const name = document.createElement('span'); name.textContent = label;
      const slider = document.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '1'; slider.value = String(Math.round(preferences[channel] * 100)); slider.setAttribute('aria-label', label + ' volume');
      const output = document.createElement('output'); output.textContent = slider.value + '%';
      slider.addEventListener('input', () => { this.store.volume(channel, Number(slider.value) / 100); output.textContent = slider.value + '%'; this.audio.apply(this.store.current); });
      row.append(name, slider, output); this.content.append(row);
    }
    const mute = document.createElement('label'); mute.className = 'settings-mute';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = preferences.muted;
    checkbox.addEventListener('change', () => { this.store.mute(checkbox.checked); this.audio.apply(this.store.current); });
    const text = document.createElement('span'); text.textContent = 'Mute all'; mute.append(checkbox, text);
    const preview = document.createElement('div'); preview.className = 'settings-preview';
    preview.append(this.button('Preview BGM', () => this.audio.play('bgm'), this.pageAbort.signal), this.button('Preview SFX', () => this.audio.play('click'), this.pageAbort.signal));
    this.content.append(mute, preview);
  }
  close(): void {
    if (!this.opened) return;
    this.pageAbort?.abort(); this.abort?.abort(); this.element?.remove(); this.element = undefined; this.panel = undefined; this.content = undefined; this.tabs = undefined;
    for (const item of this.blocked) item.element.inert = item.inert;
    this.blocked = []; this.pause(false);
    if (this.previousFocus?.isConnected) this.previousFocus.focus(); this.previousFocus = undefined;
  }
  destroy(): void { this.close(); }
}