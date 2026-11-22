<script lang="ts">
  import { authErrorFromUrl, loginMethods, resolveGate } from './lib/auth/gate.ts';
  import { fetchCards } from './lib/data/cardsRepo.ts';
  import { fetchMyStock, saveStockChanges } from './lib/data/stockRepo.ts';
  import { fetchTeamRows } from './lib/data/teamRepo.ts';
  import { createSessionStore } from './lib/state/session.svelte.ts';
  import { createStockStore, type StockStore } from './lib/state/stock.svelte.ts';
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
  let cards = $state<Card[]>([]);
  let catalogReady = $state(false);
  let stock = $state<StockStore | null>(null);
  let teamRows = $state<TeamRow[]>([]);
  let teamLoading = $state(false);
  let teamError = $state<string | null>(null);

  void session?.init();

  $effect(() => {
    const userId = session?.userId ?? null;
    if (!supabase || !userId) {
      cards = [];
      catalogReady = false;
      stock = null;
      return;
    }
    const client = supabase;
    const store = createStockStore({
      fetchStock: () => fetchMyStock(client, userId),
      save: (changes) => saveStockChanges(client, userId, changes),
    });
    void (async () => {
      try {
        cards = await fetchCards(client);
      } catch {
        cards = [];
      }
      if (cards.length > 0) await store.load();
      stock = store;
      catalogReady = true;
    })();
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
      loading: (session?.loading ?? false) || (session?.userId != null && !catalogReady),
      signedIn: session?.userId != null,
      hasCatalogAccess: cards.length > 0,
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
