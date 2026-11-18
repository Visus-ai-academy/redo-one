import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PrioridadeOperacaoDto } from '../../gen/types/PrioridadeOperacaoDto';
import { escolherOpcao } from '../../test/select';
import { SecaoGradeRecebimento } from './SecaoGradeRecebimento';

const PRIORIDADES: PrioridadeOperacaoDto[] = [
  {
    id: 'op-urg',
    nome: 'URGÊNCIA',
    posicao: 1,
    urgencia: { tipo: 'sempre', horas: null },
    padrao: false,
    grafias: [],
  },
  {
    id: 'op-rot',
    nome: 'ROTINA',
    posicao: 3,
    urgencia: { tipo: 'nunca', horas: null },
    padrao: true,
    grafias: [],
  },
];
const TURNOS = [
  { id: 't-manha', nome: 'Manhã' },
  { id: 't-lista', nome: 'Lista' },
];
const LISTA_24 = {
  prioridadeOperacaoId: 'op-rot',
  turnoId: 't-lista',
  regra: { tipo: 'prazo_minimo' as const, horas: 24 },
};

describe('SecaoGradeRecebimento', () => {
  it('muda uma célula e salva a grade sem as que seguem o SLA', async () => {
    const onSalvar = vi.fn(async () => undefined);
    render(
      <SecaoGradeRecebimento
        prioridades={PRIORIDADES}
        turnos={TURNOS}
        celulas={[LISTA_24]}
        podeEditar
        onSalvar={onSalvar}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'ROTINA no turno Manhã' })).toHaveTextContent(
      'Segue o SLA',
    );
    await escolherOpcao('URGÊNCIA no turno Lista', 'Não recebe');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar grade' }));
    expect(onSalvar).toHaveBeenCalledWith([
      LISTA_24,
      {
        prioridadeOperacaoId: 'op-urg',
        turnoId: 't-lista',
        regra: { tipo: 'nao_recebe', horas: null },
      },
    ]);
  });

  it('prazo mínimo sem horas não salva e diz o que falta', async () => {
    const onSalvar = vi.fn(async () => undefined);
    render(
      <SecaoGradeRecebimento
        prioridades={PRIORIDADES}
        turnos={TURNOS}
        celulas={[LISTA_24]}
        podeEditar
        onSalvar={onSalvar}
      />,
    );
    await userEvent.clear(
      screen.getByRole('textbox', { name: 'Horas mínimas até o prazo: ROTINA no turno Lista' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salvar grade' }));
    expect(await screen.findByText('Informe as horas (1 a 720).')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('sem editar, mostra a grade em texto', () => {
    render(
      <SecaoGradeRecebimento
        prioridades={PRIORIDADES}
        turnos={TURNOS}
        celulas={[LISTA_24]}
        podeEditar={false}
        onSalvar={vi.fn()}
      />,
    );
    expect(screen.getByRole('cell', { name: '≥ 24 h' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar grade' })).not.toBeInTheDocument();
  });
});
