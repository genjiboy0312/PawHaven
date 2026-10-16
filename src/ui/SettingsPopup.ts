import { bindAria, bindText, setLanguage, t, type TextKey } from '../settings/i18n';
import { GameSettings } from '../settings/GameSettings';
import type { GamePreferences } from '../settings/GameSettings';
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
  private tab: 'Sound' | 'Controls' | 'Display' | 'Language' | 'Account' | 'About' = 'Sound';
  get opened(): boolean { return !!this.element; }
  constructor(private readonly store: SoundSettings, private readonly audio: SettingsAudio, private readonly pause: (paused: boolean) => void, private readonly game = new GameSettings(), private readonly applyGame: (preferences: GamePreferences) => void = () => undefined) {}
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
    this.panel.setAttribute('role', 'dialog'); this.panel.setAttribute('aria-modal', 'true'); bindAria(this.panel, 'settings');
    const heading = document.createElement('h2'); bindText(heading, 'settings');
    const close = this.button('×', () => this.close()); close.className = 'settings-close'; bindAria(close, 'closeSettings');
    this.tabs = document.createElement('nav'); this.tabs.className = 'settings-tabs'; bindAria(this.tabs, 'settingsCategories');
    for (const label of ['Sound', 'Controls', 'Display', 'Language', 'Account', 'About'] as const) { const button = this.button(t(label), () => { this.tab = label; this.render(); }); bindText(button, label); this.tabs.append(button); };
    this.content = document.createElement('div'); this.content.className = 'settings-content';
    this.panel.append(heading, close, this.tabs, this.content); this.element.append(this.panel); host.append(this.element);
    let backdropPressed = false;
    this.element.addEventListener('pointerdown', event => { backdropPressed = event.target === this.element; }, { signal: this.abort.signal });
    this.element.addEventListener('pointerup', event => { if (backdropPressed && event.target === this.element) this.close(); backdropPressed = false; }, { signal: this.abort.signal });
    this.element.addEventListener('pointercancel', () => { backdropPressed = false; }, { signal: this.abort.signal });
    this.element.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.close(); return; }
      if (event.key !== 'Tab') return;
      const controls = Array.from(this.panel!.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]'));
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
    for (const button of Array.from(this.tabs.children)) button.setAttribute('aria-pressed', String(button.textContent === t(this.tab)));
    this.pageAbort?.abort(); this.pageAbort = new AbortController();
    this.content.replaceChildren();
    if (this.tab === 'Account') {
      const title = document.createElement('p'); title.className = 'settings-guest'; title.textContent = t('guest');
      const hint = document.createElement('p'); hint.textContent = t('accountSoon');
      const login = document.createElement('button'); login.type = 'button'; login.textContent = t('login'); login.disabled = true;
      this.content.append(title, hint, login); return;
    }
    const options = this.game.current;
    if (this.tab === 'Controls') {
      this.slider('controlSize', Math.round(options.controlSize * 100), 80, 120, value => this.changeGame({ controlSize: value / 100 }));
      this.toggle('leftHanded', options.leftHanded, value => this.changeGame({ leftHanded: value }));
      this.toggle('vibration', options.vibration, value => this.changeGame({ vibration: value }));
      this.paragraph('keyboardHelp'); return;
    }
    if (this.tab === 'Display') {
      this.toggle('effects', options.effects, value => this.changeGame({ effects: value }));
      this.toggle('camera', options.smoothCamera, value => this.changeGame({ smoothCamera: value })); return;
    }
    if (this.tab === 'Language') {
      for (const [code, label] of [['ko', '한국어'], ['en', 'English']] as const) {
        const button = this.button(label, () => { this.changeGame({ language: code }); this.render(); }, this.pageAbort.signal);
        button.setAttribute('aria-pressed', String(options.language === code)); this.content.append(button);
      }
      this.paragraph('languageHint'); return;
    }
    if (this.tab === 'About') {
      const title = document.createElement('p'); title.textContent = 'Paw Haven'; this.content.append(title);
      this.paragraph('version'); this.paragraph('aboutText');
      this.paragraph('feedbackHint');
      const email = document.createElement('p'); email.className = 'feedback-email'; email.textContent = 'genjiman0312@gmail.com';
      const feedback = document.createElement('a'); feedback.className = 'settings-feedback';
      feedback.setAttribute('href', 'mailto:genjiman0312@gmail.com?subject=' + encodeURIComponent('[PawHaven Feedback]'));
      bindText(feedback, 'sendFeedback');
      this.content.append(email, feedback); return;
    }
    const preferences = this.store.current;
    for (const channel of ['master', 'bgm', 'sfx'] as const) {
      const row = document.createElement('label'); row.className = 'settings-volume';
      const name = document.createElement('span'); name.textContent = t(channel);
      const slider = document.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '1'; slider.value = String(Math.round(preferences[channel] * 100)); slider.setAttribute('aria-label', t(channel));
      const output = document.createElement('output'); output.textContent = slider.value + '%';
      slider.addEventListener('input', () => { this.store.volume(channel, Number(slider.value) / 100); output.textContent = slider.value + '%'; this.audio.apply(this.store.current); });
      row.append(name, slider, output); this.content.append(row);
    }
    const mute = document.createElement('label'); mute.className = 'settings-mute';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = preferences.muted;
    checkbox.addEventListener('change', () => { this.store.mute(checkbox.checked); this.audio.apply(this.store.current); });
    const text = document.createElement('span'); text.textContent = t('mute'); mute.append(checkbox, text);
    const preview = document.createElement('div'); preview.className = 'settings-preview';
    preview.append(this.button(t('previewBgm'), () => this.audio.play('bgm'), this.pageAbort.signal), this.button(t('previewSfx'), () => this.audio.play('click'), this.pageAbort.signal));
    this.content.append(mute, preview);
  }
  private changeGame(next: Partial<GamePreferences>): void { this.game.update(next); if (next.language) setLanguage(next.language); this.applyGame(this.game.current); }
  private paragraph(key: TextKey): void { const p = document.createElement('p'); p.textContent = t(key); this.content?.append(p); }
  private toggle(key: TextKey, checked: boolean, change: (value: boolean) => void): void {
    const label = document.createElement('label'); label.className = 'settings-option';
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = checked;
    input.addEventListener('change', () => change(input.checked));
    const text = document.createElement('span'); text.textContent = t(key); label.append(input, text); this.content?.append(label);
  }
  private slider(key: TextKey, value: number, min: number, max: number, change: (value: number) => void): void {
    const row = document.createElement('label'); row.className = 'settings-volume';
    const name = document.createElement('span'); name.textContent = t(key);
    const input = document.createElement('input'); input.type = 'range'; input.min = String(min); input.max = String(max); input.value = String(value); input.setAttribute('aria-label', t(key));
    const output = document.createElement('output'); output.textContent = value + '%';
    input.addEventListener('input', () => { output.textContent = input.value + '%'; change(Number(input.value)); });
    row.append(name, input, output); this.content?.append(row);
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