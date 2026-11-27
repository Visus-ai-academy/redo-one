import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AdicionalDto } from '../../gen/types/AdicionalDto';
import { ListaAdicionaisRepasse } from './ListaAdicionaisRepasse';

const adicional = (extra: Partial<AdicionalDto>): AdicionalDto => ({
  id: 'a1',
  medicoId: 'm1',
  medico: 'Ana Souza',
  tipo: 'plantao',
  competencia: '2026-11',
  data: '2026-11-05',
  valorCentavos: 180000,
  descricao: 'Plantão: 3 plantões × R$ 600,00',
  quantidade: 3,
  valorUnitarioCentavos: 60000,
  referenciaDesde: null,
  referenciaAte: null,
  recalculoId: null,
  lancadoEm: '2026-11-10T10:00:00Z',
  lancadoPor: 'Bruno',
  canceladoEm: null,
  canceladoPor: null,
  motivoCancelamento: null,
  ...extra,
});

function montar(props: Partial<Parameters<typeof ListaAdicionaisRepasse>[0]> = {}) {
  const handlers = {
    onFiltrar: vi.fn(),
    onIrPara: vi.fn(),
    onCancelar: vi.fn(async () => {}),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ListaAdicionaisRepasse
        pagina={{
          itens: [
            adicional({}),
            adicional({
              id: 'a2',
              medico: 'Caio Lima',
              tipo: 'peer_review',
              valorCentavos: 21000,
              descricao: 'Peer Review: 10 avaliações × R$ 21,00',
              canceladoEm: '2026-11-12T10:00:00Z',
              canceladoPor: 'Bruno',
              motivoCancelamento: 'lançado em dobro',
            }),
          ],
          total: 2,
          pagina: 1,
          porPagina: 25,
        }}
        medico={null}
        tipo={undefined}
        buscarMedicos={async () => []}
        podeCancelar
        recarregando={false}
        {...handlers}
        {...props}
      />
    </QueryClientProvider>,
  );
  return handlers;
}

describe('ListaAdicionaisRepasse', () => {
  it('o cancelado aparece riscado, com o motivo; o lançado, com a situação', () => {
    montar();
    const caio = screen.getByText('Caio Lima').closest('tr') as HTMLElement;
    expect(within(caio).getByText('Caio Lima')).toHaveClass('line-through');
    expect(within(caio).getByText('210,00')).toHaveClass('line-through');
    expect(within(caio).getByText('Cancelado: lançado em dobro')).toBeInTheDocument();
    const ana = screen.getByText('Ana Souza').closest('tr') as HTMLElement;
    expect(within(ana).getByText('Lançado')).toBeInTheDocument();
    expect(within(ana).getByText('Plantão')).toBeInTheDocument();
  });

  it('filtro de tipo com "Todos os tipos" explícito', async () => {
    const { onFiltrar } = montar();
    await userEvent.click(screen.getByRole('combobox', { name: 'Filtrar por tipo' }));
    expect(await screen.findByRole('option', { name: 'Todos os tipos' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: 'Peer Review' }));
    expect(onFiltrar).toHaveBeenCalledWith({ tipo: 'peer_review' });
  });

  it('cancelar pede o motivo; o cancelado não tem a ação', async () => {
    const { onCancelar } = montar();
    expect(screen.queryByRole('button', { name: 'Ações do lançamento de Caio Lima' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Ações do lançamento de Ana Souza' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Cancelar lançamento…' }));
    const dialogo = await screen.findByRole('dialog', {
      name: 'Cancelar o lançamento de Ana Souza?',
    });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar lançamento' }));
    expect(await within(dialogo).findByText('Informe o motivo.')).toBeInTheDocument();
    await userEvent.type(within(dialogo).getByRole('textbox', { name: /Motivo/ }), 'em dobro');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar lançamento' }));
    expect(onCancelar).toHaveBeenCalledWith('a1', 'em dobro');
  });

  it('na competência fechada não se cancela', () => {
    montar({ podeCancelar: false });
    expect(screen.queryByRole('button', { name: /Ações do lançamento/ })).toBeNull();
  });

  it('a ação de lançar não fica na faixa dos filtros (vai na linha das abas da tela)', () => {
    montar();
    expect(screen.queryByRole('button', { name: 'Lançar adicional' })).toBeNull();
  });
});
