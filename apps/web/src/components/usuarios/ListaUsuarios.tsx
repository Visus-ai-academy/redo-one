import { MagnifyingGlass } from '@phosphor-icons/react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import type { PaginaUsuariosDto } from '../../gen/types/PaginaUsuariosDto';
import type { PapelAtribuivelDto } from '../../gen/types/PapelAtribuivelDto';
import type { UsuarioResumoDto } from '../../gen/types/UsuarioResumoDto';
import { cn } from '../../lib/cn';
import { dataHoraCurta } from '../../lib/datas';
import { iniciais } from '../app-shell/iniciais';
import { buttonClassName } from '../button/button-class';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { controlClassName } from '../form/control-class';
import { Paginacao } from '../paginacao/Paginacao';
import { EtiquetaSituacao } from './EtiquetaSituacao';
import { SITUACOES, type Situacao } from './situacoes';

export type FiltrosUsuarios = { busca?: string; papelId?: string; situacao?: Situacao };

export type ListaUsuariosProps = {
  pagina: PaginaUsuariosDto;
  filtros: FiltrosUsuarios;
  papeis: PapelAtribuivelDto[];
  euId: string;
  agora?: Date;
  onFiltrar: (filtros: Partial<FiltrosUsuarios>) => void;
  onIrPara: (pagina: number) => void;
  /** Abre o detalhe da pessoa (o nome vira botão). */
  onAbrir?: (id: string) => void;
  /** Linha aberta no painel. */
  selecionadoId?: string;
  /** Painel de detalhe, ao lado da lista (no celular, no lugar dela). */
  painel?: ReactNode;
};

const coluna = createDataTableColumnHelper<UsuarioResumoDto>();
const ESPERA_DA_BUSCA_MS = 300;

