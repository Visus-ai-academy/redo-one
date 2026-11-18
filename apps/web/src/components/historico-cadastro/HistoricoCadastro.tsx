import { Button } from '@base-ui/react/button';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { historicoCadastroControllerDoClienteQueryOptions } from '../../gen/hooks/useHistoricoCadastroControllerDoCliente';
import { historicoCadastroControllerDoExameQueryOptions } from '../../gen/hooks/useHistoricoCadastroControllerDoExame';
import { historicoCadastroControllerDoMedicoQueryOptions } from '../../gen/hooks/useHistoricoCadastroControllerDoMedico';
import type { PaginaHistoricoCadastroDto } from '../../gen/types/PaginaHistoricoCadastroDto';
import { cn } from '../../lib/cn';
import { dataHoraCurta } from '../../lib/datas';
import { buttonClassName } from '../button/button-class';
import { rotuloDoAtor } from '../escala-historico/historico';
import { Paginacao } from '../paginacao/Paginacao';
import { Skeleton } from '../skeleton/Skeleton';
import {
  alteracoesDoCadastro,
  descreverEventoCadastro,
  type LinhaAlteracao,
} from './historico-cadastro';

export type CadastroComHistorico = 'medico' | 'cliente' | 'exame';

/** Num painel lateral, 10 mudanças por página (a API pagina). */
const POR_PAGINA = 10;

/** As três rotas devolvem a mesma página; o tipo é o da do médico. */
type OpcoesHistorico = ReturnType<typeof historicoCadastroControllerDoMedicoQueryOptions>;

function opcoesDaConsulta(
  cadastro: CadastroComHistorico,
  id: string,
  pagina: number,
): OpcoesHistorico {
  const args = { path: { id }, query: { pagina, porPagina: POR_PAGINA } };
  if (cadastro === 'cliente') {
    return historicoCadastroControllerDoClienteQueryOptions(args) as unknown as OpcoesHistorico;
  }
  if (cadastro === 'exame') {
    return historicoCadastroControllerDoExameQueryOptions(args) as unknown as OpcoesHistorico;
  }
  return historicoCadastroControllerDoMedicoQueryOptions(args);
}

/**
 * Aba "Histórico" dos painéis de médico, cliente e exame: uma linha por mudança, da mais recente
 * para a mais antiga, com quem fez e o que mudou. A API já tira o que quem consulta não pode ver.
 */
export function HistoricoCadastro({
  cadastro,
  id,
  agora,
}: {
  cadastro: CadastroComHistorico;
  id: string;
  agora?: Date;
}) {
  const [referencia] = useState(() => agora ?? new Date());
  const [pagina, setPagina] = useState(1);
  const consulta = useQuery({
    ...opcoesDaConsulta(cadastro, id, pagina),
    // Trocando de página, a anterior fica à vista (esmaecida) até a nova chegar.
    placeholderData: keepPreviousData,
  });
  const dados: PaginaHistoricoCadastroDto | undefined = consulta.data;

  if (consulta.isError && !dados) {
    return (
      <div className="flex flex-col items-start gap-3 p-4">
        <p className="text-muted-foreground">Não foi possível carregar o histórico agora.</p>
        <Button
          type="button"
          onClick={() => void consulta.refetch()}
          className={buttonClassName({ variant: 'secondary' })}
        >
          Tentar de novo
        </Button>
      </div>
    );
  }

  if (!dados) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3 p-4">
        <span className="sr-only">Carregando o histórico…</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (dados.total === 0) {
    return <p className="text-muted-foreground p-4">Sem mudanças registradas no redo-one.</p>;
  }

  return (
    <div className="flex flex-col">
      <ul
        className={cn(
          'flex flex-col divide-y transition-opacity motion-reduce:transition-none',
          consulta.isPlaceholderData && 'opacity-60',
        )}
      >
        {dados.itens.map((item) => {
          const frase = descreverEventoCadastro(
            item.entidade,
            item.acao,
            dados.nomes[item.entidadeId.toLowerCase()],
          );
          return (
            <li key={item.id} aria-label={frase} className="flex flex-col gap-1 px-4 py-3">
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{frase}</span>
                <span className="text-muted-foreground flex-none text-[13px] tabular-nums">
                  {dataHoraCurta(item.ocorridoEm, referencia)}
                </span>
              </span>
              <span className="text-muted-foreground text-[13px]">{rotuloDoAtor(item.ator)}</span>
              <Alteracoes linhas={alteracoesDoCadastro(item, dados.nomes)} />
            </li>
          );
        })}
      </ul>
      {dados.total > POR_PAGINA && (
        <Paginacao
          pagina={pagina}
          porPagina={POR_PAGINA}
          total={dados.total}
          onIrPara={setPagina}
        />
      )}
    </div>
  );
}

function Alteracoes({ linhas }: { linhas: LinhaAlteracao[] }) {
  if (linhas.length === 0) return null;
  return (
    <ul className="flex flex-col gap-0.5 text-[13px]">
      {linhas.map((linha, i) => (
        // Arranjos podem repetir o rótulo ("Arranjo incluído"): a posição desempata.
        // biome-ignore lint/suspicious/noArrayIndexKey: lista fixa por evento, não reordena
        <li key={`${linha.rotulo}-${i}`} className="break-words">
          <span className="text-muted-foreground">{linha.rotulo}: </span>
          {linha.antes !== null && (
            <span className="text-muted-foreground line-through">{linha.antes}</span>
          )}
          {linha.antes !== null && linha.depois !== null && (
            <span className="text-subtle-foreground"> → </span>
          )}
          {linha.depois !== null && <span className="font-medium">{linha.depois}</span>}
        </li>
      ))}
    </ul>
  );
}
