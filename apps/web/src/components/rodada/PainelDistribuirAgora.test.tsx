import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { FilaDoMomentoDto } from '../../gen/types/FilaDoMomentoDto';
import type { RecolhimentoPrevistoDto } from '../../gen/types/RecolhimentoPrevistoDto';
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
      cor: null,
    },
    {
      turnoId: 't2',
      nome: 'Tarde',
      inicio: '2026-11-18T16:00:00Z',
      fim: '2026-11-18T22:00:00Z',
      medicos: 3,
      emAndamento: false,
      cor: null,
    },
  ],
};

const abrir = (
  onDistribuir = vi.fn(async () => undefined),
  recolhimento: RecolhimentoPrevistoDto | undefined = undefined,
  daFila: FilaDoMomentoDto = fila,
) => {
  renderComRotas(
    <PainelDistribuirAgora
      fila={daFila}
      recolhimento={recolhimento}
      onFechar={() => undefined}
      onDistribuir={onDistribuir}
      buscarClientes={async () => []}
      buscarMedicos={async () => []}
    />,
  );
  return onDistribuir;
};

describe('PainelDistribuirAgora', () => {
  it('as contagens são do retrato da fila e dizem a hora da leitura', async () => {
    abrir();
    expect(
      await screen.findByText(/As contagens abaixo são da leitura das 10:29\./),
    ).toBeInTheDocument();
  });

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
      subespecialidadeIds: [],
      subespecialidadeGeral: false,
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

  it('recorte por subespecialidade: o "Sem subespecialidade" vai à parte', async () => {
    const onDistribuir = abrir();
    await userEvent.click(await screen.findByRole('checkbox', { name: /Sem subespecialidade/ }));
    // A frente sem quebra por subespecialidade (RX) conta como sem subespecialidade.
    expect(screen.getByText(/Cerca de 18 exames/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Distribuir agora' }));
    expect(onDistribuir).toHaveBeenCalledWith(
      expect.objectContaining({ subespecialidadeIds: ['s-cranio'], subespecialidadeGeral: false }),
    );
  });

  it('subespecialidade de mesmo nome em frentes diferentes leva o nome da frente', async () => {
    const outros = (frente: string, segmentoId: string) => ({
      frenteId: frente,
      nome: frente,
      exames: 2,
      urgentes: 0,
      primeiroVencimento: null,
      porPrioridade: [{ prioridadeOperacaoId: 'p-rot', exames: 2, urgentes: 0 }],
      porSegmento: [
        {
          segmentoId,
          nome: 'OUTROS',
          cor: null,
          exames: 2,
          urgentes: 0,
          porPrioridade: [{ prioridadeOperacaoId: 'p-rot', exames: 2, urgentes: 0 }],
        },
      ],
    });
    const onDistribuir = abrir(undefined, undefined, {
      ...fila,
      porFrente: [outros('MI', 's-mi'), outros('MSK', 's-msk')],
    });
    await userEvent.click(await screen.findByRole('checkbox', { name: /OUTROS \(MSK\)/ }));
    expect(screen.getByRole('checkbox', { name: /OUTROS \(MI\)/ })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Distribuir agora' }));
    expect(onDistribuir).toHaveBeenCalledWith(
      expect.objectContaining({ subespecialidadeIds: ['s-mi'], subespecialidadeGeral: false }),
    );
  });

  it('mostra quantos exames a rodada recolheria de médicos fora do turno ou ausentes', async () => {
    abrir(undefined, { ligado: true, recolhiveis: 4, porAusencia: 1 });
    expect(
      await screen.findByText(
        'Mais 4 exame(s) a recolher de médicos fora do turno ou ausentes (1 por ausência), se houver quem os pegue.',
      ),
    ).toBeInTheDocument();
  });

  it('enquanto conta o recolhimento, diz que está contando', async () => {
    abrir();
    expect(await screen.findByText('Contando os exames a recolher…')).toBeInTheDocument();
  });

  it('sem turno marcado, pede ao menos um', async () => {
    const onDistribuir = abrir();
    await userEvent.click(await screen.findByRole('checkbox', { name: /Manhã/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Distribuir agora' }));
    expect(await screen.findByText('Marque ao menos um turno.')).toBeInTheDocument();
    expect(onDistribuir).not.toHaveBeenCalled();
  });
});
