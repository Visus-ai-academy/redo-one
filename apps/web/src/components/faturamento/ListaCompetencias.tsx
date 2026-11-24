import { Menu } from '@base-ui/react/menu';
import { DotsThree, Lock, LockOpen } from '@phosphor-icons/react';
import { useMemo, useRef, useState } from 'react';

import type { CompetenciaDto } from '../../gen/types/CompetenciaDto';
import type { PaginaCompetenciasDto } from '../../gen/types/PaginaCompetenciasDto';
import { dataHoraCurta } from '../../lib/datas';
import { numero } from '../../lib/formato';
import type { pode } from '../../lib/permissoes';
import { AjudaContextual } from '../ajuda/AjudaContextual';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { buttonClassName } from '../button/button-class';
import { ListaCadastro } from '../cadastro/ListaCadastro';
import { ConfirmarAcao } from '../confirmacao/ConfirmarAcao';
import { createDataTableColumnHelper } from '../data-table/columns';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { useAvisos } from '../toast/use-avisos';
import {
  type AcaoCompetencia,
  acoesDaCompetencia,
  mesAno,
  type TipoAcaoCompetencia,
} from './competencias';

type Acesso = Parameters<typeof pode>[0];

export type ListaCompetenciasProps = {
  pagina: PaginaCompetenciasDto;
  acesso: Acesso;
  /** Referência de "Hoje"/"Ontem" nas datas (testes). */
  agora?: Date;
  /** Buscando a página: as linhas de antes ficam à vista, esmaecidas. */
  recarregando?: boolean;
  erro?: { erro: unknown; oQue: string; onTentarDeNovo: () => void };
  /** Chama a API; rejeita com o erro dela (ex.: 409, "o mês ainda não acabou"). */
  onExecutar: (tipo: TipoAcaoCompetencia, competencia: string) => Promise<void>;
  onIrPara: (pagina: number) => void;
};

const coluna = createDataTableColumnHelper<CompetenciaDto>();
const aDireita = (texto: string) => () => <span className="block text-right">{texto}</span>;
const nada = () => undefined;

/** Data e autor de um marco (fechamento, reabertura, trava) em duas linhas; sem marco, "—". */
function Marco({ em, por, agora }: { em: string | null; por: string | null; agora?: Date }) {
  if (!em) return <span className="text-subtle-foreground">—</span>;
  return (
    <span className="flex min-w-0 flex-col leading-snug">
      <span className="whitespace-nowrap tabular-nums">{dataHoraCurta(em, agora)}</span>
      {por && (
        <span title={por} className="text-muted-foreground max-w-56 truncate text-[13px]">
          {por}
        </span>
      )}
    </span>
  );
}

/**
 * Faturamento › Competências: a lista paginada (mais nova em cima) com status, quem fechou,
 * reabriu e travou a importação, e os totais. As ações da linha ficam no menu "⋯", cada uma
 * com a confirmação que diz a consequência.
 */
