export type LoginMethods = { google: boolean; emailPassword: boolean };
export type GateView = 'loading' | 'login' | 'not-member' | 'app';

export const NOT_ON_TEAM_MESSAGE = 'This Google account is not on the team.';
export const GENERIC_AUTH_MESSAGE = 'Sign-in failed. Please try again.';

/** Production is Google only; email/password exists solely for the local dev server (`vite` dev mode). */
export function loginMethods(isDevServer: boolean): LoginMethods {
  return { google: true, emailPassword: isDevServer };
}

/**
 * Signed in but an empty catalog means RLS hides everything from this account,
 * i.e. it is not on the team (e.g. the signup hook was not enabled).
 */
export function resolveGate(s: { loading: boolean; signedIn: boolean; hasCatalogAccess: boolean }): GateView {
  if (s.loading) return 'loading';
  if (!s.signedIn) return 'login';
  return s.hasCatalogAccess ? 'app' : 'not-member';
}

/** Reads an OAuth error from the redirect URL (query or hash) and maps it to user-facing copy. */
export function authErrorFromUrl(urlPart: string): string | null {
  const params = new URLSearchParams(urlPart.replace(/^[?#]/, ''));
  if (!params.has('error') && !params.has('error_description')) return null;
  const description = (params.get('error_description') ?? '').toLowerCase();
  return description.includes('team member') ? NOT_ON_TEAM_MESSAGE : GENERIC_AUTH_MESSAGE;
}
