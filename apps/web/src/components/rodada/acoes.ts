import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { rodadasControllerAjustarProposta } from '../../gen/clients/rodadasControllerAjustarProposta';
import { rodadasControllerAprovar } from '../../gen/clients/rodadasControllerAprovar';
import { rodadasControllerCancelar } from '../../gen/clients/rodadasControllerCancelar';
import { rodadasControllerCriar } from '../../gen/clients/rodadasControllerCriar';
import { rodadasControllerEncerrar } from '../../gen/clients/rodadasControllerEncerrar';
import { rodadasControllerPausar } from '../../gen/clients/rodadasControllerPausar';
import { rodadasControllerReler } from '../../gen/clients/rodadasControllerReler';
import { rodadasControllerRetomar } from '../../gen/clients/rodadasControllerRetomar';
import type { AjustePropostaDto } from '../../gen/types/AjustePropostaDto';
import type { RecortesRodadaDto } from '../../gen/types/RecortesRodadaDto';
import { mensagemDaApi } from '../alerta/mensagem-da-api';

/** Depois de qualquer ação na rodada, refaz as consultas dela (viva, situação, resumo, listas). */
export function invalidarRodadas(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (consulta) => {
      const chave = consulta.queryKey[0] as { url?: unknown } | undefined;
      return typeof chave?.url === 'string' && chave.url.startsWith('/distribuicao/rodadas');
    },
  });
}

const FALHA = 'Não foi possível falar com o servidor agora. Confira sua conexão e tente de novo.';

export type AcoesRodada = ReturnType<typeof useAcoesRodada>;

/**
 * As ações da rodada (pedir, aprovar, ajustar, pausar, retomar, encerrar, cancelar, reler), cada
 * uma com o "trabalhando" e o erro da API para mostrar junto do que falhou.
 */
export function useAcoesRodada() {
  const queryClient = useQueryClient();
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const rodar = async <T>(nome: string, acao: () => Promise<T>): Promise<T | undefined> => {
    setOcupada(nome);
    setErro(null);
    try {
      return await acao();
    } catch (falha) {
      setErro(mensagemDaApi(falha, FALHA));
      return undefined;
    } finally {
      setOcupada(null);
      await invalidarRodadas(queryClient);
    }
  };
  const naRodada =
    (nome: string, chamar: (p: { path: { id: string } }) => { unwrap: () => Promise<unknown> }) =>
    (id: string) =>
      rodar(nome, async () => {
        await chamar({ path: { id } }).unwrap();
        return true;
      });

  return {
    ocupada,
    erro,
    limparErro: () => setErro(null),
    criar: (recortes: RecortesRodadaDto) =>
      rodar('criar', async () => (await rodadasControllerCriar({ body: recortes }).unwrap()).id),
    /** Lança o erro (o painel de quem pede mostra junto do formulário). */
    criarOuFalhar: async (recortes: RecortesRodadaDto) => {
      const { id } = await rodadasControllerCriar({ body: recortes }).unwrap();
      await invalidarRodadas(queryClient);
      return id;
    },
    aprovar: naRodada('aprovar', rodadasControllerAprovar),
    pausar: naRodada('pausar', rodadasControllerPausar),
    retomar: naRodada('retomar', rodadasControllerRetomar),
    encerrar: naRodada('encerrar', rodadasControllerEncerrar),
    cancelar: naRodada('cancelar', rodadasControllerCancelar),
    reler: naRodada('reler', rodadasControllerReler),
    ajustar: (id: string, ajuste: Partial<AjustePropostaDto>) =>
      rodar('ajustar', async () => {
        await rodadasControllerAjustarProposta({
          path: { id },
          body: { remover: [], mover: [], ...ajuste },
        }).unwrap();
        return true;
      }),
    /**
     * Ajusta e lança o erro com a mensagem da API, para quem pediu mostrar junto da ação (o
     * popover do "Mover"), em vez de no cartão da rodada.
     */
    ajustarOuFalhar: async (id: string, ajuste: Partial<AjustePropostaDto>) => {
      setOcupada('ajustar');
      setErro(null);
      try {
        await rodadasControllerAjustarProposta({
          path: { id },
          body: { remover: [], mover: [], ...ajuste },
        }).unwrap();
      } catch (falha) {
        throw new Error(mensagemDaApi(falha, FALHA));
      } finally {
        setOcupada(null);
        await invalidarRodadas(queryClient);
      }
    },
  };
}
