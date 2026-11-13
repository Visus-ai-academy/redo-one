import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tailwindcss(), tanstackStart(), react()],
  // No dev, o Vite só descobre as dependências das rotas quando elas abrem e então recarrega a
  // página; no meio da hidratação isso carrega duas cópias do React e a tela para de responder.
  // Pré-empacotar na subida evita isso. Novo componente do Base UI entra nesta lista.
  optimizeDeps: {
    include: [
      '@base-ui/react/button',
      '@base-ui/react/dialog',
      '@base-ui/react/field',
      '@phosphor-icons/react',
      '@tanstack/react-form',
      '@tanstack/react-table',
      'zod',
    ],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    passWithNoTests: true,
  },
});
