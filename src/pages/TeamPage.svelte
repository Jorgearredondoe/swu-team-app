<script lang="ts">
  import { filterCards, sortCards } from '../lib/domain/catalog.ts';
  import { buildExport, exportFileName, serializeExport } from '../lib/domain/export.ts';
  import { aggregateTeam, summarizeMembers } from '../lib/domain/team.ts';
  import { downloadText } from '../lib/download.ts';
  import type { Card, Rarity, SetCode, TeamRow } from '../lib/types.ts';
  import CardRow from '../components/molecules/CardRow.svelte';
  import FilterBar from '../components/molecules/FilterBar.svelte';

  let { cards, rows, loading, error }: { cards: Card[]; rows: TeamRow[]; loading: boolean; error: string | null } = $props();

  let set = $state<SetCode | ''>('');
  let rarity = $state<Rarity | ''>('');
  let search = $state('');

  const totals = $derived(new Map(aggregateTeam(rows, cards).map((t) => [t.cardId, t])));
  const members = $derived(summarizeMembers(rows));
  const teamCopies = $derived(members.reduce((sum, m) => sum + m.copies, 0));
  const visible = $derived(
    sortCards(filterCards(cards, { set: set || undefined, rarity: rarity || undefined, search })),
  );

  function breakdown(cardId: string): string | undefined {
    const by = totals.get(cardId)?.byMember ?? {};
    const text = Object.entries(by).map(([name, q]) => `${name} ${q}`).join(', ');
    return text || undefined;
  }

  function exportAll(): void {
    const now = new Date();
    downloadText(exportFileName(now), serializeExport(buildExport(cards, rows, now)));
  }
</script>

<section>
  <h2>Team stock <span class="muted">({teamCopies} copies)</span></h2>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if loading}<p class="muted">Loading...</p>{/if}
  <table>
    <thead><tr><th>Member</th><th>Copies</th><th>Distinct</th></tr></thead>
    <tbody>
      {#each members as m (m.displayName)}
        <tr><td>{m.displayName}</td><td>{m.copies}</td><td>{m.distinctCards}</td></tr>
      {:else}
        <tr><td colspan="3" class="muted">No stock recorded yet.</td></tr>
      {/each}
    </tbody>
  </table>
  <FilterBar bind:set bind:rarity bind:search />
  <ul>
    {#each visible as card (card.id)}
      <CardRow {card} qty={totals.get(card.id)?.total ?? 0} detail={breakdown(card.id)} />
    {:else}
      <li class="muted">No cards match.</li>
    {/each}
  </ul>
  <button type="button" onclick={exportAll}>Export team stock (JSON)</button>
</section>

<style>
  ul { padding: 0; margin: 0 0 1rem; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
  th, td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--line); }
</style>
