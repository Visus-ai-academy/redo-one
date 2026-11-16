import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AusenciaItemDto } from '../../gen/types/AusenciaItemDto';
import { DetalheAusencia, type DetalheAusenciaProps } from './DetalheAusencia';

const PEDIDO: AusenciaItemDto = {
  id: 'a-1',
  medico: { id: 'm-ana', nome: 'Ana Reis' },
  tipo: { id: 't-1', nome: 'Congresso', cor: '#1F7A4D' },
  dataInicio: '2026-12-01',
  dataFim: '2026-12-03',
  diasSemana: [1, 3],
  frentes: [{ id: 'f-1', nome: 'NEURO' }],
  turnos: [{ id: 'tu-1', nome: 'Tarde' }],
  situacao: 'pendente',
  origem: 'medico',
  observacoes: 'Congresso de radiologia',
  motivoRecusa: null,
  revisadaEm: null,
  criadoEm: '2026-11-10T12:00:00.000Z',
  solicitadaPor: { id: 'u-ana', nome: 'Ana Reis' },
  revisadaPor: null,
};

function montar(props: Partial<DetalheAusenciaProps> = {}) {
  const acoes = {
    onAprovar: vi.fn(async () => undefined),
    onRecusar: vi.fn(async (_motivo: string) => undefined),
    onEditar: vi.fn(),
    onExcluir: vi.fn(async () => undefined),
  };
  render(<DetalheAusencia ausencia={PEDIDO} podeEditar podeAprovar {...acoes} {...props} />);
  return acoes;
}

describe('DetalheAusencia', () => {
  it('mostra os dados, o recorte e a origem do pedido', () => {
    montar();

    expect(screen.getByText('Pendente')).toBeInTheDocument();
    expect(screen.getByText('Pedido pelo portal')).toBeInTheDocument();
    expect(screen.getByText('01/12/2026 – 03/12/2026')).toBeInTheDocument();
    expect(screen.getByText('seg, qua')).toBeInTheDocument();
    expect(screen.getByText('Tarde')).toBeInTheDocument();
    expect(screen.getByText('NEURO')).toBeInTheDocument();
    expect(screen.getByText('Congresso de radiologia')).toBeInTheDocument();
  });

  it('sem recorte, diz que vale em tudo', () => {
    montar({ ausencia: { ...PEDIDO, diasSemana: [], frentes: [], turnos: [] } });

    expect(screen.getByText('Todos os dias do período')).toBeInTheDocument();
    expect(screen.getByText('Dia inteiro')).toBeInTheDocument();
    expect(screen.getByText('Todas as escalas do médico')).toBeInTheDocument();
  });

  it('os 7 dias marcados aparecem como todos os dias do período', () => {
    montar({ ausencia: { ...PEDIDO, diasSemana: [0, 1, 2, 3, 4, 5, 6] } });
    expect(screen.getByText('Todos os dias do período')).toBeInTheDocument();
  });

  it('aprova o pedido pendente', async () => {
    const { onAprovar } = montar();

    await userEvent.click(screen.getByRole('button', { name: 'Aprovar' }));

    expect(onAprovar).toHaveBeenCalled();
  });

  it('recusa pedindo o motivo, que o médico verá', async () => {
    const { onRecusar } = montar();

    await userEvent.click(screen.getByRole('button', { name: 'Recusar' }));
    expect(screen.getByText('O médico vê este motivo no portal.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Recusar pedido' }));
    expect(await screen.findByText('Informe o motivo.')).toBeInTheDocument();
    expect(onRecusar).not.toHaveBeenCalled();

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Motivo da recusa' }),
      ' Escala cheia ',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Recusar pedido' }));

    expect(onRecusar).toHaveBeenCalledWith('Escala cheia');
  });

  it('sem permissão de aprovar, não mostra aprovar nem recusar', () => {
    montar({ podeAprovar: false });

    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recusar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
  });

  it('decidida, mostra quem decidiu e o motivo; não oferece aprovar', () => {
    montar({
      ausencia: {
        ...PEDIDO,
        situacao: 'recusada',
        motivoRecusa: 'Escala cheia',
        revisadaPor: { id: 'u-gi', nome: 'Gisele' },
        revisadaEm: '2026-11-11T12:00:00.000Z',
      },
    });

    expect(screen.getByText('Escala cheia')).toBeInTheDocument();
    expect(screen.getByText('Gisele')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument();
  });

  it('sem permissão de editar, só leitura', () => {
    montar({ podeEditar: false, podeAprovar: false });

    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir ausência' })).not.toBeInTheDocument();
  });

  it('exclui depois de confirmar a consequência', async () => {
    const { onExcluir } = montar();

    await userEvent.click(screen.getByRole('button', { name: 'Excluir ausência' }));
    expect(
      screen.getByText('A ausência de Ana Reis (01/12/2026 – 03/12/2026) sai da escala', {
        exact: false,
      }),
    ).toBeInTheDocument();
    const botoes = screen.getAllByRole('button', { name: 'Excluir ausência' });
    await userEvent.click(botoes.at(-1) as HTMLElement);

    expect(onExcluir).toHaveBeenCalled();
  });

  it('mostra o erro da API', async () => {
    montar({
      onAprovar: vi.fn(async () => {
        throw new Error('rede');
      }),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Aprovar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível aprovar agora');
  });
});
