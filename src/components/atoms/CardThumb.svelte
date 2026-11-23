<script lang="ts">
  let { src, alt }: { src: string; alt: string } = $props();
</script>

<img {src} {alt} loading="lazy" width="63" height="88" />

<style>
  img { width: 63px; height: 88px; object-fit: cover; border-radius: 6px; background: var(--line); flex: none; }
</style>
