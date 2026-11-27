import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PaginaDemonstrativosRepasseDto } from '../../gen/types/PaginaDemonstrativosRepasseDto';
import { TabelaMedicosRepasse } from './TabelaMedicosRepasse';

const linha = (medico: string, semPreco: number, liquido: number) => ({
  id: medico,
  medicoId: `m-${medico}`,
  medico,
  volume: 1102,
  examesCentavos: 3841010,
  adicionaisCentavos: -12000,
  brutoCentavos: liquido,
  retencoesCentavos: 0,
  liquidoCentavos: liquido,
  gruposSemPreco: semPreco,
});

const pagina: PaginaDemonstrativosRepasseDto = {
  itens: [linha('Ana Souza', 2, 3829010), linha('Caio Lima', 0, 50000)],
  total: 132,
  pagina: 1,
  porPagina: 25,
  totais: {
    medicos: 132,
    volume: 43834,
    examesCentavos: 114352110,
    adicionaisCentavos: 1586449,
    brutoCentavos: 115938559,
    retencoesCentavos: 0,
    liquidoCentavos: 115938559,
    gruposSemPreco: 2,
    laudosSemPreco: 3,
  },
};

function montar(props: Partial<Parameters<typeof TabelaMedicosRepasse>[0]> = {}) {
  const handlers = { onFiltrar: vi.fn(), onOrdenar: vi.fn(), onIrPara: vi.fn() };
  render(
    <TabelaMedicosRepasse
      pagina={pagina}
      busca={undefined}
      situacao="todas"
      ordenacao={{ coluna: 'medico', direcao: 'asc' }}
      recarregando={false}
      renderNome={(d) => <span>{d.medico}</span>}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('TabelaMedicosRepasse', () => {
  it('uma linha por médico, valores com centavos e os sem preço em destaque', () => {
    montar();
    const tabela = screen.getByRole('table');
    const ana = within(tabela).getByText('Ana Souza').closest('tr') as HTMLElement;
    expect(within(ana).getByText('38.410,10')).toBeInTheDocument();
    expect(within(ana).getByText('-120,00')).toBeInTheDocument();
    expect(within(ana).getByText('2 arranjos')).toBeInTheDocument();
    const caio = within(tabela).getByText('Caio Lima').closest('tr') as HTMLElement;
    expect(within(caio).queryByText(/arranjo/)).not.toBeInTheDocument();
  });

  it('o rodapé traz o total do recorte inteiro, não só da página', () => {
    montar();
    const rodape = screen.getByRole('table').querySelector('tfoot') as HTMLElement;
    expect(within(rodape).getByText('Total (132 médicos)')).toBeInTheDocument();
    expect(within(rodape).getAllByText('1.159.385,59')).toHaveLength(2);
    expect(within(rodape).getByText('43.834')).toBeInTheDocument();
  });

  it('ordena pelo cabeçalho e marca a coluna com aria-sort', async () => {
    const { onOrdenar } = montar({ ordenacao: { coluna: 'liquido', direcao: 'desc' } });
    expect(screen.getByRole('columnheader', { name: /Líquido/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Bruto' }));
    expect(onOrdenar).toHaveBeenCalledWith({ coluna: 'bruto', direcao: 'desc' });
  });

  it('filtra pela situação com "Todas" explícito', async () => {
    const { onFiltrar } = montar();
    await userEvent.click(screen.getByRole('combobox', { name: 'Filtrar por situação' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Com arranjo sem preço' }));
    expect(onFiltrar).toHaveBeenCalledWith({ situacao: 'sem_preco' });
  });

  it('filtro sem resultado diz isso e oferece limpar', async () => {
    const { onFiltrar } = montar({
      busca: 'zzz',
      pagina: { ...pagina, itens: [], total: 0 },
    });
    expect(screen.getByText('Nada encontrado para “zzz”.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(onFiltrar).toHaveBeenCalledWith({ busca: undefined, situacao: 'todas' });
  });
});
