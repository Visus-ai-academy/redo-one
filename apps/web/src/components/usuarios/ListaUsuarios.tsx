import { Button } from '@base-ui/react/button';
import { Plus } from '@phosphor-icons/react';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import type { PaginaUsuariosDto } from '../../gen/types/PaginaUsuariosDto';
import type { PapelAtribuivelDto } from '../../gen/types/PapelAtribuivelDto';
import type { UsuarioResumoDto } from '../../gen/types/UsuarioResumoDto';
import { cn } from '../../lib/cn';
import { dataHoraCurta } from '../../lib/datas';
import { Avatar } from '../avatar/Avatar';
import { CampoBusca } from '../busca/CampoBusca';
import { useBuscaComEspera } from '../busca/use-busca-com-espera';
import { buttonClassName } from '../button/button-class';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { LinkDaLinha } from '../data-table/link-da-linha';
import { Paginacao } from '../paginacao/Paginacao';
import { Select } from '../select/Select';
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
  /** Buscando a página ou o filtro novo: as linhas antigas ficam à vista, esmaecidas. */
  recarregando?: boolean;
  /** Linha aberta no painel. */
  selecionadoId?: string;
  /** Painel de detalhe, ao lado da lista (no celular, no lugar dela). */
  painel?: ReactNode;
  /** Abre o convite; presente só para quem tem usuarios.criar. */
  onConvidar?: () => void;
};

const coluna = createDataTableColumnHelper<UsuarioResumoDto>();

export function ListaUsuarios({
  pagina,
  filtros,
  papeis,
  euId,
  agora,
  onFiltrar,
  onIrPara,
  recarregando = false,
  selecionadoId,
  painel,
  onConvidar,
}: ListaUsuariosProps) {
  const [referencia] = useState(() => agora ?? new Date());
  const [termo, setTermo] = useBuscaComEspera(
    filtros.busca,
    useCallback((texto: string | undefined) => onFiltrar({ busca: texto }), [onFiltrar]),
  );

  const colunas = useMemo(
    () => [
      coluna.accessor('nome', {
        header: 'Nome',
        cell: (info) => {
          const usuario = info.row.original;
          // O nome é o link do painel (`?id=`): Ctrl/⌘+clique abre em outra aba; clicar em
          // qualquer ponto da linha segue este link.
          return (
            <LinkDaLinha
              to="."
              search={(atual: Record<string, unknown>) => ({ ...atual, id: usuario.id }) as never}
              className="group flex items-center gap-3 font-normal hover:no-underline"
            >
              <Avatar nome={usuario.nome} tamanho="sm" />
              <span className="flex min-w-0 flex-col leading-snug">
                <span className="font-medium group-hover:underline">
                  {usuario.nome}
                  {usuario.id === euId && ' (você)'}
                </span>
                <span className="text-muted-foreground text-[13px]">{usuario.email}</span>
              </span>
            </LinkDaLinha>
          );
        },
      }),
      coluna.accessor((u) => u.papeis.map((papel) => papel.nome).join(', '), {
        id: 'papel',
        header: 'Papéis',
      }),
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
    [euId, referencia],
  );

  const temFiltro = Boolean(filtros.busca || filtros.papelId || filtros.situacao);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[22px] leading-snug font-semibold">
          Usuários{' '}
          <span className="text-subtle-foreground font-normal tabular-nums">{pagina.total}</span>
        </h1>
        {onConvidar && (
          <Button type="button" onClick={onConvidar} className={buttonClassName()}>
            <Plus size={16} aria-hidden />
            Convidar usuário
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <section
          aria-label="Lista de usuários"
          className={cn(
            'bg-card min-w-0 flex-[999_1_480px] rounded-lg border',
            // No computador a lista cabe na tela: a tabela rola por dentro e a paginação fica à
            // vista (8rem = respiro do main e o título acima).
            'md:flex md:max-h-[calc(100dvh-8rem)] md:flex-col',
          )}
        >
          <div className="flex flex-none flex-wrap gap-2 border-b p-3">
            <CampoBusca
              rotulo="Buscar usuários"
              placeholder="Nome, e-mail ou CPF"
              valor={termo}
              onMudar={setTermo}
              className="flex-[1_1_220px]"
            />
            <Select
              aria-label="Filtrar por papel"
              value={filtros.papelId ?? ''}
              onValueChange={(valor) => onFiltrar({ papelId: valor || undefined })}
              opcoes={[
                { valor: '', rotulo: 'Todos os papéis' },
                ...papeis.map((papel) => ({ valor: papel.id, rotulo: papel.nome })),
              ]}
              className="flex-[1_1_180px] md:flex-[0_1_200px]"
            />
            <Select
              aria-label="Filtrar por situação"
              value={filtros.situacao ?? ''}
              onValueChange={(valor) =>
                onFiltrar({ situacao: (valor || undefined) as Situacao | undefined })
              }
              opcoes={[
                { valor: '', rotulo: 'Todas as situações' },
                ...Object.entries(SITUACOES).map(([valor, { rotulo }]) => ({ valor, rotulo })),
              ]}
              className="flex-[1_1_180px] md:flex-[0_1_200px]"
            />
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
              <Button
                type="button"
                onClick={() =>
                  onFiltrar({ busca: undefined, papelId: undefined, situacao: undefined })
                }
                className={buttonClassName({ variant: 'secondary' })}
              >
                Limpar filtros
              </Button>
            </div>
          ) : (
            <DataTable
              columns={colunas}
              data={pagina.itens}
              getRowId={(usuario) => usuario.id}
              selectedRowId={selecionadoId}
              recarregando={recarregando}
              className="md:min-h-0 md:flex-1 md:overflow-y-auto"
            />
          )}

          <div className="flex-none">
            <Paginacao
              pagina={pagina.pagina}
              porPagina={pagina.porPagina}
              total={pagina.total}
              onIrPara={onIrPara}
            />
          </div>
        </section>
        {painel}
      </div>
    </div>
  );
}
