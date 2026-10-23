import { bindAria, bindText } from '../settings/i18n';
import { roomInvitationUrl, shareRoomInvitation } from '../multiplayer/RoomInvitation';

export class RoomInviteButton {
  readonly element = document.createElement('div');
  private readonly abort = new AbortController();
  constructor(room: string, href = window.location.href) {
    const url = roomInvitationUrl(href, room);
    this.element.className = 'room-invite-actions';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'commerce-primary'; bindText(button, 'roomInviteShare');
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    const link = document.createElement('textarea'); link.className = 'room-invite-link'; link.readOnly = true; link.rows = 2; link.value = url; link.hidden = true; bindAria(link, 'roomInviteLink');
    button.addEventListener('click', () => {
      if (button.disabled || this.abort.signal.aborted) return;
      button.disabled = true;
      void shareRoomInvitation(url).then(result => {
        if (this.abort.signal.aborted) return;
        button.disabled = false;
        if (result === 'cancelled') return;
        bindText(status, result === 'copied' ? 'roomInviteCopied' : result === 'shared' ? 'roomInviteShared' : 'roomInviteManual');
        link.hidden = result !== 'manual';
        if (!link.hidden) { link.focus(); link.select(); }
      });
    }, { signal: this.abort.signal });
    this.element.append(button, status, link);
  }
  destroy(): void { this.abort.abort(); this.element.remove(); }
}
