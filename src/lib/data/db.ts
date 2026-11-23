import type { SupabaseClient } from '@supabase/supabase-js';

/** The only slice of the Supabase client the repos need (keeps them easy to fake in tests). */
export type DbClient = Pick<SupabaseClient, 'from'>;
