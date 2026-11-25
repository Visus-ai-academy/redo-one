import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ExcecaoRecebimentoDto } from '../../gen/types/ExcecaoRecebimentoDto';
import { escolherOpcao } from '../../test/select';
import { ExcecoesRecebimento } from './ExcecoesRecebimento';

const HOJE = '2026-11-25';
const TURNOS = [
  { id: 'lista', nome: 'Lista' },
  { id: 'manha', nome: 'Manhã' },
];
const PRIORIDADES = [
  { id: 'op-urg', nome: 'URGÊNCIA' },
  { id: 'op-rot', nome: 'ROTINA' },
];
const FRENTES = [
  { especialidadeId: 'neuro', modalidadeId: null, rotulo: 'NEURO' },
  { especialidadeId: null, modalidadeId: 'ct', rotulo: 'CT' },
];

const excecao = (p: Partial<ExcecaoRecebimentoDto> = {}): ExcecaoRecebimentoDto => ({
  id: 'x1',
  turnoId: 'lista',
  especialidadeId: null,
  modalidadeId: null,
  prioridadeOperacaoId: null,
  regra: { tipo: 'segue_sla', horas: null },
  de: '2026-11-20',
  ate: '2026-12-22',
  criadoEm: '2026-11-20T12:00:00Z',
  situacao: 'vigente',
  podeExcluir: false,
  empatesIds: [],
  ...p,
});

const montar = (excecoes: ExcecaoRecebimentoDto[], podeEditar = true) => {
  const props = {
    onCriar: vi.fn(async () => undefined),
    onEditar: vi.fn(async () => undefined),
    onEncerrar: vi.fn(async () => undefined),
    onExcluir: vi.fn(async () => undefined),
  };
  render(
    <ExcecoesRecebimento
      excecoes={excecoes}
      turnos={TURNOS}
      prioridades={PRIORIDADES}
      frentes={FRENTES}
      hoje={HOJE}
      podeEditar={podeEditar}
      {...props}
    />,
  );
  return props;
};

describe('ExcecoesRecebimento', () => {
  it('lista vigentes e futuras com turno, regra, recorte e período; encerradas recolhidas', async () => {
    montar([
      excecao(),
      excecao({
        id: 'x2',
        situacao: 'futura',
        especialidadeId: 'neuro',
        prioridadeOperacaoId: 'op-rot',
        regra: { tipo: 'nao_recebe', horas: null },
        de: '2026-12-24',
        ate: '2026-12-26',
      }),
      excecao({ id: 'x3', situacao: 'encerrada', de: '2026-10-01', ate: '2026-10-31' }),
    ]);
    const vigentes = screen.getByRole('list', { name: 'Vigentes' });
    expect(vigentes).toHaveTextContent('Lista: segue o SLA');
    expect(vigentes).toHaveTextContent('Todas as frentes e prioridades');
    expect(vigentes).toHaveTextContent('20/11/2026 a 22/12/2026');
    const futuras = screen.getByRole('list', { name: 'Futuras' });
    expect(futuras).toHaveTextContent('Lista: não recebe');
    expect(futuras).toHaveTextContent('Só NEURO, só ROTINA');
    expect(screen.queryByText('01/10/2026 a 31/10/2026')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Encerradas \(1\)/ }));
    expect(await screen.findByText('01/10/2026 a 31/10/2026')).toBeInTheDocument();
  });

  it('sem exceções, diz que vale a grade', () => {
    montar([]);
    expect(screen.getByText(/Nenhuma exceção: vale a grade de recebimento/)).toBeInTheDocument();
  });

  it('avisa o empate e qual vale', () => {
    montar([
      excecao({ empatesIds: ['x2'] }),
      excecao({ id: 'x2', criadoEm: '2026-11-21T12:00:00Z', empatesIds: ['x1'] }),
    ]);
    const linhas = within(screen.getByRole('list', { name: 'Vigentes' })).getAllByRole('listitem');
    expect(linhas[0]).toHaveTextContent('Empata com outra exceção: vale a criada por último.');
  });

  it('cria "toda a Lista segue o SLA até 22/12"', async () => {
    const { onCriar } = montar([]);
    await userEvent.click(screen.getByRole('button', { name: 'Nova exceção' }));
    await escolherOpcao('Turno', 'Lista');
    await userEvent.type(screen.getByLabelText(/Último dia/), '22122026');
    await userEvent.click(screen.getByRole('button', { name: 'Criar exceção' }));
    expect(onCriar).toHaveBeenCalledWith({
      turnoId: 'lista',
      especialidadeId: null,
      modalidadeId: null,
      prioridadeOperacaoId: null,
      regra: { tipo: 'segue_sla', horas: null },
      de: HOJE,
      ate: '2026-12-22',
    });
  });

  it('cria com prazo mínimo, só uma frente e só uma prioridade', async () => {
    const { onCriar } = montar([]);
    await userEvent.click(screen.getByRole('button', { name: 'Nova exceção' }));
    await escolherOpcao('Turno', 'Manhã');
    await escolherOpcao('Regra', 'Prazo mínimo');
    await userEvent.type(
      await screen.findByRole('textbox', { name: /Prazo mínimo, em horas/ }),
      '12',
    );
    await escolherOpcao('Frente', 'CT');
    await escolherOpcao('Prioridade da operação', 'ROTINA');
    await userEvent.type(screen.getByLabelText(/Último dia/), '30112026');
    await userEvent.click(screen.getByRole('button', { name: 'Criar exceção' }));
    expect(onCriar).toHaveBeenCalledWith({
      turnoId: 'manha',
      especialidadeId: null,
      modalidadeId: 'ct',
      prioridadeOperacaoId: 'op-rot',
      regra: { tipo: 'prazo_minimo', horas: 12 },
      de: HOJE,
      ate: '2026-11-30',
    });
  });

  it('vigente que já começou: o primeiro dia não muda, e encerra com confirmação', async () => {
    const { onEditar, onEncerrar } = montar([excecao()]);
    await userEvent.click(screen.getByRole('button', { name: /Lista: segue o SLA/ }));
    expect(await screen.findByLabelText('Primeiro dia')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Primeiro dia')).toHaveValue('20/11/2026');
    const ate = screen.getByLabelText(/Último dia/);
    await userEvent.clear(ate);
    await userEvent.type(ate, '31122026');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onEditar).toHaveBeenCalledWith('x1', expect.objectContaining({ ate: '2026-12-31' }));

    await userEvent.click(screen.getByRole('button', { name: /Lista: segue o SLA/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Encerrar exceção' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent('vale até ontem (24/11/2026)');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Encerrar exceção' }));
    expect(onEncerrar).toHaveBeenCalledWith('x1');
  });

  it('futura se exclui com confirmação', async () => {
    const { onExcluir } = montar([
      excecao({ situacao: 'futura', de: '2026-12-01', podeExcluir: true }),
    ]);
    await userEvent.click(screen.getByRole('button', { name: /Lista: segue o SLA/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir exceção' }));
    const dialogo = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Excluir exceção' }));
    expect(onExcluir).toHaveBeenCalledWith('x1');
  });

  it('encerrada abre só para leitura; sem permissão, nada de criar', async () => {
    montar([excecao({ situacao: 'encerrada', de: '2026-10-01', ate: '2026-10-31' })], false);
    expect(screen.queryByRole('button', { name: 'Nova exceção' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Encerradas \(1\)/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Lista: segue o SLA/ }));
    expect(await screen.findByLabelText('Período')).toHaveValue('01/10/2026 a 31/10/2026');
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
  });
});
