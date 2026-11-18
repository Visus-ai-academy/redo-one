import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ConfiguracaoDistribuicaoDto } from '../../gen/types/ConfiguracaoDistribuicaoDto';
import { FormConfiguracaoDistribuicao } from './FormConfiguracaoDistribuicao';

const CONFIG: ConfiguracaoDistribuicaoDto = {
  ordemFila: [
    { criterio: 'prioridade', direcao: 'desc' },
    { criterio: 'prazo', direcao: 'asc' },
  ],
  prioridadeIdsUrgentes: ['p-urg'],
  agruparPorPaciente: true,
  janelaPacienteHoras: 0,
  toleranciaAcimaTeto: 0,
  margemUrgenciaPct: 10,
  folgaProporcaoPct: 20,
  prazoCriticoMin: 60,
  antecedenciaPeriodoMin: 180,
  cicloMinutos: 30,
  marcadoresEquilibrio: [],
  escalaRestringeEspecialidade: true,
  diasJaEntregue: 7,
  turnosPosteriores: { turnoIds: ['t-tarde'], cheiaEm: '10:50' },
  lista: { prioridadeIds: ['p-rot'], prazoMinimoHoras: 24 },
  recolhimentoAposTurnoMin: 60,
};

const REF = {
  prioridades: [
    { id: 'p-urg', nome: 'URGÊNCIA' },
    { id: 'p-rot', nome: 'ROTINA' },
  ],
  turnos: [
    { id: 't-manha', nome: 'Manhã' },
    { id: 't-tarde', nome: 'Tarde' },
  ],
};

describe('FormConfiguracaoDistribuicao', () => {
  it('salva o que mudou, com o resto como estava', async () => {
    const onSalvar = vi.fn(async () => undefined);
    render(
      <FormConfiguracaoDistribuicao
        configuracao={CONFIG}
        {...REF}
        podeEditar
        onSalvar={onSalvar}
      />,
    );
    const ciclo = screen.getByRole('textbox', { name: 'Intervalo entre rodadas (minutos)' });
    await userEvent.clear(ciclo);
    await userEvent.type(ciclo, '20');
    await userEvent.click(screen.getByRole('button', { name: 'Critério chegada' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar configuração' }));
    expect(onSalvar).toHaveBeenCalledWith({
      ...CONFIG,
      cicloMinutos: 20,
      ordemFila: [...CONFIG.ordemFila, { criterio: 'antiguidade', direcao: 'asc' }],
    });
  });

  it('sobe um critério na ordem da fila', async () => {
    const onSalvar = vi.fn(async () => undefined);
    render(
      <FormConfiguracaoDistribuicao
        configuracao={CONFIG}
        {...REF}
        podeEditar
        onSalvar={onSalvar}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Subir prazo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar configuração' }));
    expect(onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({
        ordemFila: [
          { criterio: 'prazo', direcao: 'asc' },
          { criterio: 'prioridade', direcao: 'desc' },
        ],
      }),
    );
  });

  it('recusa turnos posteriores sem turno', async () => {
    const onSalvar = vi.fn(async () => undefined);
    render(
      <FormConfiguracaoDistribuicao
        configuracao={CONFIG}
        {...REF}
        podeEditar
        onSalvar={onSalvar}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Tarde' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar configuração' }));
    expect(
      await screen.findByText('Escolha ao menos um turno, ou desmarque os turnos posteriores.'),
    ).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('sem editar, mostra o resumo', () => {
    render(
      <FormConfiguracaoDistribuicao
        configuracao={CONFIG}
        {...REF}
        podeEditar={false}
        onSalvar={vi.fn()}
      />,
    );
    expect(screen.getByText('Tarde, cheios na rodada das 10:50')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar configuração' })).not.toBeInTheDocument();
  });
});
