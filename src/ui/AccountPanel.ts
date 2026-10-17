import type { AccountService } from '../account/AccountService';
import { t, type TextKey } from '../settings/i18n';

/** Settings owns this view's lifetime; account operations can finish after closing it. */
export class AccountPanel {
  private readonly abort = new AbortController();
  private readonly unsubscribe: () => void;
  private identity = '';
  private notice?: TextKey;
  private status?: HTMLElement;
  private feedback?: HTMLElement;
  private controls: HTMLButtonElement[] = [];
  constructor(private readonly host: HTMLElement, private readonly account: AccountService) {
    this.render();
    this.unsubscribe = account.subscribe(() => {
      const identity = account.user?.id + ':' + account.nickname;
      if (identity !== this.identity) this.render();
      else this.refresh();
    });
  }
  private text(key: TextKey): HTMLElement {
    const p = document.createElement('p'); p.textContent = t(key); this.host.append(p); return p;
  }
  private field(key: TextKey, type: string, autocomplete: string): HTMLInputElement {
    const label = document.createElement('label'); label.className = 'account-field';
    const name = document.createElement('span'); name.textContent = t(key);
    const input = document.createElement('input'); input.type = type; input.autocomplete = autocomplete as AutoFill;
    input.required = true; input.setAttribute('aria-label', t(key));
    if (type === 'password') { input.minLength = 8; input.maxLength = 128; }
    label.append(name, input); this.host.append(label); return input;
  }
  private button(key: TextKey, action: () => Promise<void>): void {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = t(key);
    button.setAttribute('data-account-action', key);
    button.addEventListener('click', () => { void this.run(action); }, { signal: this.abort.signal });
    this.controls.push(button); this.host.append(button);
  }
  private async run(action: () => Promise<void>): Promise<void> {
    if (this.account.busy) return;
    this.notice = undefined; this.account.setBusy(true);
    try { await action(); }
    catch (error) {
      const code = (error as { code?: string; message?: string })?.code;
      this.notice = code === 'email_not_confirmed' ? 'accountConfirm'
        : code === 'invalid_credentials' ? 'accountInvalid'
        : code === 'weak_password' ? 'accountPasswordHint'
        : code === '23505' || code === 'P0001' || (error as Error)?.message === 'invalid_nickname' ? 'accountNicknameError'
        : 'accountError';
    } finally { this.account.setBusy(false); if (!this.abort.signal.aborted) this.refresh(); }
  }
  private render(): void {
    this.identity = this.account.user?.id + ':' + this.account.nickname;
    this.controls = []; this.host.replaceChildren();
    this.host.classList.add('account-content');
    this.status = this.text('guest'); this.status.setAttribute('role', 'status');
    this.feedback = this.text('accountHint'); this.feedback.setAttribute('role', 'status');
    if (!this.account.enabled) { this.text('accountDisabled'); this.refresh(); return; }
    if (!this.account.user) {
      this.button('accountGoogle', () => this.account.loginGoogle(window.location.href));
      this.text('accountEmailAlternative');
      const email = this.field('accountEmail', 'email', 'email');
      const password = this.field('accountPassword', 'password', 'current-password');
      this.text('accountPasswordHint');
      const validate = (): boolean => email.reportValidity() && password.reportValidity();
      this.button('login', async () => {
        if (validate()) await this.account.login(email.value, password.value);
      });
      this.button('accountSignup', async () => {
        if (!validate()) return;
        const url = new URL(window.location.href); url.hash = ''; url.search = '';
        const confirm = await this.account.signup(email.value, password.value, url.href);
        if (confirm) this.notice = 'accountCheckEmail';
      });
      password.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !this.account.busy) { event.preventDefault(); void this.run(async () => { if (validate()) await this.account.login(email.value, password.value); }); }
      }, { signal: this.abort.signal });
    } else {
      const email = document.createElement('p'); email.className = 'account-email'; email.textContent = this.account.user.email; this.host.append(email);
      if (this.account.nickname) {
        const nickname = document.createElement('p'); nickname.textContent = this.account.nickname; this.host.append(nickname);
        this.text('accountRenameLater');
      } else {
        const nickname = this.field('accountNickname', 'text', 'nickname'); nickname.maxLength = 16; nickname.minLength = 2;
        this.text('accountNicknameHint');
        this.button('accountNicknameSave', async () => { if (nickname.reportValidity()) await this.account.claimNickname(nickname.value); });
      }
      this.text('accountCloudHint');
      this.button('accountSave', () => this.account.save());
      this.text('accountLoadHint');
      this.button('accountLoad', () => this.account.load(true));
      this.text('accountImportHint');
      this.button('accountImport', () => this.account.importGuest());
      this.button('accountLogout', () => this.account.logout());
    }
    this.refresh();
  }
  private refresh(): void {
    if (this.status) this.status.textContent = this.account.busy ? t('accountWorking') : t(('sync.' + this.account.status) as TextKey);
    if (this.feedback) this.feedback.textContent = this.notice ? t(this.notice) : this.account.user ? '' : t('accountHint');
    for (const button of this.controls) {
      const key = button.getAttribute('data-account-action');
      button.disabled = this.account.busy ||
        ((key === 'accountSave' || key === 'accountImport') && !this.account.canSave) ||
        (key === 'accountLoad' && ['loading', 'saving'].includes(this.account.status));
    }
  }
  destroy(): void { this.abort.abort(); this.unsubscribe(); this.host.classList.remove('account-content'); }
}
