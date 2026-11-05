import { createClient } from '@supabase/supabase-js';
import { connectionDiagnostics } from './ConnectionDiagnostics';

// Publishable keys identify the app; table grants and RLS protect user data.
export function createAccountClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? createClient(url, key, {
    global: { fetch: connectionDiagnostics.wrap(fetch) },
  }) : undefined;
}
