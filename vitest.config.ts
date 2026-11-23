import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  // The svelte plugin compiles runes in `*.svelte.ts` state modules so they can be unit tested.
  plugins: [svelte()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'tooling/**/*.test.ts'],
  },
});
