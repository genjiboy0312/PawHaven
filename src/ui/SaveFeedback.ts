import type { AccountService } from '../account/AccountService';
import { bindText, type TextKey } from '../settings/i18n';

export type SaveAccount = Pick<AccountService, 'status' | 'pendingSave' | 'canSave' | 'subscribe' | 'save'>
  & Partial<Pick<AccountService, 'retrySync'>>;

/** Shared save status; account updates never rebuild the editing controls. */
export class SaveFeedback {
  readonly element = document.createElement('div');
  private readonly message = document.createElement('p');
  private readonly retry = document.createElement('button');
  private readonly abort = new AbortController();
  private readonly unsubscribe?: () => void;
  private following = false;
  private retrying = false;
  private disposed = false;

  constructor(private readonly account?: SaveAccount, private readonly guestKey: TextKey = 'lookSavedDevice') {
    this.message.setAttribute('role', 'status');
    this.retry.type = 'button'; this.retry.className = 'commerce-primary'; this.retry.hidden = true;
    bindText(this.retry, 'accountRetry');
    this.retry.addEventListener('click', () => { void this.retrySave(); }, { signal: this.abort.signal });
    this.element.append(this.message, this.retry);
    this.unsubscribe = account?.subscribe(() => { if (this.following) this.refresh(); });
  }
  showSave(): void { this.following = true; this.refresh(); }
  showNotice(key: TextKey): void {
    this.following = false; this.retry.hidden = true; bindText(this.message, key);
  }
  private canRetry(): boolean {
    return this.account?.status === 'offline' &&
      (!!this.account.retrySync || this.account.canSave && this.account.pendingSave);
  }
  private refresh(): void {
    const status = this.account?.status ?? 'guest';
    const key = status === 'guest' ? this.guestKey
      : status === 'saved' && this.account?.pendingSave ? 'sync.saving'
      : status === 'offline' && !this.account?.canSave && !this.account?.retrySync ? 'lookSaveAccount'
      : `sync.${status}` as const;
    if (this.message.getAttribute('data-i18n') !== key) bindText(this.message, key);
    this.retry.hidden = !this.canRetry();
    this.retry.disabled = this.retrying;
  }
  private async retrySave(): Promise<void> {
    if (this.disposed || this.retrying || !this.following || !this.canRetry()) return;
    this.retrying = true; this.refresh();
    try {
      if (this.account?.canSave && this.account.pendingSave) await this.account.save();
      else await this.account?.retrySync?.();
    } catch {
      // Retain edits and leave retry available if the transport rejects.
    } finally {
      this.retrying = false;
      if (!this.disposed && this.following) this.refresh();
    }
  }
  destroy(): void { this.disposed = true; this.unsubscribe?.(); this.abort.abort(); }
}
