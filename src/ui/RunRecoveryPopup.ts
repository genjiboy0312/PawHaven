import { bindText, bindAria } from '../settings/i18n';

/** Small foreground recovery prompt using the shared settings panel style. */
export class RunRecoveryPopup {
  readonly element = document.createElement('div');
  private readonly abort = new AbortController();
  private readonly wasInert: boolean;
  constructor(private readonly hud: HTMLElement, failed: boolean, proceed: () => void) {
    this.wasInert = hud.inert; hud.inert = true;
    this.element.className = 'settings-overlay run-recovery-overlay';
    const panel = document.createElement('section'); panel.className = 'settings-panel run-recovery-panel';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    bindAria(panel, failed ? 'runConnectionLost' : 'runPaused');
    const heading = document.createElement('h2'); bindText(heading, failed ? 'runConnectionLost' : 'runPaused');
    const note = document.createElement('p'); bindText(note, failed ? 'runConnectionNote' : 'runResumeNote');
    const button = document.createElement('button'); button.type = 'button'; button.className = 'commerce-primary';
    bindText(button, failed ? 'runRoomList' : 'runResume');
    button.addEventListener('click', proceed, { signal: this.abort.signal });
    panel.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Tab') { event.preventDefault(); button.focus(); }
    }, { signal: this.abort.signal });
    panel.append(heading, note, button); this.element.append(panel);
    document.querySelector('#app')?.append(this.element); button.focus();
  }
  destroy(): void { this.abort.abort(); this.element.remove(); this.hud.inert = this.wasInert; }
}
