import { Button } from '@base-ui/react/button';
import { Menu } from '@base-ui/react/menu';
import { DotsThree, Plus, XCircle } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';

import type { AdicionalDto } from '../../gen/types/AdicionalDto';
import type { PaginaAdicionaisDto } from '../../gen/types/PaginaAdicionaisDto';
import { cn } from '../../lib/cn';
import { numero } from '../../lib/formato';
import { ROTULO_TIPO_ADICIONAL, type TipoAdicional } from '../../lib/repasse';
import { BuscaSelecao, type OpcaoBusca } from '../busca/BuscaSelecao';
import { buttonClassName } from '../button/button-class';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { EstadoDoErro } from '../estado/EstadoDoErro';
import { Paginacao } from '../paginacao/Paginacao';
import { Select } from '../select/Select';
import { DialogoMotivo } from './DialogoMotivo';

type ListaAdicionaisRepasseProps = {
  pagina: PaginaAdicionaisDto;
  /** Médico do filtro; nulo = todos os médicos. */
  medico: OpcaoBusca | null;
  /** Sem tipo = todos os tipos. */
  tipo: TipoAdicional | undefined;
  buscarMedicos: (termo: string, sinal?: AbortSignal) => Promise<OpcaoBusca[]>;
  podeLancar: boolean;
  /** Só na competência aberta e com a permissão (na fechada, lança-se o valor contrário). */
  podeCancelar: boolean;
  recarregando: boolean;
  erro?: { erro: unknown; onTentarDeNovo: () => void };
  onFiltrar: (f: { medico?: OpcaoBusca | null; tipo?: TipoAdicional | undefined }) => void;
  onIrPara: (pagina: number) => void;
  onLancar: () => void;
  onCancelar: (id: string, motivo: string) => Promise<void>;
};

const coluna = createDataTableColumnHelper<AdicionalDto>();
const dia = (iso: string) => iso.split('-').reverse().join('/');
const riscado = (a: AdicionalDto) => (a.canceladoEm ? 'line-through' : undefined);

