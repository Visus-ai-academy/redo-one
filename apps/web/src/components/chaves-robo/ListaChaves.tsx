import { Plus, Robot } from '@phosphor-icons/react';
import { type ReactNode, useMemo, useState } from 'react';

import type { ChaveRoboDto } from '../../gen/types/ChaveRoboDto';
import { ipParcial } from '../../lib/aparelho';
import { cn } from '../../lib/cn';
import { dataHoraCurta } from '../../lib/datas';
import { buttonClassName } from '../button/button-class';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { situacaoDaChave } from './situacao-chave';

const coluna = createDataTableColumnHelper<ChaveRoboDto>();

export type ListaChavesProps = {
  chaves: ChaveRoboDto[];
  agora?: Date;
  onAbrir: (id: string) => void;
  selecionadoId?: string;
  /** Sem `chaves-robo.gerenciar`, não vem e o botão some. */
  onNova?: () => void;
  painel?: ReactNode;
};

/** Chaves com que os robôs chamam a API, com o painel de detalhe ou de criação ao lado. */
export function ListaChaves({
  chaves,
  agora,
  onAbrir,
  selecionadoId,
  onNova,
  painel,
}: ListaChavesProps) {
  // Um instante por montagem: as colunas ("Hoje", "Vence em") não mudam a cada render.
  const [referencia] = useState(() => agora ?? new Date());
  const paginacao = usePaginaLocal(chaves, 10);

  const colunas = useMemo(
    () => [
      coluna.accessor('nome', {
        header: 'Robô',
        cell: (info) => {
          const chave = info.row.original;
          return (
            <button
              type="button"
              onClick={() => onAbrir(chave.id)}
              className="focus-visible:outline-ring -mx-1 flex items-center gap-3 rounded-md px-1 text-left focus-visible:outline-2"
            >
              <Robot size={20} aria-hidden className="text-muted-foreground flex-none" />
              <span className="flex min-w-0 flex-col leading-snug">
                <span className="font-medium">{chave.nome}</span>
                {chave.descricao && (
                  <span className="text-muted-foreground text-[13px]">{chave.descricao}</span>
                )}
                <code className="text-subtle-foreground font-mono text-xs">{chave.prefixo}…</code>
              </span>
            </button>
          );
        },
      }),
      coluna.accessor('permissoes', {
        header: 'Permissões',
        cell: (info) => (
          <span className="flex flex-col gap-0.5">
            {info.getValue().map((permissao) => (
              <code key={permissao} className="text-muted-foreground font-mono text-xs">
                {permissao}
              </code>
            ))}
          </span>
        ),
      }),
      coluna.accessor('ultimoUsoEm', {
        id: 'ultimoUsoEm',
        header: 'Último uso',
        cell: (info) => {
          const { ultimoUsoEm, ultimoIp } = info.row.original;
          if (!ultimoUsoEm) return <span className="text-muted-foreground">Nunca usada</span>;
          const ip = ipParcial(ultimoIp);
          return (
            <span className="flex flex-col leading-snug whitespace-nowrap">
              <span>{dataHoraCurta(ultimoUsoEm, referencia)}</span>
              {ip && <span className="text-muted-foreground text-[13px]">IP {ip}</span>}
            </span>
          );
        },
      }),
      coluna.display({
        id: 'situacao',
        header: 'Situação',
        cell: (info) => {
          const situacao = situacaoDaChave(info.row.original, referencia);
          return (
            <Etiqueta tom={situacao.tom} icone={situacao.icone}>
              {situacao.rotulo}
            </Etiqueta>
          );
        },
      }),
    ],
    [referencia, onAbrir],
  );

  // Com o painel aberto a lista estreita; as permissões já aparecem no painel.
  const colunasVisiveis = useMemo(
    () => (painel ? colunas.filter((c) => c.id !== 'permissoes') : colunas),
    [colunas, painel],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[640px] flex-col gap-1">
          <h1 className="text-[22px] leading-snug font-semibold">Chaves dos robôs</h1>
          <p className="text-muted-foreground">
            Cada robô chama a API do One com a própria chave, limitada às permissões dele. A chave
            aparece uma vez só, ao ser criada.
          </p>
        </div>
        {onNova && (
          <button type="button" onClick={onNova} className={buttonClassName()}>
            <Plus size={16} aria-hidden />
            Nova chave
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <section
          aria-label="Chaves"
          className={cn(
            'bg-card min-w-0 flex-[999_1_480px] overflow-hidden rounded-lg border',
            // No celular o painel ocupa o lugar da lista; "Fechar" volta para ela.
            painel && 'hidden md:block',
          )}
        >
          {chaves.length === 0 ? (
            <div className="flex flex-col items-start gap-3 p-6">
              <div className="flex flex-col gap-1">
                <p className="font-medium">Nenhuma chave criada.</p>
                <p className="text-muted-foreground">
                  Crie uma chave para cada robô que chama a API do One.
                </p>
              </div>
              {onNova && (
                <button
                  type="button"
                  onClick={onNova}
                  className={buttonClassName({ variant: 'secondary' })}
                >
                  Nova chave
                </button>
              )}
            </div>
          ) : (
            <>
              <DataTable
                columns={colunasVisiveis}
                data={paginacao.itensDaPagina}
                getRowId={(chave) => chave.id}
                selectedRowId={selecionadoId}
              />
              {paginacao.precisaPaginar && (
                <Paginacao
                  pagina={paginacao.pagina}
                  porPagina={paginacao.porPagina}
                  total={paginacao.total}
                  onIrPara={paginacao.irPara}
                />
              )}
            </>
          )}
        </section>
        {painel}
      </div>
    </div>
  );
}
