import { Toast } from '@base-ui/react/toast';

/** Dispara os avisos de um `Avisos` acima na árvore. */
export function useAvisos() {
  const gerente = Toast.useToastManager();
  return {
    sucesso: (texto: string) => {
      gerente.add({ title: texto, type: 'sucesso' });
    },
  };
}
