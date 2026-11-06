import type { SupabaseClient } from '@supabase/supabase-js';
import { COURSES, type CourseId } from '../game/CourseCatalog';
import { SingleRecords, SINGLE_GOALS, SINGLE_RECORD_MAX_MS, type SingleRecordData } from '../game/SingleRecords';
export type RecordSyncStatus = 'loading' | 'syncing' | 'saved' | 'offline' | 'setup';
type Transport = (records: SingleRecordData, signal: AbortSignal) => Promise<unknown>;
export function parseSingleRecordData(value: unknown): SingleRecordData {
  const data = value as SingleRecordData | null;
  if (!data || data.version !== 2 || !data.times || typeof data.times !== 'object' || Array.isArray(data.times) || !data.goals || typeof data.goals !== 'object' || Array.isArray(data.goals)) throw Error('invalid_single_records');
  for (const [map, ms] of Object.entries(data.times)) {
    const goals = data.goals[map as CourseId];
    if (!Object.hasOwn(COURSES, map) || !Number.isSafeInteger(ms) || ms <= 0 || ms > SINGLE_RECORD_MAX_MS || !Array.isArray(goals) || goals.length > 3 || goals.some(goal => !SINGLE_GOALS.includes(goal))) throw Error('invalid_single_records');
  }
  if (Object.keys(data.goals).some(map => !Object.hasOwn(data.times, map))) throw Error('invalid_single_records');
  return new SingleRecords({ getItem: () => JSON.stringify(data), setItem() {} }).snapshot();
}
export function singleRecordTransport(client: SupabaseClient, owner: string): Transport {
  return async (records, signal) => {
    const { data, error } = await client.auth.getSession(); if (error) throw error;
    if (signal.aborted || data.session?.user.id !== owner) throw { code: '42501' };
    const result = await client.rpc('sync_single_records', { p_records: records }).setHeader('Authorization', 'Bearer ' + data.session.access_token).abortSignal(signal);
    if (result.error) throw result.error; return result.data;
  };
}

/** Monotonic personal-record merge, separate from mutable cosmetic save revisions. */
export class SingleRecordSync {
  status: RecordSyncStatus = 'loading';
  private requested = false;
  private applying = false;
  private disposed = false;
  private work?: Promise<void>;
  private readonly abort = new AbortController();
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: () => void;
  constructor(readonly records: SingleRecords, private readonly guest: () => SingleRecordData, private readonly transport: Transport, private readonly active: () => boolean = () => true) {
    this.unsubscribe = records.subscribe(() => { if (!this.applying && this.status !== 'setup') void this.sync(); });
    void this.sync();
  }
  get busy(): boolean { return !!this.work; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit(): void { if (!this.disposed) this.listeners.forEach(listener => listener()); }
  sync(): Promise<void> {
    if (this.disposed || !this.active()) return Promise.resolve();
    this.requested = true;
    if (this.work) return this.work;
    this.work = Promise.resolve().then(async () => {
      while (this.requested && !this.disposed && this.active()) {
        this.requested = false; this.status = 'syncing'; this.emit();
        try {
          const result = parseSingleRecordData(await this.transport(this.records.snapshot(), this.abort.signal));
          if (this.disposed || !this.active()) return;
          this.applying = true;
          try { this.records.merge(result); } finally { this.applying = false; }
          this.status = 'saved'; this.emit();
        } catch (error) {
          if (this.disposed || !this.active()) return;
          const code = (error as { code?: string })?.code;
          this.status = ['PGRST202','PGRST205','42883','42P01','42501'].includes(code ?? '') ? 'setup' : 'offline'; this.emit(); return;
        }
      }
    }).finally(() => { this.work = undefined; this.emit(); });
    return this.work;
  }
  async importGuest(): Promise<void> {
    if (this.disposed || !this.active()) return;
    this.records.merge(this.guest()); await this.sync();
  }
  async retryConnection(): Promise<void> { if (this.status === 'offline' && !this.busy) await this.sync(); }
  destroy(): void { this.disposed = true; this.abort.abort(); this.unsubscribe(); this.listeners.clear(); }
}
