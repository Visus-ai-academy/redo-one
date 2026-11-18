import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { FilaDoMomentoDto } from '../../gen/types/FilaDoMomentoDto';
import { renderComRotas } from '../../test/render';
import { PainelDistribuirAgora } from './PainelDistribuirAgora';
import { FILA } from './teste-dados';

const fila: FilaDoMomentoDto = {
  ...FILA,
  turnos: [
    {
      turnoId: 't1',
      nome: 'Manhã',
      inicio: '2026-11-18T10:00:00Z',
      fim: '2026-11-18T16:00:00Z',
      medicos: 12,
      emAndamento: true,
    },
    {
      turnoId: 't2',
      nome: 'Tarde',
      inicio: '2026-11-18T16:00:00Z',
      fim: '2026-11-18T22:00:00Z',
      medicos: 3,
      emAndamento: false,
    },
  ],
};

const abrir = (onDistribuir = vi.fn(async () => undefined)) => {
  renderComRotas(
    <PainelDistribuirAgora
      fila={fila}
      onFechar={() => undefined}
      onDistribuir={onDistribuir}
      buscarClientes={async () => []}
      buscarMedicos={async () => []}
    />,
  );
  return onDistribuir;
};

describe('PainelDistribuirAgora', () => {
  it('vem com os turnos em andamento, todas as frentes e prioridades (sem recorte)', async () => {
    const onDistribuir = abrir();
    expect(await screen.findByRole('checkbox', { name: /Manhã/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Tarde/ })).not.toBeChecked();
    expect(screen.getByText(/Cerca de 30 exames/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Distribuir agora' }));
    expect(onDistribuir).toHaveBeenCalledWith({
      turnoIds: ['t1'],
      frenteIds: [],
      prioridadeOperacaoIds: [],
      clienteIds: [],
      medicosExcluidos: [],
      medicosIncluidos: [],
    });
  });

  it('recorte por prioridade e todos os turnos = sem recorte de turno', async () => {
    const onDistribuir = abrir();
    await userEvent.click(await screen.findByRole('checkbox', { name: /Tarde/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Rotina/ }));
    expect(screen.getByText(/Cerca de 5 exames/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Distribuir agora' }));
    expect(onDistribuir).toHaveBeenCalledWith(
      expect.objectContaining({ turnoIds: [], prioridadeOperacaoIds: ['p-urg'] }),
    );
  });

  it('sem turno marcado, pede ao menos um', async () => {
    const onDistribuir = abrir();
    await userEvent.click(await screen.findByRole('checkbox', { name: /Manhã/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Distribuir agora' }));
    expect(await screen.findByText('Marque ao menos um turno.')).toBeInTheDocument();
    expect(onDistribuir).not.toHaveBeenCalled();
  });
});
