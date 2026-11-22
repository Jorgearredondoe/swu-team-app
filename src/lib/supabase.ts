import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey);

/** Browser client. Only the public anon/publishable key is ever used here (never service_role). */
export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url!, anonKey!, { auth: { flowType: 'pkce', detectSessionInUrl: true } })
  : null;
