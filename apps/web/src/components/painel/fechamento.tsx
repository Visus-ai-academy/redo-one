import { type AnyFormApi, useStore } from '@tanstack/react-form';
import { createContext, type ReactNode, useState } from 'react';

import { ConfirmarAcao } from '../confirmacao/ConfirmarAcao';

/** Pede para fechar a camada (painel lateral ou diálogo) em que o componente está. */
export const PedirFechamento = createContext<(() => void) | undefined>(undefined);

/**
 * Guarda do fechamento de painel e diálogo: com alterações não salvas, pergunta antes ("Descartar
 * as alterações?"); sem alteração, fecha direto. `confirmacao` vai dentro da camada.
 */
export function useDescartarAlteracoes() {
  const [pendente, setPendente] = useState<(() => void) | null>(null);

  const pedir = (alterado: boolean, fechar: () => void) => {
    if (alterado) setPendente(() => fechar);
    else fechar();
  };

  const confirmacao: ReactNode = (
    <ConfirmarAcao
      acao="Descartar"
      rotuloCancelar="Continuar editando"
      titulo="Descartar as alterações?"
      consequencia="O que você mudou aqui ainda não foi salvo e se perde."
      aberto={pendente !== null}
      onAbertoChange={(abrir) => {
        if (!abrir) setPendente(null);
      }}
      onConfirmar={() => pendente?.()}
    />
  );

  return { pedir, confirmacao };
}

/**
 * O formulário tem alterações não salvas: algum valor difere do salvo (`iniciais`, os mesmos
 * `defaultValues` do `useAppForm`). Salvou e o item voltou da API, deixa de estar alterado.
 */
export function useAlterado(form: AnyFormApi, iniciais: unknown) {
  const valores = useStore(form.store, (estado) => estado.values);
  return JSON.stringify(valores) !== JSON.stringify(iniciais);
}
