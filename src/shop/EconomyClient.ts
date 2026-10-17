import { parseEconomyResult, type EconomyAction, type EconomyRequest, type EconomyResult } from './EconomySnapshot';
export type EconomyConnection = 'local' | 'loading' | 'ready' | 'offline' | 'setup' | 'rejected';
type Transport = (request: EconomyRequest, signal: AbortSignal) => Promise<unknown>;
interface Job { request: EconomyRequest; resolve: (value: EconomyResult | undefined) => void }
/** Ordered outbox: retry a lost response with the same server idempotency key. */
export class EconomyClient {
  connection: EconomyConnection = 'loading';
  issue: 'run_rejected' | undefined;
  result?: EconomyResult;
  private jobs: Job[] = [];
  private work?: Promise<void>;
  private lastRead = 0;
  private disposed = false;
  private readonly abort = new AbortController();
  private readonly listeners = new Set<() => void>();
  constructor(private readonly transport: Transport, private readonly uuid = () => crypto.randomUUID(), private readonly now = Date.now) {}
  get busy(): boolean { return !!this.work; }
  get ready(): boolean { return this.connection === 'ready' && !!this.result && !this.busy; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit(): void { if (!this.disposed) this.listeners.forEach(listener => listener()); }
  execute(action: EconomyAction, payload: Record<string, unknown> = {}): Promise<EconomyResult | undefined> {
    if (this.disposed) return Promise.resolve(undefined);
    return new Promise(resolve => {
      this.jobs.push({ request: { p_action: action, p_request_id: this.uuid(), p_payload: structuredClone(payload) }, resolve });
      void this.drain();
    });
  }
  refresh(force = false): void {
    if (this.disposed || this.busy || this.jobs.length || (!force && this.now() - this.lastRead < 30000)) return;
    void this.execute('load');
  }
  async retry(): Promise<void> {
    if (!this.jobs.length) { await this.execute('load'); return; }
    await this.drain();
  }
  private async drain(): Promise<void> {
    if (this.work || this.disposed) return;
    this.work = this.process();
    try { await this.work; } finally { this.work = undefined; this.emit(); }
  }
  private async process(): Promise<void> {
    while (this.jobs.length && !this.disposed) {
      const job = this.jobs[0]!;
      this.connection = 'loading'; this.emit();
      try {
        const result = parseEconomyResult(await this.transport(job.request, this.abort.signal));
        if (this.disposed) return;
        this.result = result; this.lastRead = this.now();
        this.issue = result.outcome === 'run_rejected' ? 'run_rejected' : undefined;
        this.jobs.shift(); job.resolve(result);
        this.connection = 'ready'; this.emit();
      } catch (error) {
        if (this.disposed) return;
        const code = (error as { code?: string })?.code;
        this.connection = ['PGRST202', 'PGRST205', '42501', '42883'].includes(code ?? '') ? 'setup'
          : ['22023', '22P02', 'P0001'].includes(code ?? '') ? 'rejected' : 'offline';
        // Resolve current callers so the UI is usable. Keep unknown outcomes for explicit retry.
        this.jobs.forEach(item => item.resolve(undefined));
        if (this.connection === 'rejected') this.jobs = []; // Invalid commands must not poison the queue.
        return;
      }
    }
  }
  destroy(): void {
    this.disposed = true; this.abort.abort(); this.jobs.forEach(item => item.resolve(undefined));
    this.jobs = []; this.listeners.clear();
  }
}
