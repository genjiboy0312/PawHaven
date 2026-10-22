const KEY = 'paw-haven.room-invitation';
const LIFETIME = 30 * 60 * 1000;
export function inviteRoomId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : undefined;
}
export function invitationFromUrl(href: string): string | undefined {
  const params = new URL(href).searchParams;
  return params.getAll('room').length === 1 ? inviteRoomId(params.get('room')) : undefined;
}
/** A tab-scoped invitation survives OAuth; it never admits a player by itself. */
export class RoomInvitation {
  private id?: string;
  constructor(href: string, private readonly storage?: Storage, now = Date.now()) {
    const explicit = new URL(href).searchParams.has('room');
    this.id = invitationFromUrl(href);
    try {
      if (this.id) storage?.setItem(KEY, JSON.stringify({ id: this.id, expires: now + LIFETIME }));
      else if (explicit) storage?.removeItem(KEY);
      else {
        const saved = JSON.parse(storage?.getItem(KEY) ?? 'null');
        if (saved && Number.isFinite(saved.expires) && saved.expires > now && saved.expires <= now + LIFETIME) this.id = inviteRoomId(saved.id);
        if (!this.id) storage?.removeItem(KEY);
      }
    } catch { /* The URL still carries the invitation when session storage is blocked. */ }
  }
  get room(): string | undefined { return this.id; }
  clear(): void { this.id = undefined; try { this.storage?.removeItem(KEY); } catch { /* Memory-only. */ } }
}
export function roomInvitationUrl(href: string, room: string): string {
  const id = inviteRoomId(room), url = new URL(href);
  if (!id || !['https:', 'http:'].includes(url.protocol)) throw Error('invalid_invitation');
  url.search = ''; url.hash = ''; url.searchParams.set('room', id); return url.href;
}
interface ShareEnvironment {
  mobile: boolean;
  share?: (data: ShareData) => Promise<void>;
  copy?: (text: string) => Promise<void>;
}
export async function shareRoomInvitation(url: string, environment?: ShareEnvironment): Promise<'shared' | 'copied' | 'manual' | 'cancelled'> {
  const browser = environment ?? {
    mobile: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    share: navigator.share?.bind(navigator), copy: navigator.clipboard?.writeText.bind(navigator.clipboard),
  };
  if (browser.mobile && browser.share) {
    try { await browser.share({ title: 'Paw Haven', url }); return 'shared'; }
    catch (error) { if ((error as { name?: string })?.name === 'AbortError') return 'cancelled'; }
  }
  try { if (browser.copy) { await browser.copy(url); return 'copied'; } } catch { /* Offer selectable text. */ }
  return 'manual';
}
