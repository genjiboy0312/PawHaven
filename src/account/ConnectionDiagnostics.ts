type Failure = { at: string; operation: string; durationMs: number; status?: number; code: string };
const RPCS = new Set(['sync_single_records','save_player_state','claim_player_nickname','economy_command','multiplayer_command','room_chat_command','park_command','park_chat_command','friends_command','friend_activity','visit_friend_home','mailbox_command','daily_attendance_mail','redeem_coupon']);
const ACTIONS = new Set(['load','buy','buy_home','buy_pet','feed','claim','claim_daily','unlock_pass','run_start','run_finish','list','sync','create','join','leave','ready','start','map','pose','finish','return','send','redeem','attendance']);

function operation(input: RequestInfo | URL, init?: RequestInit): string {
  try {
    const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).pathname;
    const name = path.split('/').at(-1)!;
    if (path.startsWith('/rest/v1/rpc/') && RPCS.has(name)) {
      let action: unknown;
      if (typeof init?.body === 'string') { try { action = JSON.parse(init.body).p_action; } catch { /* No body is retained. */ } }
      return name + (typeof action === 'string' && ACTIONS.has(action) ? '.' + action : '');
    }
    if (['/rest/v1/player_saves','/rest/v1/player_profiles'].includes(path)) return name;
    if (['token','signup','logout','authorize','user','recover','verify'].some(route => path === '/auth/v1/' + route)) return 'auth.' + name;
  } catch { /* Unrecognized URLs get a fixed label. */ }
  return 'other';
}

/** Session-only, bounded failures. URLs, bodies, headers and raw messages are never stored. */
export class ConnectionDiagnostics {
  private readonly failures: Failure[] = [];
  wrap(fetcher: typeof fetch): typeof fetch {
    return async (input, init) => {
      const started = performance.now();
      const timeout = AbortSignal.timeout(12000);
      const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      const record = (code: string, status?: number) => {
        const entry: Failure = { at: new Date().toISOString(), operation: operation(input, init), durationMs: Math.round(performance.now() - started), code, ...(status === undefined ? {} : { status }) };
        this.failures.push(entry); if (this.failures.length > 20) this.failures.shift();
        return entry;
      };
      try {
        const response = await fetcher(input, { ...init, signal });
        if (!response.ok) {
          const entry = record('HTTP_' + response.status, response.status);
          // Read only a small clone, leaving the actual SDK response untouched.
          try { void this.errorCode(response.clone()).then(code => { if (code) entry.code = code; }).catch(() => {}); } catch { /* Diagnostics cannot change the response. */ }
        }
        return response;
      } catch (error) {
        const reason = signal.aborted ? signal.reason : error;
        const name = (reason as { name?: string })?.name;
        if (name !== 'AbortError') record(name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK');
        throw error;
      }
    };
  }
  private async errorCode(response: Response): Promise<string | undefined> {
    const reader = response.body?.getReader(); if (!reader) return;
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const next = await reader.read(); if (next.done) break;
        size += next.value.byteLength; if (size > 2048) return;
        chunks.push(next.value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const code: unknown = JSON.parse(new TextDecoder().decode(bytes)).code;
      return typeof code === 'string' && /^(PGRST[0-9]{3}|[0-9A-Z]{5})$/.test(code) ? code : undefined;
    } catch { return; } finally { void reader.cancel().catch(() => {}); }
  }
  report(): string {
    const build = import.meta.env?.VITE_BUILD_SHA;
    return JSON.stringify({ app: 'PawHaven', build: typeof build === 'string' && /^[a-f0-9]{7,40}$/.test(build) ? build.slice(0,7) : 'local', capturedAt: new Date().toISOString(), failures: this.failures }, null, 2);
  }
}
export const connectionDiagnostics = new ConnectionDiagnostics();
