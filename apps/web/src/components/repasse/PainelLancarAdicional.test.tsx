import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { TarifasLancamentoDto } from '../../gen/types/TarifasLancamentoDto';
import { PainelLancarAdicional } from './PainelLancarAdicional';

const tarifas = async (competencia: string): Promise<TarifasLancamentoDto> => {
  const fechada = competencia <= '2026-11';
  return {
    competencia,
    fechada,
    destino: fechada ? '2026-12' : competencia,
    tarifasDestino: { peerReviewCentavos: 2500, plantaoCentavos: 60000 },
    tarifasDaCompetencia: fechada
      ? { peerReviewCentavos: 2100, plantaoCentavos: 35000 }
      : { peerReviewCentavos: 2500, plantaoCentavos: 60000 },
  };
};

function montar(props: Partial<Parameters<typeof PainelLancarAdicional>[0]> = {}) {
  const onSalvar = vi.fn(async () => {});
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PainelLancarAdicional
        competencias={[
          { competencia: '2026-12', status: 'aberta' },
          { competencia: '2026-11', status: 'fechada' },
        ]}
        competenciaInicial="2026-12"
        medicoInicial={{ valor: 'm1', rotulo: 'Ana Souza' }}
        hoje="2026-12-03"
        podeLancarNaFechada
        tarifas={tarifas}
        buscarMedicos={async () => []}
        onSalvar={onSalvar}
        onFechar={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onSalvar };
}

const painel = () => screen.findByRole('dialog', { name: 'Lançar adicional' });

describe('PainelLancarAdicional', () => {
  it('sem tipo, não envia e diz o que falta', async () => {
    const { onSalvar } = montar({ medicoInicial: undefined });
    const p = await painel();
    await userEvent.click(within(p).getByRole('button', { name: 'Lançar adicional' }));
    expect(await within(p).findByText('Escolha o médico.')).toBeInTheDocument();
    expect(within(p).getByText('Escolha o tipo.')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('Plantão: a tarifa vigente já vem no unitário e o total é calculado', async () => {
    const { onSalvar } = montar();
    const p = await painel();
    await userEvent.click(within(p).getByRole('radio', { name: 'Plantão' }));
    const unitario = within(p).getByRole('textbox', { name: /Valor unitário/ });
    await vi.waitFor(() => expect(unitario).toHaveValue('600,00'));
    await userEvent.type(within(p).getByRole('textbox', { name: /Quantidade/ }), '3');
    expect(within(p).getByText('R$ 1.800,00')).toBeInTheDocument();
    expect(within(p).getByText(/tarifa do plantão vigente em Dezembro\/2026/)).toBeInTheDocument();
    await userEvent.click(within(p).getByRole('button', { name: 'Lançar adicional' }));
    expect(onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({
        medicoId: 'm1',
        tipo: 'plantao',
        competencia: '2026-12',
        data: '2026-12-03',
        quantidade: 3,
        valorUnitarioCentavos: 60000,
      }),
    );
  });

  it('na fechada, avisa a próxima aberta; lançar nela pede o motivo e usa a tarifa dela', async () => {
    const { onSalvar } = montar({ competenciaInicial: '2026-11' });
    const p = await painel();
    expect(
      await within(p).findByText(
        'Novembro/2026 está fechada: o adicional entra em Dezembro/2026, a próxima aberta.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(within(p).getByRole('radio', { name: 'Plantão' }));
    const unitario = within(p).getByRole('textbox', { name: /Valor unitário/ });
    await vi.waitFor(() => expect(unitario).toHaveValue('600,00'));

    await userEvent.click(
      within(p).getByRole('switch', { name: 'Lançar na própria competência fechada' }),
    );
    await vi.waitFor(() => expect(unitario).toHaveValue('350,00'));
    await userEvent.type(within(p).getByRole('textbox', { name: /Quantidade/ }), '1');
    await userEvent.click(within(p).getByRole('button', { name: 'Lançar adicional' }));
    expect(
      await within(p).findByText('Informe o motivo de lançar na competência fechada.'),
    ).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();

    await userEvent.type(within(p).getByRole('textbox', { name: /Motivo/ }), 'plantão esquecido');
    await userEvent.click(within(p).getByRole('button', { name: 'Lançar adicional' }));
    expect(onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({
        competencia: '2026-11',
        lancarNaFechada: true,
        motivo: 'plantão esquecido',
        valorUnitarioCentavos: 35000,
      }),
    );
  });

  it('sem a permissão própria, não há como lançar na fechada', async () => {
    montar({ competenciaInicial: '2026-11', podeLancarNaFechada: false });
    const p = await painel();
    await within(p).findByText(/está fechada/);
    expect(within(p).queryByRole('switch', { name: /Lançar na própria/ })).not.toBeInTheDocument();
  });

  it('Peer Review pede os meses avaliados', async () => {
    montar();
    const p = await painel();
    await userEvent.click(within(p).getByRole('radio', { name: 'Peer Review' }));
    expect(within(p).getByRole('combobox', { name: /Meses avaliados de/ })).toBeInTheDocument();
    expect(within(p).getByRole('combobox', { name: /até/ })).toBeInTheDocument();
  });

  it('Avulso: valor negativo é desconto e a descrição é obrigatória', async () => {
    const { onSalvar } = montar();
    const p = await painel();
    await userEvent.click(within(p).getByRole('radio', { name: 'Avulso' }));
    await userEvent.type(within(p).getByRole('textbox', { name: /^Valor/ }), '-120,00');
    await userEvent.click(within(p).getByRole('button', { name: 'Lançar adicional' }));
    expect(
      await within(p).findByText(
        'Descreva o lançamento: é o que explica o valor no demonstrativo do médico.',
      ),
    ).toBeInTheDocument();
    await userEvent.type(
      within(p).getByRole('textbox', { name: /Descrição/ }),
      'Desconto de equipamento',
    );
    await userEvent.click(within(p).getByRole('button', { name: 'Lançar adicional' }));
    expect(onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'avulso',
        valorCentavos: -12000,
        descricao: 'Desconto de equipamento',
      }),
    );
  });
});
