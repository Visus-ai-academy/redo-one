import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { PrioridadeOperacaoDto } from '../../gen/types/PrioridadeOperacaoDto';
import { GradeRecebimento } from './GradeRecebimento';
import { chaveCelula, type Grade } from './recebimento';

const prioridade = (id: string, nome: string, posicao: number): PrioridadeOperacaoDto => ({
  id,
  nome,
  posicao,
  urgencia: { tipo: 'nunca', horas: null },
  furaGradeNaAlocacao: false,
  padrao: false,
  grafias: [],
  cor: null,
});
const PRIORIDADES = [prioridade('urg', 'URGÊNCIA', 1), prioridade('rot', 'ROTINA', 3)];
const TURNOS = [
  { id: 'manha', nome: 'Manhã' },
  { id: 'lista', nome: 'Lista' },
];
const GERAL: Grade = {
  [chaveCelula('rot', 'lista')]: { tipo: 'prazo_minimo', horas: '24' },
  [chaveCelula('urg', 'lista')]: { tipo: 'nao_recebe', horas: '' },
};

function Controlada({
  inicial,
  onChange,
  geral,
}: {
  inicial: Grade;
  onChange: (g: Grade) => void;
  geral?: Grade;
}) {
  const [grade, setGrade] = useState(inicial);
  return (
    <GradeRecebimento
      prioridades={PRIORIDADES}
      turnos={TURNOS}
      valor={grade}
      geral={geral}
      onChange={(nova) => {
        setGrade(nova);
        onChange(nova);
      }}
    />
  );
}

const celula = (nome: RegExp) => screen.getByRole('button', { name: nome });

describe('GradeRecebimento', () => {
  it('cada célula mostra o valor curto; o nome diz a regra por extenso', () => {
    render(<Controlada inicial={GERAL} onChange={vi.fn()} />);
    expect(celula(/^ROTINA no turno Manhã: Segue o SLA/)).toHaveTextContent('SLA');
    expect(celula(/^ROTINA no turno Lista: Só com 24 h ou mais/)).toHaveTextContent('≥ 24 h');
    expect(celula(/^URGÊNCIA no turno Lista: Não recebe/)).toHaveTextContent('Não recebe');
  });

  it('a célula abre o editor e muda a regra no lugar', async () => {
    const onChange = vi.fn();
    render(<Controlada inicial={GERAL} onChange={onChange} />);
    await userEvent.click(celula(/^ROTINA no turno Manhã/));
    const editor = await screen.findByRole('dialog', { name: 'ROTINA no turno Manhã' });
    await userEvent.click(within(editor).getByRole('radio', { name: 'Não recebe' }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...GERAL,
      [chaveCelula('rot', 'manha')]: { tipo: 'nao_recebe', horas: '' },
    });
    expect(celula(/^ROTINA no turno Manhã: Não recebe/)).toBeInTheDocument();
  });

  it('prazo mínimo começa em 24 h e as horas mudam no próprio editor', async () => {
    const onChange = vi.fn();
    render(<Controlada inicial={GERAL} onChange={onChange} />);
    await userEvent.click(celula(/^ROTINA no turno Manhã/));
    const editor = await screen.findByRole('dialog', { name: 'ROTINA no turno Manhã' });
    await userEvent.click(within(editor).getByRole('radio', { name: 'Prazo mínimo' }));
    const horas = within(editor).getByRole('textbox', { name: 'Horas mínimas até o prazo' });
    expect(horas).toHaveValue('24');
    await userEvent.clear(horas);
    await userEvent.type(horas, '48');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        [chaveCelula('rot', 'manha')]: { tipo: 'prazo_minimo', horas: '48' },
      }),
    );
  });

  it('usa a regra da célula na coluna inteira', async () => {
    const onChange = vi.fn();
    render(<Controlada inicial={GERAL} onChange={onChange} />);
    await userEvent.click(celula(/^ROTINA no turno Lista/));
    const editor = await screen.findByRole('dialog', { name: 'ROTINA no turno Lista' });
    await userEvent.click(
      within(editor).getByRole('button', { name: 'Usar em toda a coluna Lista' }),
    );
    expect(onChange).toHaveBeenLastCalledWith({
      [chaveCelula('rot', 'lista')]: { tipo: 'prazo_minimo', horas: '24' },
      [chaveCelula('urg', 'lista')]: { tipo: 'prazo_minimo', horas: '24' },
    });
  });

  it('na frente, a célula herdada mostra a da geral com a marca "geral" e pode voltar a ela', async () => {
    const onChange = vi.fn();
    render(
      <Controlada
        inicial={{ [chaveCelula('rot', 'manha')]: { tipo: 'prazo_minimo', horas: '48' } }}
        geral={GERAL}
        onChange={onChange}
      />,
    );
    const herdada = celula(
      /^ROTINA no turno Lista: Só com 24 h ou mais até o prazo, como na geral/,
    );
    expect(herdada).toHaveTextContent('≥ 24 h');
    expect(herdada).toHaveTextContent('geral');
    const propria = celula(/^ROTINA no turno Manhã: Só com 48 h/);
    expect(propria).not.toHaveTextContent('geral');

    await userEvent.click(propria);
    const editor = await screen.findByRole('dialog', { name: 'ROTINA no turno Manhã' });
    expect(within(editor).getByText('Na grade geral: Segue o SLA')).toBeInTheDocument();
    await userEvent.click(within(editor).getByRole('radio', { name: 'Como na geral' }));
    expect(onChange).toHaveBeenLastCalledWith({
      [chaveCelula('rot', 'manha')]: { tipo: 'geral', horas: '' },
    });
  });

  it('só leitura: a grade em texto, sem editor', () => {
    render(
      <GradeRecebimento prioridades={PRIORIDADES} turnos={TURNOS} valor={GERAL} somenteLeitura />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('cell', { name: /≥ 24 h/ })).toBeInTheDocument();
  });
});
