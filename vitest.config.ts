import { defineConfig } from 'vitest/config';

// Fuseau fixe pour des tests reproductibles (dont le passage à l'heure d'hiver du 25 oct. 2026).
process.env.TZ = 'Europe/Paris';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
