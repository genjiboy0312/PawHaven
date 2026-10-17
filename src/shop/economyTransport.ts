import type { SupabaseClient } from '@supabase/supabase-js';
import type { EconomyRequest } from './EconomySnapshot';

/** Pin each request to its owner's token even if another login replaces the shared SDK session. */
export function economyTransport(client: SupabaseClient, owner: string) {
  return async (request: EconomyRequest, signal: AbortSignal): Promise<unknown> => {
    const { data: auth, error: authError } = await client.auth.getSession();
    if (authError) throw authError;
    if (signal.aborted || auth.session?.user.id !== owner) throw { code: '42501', message: 'account_changed' };
    const { data, error } = await client.rpc('economy_command', request)
      .setHeader('Authorization', 'Bearer ' + auth.session.access_token).abortSignal(signal);
    if (error) throw error;
    return data;
  };
}
