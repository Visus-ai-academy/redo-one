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
    nomePaciente: 'Maria Souza',
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

const montar = (acoes?: AcoesDoExame, verPaciente = false) =>
  renderComRotas(
    <PropostaPorFrente
      itens={itens}
      medicos={medicos}
      incluidos={[]}
      coresPrioridade={new Map([['p-urg', '#B5535A']])}
      verPaciente={verPaciente}
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

  it('números no plural certo e nas mesmas colunas em toda linha, com ou sem o selo de teto', async () => {
    montar();
    const neuro = await screen.findByRole('list', { name: 'Médicos de NEURO' });
    expect(screen.getByRole('button', { name: /NEURO/ })).toHaveTextContent(
      '1 urgente2 exames para 1 médico',
    );
    const ana = within(neuro).getByRole('listitem', { name: 'Ana' });
    expect(within(ana).getByTestId('coluna-exames')).toHaveTextContent('2 exames');
    expect(within(ana).getByTestId('coluna-urgentes')).toHaveTextContent('1 urgente');

    const bia = screen.getByRole('listitem', { name: 'Bia' });
    expect(within(bia).getByTestId('coluna-exames')).toHaveTextContent('1 exame');
    // Sem urgente, a coluna fica com um traço (e o leitor de tela ouve "nenhum urgente").
    expect(within(bia).getByTestId('coluna-urgentes')).toHaveTextContent('—');
    expect(within(bia).getByText('nenhum urgente')).toHaveClass('sr-only');
    // O lugar do selo "No teto" existe mesmo quando o médico não está no teto.
    expect(within(bia).getByTestId('coluna-teto')).toBeInTheDocument();
    expect(screen.queryByText(/\(s\)/)).not.toBeInTheDocument();
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

  it('com a permissão, o nome do paciente aparece direto em cada exame, sem botão', async () => {
    montar(undefined, true);
    const exames = await screen.findByRole('list', { name: 'Exames de Ana' });
    expect(within(exames).getByText('Maria Souza')).toBeVisible();
    expect(screen.queryByRole('button', { name: /pacientes/ })).not.toBeInTheDocument();
  });

  it('sem a permissão, nenhum nome de paciente', async () => {
    montar();
    await screen.findByRole('list', { name: 'Exames de Ana' });
    expect(screen.queryByText('Maria Souza')).not.toBeInTheDocument();
  });
});
