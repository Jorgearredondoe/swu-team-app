<script lang="ts">
  import type { Card } from '../../lib/types.ts';
  import CardThumb from '../atoms/CardThumb.svelte';
  import QtyStepper from '../atoms/QtyStepper.svelte';

  let {
    card,
    qty,
    onadjust,
    detail,
  }: { card: Card; qty: number; onadjust?: (delta: number) => void; detail?: string } = $props();
</script>

<li class="row">
  <CardThumb src={card.imageUrl} alt={card.name} />
  <div class="info">
    <strong>{card.name}</strong>
    {#if card.subtitle}<span class="muted">{card.subtitle}</span>{/if}
    <span class="muted">{card.setCode} #{card.number} · {card.rarity} · {card.type}</span>
    {#if detail}<span class="detail">{detail}</span>{/if}
  </div>
  {#if onadjust}
    <QtyStepper {qty} label={card.name} {onadjust} />
  {:else}
    <output class="total" aria-label="Team total for {card.name}">{qty}</output>
  {/if}
</li>

<style>
  .row { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem; border-bottom: 1px solid var(--line); list-style: none; }
  .info { display: flex; flex-direction: column; flex: 1; min-width: 0; font-size: 0.9rem; }
  .detail { color: var(--accent); }
  .total { font-size: 1.4rem; font-weight: 700; min-width: 2ch; text-align: right; }
</style>
