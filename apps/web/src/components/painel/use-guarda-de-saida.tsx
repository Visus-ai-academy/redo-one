import { useBlocker } from '@tanstack/react-router';
import { type ReactNode, useRef } from 'react';

import { ConfirmarAcao } from '../confirmacao/ConfirmarAcao';

/**
 * Formulário de página (não de painel nem de diálogo, que já perguntam ao fechar) com alterações
 * não salvas: sair da página, trocar o item pela URL ou recarregar pergunta antes ("Descartar as
 * alterações?"). `confirmacao` vai na tela; `liberar()` deixa passar a próxima navegação (ex.: a
 * que a tela faz logo depois de salvar, antes de os dados novos chegarem).
 */
export function useGuardaDeSaida(alterado: boolean): {
  confirmacao: ReactNode;
  liberar: () => void;
} {
  const atual = useRef(alterado);
  atual.current = alterado;
  const liberado = useRef(false);
  const seguiu = useRef(false);

  const bloqueio = useBlocker({
    shouldBlockFn: () => {
      if (liberado.current) {
        liberado.current = false;
        return false;
      }
      return atual.current;
    },
    enableBeforeUnload: () => atual.current,
    withResolver: true,
  });

  const confirmacao = (
    <ConfirmarAcao
      acao="Descartar"
      rotuloCancelar="Continuar editando"
      titulo="Descartar as alterações?"
      consequencia="O que você mudou aqui ainda não foi salvo e se perde."
      aberto={bloqueio.status === 'blocked'}
      // A confirmação fecha antes de chamar `onConfirmar`: desistir só depois de dar a vez a ela.
      onAbertoChange={(abrir) => {
        if (abrir || bloqueio.status !== 'blocked') return;
        const desistir = bloqueio.reset;
        queueMicrotask(() => {
          if (!seguiu.current) desistir();
          seguiu.current = false;
        });
      }}
      onConfirmar={() => {
        if (bloqueio.status !== 'blocked') return;
        seguiu.current = true;
        bloqueio.proceed();
      }}
    />
  );

  return {
    confirmacao,
    liberar: () => {
      liberado.current = true;
    },
  };
}
