import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DesignacaoDto } from '../../gen/types/DesignacaoDto';
import type { MedicoDaRodadaDto } from '../../gen/types/MedicoDaRodadaDto';
import { renderComRotas } from '../../test/render';
import { MoverExame } from './MoverExame';

const medico = (
  medicoId: string,
  nome: string,
  p: Partial<MedicoDaRodadaDto> = {},
): MedicoDaRodadaDto => ({
  medicoId,
  nome,
  turnos: ['Manhã'],
  frentes: ['NEURO'],
  aComecar: [],
  capacidade: 10,
  cargaEmMaos: 2,
  unidadeTeto: 'exames',
  propostos: 3,
  urgencias: 0,
  pacotes: 0,
  previstas: 3,
  laudosPrevistos: 3,
  executadas: 0,
  puladas: 0,
  falharam: 0,
  naMao: 0,
  ...p,
});

const designacao = (p: Partial<DesignacaoDto> = {}): DesignacaoDto => ({
  id: 'd1',
  ordem: 0,
  idExameMobilemed: 'MM-1',
  estudo: 'RM CRANIO',
  unidade: 'HOSPITAL A',
  cliente: null,
  prioridadeGrafia: 'Rotina',
  prioridadeOperacao: null,
  especialidade: null,
  modalidade: null,
  subespecialidade: null,
  frente: null,
  laudos: 1,
  realizadoEm: '2026-11-18T10:00:00Z',
  prazo: null,
  urgente: false,
  medicoProposto: { id: 'A', nome: 'Ana' },
  medico: { id: 'A', nome: 'Ana' },
  pacote: { id: 'd1', exames: 3, laudos: 3 },
  gratificado: false,
  naMao: false,
  elegiveis: ['A', 'B', 'C'],
  retiradoDe: null,
  retiradaEm: null,
  recolhidoDe: null,
  motivoRecolhimento: null,
  status: 'prevista',
  motivo: null,
  detalhe: null,
  executadaEm: null,
  nomePaciente: 'Paciente Fictício',
  ...p,
});

const MEDICOS = [
  medico('A', 'Ana'),
  medico('B', 'Bruno'),
  medico('C', 'Carla', { cargaEmMaos: 8, previstas: 1 }),
  medico('D', 'Davi'),
];

describe('MoverExame', () => {
  it('mostra quem podia laudar, a carga depois da troca e "Acima do teto"; leva o pacote por padrão', async () => {
    const onEscolher = vi.fn(async () => undefined);
    renderComRotas(
      <MoverExame
        designacao={designacao()}
        medicos={MEDICOS}
        buscarMedicos={async () => []}
        onEscolher={onEscolher}
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Mover' }));
    expect(
      screen.getByRole('switch', { name: /Levar os outros 2 exame\(s\) de Paciente Fictício/ }),
    ).toBeChecked();
    expect(screen.queryByText('Davi')).not.toBeInTheDocument();
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
    expect(screen.getByText('fica com 8 de 10 exames')).toBeInTheDocument();
    expect(screen.getByText('Acima do teto')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Bruno/ }));
    expect(onEscolher).toHaveBeenCalledWith('B', true);
  });

  it('quem conta o teto por laudos: a carga depois da troca soma os laudos do pacote', async () => {
    renderComRotas(
      <MoverExame
        designacao={designacao({ pacote: { id: 'd1', exames: 3, laudos: 5 } })}
        medicos={[
          medico('A', 'Ana'),
          medico('B', 'Bruno', { unidadeTeto: 'laudos', previstas: 2, laudosPrevistos: 4 }),
        ]}
        buscarMedicos={async () => []}
        onEscolher={vi.fn(async () => undefined)}
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Mover' }));
    // 2 em mãos + 4 laudos previstos + 5 do pacote.
    expect(screen.getByText('fica com 11 de 10 laudos')).toBeInTheDocument();
  });

  it('o recolhido não volta para quem o tinha: ele nem aparece na lista nem na busca', async () => {
    renderComRotas(
      <MoverExame
        designacao={designacao({
          recolhidoDe: { id: 'C', nome: 'Carla' },
          motivoRecolhimento: 'turno_encerrado',
        })}
        medicos={MEDICOS}
        buscarMedicos={async () => [{ valor: 'C', rotulo: 'Carla' }]}
        onEscolher={vi.fn(async () => undefined)}
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Mover' }));
    expect(screen.getByRole('button', { name: /Bruno/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Carla/ })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar médico' }), 'car');
    expect(await screen.findByText(/Nenhum médico/)).toBeInTheDocument();
  });

  it('desmarcada a caixa do pacote, move só o exame', async () => {
    const onEscolher = vi.fn(async () => undefined);
    renderComRotas(
      <MoverExame
        designacao={designacao()}
        medicos={MEDICOS}
        buscarMedicos={async () => []}
        onEscolher={onEscolher}
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Mover' }));
    await userEvent.click(screen.getByRole('switch', { name: /Levar os outros/ }));
    await userEvent.click(screen.getByRole('button', { name: /Bruno/ }));
    expect(onEscolher).toHaveBeenCalledWith('B', false);
  });

  it('o que ficou de fora vai "na mão"; a busca acha quem está fora da rodada', async () => {
    const onEscolher = vi.fn(async () => undefined);
    renderComRotas(
      <MoverExame
        designacao={designacao({ status: 'recusada', medico: null, pacote: null, elegiveis: [] })}
        medicos={MEDICOS}
        buscarMedicos={async () => [{ valor: 'Z', rotulo: 'Zélia Fora' }]}
        onEscolher={onEscolher}
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Mandar a um médico' }));
    expect(screen.getByText(/Ninguém mais da rodada podia laudar/)).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar médico' }), 'ze');
    await userEvent.click(await screen.findByRole('button', { name: /Zélia Fora/ }));
    expect(onEscolher).toHaveBeenCalledWith('Z', false);
  });
  it('a API recusa: o erro aparece no popover, que fica aberto para escolher de novo', async () => {
    const onEscolher = vi
      .fn<(id: string, levar: boolean) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('Médico de destino sem conta na MobileMed.'))
      .mockResolvedValueOnce(undefined);
    renderComRotas(
      <MoverExame
        designacao={designacao()}
        medicos={MEDICOS}
        buscarMedicos={async () => []}
        onEscolher={onEscolher}
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Mover' }));
    await userEvent.click(screen.getByRole('button', { name: /Bruno/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Médico de destino sem conta na MobileMed.',
    );
    expect(screen.getByRole('button', { name: /Carla/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Carla/ }));
    expect(onEscolher).toHaveBeenLastCalledWith('C', true);
    await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
