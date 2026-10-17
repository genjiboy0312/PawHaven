import { createClient } from '@supabase/supabase-js';

// Publishable keys identify the app; table grants and RLS protect user data.
export function createAccountClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? createClient(url, key, {
    global: { fetch: (input, init) => {
      const timeout = AbortSignal.timeout(12000);
      const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      return fetch(input, { ...init, signal });
    } },
  }) : undefined;
}
