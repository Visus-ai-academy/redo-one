import { existsSync } from 'node:fs';

import { defineConfig } from 'drizzle-kit';

// O drizzle-kit roda fora do Nest, então carrega o .env do app por conta própria.
if (existsSync('.env')) process.loadEnvFile('.env');

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não definida (veja apps/api/.env.example).');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema',
  out: './drizzle',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
