import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { contasPagarTitulosControllerListarQueryOptions } from '../../gen/hooks/useContasPagarTitulosControllerListar';
import { formatarDia } from '../../lib/financeiro';
import { moeda } from '../../lib/formato';
import { diaDeHoje, etiquetaDaSituacao, numeroDoTitulo } from '../../lib/titulos';
import { EstadoDoErro } from '../estado/EstadoDoErro';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { Paginacao } from '../paginacao/Paginacao';
import { Skeleton } from '../skeleton/Skeleton';

const POR_PAGINA = 5;

/**
 * Aba Títulos do fornecedor: os títulos a pagar dele (só leitura), do vencimento mais antigo ao
 * mais novo, com o link para abrir em Contas a pagar. Pede `contas-pagar.ver`.
 */
export function TitulosDoFornecedor({
  id,
  nome,
  podeVer,
}: {
  id: string;
  nome: string;
  podeVer: boolean;
}) {
  const [pagina, setPagina] = useState(1);
  const consulta = useQuery({
    ...contasPagarTitulosControllerListarQueryOptions({
      query: {
        empresa: 'todas',
        situacao: 'todas',
        origem: 'todas',
        categoria: 'todas',
        favorecidoTipo: 'fornecedor',
        favorecidoId: id,
        pagina,
        porPagina: POR_PAGINA,
      },
    }),
    placeholderData: keepPreviousData,
    enabled: podeVer,
  });
  const hoje = diaDeHoje();

  if (!podeVer) {
    return (
      <p className="text-muted-foreground p-4">
        Os títulos ficam em Contas a pagar, que o seu papel não abre.
      </p>
    );
  }
  if (consulta.isError && !consulta.data) {
    return (
      <EstadoDoErro
        erro={consulta.error}
        oQue="os títulos"
        onTentarDeNovo={() => void consulta.refetch()}
        className="p-4"
      />
    );
  }
  const dados = consulta.data;
  if (!dados) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3 p-4">
        <span className="sr-only">Carregando os títulos…</span>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (dados.total === 0) {
    return (
      <div className="flex flex-col gap-1 p-4">
        <p className="font-medium">Nenhum título deste fornecedor.</p>
        <p className="text-muted-foreground">
          Os títulos lançados em Contas a pagar para este fornecedor aparecem aqui.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      <ul className="divide-y">
        {dados.itens.map((t) => {
          const e = etiquetaDaSituacao(t, hoje);
          return (
            <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="flex min-w-0 flex-col">
                <Link
                  to="/contas-pagar"
                  search={{ id: t.id, situacao: 'todas' }}
                  className="font-medium hover:underline"
                >
                  {`${numeroDoTitulo('pagar', t.numero)} · ${t.descricao}`}
                </Link>
                <span className="text-muted-foreground text-[13px] tabular-nums">
                  {`Vence ${formatarDia(t.vencimento)} · saldo ${moeda((t.valorCentavos - t.pagoCentavos) / 100)}`}
                </span>
              </span>
              <Etiqueta tom={e.tom}>{e.texto}</Etiqueta>
            </li>
          );
        })}
      </ul>
      <Paginacao pagina={pagina} porPagina={POR_PAGINA} total={dados.total} onIrPara={setPagina} />
      <div className="border-t p-4">
        <Link
          to="/contas-pagar"
          search={{
            situacao: 'todas',
            favorecidoTipo: 'fornecedor',
            favorecidoId: id,
            favorecidoNome: nome,
          }}
          className="text-primary font-medium hover:underline"
        >
          Ver em Contas a pagar
        </Link>
      </div>
    </div>
  );
}
