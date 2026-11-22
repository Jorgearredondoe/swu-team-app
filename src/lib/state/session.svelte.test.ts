import { describe, expect, it, vi } from 'vitest';
import { createSessionStore, type AuthPort } from './session.svelte.ts';

type Listener = (event: string, session: { user: { id: string; email: string } } | null) => void;

function fakeAuth(initial: { user: { id: string; email: string } } | null) {
  let listener: Listener = () => {};
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: initial }, error: null })),
    onAuthStateChange: vi.fn((cb: Listener) => {
      listener = cb;
      return { data: { subscription: { unsubscribe: () => {} } } };
    }),
    signInWithOAuth: vi.fn(async () => ({ error: null })),
    signInWithPassword: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  };
  return { auth: auth as unknown as AuthPort, raw: auth, emit: (...a: Parameters<Listener>) => listener(...a) };
}

describe('session store', () => {
  it('starts loading, then exposes the existing session user', async () => {
    const { auth } = fakeAuth({ user: { id: 'u1', email: 'a@b.test' } });
    const store = createSessionStore(auth, 'http://localhost:5173');
    expect(store.loading).toBe(true);
    await store.init();
    expect(store.loading).toBe(false);
    expect(store.userId).toBe('u1');
    expect(store.email).toBe('a@b.test');
  });

  it('is signed out when there is no session', async () => {
    const { auth } = fakeAuth(null);
    const store = createSessionStore(auth, 'http://localhost:5173');
    await store.init();
    expect(store.userId).toBeNull();
  });

  it('follows auth state changes (sign-in and sign-out)', async () => {
    const { auth, emit } = fakeAuth(null);
    const store = createSessionStore(auth, 'http://localhost:5173');
    await store.init();
    emit('SIGNED_IN', { user: { id: 'u2', email: 'c@d.test' } });
    expect(store.userId).toBe('u2');
    emit('SIGNED_OUT', null);
    expect(store.userId).toBeNull();
  });

  it('starts Google OAuth redirecting back to the app origin', async () => {
    const { auth, raw } = fakeAuth(null);
    const store = createSessionStore(auth, 'https://app.example');
    await store.signInWithGoogle();
    expect(raw.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'https://app.example' } });
  });

  it('reports a failed password sign-in', async () => {
    const { auth, raw } = fakeAuth(null);
    raw.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } } as never);
    const store = createSessionStore(auth, 'http://localhost:5173');
    await store.signInWithPassword('x@y.test', 'bad');
    expect(store.error).toBe('Invalid login credentials');
  });

  it('signs out through the auth client', async () => {
    const { auth, raw } = fakeAuth({ user: { id: 'u1', email: 'a@b.test' } });
    const store = createSessionStore(auth, 'http://localhost:5173');
    await store.init();
    await store.signOut();
    expect(raw.signOut).toHaveBeenCalledTimes(1);
  });
});
