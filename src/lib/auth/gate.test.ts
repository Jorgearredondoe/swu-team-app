import { describe, expect, it } from 'vitest';
import { authErrorFromUrl, loginMethods, resolveGate } from './gate.ts';

describe('loginMethods', () => {
  it('offers Google only in a production build', () => {
    expect(loginMethods(false)).toEqual({ google: true, emailPassword: false });
  });
  it('adds email/password only for the local dev server', () => {
    expect(loginMethods(true)).toEqual({ google: true, emailPassword: true });
  });
});

describe('resolveGate', () => {
  it('shows a loading state until the session is known', () => {
    expect(resolveGate({ loading: true, signedIn: false, hasCatalogAccess: false })).toBe('loading');
  });
  it('sends signed-out visitors to login', () => {
    expect(resolveGate({ loading: false, signedIn: false, hasCatalogAccess: false })).toBe('login');
  });
  it('lets team members in', () => {
    expect(resolveGate({ loading: false, signedIn: true, hasCatalogAccess: true })).toBe('app');
  });
  it('blocks a signed-in account that RLS shows an empty catalog (not on the team)', () => {
    expect(resolveGate({ loading: false, signedIn: true, hasCatalogAccess: false })).toBe('not-member');
  });
  it('shows a retryable error, not "not on the team", when the catalog fetch failed', () => {
    expect(resolveGate({ loading: false, signedIn: true, hasCatalogAccess: false, catalogError: true })).toBe('error');
  });
  it('still sends signed-out visitors to login even after a catalog error', () => {
    expect(resolveGate({ loading: false, signedIn: false, hasCatalogAccess: false, catalogError: true })).toBe('login');
  });
});

describe('authErrorFromUrl', () => {
  it('maps a hook rejection in the query string to the team message', () => {
    expect(authErrorFromUrl('?error=access_denied&error_description=Not+a+team+member')).toBe(
      'This Google account is not on the team.',
    );
  });
  it('also reads errors returned in the hash fragment', () => {
    expect(authErrorFromUrl('#error=server_error&error_description=Not%20a%20team%20member')).toBe(
      'This Google account is not on the team.',
    );
  });
  it('shows a generic message for other auth errors', () => {
    expect(authErrorFromUrl('?error=server_error&error_description=boom')).toBe('Sign-in failed. Please try again.');
  });
  it('returns null when there is no error', () => {
    expect(authErrorFromUrl('?code=abc')).toBeNull();
    expect(authErrorFromUrl('')).toBeNull();
  });
});
