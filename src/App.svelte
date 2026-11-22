<script lang="ts">
  import { authErrorFromUrl, loginMethods, resolveGate } from './lib/auth/gate.ts';
  import { fetchCards } from './lib/data/cardsRepo.ts';
  import { fetchMyStock, saveStockChanges } from './lib/data/stockRepo.ts';
  import { fetchTeamRows } from './lib/data/teamRepo.ts';
  import { createSessionStore } from './lib/state/session.svelte.ts';
  import { createStockStore, type StockStore } from './lib/state/stock.svelte.ts';
  import { createUserDataLoader, type UserData } from './lib/state/userData.ts';
  import { untrack } from 'svelte';
  import { isConfigured, supabase } from './lib/supabase.ts';
  import type { Card, TeamRow } from './lib/types.ts';
  import LoginPage from './pages/LoginPage.svelte';
  import MyStockPage from './pages/MyStockPage.svelte';
  import TeamPage from './pages/TeamPage.svelte';

  const methods = loginMethods(import.meta.env.DEV);
  const urlError = authErrorFromUrl(location.search) ?? authErrorFromUrl(location.hash);
  if (urlError) history.replaceState(null, '', location.pathname);

  const session = supabase ? createSessionStore(supabase.auth, location.origin) : null;

  let route = $state(location.hash === '#/team' ? '#/team' : '#/stock');
  let data = $state.raw<UserData<StockStore>>({ status: 'idle' });
  let teamRows = $state<TeamRow[]>([]);
  let teamLoading = $state(false);
  let teamError = $state<string | null>(null);

  const cards = $derived(data.status === 'ready' ? data.cards : []);
  const stock = $derived(data.status === 'ready' ? data.stock : null);
  const catalogReady = $derived(data.status === 'ready');

  void session?.init();

  function createLoader(client: NonNullable<typeof supabase>) {
    return createUserDataLoader<StockStore>({
      fetchCards: () => fetchCards(client),
      createStock: (userId) =>
        createStockStore({
          fetchStock: () => fetchMyStock(client, userId),
          save: (changes) => saveStockChanges(client, userId, changes),
        }),
      onChange: (next) => (data = next),
    });
  }
  const loader = supabase ? createLoader(supabase) : null;

  // Re-run only when the signed-in user actually changes (not on token refreshes).
  const uid = $derived(session?.userId ?? null);
  $effect(() => {
    const userId = uid;
    untrack(() => void loader?.switchTo(userId));
  });


  async function loadTeam(): Promise<void> {
    if (!supabase) return;
    teamLoading = true;
    teamError = null;
    try {
      teamRows = await fetchTeamRows(supabase);
    } catch {
      teamError = 'Could not load team stock.';
    }
    teamLoading = false;
  }

  $effect(() => {
    if (route === '#/team' && catalogReady) void loadTeam();
  });

  const gate = $derived(
    resolveGate({
      loading: (session?.loading ?? false) || (uid != null && (data.status === 'idle' || data.status === 'loading')),
      signedIn: uid != null,
      hasCatalogAccess: cards.length > 0,
      catalogError: data.status === 'error',
    }),
  );

  function go(next: '#/stock' | '#/team'): void {
    route = next;
    history.replaceState(null, '', next);
  }

  async function signOut(): Promise<void> {
    await stock?.flush();
    await session?.signOut();
  }
</script>

{#if !isConfigured || !session}
  <main>
    <h1>SWU Team Stock</h1>
    <p class="error" role="alert">Missing configuration: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example).</p>
  </main>
{:else if gate === 'loading'}
  <main><p class="muted">Loading...</p></main>
{:else if gate === 'error'}
  <main>
    <h1>SWU Team Stock</h1>
    <p class="error" role="alert">Could not load the card catalog. Check your connection and try again.</p>
    <button type="button" class="primary" onclick={() => loader?.retry()}>Retry</button>
    <button type="button" onclick={signOut}>Sign out</button>
  </main>
{:else if gate === 'login' || gate === 'not-member'}
  <LoginPage
    {methods}
    error={urlError ?? session.error}
    notMember={gate === 'not-member'}
    onGoogle={() => session.signInWithGoogle()}
    onPassword={(e, p) => session.signInWithPassword(e, p)}
    onSignOut={signOut}
  />
{:else if stock && session.userId}
  <main>
    <header class="nav">
      <nav>
        <button type="button" class:primary={route === '#/stock'} onclick={() => go('#/stock')}>My stock</button>
        <button type="button" class:primary={route === '#/team'} onclick={() => go('#/team')}>Team</button>
      </nav>
      <span class="muted who">{session.email}</span>
      <button type="button" onclick={signOut}>Sign out</button>
    </header>
    {#if route === '#/team'}
      <TeamPage {cards} rows={teamRows} loading={teamLoading} error={teamError} />
    {:else}
      <MyStockPage {cards} {stock} userId={session.userId} />
    {/if}
  </main>
{/if}

<style>
  .nav { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
  nav { display: flex; gap: 0.5rem; flex: 1; }
  .who { font-size: 0.8rem; }
</style>
