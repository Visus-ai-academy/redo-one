import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderComRotas } from '../../test/render';
import { type AcoesDoExame, PropostaPorFrente } from './PropostaPorFrente';
import { designacaoDeTeste, medicoDaRodada } from './teste-dados';

const NEURO = { id: 'f-neuro', nome: 'NEURO', cor: '#5B7DB1' };
const RX = { id: 'f-rx', nome: 'RX', cor: null };
const URG = { id: 'p-urg', nome: 'Urgência' };

const itens = [
  designacaoDeTeste({
    id: 'd1',
    estudo: 'RM CRANIO',
    medico: { id: 'ana', nome: 'Ana' },
    frente: NEURO,
    prioridadeOperacao: URG,
    urgente: true,
    cliente: { id: 'c1', nome: 'Hospital Alfa' },
    recolhidoDe: { id: 'x', nome: 'Dr. Xavier' },
    motivoRecolhimento: 'turno_encerrado',
  }),
  designacaoDeTeste({
    id: 'd2',
    ordem: 1,
    estudo: 'TC CRANIO',
    medico: { id: 'ana', nome: 'Ana' },
    frente: NEURO,
    pacote: null,
  }),
  designacaoDeTeste({
    id: 'd3',
    ordem: 2,
    estudo: 'RX TORAX',
    medico: { id: 'bia', nome: 'Bia' },
    frente: RX,
    pacote: null,
  }),
];
const medicos = [
  medicoDaRodada('ana', 'Ana', {
    turnos: [],
    aComecar: [{ turno: 'Tarde', inicio: '2026-11-18T16:00:00Z' }],
    previstas: 2,
  }),
  medicoDaRodada('bia', 'Bia', { previstas: 1 }),
  medicoDaRodada('caio', 'Caio', { previstas: 0 }),
];

const montar = (acoes?: AcoesDoExame) =>
  renderComRotas(
    <PropostaPorFrente
      rodadaId="r1"
      itens={itens}
      medicos={medicos}
      incluidos={[]}
      coresPrioridade={new Map([['p-urg', '#B5535A']])}
      verPaciente={false}
      buscarMedicos={async () => []}
      acoes={acoes}
    />,
  );

describe('PropostaPorFrente', () => {
  it('mostra as frentes, os médicos e os exames de cada um, sem abrir nada', async () => {
    montar();
    const neuro = await screen.findByRole('list', { name: 'Médicos de NEURO' });
    const ana = within(neuro).getByRole('listitem', { name: 'Ana' });
    expect(within(ana).getByText('Tarde (começa 13:00)')).toBeInTheDocument();
    const exames = within(ana).getByRole('list', { name: 'Exames de Ana' });
    expect(within(exames).getByText('RM CRANIO')).toBeVisible();
    expect(within(exames).getByText('TC CRANIO')).toBeVisible();
    expect(within(exames).getByText('Hospital Alfa')).toBeVisible();
    expect(within(exames).getByText(/Recolhido de Dr\. Xavier/)).toBeVisible();
    expect(screen.getByRole('list', { name: 'Exames de Bia' })).toHaveTextContent('RX TORAX');
  });

  it('médico sem exame proposto não aparece', async () => {
    montar();
    await screen.findByRole('list', { name: 'Médicos de NEURO' });
    expect(screen.queryByRole('listitem', { name: 'Caio' })).not.toBeInTheDocument();
  });

  it('recolher todos fecha os médicos; expandir todos abre de novo', async () => {
    montar();
    await userEvent.click(await screen.findByRole('button', { name: 'Recolher todos' }));
    expect(screen.queryByText('RM CRANIO')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Expandir todos' }));
    expect(screen.getByText('RM CRANIO')).toBeVisible();
  });

  it('a busca deixa só o que casa (médico, exame ou cliente)', async () => {
    montar();
    await userEvent.type(
      await screen.findByRole('searchbox', { name: 'Buscar médico, exame ou cliente' }),
      'torax',
    );
    expect(screen.getByText('RX TORAX')).toBeVisible();
    expect(screen.queryByText('RM CRANIO')).not.toBeInTheDocument();
  });

  it('as ações ficam na linha do exame: mover e, no menu, tirar da proposta', async () => {
    const acoes = { tirar: vi.fn(async () => undefined), mover: vi.fn(async () => undefined) };
    montar(acoes);
    const exames = await screen.findByRole('list', { name: 'Exames de Ana' });
    expect(within(exames).getAllByRole('button', { name: 'Mover' })).toHaveLength(2);
    await userEvent.click(within(exames).getByRole('button', { name: 'Mais ações de TC CRANIO' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Tirar da proposta' }));
    expect(acoes.tirar).toHaveBeenCalledWith(expect.objectContaining({ id: 'd2' }));
  });

  it('quem só acompanha não vê as ações', async () => {
    montar();
    await screen.findByRole('list', { name: 'Exames de Ana' });
    expect(screen.queryByRole('button', { name: 'Mover' })).not.toBeInTheDocument();
  });
});
