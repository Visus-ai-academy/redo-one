import { Toast } from '@base-ui/react/toast';

export type AcaoDoAviso = { rotulo: string; onClick: () => void };

/** Aviso com ação ("Desfazer") fica mais tempo que o simples (5 s, no `Avisos`). */
export const TEMPO_COM_ACAO = 8000;

/** Dispara os avisos de um `Avisos` acima na árvore. */
export function useAvisos() {
  const gerente = Toast.useToastManager();
  return {
    /**
     * Com `acao`, o aviso ganha um botão (ex.: "Desfazer") que roda a ação e fecha o aviso; fica
     * 8 s e, como todo aviso, pausa com o mouse em cima ou o foco nele.
     * Ex.: `sucesso('Aviso arquivado.', { acao: { rotulo: 'Desfazer', onClick: reabrir } })`.
     */
    sucesso: (texto: string, opcoes: { acao?: AcaoDoAviso } = {}) => {
      const { acao } = opcoes;
      const id = gerente.add({
        title: texto,
        type: 'sucesso',
        ...(acao
          ? {
              timeout: TEMPO_COM_ACAO,
              actionProps: {
                children: acao.rotulo,
                onClick: () => {
                  acao.onClick();
                  gerente.close(id);
                },
              },
            }
          : {}),
      });
    },
  };
}
