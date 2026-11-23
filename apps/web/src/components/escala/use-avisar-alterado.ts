import type { AnyFormApi } from '@tanstack/react-form';
import { useEffect } from 'react';

import { useAlterado } from '../painel/fechamento';

/**
 * Formulário dentro de um painel montado por outro componente (seção do plantão, recusa da
 * ausência): avisa quem monta o `PainelLateral` se há alteração não salva, para ele perguntar antes
 * de descartar. Ao sair da tela (salvou, a seção sumiu), deixa de estar alterado.
 */
export function useAvisarAlterado(
  form: AnyFormApi,
  iniciais: unknown,
  onAlterado: ((alterado: boolean) => void) | undefined,
) {
  const alterado = useAlterado(form, iniciais);
  useEffect(() => {
    onAlterado?.(alterado);
  }, [alterado, onAlterado]);
  useEffect(() => () => onAlterado?.(false), [onAlterado]);
}
