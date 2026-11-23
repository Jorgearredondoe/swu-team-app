import type { SupabaseClient } from '@supabase/supabase-js';

export type AuthPort = Pick<
  SupabaseClient['auth'],
  'getSession' | 'onAuthStateChange' | 'signInWithOAuth' | 'signInWithPassword' | 'signOut'
>;

type SessionUser = { id: string; email?: string | undefined };

export function createSessionStore(auth: AuthPort, redirectTo: string) {
  let user = $state<SessionUser | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  return {
    get loading() {
      return loading;
    },
    get userId() {
      return user?.id ?? null;
    },
    get email() {
      return user?.email ?? null;
    },
    get error() {
      return error;
    },
    async init(): Promise<void> {
      auth.onAuthStateChange((_event, session) => {
        user = session?.user ?? null;
      });
      const { data } = await auth.getSession();
      user = data.session?.user ?? null;
      loading = false;
    },
    async signInWithGoogle(): Promise<void> {
      error = null;
      const { error: e } = await auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
      if (e) error = e.message;
    },
    async signInWithPassword(email: string, password: string): Promise<void> {
      error = null;
      const { error: e } = await auth.signInWithPassword({ email, password });
      if (e) error = e.message;
    },
    async signOut(): Promise<void> {
      await auth.signOut();
      user = null;
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
