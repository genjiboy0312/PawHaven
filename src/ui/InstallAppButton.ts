import { bindText } from '../settings/i18n';
import type { AppInstall } from './AppInstall';

/** Display-settings component. Unsupported and already-installed states stay hidden. */
export class InstallAppButton {
  private readonly root = document.createElement('section');
  private readonly button = document.createElement('button');
  private readonly status = document.createElement('p');
  private readonly unsubscribe: () => void;
  private readonly abort = new AbortController();
  constructor(container: HTMLElement, private readonly installation: AppInstall) {
    this.root.className = 'settings-install'; this.button.type = 'button'; this.button.className = 'commerce-primary install-app';
    this.status.setAttribute('role', 'status');
    this.button.addEventListener('click', () => { void installation.install(); }, { signal: this.abort.signal });
    this.root.append(this.button, this.status); container.append(this.root);
    this.unsubscribe = installation.subscribe(() => this.render()); this.render();
  }
  private render(): void {
    this.root.hidden = !this.installation.visible && !this.installation.failed;
    this.button.hidden = !this.installation.visible; this.button.disabled = this.installation.busy;
    bindText(this.button, this.installation.busy ? 'installWorking' : 'installApp');
    this.status.hidden = !this.installation.failed; bindText(this.status, 'installFailed');
  }
  destroy(): void { this.unsubscribe(); this.abort.abort(); this.root.remove(); }
}
