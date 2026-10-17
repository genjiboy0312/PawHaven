import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { AccountStorage, normalizeSnapshot, type PlayerSnapshot } from './AccountStorage';

export type SyncStatus = 'guest' | 'loading' | 'saved' | 'saving' | 'offline' | 'conflict' | 'setup';
export class AccountService {
  user: { id: string; email: string } | null = null;
  nickname: string | null = null;
  status: SyncStatus = 'guest';
  busy = false;
  private ready = false;
  private revision = 0;
  private generation = 0;
  private disposed = false;
  private timer?: ReturnType<typeof setTimeout>;
  private authTimer?: ReturnType<typeof setTimeout>;
  private unsubscribeAuth?: () => void;
  private readonly unsubscribeStore: () => void;
  private readonly listeners = new Set<() => void>();
  private readonly loadedListeners = new Set<() => void>();
  private writing?: Promise<void>;
  constructor(readonly storage: AccountStorage, private readonly client?: SupabaseClient) {
    this.unsubscribeStore = storage.subscribe(() => this.schedule());
  }
  setBusy(value: boolean): void { this.busy = value; this.emit(); }
  get canSave(): boolean { return this.ready && !!this.user && !['loading', 'saving'].includes(this.status); }
  get enabled(): boolean { return !!this.client; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  onLoaded(listener: () => void): () => void { this.loadedListeners.add(listener); return () => { this.loadedListeners.delete(listener); }; }
  private emit(): void { if (!this.disposed) this.listeners.forEach(listener => listener()); }
  private loaded(): void { if (!this.disposed) this.storage.hydrate(() => this.loadedListeners.forEach(listener => listener())); }
  async initialize(): Promise<void> {
    if (!this.client) return;
    let data;
    try {
      const result = await this.client.auth.getSession();
      data = result.data;
    } catch {
      this.status = 'offline'; this.emit();
      data = { session: null };
    }
    await this.switchSession(data.session);
    if (this.disposed) return;
    const { data: auth } = this.client.auth.onAuthStateChange((_event, session) => {
      if ((session?.user.id ?? null) === this.user?.id || (!session && !this.user)) return;
      clearTimeout(this.authTimer);
      this.authTimer = setTimeout(() => { void this.switchSession(session); }, 0);
    });
    this.unsubscribeAuth = () => auth.subscription.unsubscribe();
  }
  private async switchSession(session: Session | null): Promise<void> {
    clearTimeout(this.authTimer);
    const generation = ++this.generation;
    clearTimeout(this.timer);
    this.ready = false; this.nickname = null;
    this.user = session ? { id: session.user.id, email: session.user.email ?? '' } : null;
    this.storage.owner = this.user?.id ?? null;
    this.revision = this.storage.meta.revision;
    if (!this.user) { this.status = 'guest'; this.emit(); this.loaded(); return; }
    this.status = 'loading'; this.emit();
    // Immediately rebuild the scene against this account's isolated local bucket.
    this.loaded();
    await this.load(false, generation);
  }
  async load(discardLocal = true, generation = this.generation): Promise<void> {
    if (!this.client || !this.user || this.disposed) return;
    clearTimeout(this.timer);
    if (this.writing) await this.writing;
    if (generation !== this.generation || this.disposed || !this.user) return;
    this.ready = false;
    const userId = this.user.id;
    this.status = 'loading'; this.emit();
    try {
      const [save, profile] = await Promise.all([
        this.client.from('player_saves').select('snapshot,revision').eq('user_id', userId).maybeSingle(),
        this.client.from('player_profiles').select('nickname').eq('user_id', userId).maybeSingle(),
      ]);
      if (generation !== this.generation || this.disposed) return;
      if (save.error) throw save.error;
      if (profile.error) throw profile.error;
      this.nickname = profile.data?.nickname ?? null;
      const remoteRevision = save.data?.revision ?? 0, meta = this.storage.meta;
      if (save.data && (!Number.isSafeInteger(remoteRevision) || remoteRevision < 1)) throw Error('invalid_save');
      if (!discardLocal && meta.dirty && meta.revision !== remoteRevision) {
        this.status = 'conflict'; this.ready = false; this.emit(); return;
      }
      if (save.data && (discardLocal || !meta.dirty)) {
        this.storage.apply(normalizeSnapshot(save.data.snapshot));
        this.storage.setMeta({ revision: remoteRevision, dirty: false });
      } else if (!save.data && discardLocal) {
        // An empty cloud account starts from its own local cache, never a different guest.
        this.storage.setMeta({ revision: 0, dirty: true });
      }
      this.revision = remoteRevision; this.ready = true; this.status = 'saved';
      this.emit(); this.loaded();
      if (this.storage.meta.dirty || !save.data) this.schedule();
    } catch (error) {
      if (generation !== this.generation || this.disposed) return;
      this.ready = false; this.status = this.failure(error); this.emit();
    }
  }
  private failure(error: unknown): SyncStatus {
    const code = (error as { code?: string })?.code;
    return code === 'PGRST205' || code === '42501' || code === '42883' ? 'setup'
      : code === '40001' || code === '23505' ? 'conflict' : 'offline';
  }
  private schedule(): void {
    if (!this.ready || !this.user || this.disposed) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.save(); }, 800);
  }
  async save(): Promise<void> {
    clearTimeout(this.timer);
    if (!this.ready || !this.client || !this.user || this.disposed) return;
    if (this.writing) { await this.writing; if (this.storage.meta.dirty && this.ready) await this.save(); return; }
    const generation = this.generation, state = this.storage.snapshot(), encoded = JSON.stringify(state);
    this.status = 'saving'; this.emit();
    this.writing = (async () => {
      try {
        const { data, error } = await this.client!.rpc('save_player_state', { expected_revision: this.revision, state });
        if (generation !== this.generation || this.disposed) return;
        if (error) throw error;
        if (!Number.isSafeInteger(data) || data < 1) throw Error('invalid_revision');
        this.revision = data;
        const dirty = encoded !== JSON.stringify(this.storage.snapshot());
        this.storage.setMeta({ revision: data, dirty });
        this.status = 'saved'; this.emit();
        if (dirty) this.schedule();
      } catch (error) {
        if (generation !== this.generation || this.disposed) return;
        this.storage.setMeta({ revision: this.revision, dirty: true });
        this.status = this.failure(error);
        if (this.status === 'conflict' || this.status === 'setup') this.ready = false;
        this.emit();
      }
    })();
    try { await this.writing; } finally { this.writing = undefined; }
  }
  async importGuest(): Promise<void> {
    if (!this.ready || !this.user || this.status === 'loading' || this.writing) return;
    const guest: PlayerSnapshot = this.storage.snapshot(null);
    this.storage.apply(guest); this.storage.setMeta({ revision: this.revision, dirty: true });
    this.loaded(); await this.save();
  }
  async login(email: string, password: string): Promise<void> {
    if (!this.client) throw Error('account_unavailable');
    const { data, error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    await this.switchSession(data.session);
  }
  async signup(email: string, password: string, redirectTo: string): Promise<boolean> {
    if (!this.client) throw Error('account_unavailable');
    const { data, error } = await this.client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectTo } });
    if (error) throw error;
    if (data.session) await this.switchSession(data.session);
    return !data.session;
  }
  async logout(): Promise<void> {
    if (!this.client) return;
    if (this.ready && this.storage.meta.dirty) await this.save();
    const { error } = await this.client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    await this.switchSession(null);
  }
  async claimNickname(value: string): Promise<void> {
    if (!this.client || !this.user) return;
    const generation = this.generation;
    const nickname = value.trim();
    if (!/^[A-Za-z0-9가-힣_]{2,16}$/.test(nickname)) throw Error('invalid_nickname');
    const { data, error } = await this.client.rpc('claim_player_nickname', { new_nickname: nickname });
    if (error) throw error;
    if (generation === this.generation && !this.disposed) { this.nickname = data; this.emit(); }
  }
  destroy(): void {
    this.disposed = true; this.generation++;
    clearTimeout(this.timer); clearTimeout(this.authTimer);
    this.unsubscribeAuth?.(); this.unsubscribeStore(); this.listeners.clear(); this.loadedListeners.clear();
  }
}
