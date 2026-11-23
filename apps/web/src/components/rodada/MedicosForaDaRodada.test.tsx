import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { MedicoForaDaRodadaDto } from '../../gen/types/MedicoForaDaRodadaDto';
import { MedicosForaDaRodada } from './MedicosForaDaRodada';

const fora = (n: number, p: Partial<MedicoForaDaRodadaDto> = {}): MedicoForaDaRodadaDto => ({
  medicoId: `m${n}`,
  nome: `Médico ${String(n).padStart(2, '0')}`,
  motivo: 'turno_nao_marcado',
  detalhe: 'Turno Tarde não marcado na rodada.',
  ...p,
});

describe('MedicosForaDaRodada', () => {
  it('lista cada médico com o porquê de ficar fora', () => {
    render(
      <MedicosForaDaRodada
        medicos={[
          fora(1, { nome: 'Ana' }),
          fora(2, { nome: 'Bia', motivo: 'ausente', detalhe: 'Ausente na escala (Manhã).' }),
        ]}
      />,
    );
    const lista = screen.getByRole('list', { name: 'Médicos fora da rodada' });
    const [ana, bia] = within(lista).getAllByRole('listitem');
    expect(ana).toHaveTextContent('Ana');
    expect(ana).toHaveTextContent('Turno Tarde não marcado na rodada.');
    expect(bia).toHaveTextContent('Ausente na escala (Manhã).');
  });

  it('sem ninguém de fora, diz que todos da escala entraram', () => {
    render(<MedicosForaDaRodada medicos={[]} />);
    expect(
      screen.getByText('Todos os médicos em turno na escala entraram na rodada.'),
    ).toBeVisible();
  });

  it('pagina de 10 em 10', async () => {
    render(<MedicosForaDaRodada medicos={Array.from({ length: 12 }, (_, i) => fora(i + 1))} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByText('1–10 de 12')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
