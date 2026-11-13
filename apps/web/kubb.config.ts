import { pluginFetch } from '@kubb/plugin-fetch';
import { pluginReactQuery } from '@kubb/plugin-react-query';
import { pluginTs } from '@kubb/plugin-ts';
import { pluginZod } from '@kubb/plugin-zod';
import { defineConfig } from 'kubb/config';

export default defineConfig({
  // Spec exportada pelo apps/api (`pnpm generate` na raiz exporta e gera em sequência).
  input: '../api/openapi.json',
  output: { path: './src/gen', clean: true },
  plugins: [
    pluginTs({ output: { path: './types' } }),
    pluginZod({ output: { path: './zod' }, inferred: true }),
    pluginFetch({
      output: { path: './clients' },
      // Interpolação mantida no código gerado: a URL é lida do env do Vite em runtime.
      // biome-ignore lint/suspicious/noTemplateCurlyInString: o Kubb emite este valor como template literal.
      baseURL: '${import.meta.env.VITE_API_URL}',
      validator: 'zod',
    }),
    pluginReactQuery({ output: { path: './hooks' }, hooks: true }),
  ],
});
