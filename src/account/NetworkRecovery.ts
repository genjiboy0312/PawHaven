import type { SingleRecordSync } from './SingleRecordSync';
import type { AccountService } from './AccountService';
import type { CommerceState } from '../shop/CommerceState';
interface RecoveryState { account?: AccountService; commerce?: CommerceState; records?: SingleRecordSync; allowAccountLoad: boolean }

/** One recovery per offline/online cycle, using the existing save and economy outbox. */
export class NetworkRecovery {
  private readonly abort = new AbortController();
  private cycle = 0;
  private attempted = -1;
  private running = false;
  private again = false;
  private disposed = false;
  private deferred?: { account: AccountService; owner: string };
  constructor(private readonly current: () => RecoveryState, target: EventTarget = window) {
    target.addEventListener('offline', () => { this.cycle++; }, { signal: this.abort.signal });
    target.addEventListener('online', () => {
      if (this.attempted === this.cycle) return;
      this.attempted = this.cycle;
      if (this.running) this.again = true;
      else void this.recover(false);
    }, { signal: this.abort.signal });
  }
  /** Called on lobby entry; never retries purchases merely because a screen changed. */
  resume(): void { if (this.deferred && !this.running && this.current().allowAccountLoad) void this.recover(true); }
  private async recover(deferredOnly: boolean): Promise<void> {
    if (this.disposed || this.running) return;
    const initial = this.current(), account = initial.account, commerce = initial.commerce, records = initial.records, owner = account?.user?.id;
    if (!account || !owner) { this.deferred = undefined; return; }
    if (deferredOnly && (this.deferred?.account !== account || this.deferred.owner !== owner)) { this.deferred = undefined; return; }
    this.running = true;
    const stillCurrent = () => !this.disposed && this.current().account === account && this.current().commerce === commerce && account.user?.id === owner;
    try {
      if (!deferredOnly && commerce && 'retryConnection' in commerce) await commerce.retryConnection();
      if (!stillCurrent()) return;
      if (!deferredOnly) await records?.retryConnection();
      if (!stillCurrent()) return;
      // Loading an account rebuilds its commerce instance. Preserve unknown purchases first.
      const pending = !!commerce && 'hasPendingRequests' in commerce && commerce.hasPendingRequests;
      const wait = await account.recoverConnection(this.current().allowAccountLoad && !pending);
      if (!this.disposed) this.deferred = wait && account.user?.id === owner ? { account, owner } : undefined;
    } catch { /* Existing clients retain edits/requests and expose their manual retry UI. */ }
    finally {
      this.running = false;
      if (this.again && !this.disposed) { this.again = false; void this.recover(false); }
    }
  }
  destroy(): void { this.disposed = true; this.deferred = undefined; this.again = false; this.abort.abort(); }
}
