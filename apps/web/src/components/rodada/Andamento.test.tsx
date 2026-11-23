import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ResumoRodadaDto } from '../../gen/types/ResumoRodadaDto';
import type { RodadaDto } from '../../gen/types/RodadaDto';
import { renderComRotas } from '../../test/render';
import { Execucao, LendoFila } from './Andamento';

const rodada = (p: Partial<RodadaDto>) =>
  ({
    id: 'r1',
    status: 'lendo',
    eventos: [],
    criadoEm: '2026-11-18T13:31:00Z',
    contagens: { prevista: 6, executada: 0, pulada: 0, falhou: 0, recusada: 0, retentaveis: 0 },
    ...p,
  }) as RodadaDto;

const resumo = {
  medicos: [{ medicoId: 'ana', nome: 'Ana', propostos: 8, executadas: 2, puladas: 0, falharam: 0 }],
  motivos: [],
} as unknown as ResumoRodadaDto;

describe('Andamento da rodada', () => {
  it('lendo a fila: o robô trabalhando, sem número inventado', async () => {
    renderComRotas(<LendoFila rodada={rodada({ status: 'lendo' })} />);
    const robo = await screen.findByRole('progressbar', { name: 'Lendo a fila da MobileMed' });
    expect(robo).toHaveAttribute('aria-valuetext', 'Em andamento');
  });

  it('atribuindo: o anel do robô enche com o progresso real', async () => {
    renderComRotas(<Execucao rodada={rodada({ status: 'executando' })} resumo={resumo} />);
    // 2 atribuídos de 8 (2 feitos + 6 previstos).
    const robo = await screen.findByRole('progressbar', { name: 'Atribuindo na MobileMed' });
    expect(robo).toHaveAttribute('aria-valuenow', '25');
  });

  it('pausada: o robô fica parado', async () => {
    renderComRotas(<Execucao rodada={rodada({ status: 'pausada' })} resumo={resumo} />);
    const robo = await screen.findByRole('progressbar', { name: 'Pausada' });
    expect(robo.querySelector('[data-arco]')?.getAttribute('class')).not.toMatch(/animate-/);
  });
});
