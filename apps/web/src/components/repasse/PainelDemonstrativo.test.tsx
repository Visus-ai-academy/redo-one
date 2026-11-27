import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DemonstrativoDetalheDto } from '../../gen/types/DemonstrativoDetalheDto';
import { PainelDemonstrativo } from './PainelDemonstrativo';

const grupo = (extra: Partial<DemonstrativoDetalheDto['grupos'][number]>) => ({
  id: Math.random().toString(),
  arranjo: { modalidadeId: 'tc', especialidadeId: 'neuro', categoriaId: 'sc', prioridadeId: 'rot' },
  modalidade: 'TC',
  especialidade: 'NEURO',
  categoria: 'SC',
  prioridade: 'Rotina',
  cliente: 'CEDIM',
  unidade: null,
  volume: 620,
  unitarioCentavos: 3207,
  totalCentavos: 1988340,
  origem: 'todos' as const,
  categoriaPreco: null,
  ...extra,
});

const demonstrativo: DemonstrativoDetalheDto = {
  id: 'd1',
  medicoId: 'm1',
  medico: 'Ana Souza',
  competencia: '2026-11',
  geracaoId: 'g2',
  versao: 2,
  versaoAtual: true,
  contratado: 'Teleimagem Ltda',
  volume: 631,
  examesCentavos: 3841010,
  adicionaisCentavos: -12000,
  brutoCentavos: 3829010,
  retencoesCentavos: 0,
  liquidoCentavos: 3829010,
  gruposSemPreco: 1,
  grupos: [
    grupo({}),
    grupo({ categoria: 'COLUNAS', categoriaPreco: 'SC', cliente: 'Hospital X', volume: 240 }),
    grupo({
      modalidade: 'RX',
      especialidade: 'TÓRAX',
      categoria: null,
      prioridade: 'Plantão',
      volume: 11,
      unitarioCentavos: 0,
      totalCentavos: 0,
      origem: 'sem_preco',
    }),
  ],
  lancamentos: [
    { id: 'a', tipo: 'adicional', descricao: 'Desconto de equipamento', totalCentavos: -12000 },
    { id: 'r', tipo: 'regra', descricao: 'Coordenação: 6% de CARDIO', totalCentavos: 50000 },
  ],
  dias: [{ dia: '2026-11-03', volume: 20, totalCentavos: 64140 }],
};

function montar(aba: 'grupos' | 'dias' | 'adicionais' | 'laudos' = 'grupos') {
  const onAba = vi.fn();
  render(
    <PainelDemonstrativo
      demonstrativo={demonstrativo}
      aba={aba}
      onAba={onAba}
      onFechar={vi.fn()}
      definirPreco={(medicoId, a) => (
        <a href={`/medicos?id=${medicoId}&aba=repasse&arranjo=${a.modalidadeId}`}>Definir preço</a>
      )}
      laudos={<p>laudos aqui</p>}
    />,
  );
  return { onAba };
}

describe('PainelDemonstrativo', () => {
  it('título, competência, versão e contratado; o resumo dos valores', async () => {
    montar();
    const painel = await screen.findByRole('dialog', { name: 'Ana Souza' });
    expect(
      within(painel).getByText('Novembro/2026 · versão 2 · Teleimagem Ltda'),
    ).toBeInTheDocument();
    const resumo = within(painel).getByRole('list', { name: 'Valores do médico' });
    expect(within(resumo).getByText('Adicionais').nextSibling).toHaveTextContent('-R$ 120,00');
  });

  it('nos grupos, de onde veio o preço; o sem preço leva à aba Repasse do médico', async () => {
    montar();
    const painel = await screen.findByRole('dialog', { name: 'Ana Souza' });
    expect(within(painel).getByText('Tabela do médico')).toBeInTheDocument();
    expect(within(painel).getByText('Alternativa: COLUNAS → SC')).toBeInTheDocument();
    const semPreco = within(painel)
      .getByText('RX · TÓRAX · — · Plantão')
      .closest('tr') as HTMLElement;
    expect(semPreco).toHaveClass('bg-warning-soft');
    expect(semPreco).toHaveTextContent('Sem preço · Definir preço');
    expect(within(semPreco).getByRole('link', { name: 'Definir preço' })).toHaveAttribute(
      'href',
      '/medicos?id=m1&aba=repasse&arranjo=tc',
    );
    // A regra de apuração entra junto dos grupos, como no demonstrativo do médico.
    expect(within(painel).getByText('Coordenação: 6% de CARDIO')).toBeInTheDocument();
    expect(within(painel).getByText('Regra de apuração')).toBeInTheDocument();
  });

  it('as abas trocam pela URL', async () => {
    const { onAba } = montar();
    await userEvent.click(await screen.findByRole('tab', { name: 'Laudos' }));
    expect(onAba).toHaveBeenCalledWith('laudos');
  });

  it('aba Dias e aba Adicionais', async () => {
    montar('dias');
    const painel = await screen.findByRole('dialog', { name: 'Ana Souza' });
    expect(within(painel).getByText('03/11/2026')).toBeInTheDocument();
    expect(within(painel).getByText('641,40')).toBeInTheDocument();
  });

  it('aba Adicionais lista só os lançamentos (não as regras)', async () => {
    montar('adicionais');
    const painel = await screen.findByRole('dialog', { name: 'Ana Souza' });
    expect(within(painel).getByText('Desconto de equipamento')).toBeInTheDocument();
    expect(within(painel).queryByText('Coordenação: 6% de CARDIO')).not.toBeInTheDocument();
  });
});
