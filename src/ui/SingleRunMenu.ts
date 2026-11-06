import { bindText } from '../settings/i18n';
import { ConfirmPopup } from './ConfirmPopup';

export interface SingleRunContext {
  active: () => boolean;
  restart: () => Promise<boolean>;
  leave: () => void;
}

/** Settings footer for unfinished single runs; no completion or reward commands. */
export class SingleRunMenu {
  private readonly element = document.createElement('footer');
  private readonly status = document.createElement('p');
  private readonly abort = new AbortController();
  private prompt?: ConfirmPopup;
  private busy = false;
  private disposed = false;
  constructor(private readonly parent: HTMLElement, private readonly context: SingleRunContext, private readonly closeSettings: () => void) {
    this.element.className = 'single-run-actions';
    for (const action of ['restart', 'leave'] as const) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'commerce-primary';
      button.setAttribute('data-run-action', action); bindText(button, action === 'restart' ? 'runRestart' : 'returnLobby');
      button.addEventListener('click', () => this.confirm(action), { signal: this.abort.signal }); this.element.append(button);
    }
    this.status.setAttribute('role','status'); this.status.hidden = true;
    this.element.append(this.status); parent.append(this.element);
  }
  requestLeave(): void { this.confirm('leave'); }
  private confirm(action: 'restart' | 'leave'): void {
    if (this.disposed || this.busy || this.prompt || !this.context.active()) return;
    this.status.hidden = true;
    this.prompt = new ConfirmPopup(this.parent, action === 'restart' ? 'runRestartTitle' : 'runLeaveTitle', 'runAbandonNote', action === 'restart' ? 'runRestart' : 'returnLobby', () => { void this.proceed(action); }, () => this.closePrompt());
  }
  private closePrompt(): void { this.prompt?.destroy(); this.prompt = undefined; }
  private async proceed(action: 'restart' | 'leave'): Promise<void> {
    if (this.disposed || this.busy) return;
    if (!this.context.active()) { this.closePrompt(); return; }
    this.busy = true;
    if (this.prompt) {
      this.prompt.element.inert = true; this.prompt.element.setAttribute('aria-busy','true');
      const accept = this.prompt.element.querySelector<HTMLButtonElement>('.confirm-accept');
      if (accept) bindText(accept, 'economyWorking');
    }
    try {
      const ok = action === 'restart' ? await this.context.restart() : (this.context.leave(), true);
      if (this.disposed) return;
      if (ok) { this.closeSettings(); return; }
      bindText(this.status, 'runRetryFailed'); this.status.hidden = false;
    } catch {
      if (!this.disposed) { bindText(this.status, 'runRetryFailed'); this.status.hidden = false; }
    } finally {
      if (!this.disposed) { this.busy = false; this.closePrompt(); }
    }
  }
  destroy(): void { this.disposed = true; this.abort.abort(); this.closePrompt(); this.element.remove(); }
}
