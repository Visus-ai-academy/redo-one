import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PaginaLaudosDemonstrativoDto } from '../../gen/types/PaginaLaudosDemonstrativoDto';
import { LaudosDoDemonstrativo } from './LaudosDoDemonstrativo';

const pagina = (pacienteVisivel: boolean): PaginaLaudosDemonstrativoDto => ({
  itens: [
    {
      laudoId: 'l1',
      peca: 0,
      dataLaudo: '2026-11-03T13:00:00Z',
      exame: 'TC CRANIO',
      cliente: 'CEDIM',
      paciente: pacienteVisivel ? 'MARIA SOUZA' : null,
      volume: 1,
      totalCentavos: 3207,
    },
  ],
  total: 31,
  pagina: 1,
  porPagina: 10,
  pacienteVisivel,
});

describe('LaudosDoDemonstrativo', () => {
  it('data, exame, cliente, paciente, volume e valor; paginado pela API', async () => {
    const onIrPara = vi.fn();
    render(
      <LaudosDoDemonstrativo pagina={pagina(true)} recarregando={false} onIrPara={onIrPara} />,
    );
    const tabela = screen.getByRole('table');
    expect(
      within(tabela)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Data', 'Exame', 'Cliente', 'Paciente', 'Volume', 'Valor']);
    expect(within(tabela).getByText('MARIA SOUZA')).toBeInTheDocument();
    expect(within(tabela).getByText('32,07')).toBeInTheDocument();
    expect(screen.getByText('1–10 de 31')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Próxima/ }));
    expect(onIrPara).toHaveBeenCalledWith(2);
  });

  it('sem a permissão do paciente, a coluna não aparece', () => {
    render(
      <LaudosDoDemonstrativo pagina={pagina(false)} recarregando={false} onIrPara={vi.fn()} />,
    );
    expect(screen.queryByRole('columnheader', { name: 'Paciente' })).not.toBeInTheDocument();
  });
});
