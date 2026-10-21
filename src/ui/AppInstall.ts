interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
interface InstallEnvironment { target: EventTarget; standalone: () => boolean; mode?: EventTarget }
function browserEnvironment(): InstallEnvironment | undefined {
  if (typeof window === 'undefined') return;
  const mode = window.matchMedia?.('(display-mode: standalone)');
  return { target: window, mode, standalone: () => !!mode?.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true };
}

/** Keeps Chrome's one-use install offer; UI components observe availability. */
export class AppInstall {
  private offer?: InstallPrompt;
  private installed: boolean;
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  busy = false;
  failed = false;
  constructor(private readonly environment = browserEnvironment()) {
    this.installed = environment?.standalone() ?? false;
    environment?.target.addEventListener('beforeinstallprompt', this.onOffer);
    environment?.target.addEventListener('appinstalled', this.onInstalled);
    environment?.mode?.addEventListener('change', this.onMode);
  }
  get available(): boolean { return !this.disposed && !this.installed && !!this.offer; }
  get visible(): boolean { return !this.disposed && !this.installed && (this.busy || this.available); }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit(): void { if (!this.disposed) this.listeners.forEach(listener => listener()); }
  private readonly onOffer = (event: Event): void => {
    if (this.disposed || this.installed || this.environment?.standalone()) return;
    const offer = event as InstallPrompt;
    if (typeof offer.prompt !== 'function' || !offer.userChoice || typeof offer.userChoice.then !== 'function') return;
    event.preventDefault(); this.offer = offer; this.failed = false; this.emit();
  };
  private readonly onInstalled = (): void => {
    this.installed = true; this.offer = undefined; this.failed = false; this.emit();
  };
  private readonly onMode = (): void => { if (this.environment?.standalone()) this.onInstalled(); };
  async install(): Promise<void> {
    if (!this.available || this.busy) return;
    const offer = this.offer!; this.offer = undefined; this.busy = true; this.failed = false; this.emit();
    try {
      await offer.prompt();
      const choice = await offer.userChoice;
      if (!this.disposed && choice.outcome === 'accepted') this.onInstalled();
    } catch { if (!this.disposed && !this.installed) this.failed = true; }
    finally { this.busy = false; this.emit(); }
  }
  destroy(): void {
    this.disposed = true; this.offer = undefined; this.listeners.clear();
    this.environment?.target.removeEventListener('beforeinstallprompt', this.onOffer);
    this.environment?.target.removeEventListener('appinstalled', this.onInstalled);
    this.environment?.mode?.removeEventListener('change', this.onMode);
  }
}
