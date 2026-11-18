import { Toast } from '@base-ui/react/toast';

export type AcaoDoAviso = { rotulo: string; onClick: () => void };

/** Dispara os avisos de um `Avisos` acima na árvore. */
export function useAvisos() {
  const gerente = Toast.useToastManager();
  return {
    /** Com `acao`, o aviso ganha um botão (ex.: "Desfazer") que roda a ação e fecha o aviso. */
    sucesso: (texto: string, opcoes: { acao?: AcaoDoAviso } = {}) => {
      const { acao } = opcoes;
      const id = gerente.add({
        title: texto,
        type: 'sucesso',
        ...(acao
          ? {
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
