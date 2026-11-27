import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { CompetenciaRepasseDto } from '../../gen/types/CompetenciaRepasseDto';
import type { VersaoRepasseDto } from '../../gen/types/VersaoRepasseDto';
import { renderComRotas } from '../../test/render';
import { CabecalhoRepasse } from './CabecalhoRepasse';

const totais = {
  medicos: 132,
  volume: 43834,
  examesCentavos: 114352110,
  adicionaisCentavos: 1586449,
  brutoCentavos: 115938559,
  retencoesCentavos: 0,
  liquidoCentavos: 115938559,
  gruposSemPreco: 92,
  laudosSemPreco: 1664,
};
const v = (numero: number, atual: boolean): VersaoRepasseDto => ({
  id: `g${numero}`,
  numero,
  tipo: numero > 1 ? 'recalculo' : 'previa',
  atual,
  geradoEm: '2026-12-08T13:00:00Z',
  recalculo:
    numero > 1
      ? {
          motivo: 'valor errado',
          solicitadoPor: 'Bruno Reis',
          solicitadoEm: '2026-12-08T12:00:00Z',
        }
      : null,
  totais,
});
const fechada: CompetenciaRepasseDto = {
  competencia: '2026-11',
  status: 'fechada',
  fechadaEm: '2026-12-05T13:00:00Z',
  fechadaPor: 'Ana Lima',
  reabertaEm: null,
  versoes: [v(1, false), v(2, true)],
  atual: v(2, true),
  recalculoPendente: null,
};

function montar(props: Partial<Parameters<typeof CabecalhoRepasse>[0]> = {}) {
  const onRecalcular = vi.fn(async () => {});
  const onVersao = vi.fn();
  renderComRotas(
    <CabecalhoRepasse
      competencias={[
        { competencia: '2026-11', status: 'fechada' },
        { competencia: '2026-10', status: 'fechada' },
      ]}
      competencia="2026-11"
      dados={fechada}
      podeRecalcular
      podeVerAvisos
      onCompetencia={vi.fn()}
      onVersao={onVersao}
      onRecalcular={onRecalcular}
      {...props}
    />,
  );
  return { onRecalcular, onVersao };
}

describe('CabecalhoRepasse', () => {
  it('mostra a situação, os totais da versão e os sem preço com o link para Avisos', async () => {
    montar();
    expect(await screen.findByText('Fechada', { selector: 'span *, span' })).toBeInTheDocument();
    expect(screen.getByText(/Fechada em 05\/12\/2026 por Ana Lima/)).toBeInTheDocument();
    const faixa = screen.getByRole('list', { name: 'Totais da versão' });
    expect(within(faixa).getByText('Líquido').nextSibling).toHaveTextContent('R$ 1.159.385,59');
    expect(within(faixa).getByText('Volume').nextSibling).toHaveTextContent('43.834');
    expect(
      screen.getByText('92 arranjos sem preço (1.664 laudos pagos a zero) nesta versão.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver avisos' })).toHaveAttribute(
      'href',
      '/avisos?tipo=repasse_sem_preco&competencia=2026-11',
    );
  });

  it('Recalcular… só na fechada, com motivo obrigatório', async () => {
    const { onRecalcular } = montar();
    await userEvent.click(await screen.findByRole('button', { name: 'Recalcular…' }));
    const dialogo = await screen.findByRole('dialog', {
      name: 'Recalcular o repasse de Novembro/2026?',
    });
    await userEvent.type(within(dialogo).getByRole('textbox', { name: /Motivo/ }), 'valor errado');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Recalcular' }));
    expect(onRecalcular).toHaveBeenCalledWith('valor errado');
  });

  it('na aberta ou sem a permissão, não há Recalcular…', async () => {
    montar({ dados: { ...fechada, status: 'aberta' } });
    await screen.findByText('Aberta');
    expect(screen.queryByRole('button', { name: 'Recalcular…' })).not.toBeInTheDocument();
  });

  it('versão guardada à vista: avisa que não é a atual e volta para ela', async () => {
    const { onVersao } = montar({ versaoId: 'g1' });
    expect(
      await screen.findByText('Você está vendo a versão 1, guardada. A atual é a versão 2.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver a atual' }));
    expect(onVersao).toHaveBeenCalledWith(undefined);
  });

  it('com recálculo em andamento, o botão fica desativado', async () => {
    montar({
      dados: {
        ...fechada,
        recalculoPendente: {
          motivo: 'x',
          solicitadoPor: 'Bruno Reis',
          solicitadoEm: '2026-12-09T12:00:00Z',
        },
      },
    });
    expect(await screen.findByRole('button', { name: 'Recalcular…' })).toBeDisabled();
  });
});
