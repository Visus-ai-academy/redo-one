import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC emite os metadados de decorators que a injeção de dependência do Nest precisa.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    passWithNoTests: true,
    // Com banco de teste, os arquivos rodam em série: cada um trunca as tabelas que usa.
    fileParallelism: !process.env.TEST_DATABASE_URL,
    // Os testes não acessam o banco; a URL só satisfaz a configuração obrigatória do DatabaseModule.
    // O trabalhador de jobs nunca sobe nos testes, mesmo com JOBS_WORKER=true no .env do dev.
    env: { DATABASE_URL: 'postgresql://test:test@localhost:5432/test', JOBS_WORKER: 'false' },
  },
});
