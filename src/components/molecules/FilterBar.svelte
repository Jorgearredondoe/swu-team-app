<script lang="ts">
  import { SET_CODES, type Rarity, type SetCode } from '../../lib/types.ts';

  let {
    set = $bindable(),
    rarity = $bindable(),
    search = $bindable(),
  }: { set: SetCode | ''; rarity: Rarity | ''; search: string } = $props();
</script>

<div class="bar">
  <input type="search" placeholder="Search name..." aria-label="Search cards" bind:value={search} />
  <select aria-label="Set" bind:value={set}>
    <option value="">All sets</option>
    {#each SET_CODES as code (code)}<option value={code}>{code}</option>{/each}
  </select>
  <select aria-label="Rarity" bind:value={rarity}>
    <option value="">All rarities</option>
    <option value="Rare">Rare</option>
    <option value="Legendary">Legendary</option>
  </select>
</div>

<style>
  .bar { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.75rem; }
  input { grid-column: 1 / -1; }
  @media (min-width: 640px) { .bar { grid-template-columns: 2fr 1fr 1fr; } input { grid-column: auto; } }
</style>