export function ListaCompetencias({
  pagina,
  acesso,
  agora,
  recarregando = false,
  erro,
  onExecutar,
  onIrPara,
}: ListaCompetenciasProps) {
  const { sucesso } = useAvisos();
  const [falha, setFalha] = useState<string | null>(null);
  /** A ação que está rodando e em qual linha. */
  const [emCurso, setEmCurso] = useState<{ competencia: string; andamento: string } | null>(null);

  const executar = async (competencia: string, acao: AcaoCompetencia) => {
    setFalha(null);
    setEmCurso({ competencia, andamento: acao.andamento });
    try {
      await onExecutar(acao.tipo, competencia);
      sucesso(acao.sucesso);
    } catch (e) {
      setFalha(`${acao.falha} ${mensagemDaApi(e, 'Confira a conexão e tente de novo.')}`);
    } finally {
      setEmCurso(null);
    }
  };
  // As colunas ficam memorizadas; a célula chama sempre a versão atual (props e avisos novos).
  const executarAtual = useRef(executar);
  executarAtual.current = executar;

  const colunas = useMemo(
    () => [
      coluna.accessor('competencia', {
        header: () => (
          <span className="inline-flex items-center gap-1">
            Competência
            <AjudaContextual assunto="a competência">
              Mês de faturamento. O laudo entra nele pela data do laudo (assinatura), conforme o
              corte configurado.
            </AjudaContextual>
          </span>
        ),
        cell: (info) => <span className="font-medium tabular-nums">{mesAno(info.getValue())}</span>,
      }),
      coluna.accessor('status', {
        header: 'Status',
        cell: (info) =>
          info.getValue() === 'fechada' ? (
            <Etiqueta tom="inativo" icone={Lock}>
              Fechada
            </Etiqueta>
          ) : (
            <Etiqueta tom="info" icone={LockOpen}>
              Aberta
            </Etiqueta>
          ),
      }),
      coluna.display({
        id: 'fechada',
        header: 'Fechada em / por',
        cell: ({ row }) => (
          <Marco em={row.original.fechadaEm} por={row.original.fechadaPor} agora={agora} />
        ),
      }),
      coluna.display({
        id: 'reaberta',
        header: 'Reaberta em / por',
        cell: ({ row }) => (
          <Marco em={row.original.reabertaEm} por={row.original.reabertaPor} agora={agora} />
        ),
      }),
      coluna.display({
        id: 'travada',
        header: () => (
          <span className="inline-flex items-center gap-1">
            Importação travada em / por
            <AjudaContextual assunto="a trava da importação">
              Com a importação travada, os laudos da competência deixam de mudar mesmo com ela
              aberta. A competência fechada já fica fora da importação, travada ou não.
            </AjudaContextual>
          </span>
        ),
        cell: ({ row }) => (
          <Marco
            em={row.original.importacaoTravadaEm}
            por={row.original.importacaoTravadaPor}
            agora={agora}
          />
        ),
      }),
      coluna.accessor('laudos', {
        header: aDireita('Laudos'),
        cell: (info) => (
          <span className="block text-right tabular-nums">{numero(info.getValue())}</span>
        ),
      }),
      coluna.accessor('volume', {
        header: aDireita('Volume'),
        cell: (info) => (
          <span className="block text-right tabular-nums">{numero(info.getValue(), 2)}</span>
        ),
      }),
      coluna.display({
        id: 'acoes',
        header: () => <span className="sr-only">Ações</span>,
        cell: ({ row }) => (
          <AcoesDaLinha
            competencia={row.original.competencia}
            acoes={acoesDaCompetencia(row.original, acesso, agora ?? new Date())}
            ocupada={emCurso !== null}
            andamento={
              emCurso?.competencia === row.original.competencia ? emCurso.andamento : undefined
            }
            onConfirmar={(competencia, acao) => executarAtual.current(competencia, acao)}
          />
        ),
      }),
    ],
    [acesso, agora, emCurso],
  );

  return (
    <ListaCadastro
      titulo="Competências"
      totalNoTitulo={false}
      acoes={falha ? <Alerta tom="erro">{falha}</Alerta> : undefined}
      colunas={colunas}
      itens={pagina.itens}
      getRowId={(c) => c.competencia}
      recarregando={recarregando}
      erro={erro}
      pagina={pagina.pagina}
      porPagina={pagina.porPagina}
      total={pagina.total}
      vazio={{
        titulo: 'Nenhuma competência ainda.',
        texto: 'A competência aparece aqui quando a importação traz o primeiro laudo do mês.',
      }}
      onFiltrar={nada}
      onLimparFiltros={nada}
      onIrPara={(numero) => {
        // O erro era de uma linha desta página; na outra, ele só atrapalha.
        setFalha(null);
        onIrPara(numero);
      }}
    />
  );
}

/** Menu "⋯" da linha; a ação escolhida abre a confirmação. */
function AcoesDaLinha({
  competencia,
  acoes,
  ocupada,
  andamento,
  onConfirmar,
}: {
  competencia: string;
  acoes: AcaoCompetencia[];
  ocupada: boolean;
  /** Texto da ação que roda nesta linha ("Fechando…"). */
  andamento?: string;
  onConfirmar: (competencia: string, acao: AcaoCompetencia) => Promise<void>;
}) {
  const [escolhida, setEscolhida] = useState<AcaoCompetencia | null>(null);
  if (acoes.length === 0) return null;
  return (
    <span className="flex items-center justify-end gap-2">
      {andamento && (
        <span role="status" className="text-muted-foreground text-[13px] whitespace-nowrap">
          {andamento}
        </span>
      )}
      <Menu.Root>
        <Menu.Trigger
          disabled={ocupada}
          aria-label={`Ações de ${mesAno(competencia)}`}
          className={buttonClassName({ variant: 'ghost', className: 'size-8 px-0' })}
        >
          <DotsThree size={18} aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner align="end" sideOffset={4} className="z-50 outline-none">
            <Menu.Popup className="bg-popover text-popover-foreground min-w-[200px] origin-(--transform-origin) rounded-lg border py-1 text-sm shadow-lg transition-[opacity,scale] duration-150 ease-out outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
              {acoes.map((acao) => (
                <Menu.Item
                  key={acao.tipo}
                  disabled={Boolean(acao.desabilitada)}
                  onClick={() => setEscolhida(acao)}
                  className="data-[highlighted]:bg-muted flex min-h-9 max-w-80 items-start gap-2 px-3 py-2 outline-none data-[disabled]:cursor-not-allowed"
                >
                  {acao.tipo === 'fechar' || acao.tipo === 'travar' ? (
                    <Lock size={16} aria-hidden className="mt-0.5 flex-none" />
                  ) : (
                    <LockOpen size={16} aria-hidden className="mt-0.5 flex-none" />
                  )}
                  <span className="flex flex-col gap-0.5">
                    <span className={acao.desabilitada ? 'text-muted-foreground' : undefined}>
                      {`${acao.rotulo}…`}
                    </span>
                    {acao.desabilitada && (
                      <span className="text-muted-foreground text-xs leading-snug">
                        {acao.desabilitada}
                      </span>
                    )}
                  </span>
                </Menu.Item>
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {escolhida && (
        <ConfirmarAcao
          aberto
          onAbertoChange={(aberto) => !aberto && setEscolhida(null)}
          acao={escolhida.rotulo}
          titulo={escolhida.titulo}
          consequencia={escolhida.consequencia}
          onConfirmar={() => onConfirmar(competencia, escolhida)}
        />
      )}
    </span>
  );
}
