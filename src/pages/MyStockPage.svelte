<script lang="ts">
  import { filterCards, sortCards } from '../lib/domain/catalog.ts';
  import { buildExport, exportFileName, serializeExport } from '../lib/domain/export.ts';
  import { downloadText } from '../lib/download.ts';
  import type { StockStore } from '../lib/state/stock.svelte.ts';
  import type { Card, Rarity, SetCode } from '../lib/types.ts';
  import CardRow from '../components/molecules/CardRow.svelte';
  import FilterBar from '../components/molecules/FilterBar.svelte';

  let { cards, stock, userId }: { cards: Card[]; stock: StockStore; userId: string } = $props();

  let set = $state<SetCode | ''>('');
  let rarity = $state<Rarity | ''>('');
  let search = $state('');

  const visible = $derived(
    sortCards(filterCards(cards, { set: set || undefined, rarity: rarity || undefined, search })),
  );
  const owned = $derived(cards.reduce((sum, c) => sum + stock.qty(c.id), 0));

  function exportMine(): void {
    const now = new Date();
    const rows = cards
      .filter((c) => stock.qty(c.id) > 0)
      .map((c) => ({ cardId: c.id, userId, displayName: 'me', qty: stock.qty(c.id) }));
    downloadText(exportFileName(now), serializeExport(buildExport(cards, rows, now)));
  }
</script>

<section>
  <h2>My stock <span class="muted">({owned} copies)</span></h2>
  {#if stock.error}
    <p class="error" role="alert">{stock.error} <button type="button" onclick={() => stock.dismissError()}>Dismiss</button></p>
  {/if}
  <FilterBar bind:set bind:rarity bind:search />
  <ul>
    {#each visible as card (card.id)}
      <CardRow {card} qty={stock.qty(card.id)} onadjust={(d) => stock.adjust(card.id, d)} />
    {:else}
      <li class="muted">No cards match.</li>
    {/each}
  </ul>
  <button type="button" onclick={exportMine}>Export my stock (JSON)</button>
</section>

<style>
  ul { padding: 0; margin: 0 0 1rem; }
</style>
