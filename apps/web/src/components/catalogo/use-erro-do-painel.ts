import { useState } from 'react';

import { mensagemDaApi } from '../alerta/mensagem-da-api';

const FALHA_AO_SALVAR = 'Não foi possível salvar agora. Confira sua conexão e tente de novo.';

/** Erro da última tentativa de salvar ou excluir, com a mensagem da API quando ela explica. */
export function useErroDoPainel() {
  const [erro, setErro] = useState<string>();
  const tentar = async (acao: () => Promise<void>, padrao = FALHA_AO_SALVAR) => {
    setErro(undefined);
    try {
      await acao();
    } catch (falha) {
      setErro(mensagemDaApi(falha, padrao));
    }
  };
  return { erro, tentar };
}
