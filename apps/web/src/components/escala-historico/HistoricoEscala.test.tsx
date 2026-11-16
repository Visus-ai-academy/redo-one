import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ItemHistoricoDto } from '../../gen/types/ItemHistoricoDto';
import { renderComRotas } from '../../test/render';
import { HistoricoEscala, type HistoricoEscalaProps } from './HistoricoEscala';

const AGORA = new Date('2026-11-14T15:00:00.000Z'); // 12:00 em Brasília

const item = (dados: Partial<ItemHistoricoDto>): ItemHistoricoDto => ({
  id: 'e-1',
  ocorridoEm: '2026-11-14T12:30:00.000Z',
  ator: { tipo: 'usuario', nome: 'Ana Lima' },
  entidade: 'alocacao',
  entidadeId: 'a-1',
  acao: 'alterado',
  medico: { id: 'm-bruno', nome: 'Bruno Alves' },
  antes: { medicoId: 'm-bruno', turnoId: 't-1', frenteId: 'f-1', dataFim: null },
  depois: { medicoId: 'm-bruno', turnoId: 't-1', frenteId: 'f-1', dataFim: '2026-12-31' },
  ...dados,
});

function montar(props: Partial<HistoricoEscalaProps> = {}) {
  const handlers = {
    onFiltrar: vi.fn(),
    onLimparFiltros: vi.fn(),
    onIrPara: vi.fn(),
  };
  renderComRotas(
    <HistoricoEscala
      pagina={{ itens: [item({})], total: 1, pagina: 1, porPagina: 25, nomes: {} }}
      filtros={{}}
      medico={null}
      buscarMedicos={async () => [{ valor: 'm-bruno', rotulo: 'Bruno Alves' }]}
      agora={AGORA}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('HistoricoEscala', () => {
  it('mostra quando, quem, o quê, o médico e só o que mudou', async () => {
    montar();

    const linha = (await screen.findAllByRole('row'))[1];
    expect(linha).toHaveTextContent('Hoje, 09:30');
    expect(linha).toHaveTextContent('Ana Lima');
    expect(linha).toHaveTextContent('Alocação alterada');
    expect(linha).toHaveTextContent('Bruno Alves');
    expect(linha).toHaveTextContent('Data de fim: (vazio) → 31/12/2026');
    expect(linha).not.toHaveTextContent('medicoId');
  });

  it('mostra os nomes dos ids que a página traz', async () => {
    montar({
      pagina: {
        itens: [
          item({
            entidade: 'turno',
            medico: null,
            antes: { frenteIds: ['aaaaaaaa-1a2b-4c3d-8e9f-0a1b2c3d4e5f'] },
            depois: {
              frenteIds: [
                'aaaaaaaa-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
                'bbbbbbbb-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
              ],
            },
          }),
        ],
        total: 1,
        pagina: 1,
        porPagina: 25,
        nomes: {
          'aaaaaaaa-1a2b-4c3d-8e9f-0a1b2c3d4e5f': 'Neuro',
          'bbbbbbbb-1a2b-4c3d-8e9f-0a1b2c3d4e5f': 'Mama',
        },
      },
    });

    const linha = (await screen.findAllByRole('row'))[1];
    expect(linha).toHaveTextContent('Turno alterado');
    expect(linha).toHaveTextContent('Frentes: Neuro → Neuro, Mama');
  });

  it('diz que não há alterações quando a lista vem vazia, e oferece limpar os filtros', async () => {
    const { onLimparFiltros } = montar({
      pagina: { itens: [], total: 0, pagina: 1, porPagina: 25, nomes: {} },
      filtros: { entidade: 'turno' },
    });

    expect(await screen.findByText('Nada encontrado com esses filtros.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(onLimparFiltros).toHaveBeenCalled();
  });

  it('filtra pelo que mudou', async () => {
    const { onFiltrar } = montar();

    await userEvent.click(await screen.findByRole('combobox', { name: 'Filtrar pelo que mudou' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Ausência' }));

    expect(onFiltrar).toHaveBeenCalledWith({ entidade: 'ausencia' });
  });

  it('filtra pelo médico buscado pelo nome', async () => {
    const { onFiltrar } = montar();

    await userEvent.type(
      await screen.findByRole('combobox', { name: 'Filtrar por médico' }),
      'bru',
    );
    await userEvent.click(await screen.findByRole('option', { name: 'Bruno Alves' }));

    expect(onFiltrar).toHaveBeenCalledWith({ medicoId: 'm-bruno' });
  });

  it('sem a busca de médicos (sem permissão), não mostra o filtro de médico', async () => {
    montar({ buscarMedicos: undefined });

    await screen.findAllByRole('row');
    expect(screen.queryByRole('combobox', { name: 'Filtrar por médico' })).not.toBeInTheDocument();
  });

  it('filtra pelo período; um início depois do fim limpa o fim', async () => {
    const { onFiltrar } = montar({ filtros: { ate: '2026-11-10' } });

    fireEvent.change(await screen.findByLabelText('De'), { target: { value: '2026-11-12' } });

    expect(onFiltrar).toHaveBeenLastCalledWith({ de: '2026-11-12', ate: undefined });
  });

  it('pagina pela API', async () => {
    const { onIrPara } = montar({
      pagina: { itens: [item({})], total: 60, pagina: 1, porPagina: 25, nomes: {} },
    });

    expect(await screen.findByText('1–25 de 60')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(onIrPara).toHaveBeenCalledWith(2);
  });

  it('volta à escala', async () => {
    montar();

    expect(await screen.findByRole('link', { name: 'Voltar à escala' })).toHaveAttribute(
      'href',
      '/escala',
    );
    expect(within(screen.getByRole('heading', { level: 1 })).getByText('Histórico da escala'));
  });
});