export function ListaUsuarios({
  pagina,
  filtros,
  papeis,
  euId,
  agora,
  onFiltrar,
  onIrPara,
  onAbrir,
  selecionadoId,
  painel,
}: ListaUsuariosProps) {
  const [referencia] = useState(() => agora ?? new Date());
  const [termo, setTermo] = useState(filtros.busca ?? '');

  // A busca vai para a URL (e para a API) só depois de uma pausa na digitação.
  useEffect(() => {
    if (termo.trim() === (filtros.busca ?? '')) return;
    const espera = setTimeout(
      () => onFiltrar({ busca: termo.trim() || undefined }),
      ESPERA_DA_BUSCA_MS,
    );
    return () => clearTimeout(espera);
  }, [termo, filtros.busca, onFiltrar]);

  // "Limpar filtros" e a navegação do navegador mudam a busca por fora.
  useEffect(() => setTermo(filtros.busca ?? ''), [filtros.busca]);

  const colunas = useMemo(
    () => [
      coluna.accessor('nome', {
        header: 'Nome',
        cell: (info) => {
          const usuario = info.row.original;
          const conteudo = (
            <span className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="bg-inactive-soft text-muted-foreground flex size-7 flex-none items-center justify-center rounded-full text-xs font-semibold"
              >
                {iniciais(usuario.nome)}
              </span>
              <span className="flex min-w-0 flex-col leading-snug">
                <span className="font-medium">
                  {usuario.nome}
                  {usuario.id === euId && ' (você)'}
                </span>
                <span className="text-muted-foreground text-[13px]">{usuario.email}</span>
              </span>
            </span>
          );
          if (!onAbrir) return conteudo;
          return (
            <button
              type="button"
              onClick={() => onAbrir(usuario.id)}
              className="focus-visible:outline-ring -mx-1 rounded-md px-1 text-left focus-visible:outline-2"
            >
              {conteudo}
            </button>
          );
        },
      }),
      coluna.accessor((u) => u.papel.nome, { id: 'papel', header: 'Papel' }),
      coluna.accessor('situacao', {
        header: 'Situação',
        cell: (info) => <EtiquetaSituacao situacao={info.getValue()} />,
      }),
      coluna.accessor('ultimoAcessoEm', {
        id: 'ultimoAcessoEm',
        header: 'Último acesso',
        cell: (info) => {
          const em = info.getValue();
          return (
            <span className="text-muted-foreground whitespace-nowrap">
              {em ? dataHoraCurta(em, referencia) : 'Nunca entrou'}
            </span>
          );
        },
      }),
    ],
    [euId, referencia, onAbrir],
  );

  // Com o painel aberto a lista estreita; o último acesso já aparece no painel.
  const colunasVisiveis = useMemo(
    () => (painel ? colunas.filter((c) => c.id !== 'ultimoAcessoEm') : colunas),
    [colunas, painel],
  );

  const temFiltro = Boolean(filtros.busca || filtros.papelId || filtros.situacao);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[22px] leading-snug font-semibold">
        Usuários{' '}
        <span className="text-subtle-foreground font-normal tabular-nums">{pagina.total}</span>
      </h1>

      <div className="flex flex-wrap items-start gap-5">
        <section
          aria-label="Lista de usuários"
          className={cn(
            'bg-card min-w-0 flex-[999_1_480px] rounded-lg border',
            // No celular o painel ocupa o lugar da lista; "Fechar" volta para ela.
            painel && 'hidden md:block',
          )}
        >
          <div className="flex flex-wrap gap-2 border-b p-3">
            <div className="relative flex-[1_1_220px]">
              <MagnifyingGlass
                size={16}
                aria-hidden
                className="text-subtle-foreground absolute top-2.5 left-2.5"
              />
              <label htmlFor="busca-usuarios" className="sr-only">
                Buscar usuários
              </label>
              <input
                id="busca-usuarios"
                type="search"
                value={termo}
                onChange={(evento) => setTermo(evento.target.value)}
                placeholder="Nome, e-mail ou CPF"
                className={controlClassName('app', 'pl-8')}
              />
            </div>
            <select
              aria-label="Filtrar por papel"
              value={filtros.papelId ?? ''}
              onChange={(evento) => onFiltrar({ papelId: evento.target.value || undefined })}
              className={controlClassName(
                'app',
                'w-auto flex-[1_1_180px] px-2 md:flex-[0_1_200px]',
              )}
            >
              <option value="">Todos os papéis</option>
              {papeis.map((papel) => (
                <option key={papel.id} value={papel.id}>
                  {papel.nome}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar por situação"
              value={filtros.situacao ?? ''}
              onChange={(evento) =>
                onFiltrar({ situacao: (evento.target.value || undefined) as Situacao | undefined })
              }
              className={controlClassName(
                'app',
                'w-auto flex-[1_1_180px] px-2 md:flex-[0_1_200px]',
              )}
            >
              <option value="">Todas as situações</option>
              {Object.entries(SITUACOES).map(([valor, { rotulo }]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>

          {pagina.itens.length === 0 && temFiltro ? (
            <div className="flex flex-col items-start gap-3 p-6">
              <div className="flex flex-col gap-1">
                <p className="font-medium">
                  {filtros.busca
                    ? `Nenhum usuário encontrado para “${filtros.busca}”.`
                    : 'Nenhum usuário com esses filtros.'}
                </p>
                <p className="text-muted-foreground">
                  Confira a grafia ou limpe os filtros. Se a pessoa ainda não tem acesso, convide-a.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onFiltrar({ busca: undefined, papelId: undefined, situacao: undefined })
                }
                className={buttonClassName({ variant: 'secondary' })}
              >
                Limpar filtros
              </button>
            </div>
          ) : (
            <DataTable
              columns={colunasVisiveis}
              data={pagina.itens}
              getRowId={(usuario) => usuario.id}
              selectedRowId={selecionadoId}
            />
          )}

          <Paginacao
            pagina={pagina.pagina}
            porPagina={pagina.porPagina}
            total={pagina.total}
            onIrPara={onIrPara}
          />
        </section>
        {painel}
      </div>
    </div>
  );
}
