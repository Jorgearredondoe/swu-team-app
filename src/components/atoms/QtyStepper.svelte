<script lang="ts">
  let { qty, label, onadjust }: { qty: number; label: string; onadjust: (delta: number) => void } = $props();
</script>

<div class="stepper" role="group" aria-label={label}>
  <button type="button" aria-label="Remove one {label}" disabled={qty <= 0} onclick={() => onadjust(-1)}>-</button>
  <output aria-live="polite">{qty}</output>
  <button type="button" aria-label="Add one {label}" onclick={() => onadjust(1)}>+</button>
</div>

<style>
  .stepper { display: flex; align-items: center; gap: 0.4rem; }
  button { min-width: 44px; font-size: 1.2rem; padding: 0; }
  output { min-width: 2ch; text-align: center; font-weight: 700; font-variant-numeric: tabular-nums; }
</style>