/** Os adicionais da competência (os cancelados também), com filtros, página e o lançamento. */
export function ListaAdicionaisRepasse({
  pagina,
  medico,
  tipo,
  buscarMedicos,
  podeLancar,
  podeCancelar,
  recarregando,
  erro,
  onFiltrar,
  onIrPara,
  onLancar,
  onCancelar,
}: ListaAdicionaisRepasseProps) {
  const [cancelando, setCancelando] = useState<AdicionalDto | null>(null);
  const colunas = useMemo(
    () => [
      coluna.accessor('medico', {
        header: 'Médico',
        cell: (i) => <span className={riscado(i.row.original)}>{i.getValue()}</span>,
      }),
      coluna.accessor('tipo', { header: 'Tipo', cell: (i) => ROTULO_TIPO_ADICIONAL[i.getValue()] }),
      coluna.accessor('data', { header: 'Data', cell: (i) => dia(i.getValue()) }),
      coluna.accessor('descricao', { header: 'Descrição' }),
      coluna.accessor('valorCentavos', {
        header: () => <span className="block text-right">Valor</span>,
        cell: (i) => (
          <span className={cn('block text-right', riscado(i.row.original))}>
            {numero(i.getValue() / 100, 2)}
          </span>
        ),
      }),
      coluna.display({
        id: 'situacao',
        header: 'Situação',
        cell: ({ row: { original: a } }) =>
          a.canceladoEm ? `Cancelado: ${a.motivoCancelamento ?? ''}` : 'Lançado',
      }),
      ...(podeCancelar
        ? [
            coluna.display({
              id: 'acoes',
              header: () => <span className="sr-only">Ações</span>,
              cell: ({ row: { original: a } }) =>
                !a.canceladoEm && (
                  <span className="flex justify-end">
                    <Menu.Root>
                      <Menu.Trigger
                        aria-label={`Ações do lançamento de ${a.medico}`}
                        className={buttonClassName({ variant: 'ghost', className: 'size-8 px-0' })}
                      >
                        <DotsThree size={18} aria-hidden />
                      </Menu.Trigger>
                      <Menu.Portal>
                        <Menu.Positioner align="end" sideOffset={4} className="z-50 outline-none">
                          <Menu.Popup className="bg-popover text-popover-foreground min-w-[200px] origin-(--transform-origin) rounded-lg border py-1 text-sm shadow-lg transition-[opacity,scale] duration-150 ease-out outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
                            <Menu.Item
                              onClick={() => setCancelando(a)}
                              className="data-[highlighted]:bg-muted flex min-h-9 items-center gap-2 px-3 py-2 outline-none"
                            >
                              <XCircle size={16} aria-hidden />
                              Cancelar lançamento…
                            </Menu.Item>
                          </Menu.Popup>
                        </Menu.Positioner>
                      </Menu.Portal>
                    </Menu.Root>
                  </span>
                ),
            }),
          ]
        : []),
    ],
    [podeCancelar],
  );
  const filtrando = medico !== null || tipo !== undefined;

  return (
    <section
      aria-label="Adicionais da competência"
      className="bg-card min-w-0 rounded-lg border md:flex md:max-h-[calc(100dvh-8rem)] md:flex-col"
    >
      <div className="flex flex-none flex-wrap gap-2 border-b p-3">
        <BuscaSelecao
          chave="medicos-repasse"
          buscar={buscarMedicos}
          valor={medico}
          onMudar={(m) => onFiltrar({ medico: m })}
          placeholder="Todos os médicos"
          className="flex-[1_1_220px] md:max-w-[320px]"
        />
        <Select
          aria-label="Filtrar por tipo"
          value={tipo ?? ''}
          onValueChange={(v) => onFiltrar({ tipo: (v || undefined) as TipoAdicional | undefined })}
          opcoes={[
            { valor: '', rotulo: 'Todos os tipos' },
            ...Object.entries(ROTULO_TIPO_ADICIONAL).map(([valor, rotulo]) => ({ valor, rotulo })),
          ]}
          className="flex-[1_1_180px] md:flex-[0_1_200px]"
        />
        {podeLancar && (
          <Button
            type="button"
            onClick={onLancar}
            className={buttonClassName({ className: 'ml-auto' })}
          >
            <Plus size={16} aria-hidden />
            Lançar adicional
          </Button>
        )}
      </div>

      {erro ? (
        <EstadoDoErro
          erro={erro.erro}
          oQue="os adicionais"
          onTentarDeNovo={erro.onTentarDeNovo}
          className="p-6"
        />
      ) : pagina.itens.length === 0 ? (
        <div className="flex flex-col items-start gap-3 p-6">
          <div className="flex flex-col gap-1">
            <p className="font-medium">
              {filtrando
                ? 'Nada encontrado com esses filtros.'
                : 'Nenhum adicional nesta competência.'}
            </p>
            <p className="text-muted-foreground">
              {filtrando
                ? 'Limpe os filtros para ver todos os lançamentos.'
                : 'Créditos e descontos avulsos, plantões e Peer Review entram aqui.'}
            </p>
          </div>
          {filtrando && (
            <Button
              type="button"
              onClick={() => onFiltrar({ medico: null, tipo: undefined })}
              className={buttonClassName({ variant: 'secondary' })}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      ) : (
        <DataTable
          columns={colunas}
          data={pagina.itens}
          getRowId={(a) => a.id}
          recarregando={recarregando}
          className="[&_tr:has(.line-through)]:text-subtle-foreground md:min-h-0 md:flex-1 md:overflow-y-auto"
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

      {cancelando && (
        <DialogoMotivo
          titulo={`Cancelar o lançamento de ${cancelando.medico}?`}
          descricao="Ele fica registrado como cancelado, com o motivo, e sai do repasse na próxima prévia."
          acao="Cancelar lançamento"
          pendente="Cancelando…"
          placeholder="Ex.: lançado em dobro"
          onFechar={() => setCancelando(null)}
          onConfirmar={async (motivo) => {
            await onCancelar(cancelando.id, motivo);
            setCancelando(null);
          }}
        />
      )}
    </section>
  );
}
