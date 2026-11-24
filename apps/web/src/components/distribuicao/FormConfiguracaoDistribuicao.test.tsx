import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ConfiguracaoDistribuicaoDto } from '../../gen/types/ConfiguracaoDistribuicaoDto';
import type { PrioridadeOperacaoDto } from '../../gen/types/PrioridadeOperacaoDto';
import { FormConfiguracaoDistribuicao } from './FormConfiguracaoDistribuicao';

const CONFIG: ConfiguracaoDistribuicaoDto = {
  ordemFila: [
    { criterio: 'prioridade', direcao: 'desc' },
    { criterio: 'prazo', direcao: 'asc' },
  ],
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
  recolhimentoAposTurnoMin: 60,
  recolhimentoAposListaMin: 1440,
  roboAtivo: true,
  expiracaoPropostaMin: 45,
  tetoPorRodada: null,
  retratoFilaMin: 5,
  contasUnidadeValidadeMin: 240,
};

const ROTINA: PrioridadeOperacaoDto = {
  id: 'op-rot',
  nome: 'ROTINA',
  posicao: 3,
  urgencia: { tipo: 'nunca', horas: null },
  furaGradeNaAlocacao: false,
  padrao: true,
  grafias: [],
  cor: null,
};
const TARDE_24 = {
  prioridadeOperacaoId: 'op-rot',
  turnoId: 't-tarde',
  regra: { tipo: 'prazo_minimo' as const, horas: 24 },
};

const REF = {
  turnos: [
    { id: 't-manha', nome: 'Manhã' },
    { id: 't-tarde', nome: 'Tarde' },
  ],
  prioridades: [ROTINA],
  // A célula de uma prioridade já excluída não volta para a API.
  celulas: [TARDE_24, { ...TARDE_24, prioridadeOperacaoId: 'op-excluida' }],
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
    expect(onSalvar).toHaveBeenCalledWith(
      {
        ...CONFIG,
        cicloMinutos: 20,
        ordemFila: [...CONFIG.ordemFila, { criterio: 'antiguidade', direcao: 'asc' }],
      },
      [TARDE_24],
    );
  });

  it('desliga o robô e põe teto por rodada', async () => {
    const onSalvar = vi.fn(async () => undefined);
    render(
      <FormConfiguracaoDistribuicao
        configuracao={CONFIG}
        {...REF}
        podeEditar
        onSalvar={onSalvar}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /Robô ligado/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Limitar os exames por rodada/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /Teto de exames por rodada/ }), '500');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar configuração' }));
    expect(onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({ roboAtivo: false, tetoPorRodada: 500, expiracaoPropostaMin: 45 }),
      expect.anything(),
    );
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
      [TARDE_24],
    );
  });

  it('a grade de recebimento salva junto, pelo mesmo botão', async () => {
    const onSalvar = vi.fn(async () => undefined);
    render(
      <FormConfiguracaoDistribuicao
        configuracao={CONFIG}
        {...REF}
        podeEditar
        onSalvar={onSalvar}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^ROTINA no turno Manhã/ }));
    const editor = await screen.findByRole('dialog', { name: 'ROTINA no turno Manhã' });
    await userEvent.click(within(editor).getByRole('radio', { name: 'Não recebe' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar configuração' }));
    expect(onSalvar).toHaveBeenCalledWith(CONFIG, [
      TARDE_24,
      {
        prioridadeOperacaoId: 'op-rot',
        turnoId: 't-manha',
        regra: { tipo: 'nao_recebe', horas: null },
      },
    ]);
  });

  it('prazo mínimo sem horas não salva e marca a célula', async () => {
    const onSalvar = vi.fn(async () => undefined);
    render(
      <FormConfiguracaoDistribuicao
        configuracao={CONFIG}
        {...REF}
        podeEditar
        onSalvar={onSalvar}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^ROTINA no turno Tarde/ }));
    const editor = await screen.findByRole('dialog', { name: 'ROTINA no turno Tarde' });
    await userEvent.clear(
      within(editor).getByRole('textbox', { name: 'Horas mínimas até o prazo' }),
    );
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar configuração' }));
    expect(
      await screen.findByText('Informe as horas do prazo mínimo (1 a 720) nas células marcadas.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^ROTINA no turno Tarde/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(onSalvar).not.toHaveBeenCalled();
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
    const grade = screen.getByRole('region', { name: 'Grade de recebimento' });
    expect(within(grade).getByRole('cell', { name: /≥ 24 h/ })).toBeInTheDocument();
    expect(within(grade).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar configuração' })).not.toBeInTheDocument();
  });
});
