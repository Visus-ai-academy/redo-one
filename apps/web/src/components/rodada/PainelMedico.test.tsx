import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DesignacaoDto } from '../../gen/types/DesignacaoDto';
import { renderComRotas } from '../../test/render';
import { ExameDaProposta } from './PainelMedico';

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
  laudos: 1,
  realizadoEm: '2026-11-18T10:00:00Z',
  prazo: null,
  urgente: false,
  medicoProposto: { id: 'A', nome: 'Ana' },
  medico: { id: 'A', nome: 'Ana' },
  pacote: { id: 'd1', exames: 3 },
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

const exame = (d: DesignacaoDto) =>
  renderComRotas(
    <ul>
      <ExameDaProposta d={d} medicos={[]} buscarMedicos={async () => []} />
    </ul>,
  );

describe('ExameDaProposta', () => {
  it('marca o recolhido com de quem sai e por quê', async () => {
    exame(
      designacao({ recolhidoDe: { id: 'C', nome: 'Dra. Carla' }, motivoRecolhimento: 'ausencia' }),
    );
    expect(await screen.findByText('Recolhido de Dra. Carla (ausente hoje)')).toBeInTheDocument();
  });

  it('o exame da fila sem médico não tem a marca', async () => {
    exame(designacao());
    expect(await screen.findByText('RM CRANIO')).toBeInTheDocument();
    expect(screen.queryByText(/Recolhido de/)).not.toBeInTheDocument();
  });
});
