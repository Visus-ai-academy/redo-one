import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC emite os metadados de decorators que a injeção de dependência do Nest precisa.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    passWithNoTests: true,
    // Os testes não acessam o banco; a URL só satisfaz a configuração obrigatória do DatabaseModule.
    env: { DATABASE_URL: 'postgresql://test:test@localhost:5432/test' },
  },
});
