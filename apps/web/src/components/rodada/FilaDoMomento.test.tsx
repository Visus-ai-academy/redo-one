import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FilaDoMomento } from './FilaDoMomento';
import { FILA, medicoEmTurno } from './teste-dados';

describe('FilaDoMomento', () => {
  it('números do momento, a tabela por frente × prioridade e os médicos em turno paginados', async () => {
    render(<FilaDoMomento fila={FILA} intervalo="1 min" />);
    expect(screen.getByText('Exames esperando')).toBeInTheDocument();
    expect(screen.getByText('O primeiro às 10:52')).toBeInTheDocument();
    expect(screen.getByText('De 62 habilitados no robô')).toBeInTheDocument();

    const matriz = screen.getByRole('table', { name: 'Por frente e prioridade da operação' });
    const neuro = within(matriz).getByRole('row', { name: /NEURO/ });
    expect(neuro).toHaveTextContent('NEURO52530');

    expect(screen.getByText('1–10 de 12')).toBeInTheDocument();
    expect(screen.getByText('No teto')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar médico' }), '11');
    expect(screen.getByText('Médico 11')).toBeInTheDocument();
    expect(screen.queryByText('Médico 01')).not.toBeInTheDocument();
  });

  it('fila vazia diz que todo exame já tem médico', () => {
    render(<FilaDoMomento fila={{ ...FILA, total: 0, porFrente: [] }} intervalo="1 min" />);
    expect(screen.getByText('Nenhum exame esperando na fila')).toBeInTheDocument();
  });

  it('sem leitura agora: aviso com os números da última e "Tentar agora"', async () => {
    const tentar = vi.fn();
    render(<FilaDoMomento fila={FILA} intervalo="1 min" erro onTentarDeNovo={tentar} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível ler a fila agora');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar agora' }));
    expect(tentar).toHaveBeenCalled();
  });

  it('ninguém em turno: o estado vazio leva à escala', () => {
    render(<FilaDoMomento fila={{ ...FILA, medicosEmTurno: [] }} intervalo="1 min" />);
    expect(screen.getByText('Ninguém em turno agora')).toBeInTheDocument();
  });
  it('médicos em turno: filtros de turno, frente e subespecialidade antes da paginação, com as cores', async () => {
    const CABECA = { id: 'cab', nome: 'Cabeça e pescoço', cor: '#3E8E5E' };
    const fila = {
      ...FILA,
      medicosEmTurno: [
        ...Array.from({ length: 11 }, (_, i) =>
          medicoEmTurno(`m${i}`, `Médico ${String(i).padStart(2, '0')}`, 1, 60),
        ),
        medicoEmTurno('t1', 'Tarde Um', 1, 60, {
          turnoId: 't2',
          turno: 'Tarde',
          turnoCor: null,
          segmentosRecortados: true,
          segmentos: [CABECA],
        }),
        medicoEmTurno('t2', 'Tarde Dois', 1, 60, { turnoId: 't2', turno: 'Tarde' }),
      ],
    };
    render(<FilaDoMomento fila={fila} intervalo="1 min" />);
    expect(screen.getByText('1–10 de 13')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(screen.getByTitle('NEURO · Cabeça e pescoço')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: 'Turnos' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Tarde' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByText('1–2 de 2')).toBeInTheDocument();
    expect(screen.getByText('Tarde Um')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: 'Subespecialidades' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Cabeça e pescoço' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByText('1 de 1')).toBeInTheDocument();
    expect(screen.queryByText('Tarde Dois')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.getByText('1–10 de 13')).toBeInTheDocument();
  });
});
