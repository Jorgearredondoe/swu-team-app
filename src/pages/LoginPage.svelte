<script lang="ts">
  import type { LoginMethods } from '../lib/auth/gate.ts';

  let {
    methods,
    error,
    notMember = false,
    onGoogle,
    onPassword,
    onSignOut,
  }: {
    methods: LoginMethods;
    error: string | null;
    notMember?: boolean;
    onGoogle: () => void;
    onPassword: (email: string, password: string) => void;
    onSignOut: () => void;
  } = $props();

  let email = $state('');
  let password = $state('');
</script>

<main>
  <h1>SWU Team Stock</h1>
  {#if notMember}
    <p class="error" role="alert">This account is not on the team, so no data is available.</p>
    <button type="button" onclick={onSignOut}>Sign out</button>
  {:else}
    <p class="muted">Sign in to record your Rare and Legendary cards.</p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if methods.google}
      <button type="button" class="primary" onclick={onGoogle}>Sign in with Google</button>
    {/if}
    {#if import.meta.env.DEV && methods.emailPassword}
      <form
        class="dev"
        onsubmit={(e) => {
          e.preventDefault();
          onPassword(email, password);
        }}
      >
        <p class="muted">Local development only</p>
        <input type="email" placeholder="Email" aria-label="Email" autocomplete="username" bind:value={email} required />
        <input type="password" placeholder="Password" aria-label="Password" autocomplete="current-password" bind:value={password} required />
        <button type="submit">Sign in (dev)</button>
      </form>
    {/if}
  {/if}
</main>

<style>
  .dev { display: grid; gap: 0.5rem; margin-top: 1.5rem; max-width: 320px; padding-top: 1rem; border-top: 1px dashed var(--line); }
</style>
