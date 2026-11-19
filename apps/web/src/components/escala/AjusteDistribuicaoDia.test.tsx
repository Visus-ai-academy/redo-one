import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ajustesDiaControllerObter } from '../../gen/clients/ajustesDiaControllerObter';
import type { AjusteDiaDto } from '../../gen/types/AjusteDiaDto';
import { renderComRotas } from '../../test/render';
import { AjusteDistribuicaoDia } from './AjusteDistribuicaoDia';

vi.mock('../../gen/clients/ajustesDiaControllerObter', () => ({
  ajustesDiaControllerObter: vi.fn(),
}));

const obter = vi.mocked(ajustesDiaControllerObter);
const com = (ajuste: AjusteDiaDto | null) =>
  obter.mockReturnValue({ unwrap: async () => ({ ajuste }) } as never);

const PRIORIDADES = [
  { id: 'p-rot', nome: 'ROTINA', cor: '#5A9A64' },
  { id: 'p-urg', nome: 'URGÊNCIA', cor: '#B5535A' },
  { id: 'p-int', nome: 'INTERNADO', cor: null },
];

function montar() {
  const onSalvar = vi.fn(async () => undefined);
  const buscarClientes = vi.fn(async () => [{ valor: 'c-hc', rotulo: 'HCLONDRINA' }]);
  renderComRotas(
    <AjusteDistribuicaoDia
      alocacaoId="al-1"
      data="2026-11-18"
      prioridades={PRIORIDADES}
      buscarClientes={buscarClientes}
      onSalvar={onSalvar}
    />,
  );
  return { onSalvar };
}

beforeEach(() => com(null));

describe('AjusteDistribuicaoDia', () => {
  it('libera uma prioridade e a Lista pelo SLA', async () => {
    const { onSalvar } = montar();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'URGÊNCIA' }));
    expect(screen.getByRole('checkbox', { name: 'INTERNADO' })).not.toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Segue o SLA neste dia' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar ajuste' }));
    expect(onSalvar).toHaveBeenCalledWith({
      prioridadeIdsLiberadas: ['p-urg'],
      segueSla: true,
      clienteId: null,
      laudosExtra: 0,
    });
    expect(screen.queryByRole('button', { name: 'Tirar ajuste' })).not.toBeInTheDocument();
  });

  it('sem nada marcado, pede o que mudar', async () => {
    const { onSalvar } = montar();
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar ajuste' }));
    expect(
      await screen.findByText('Marque uma prioridade ou "Segue o SLA neste dia".'),
    ).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('com ajuste gravado, mostra os valores e tira o ajuste', async () => {
    com({
      id: 'aj-1',
      alocacaoId: 'al-1',
      data: '2026-11-18',
      medicoId: 'm',
      turnoId: 't',
      frenteId: 'f',
      prioridadeIdsLiberadas: ['p-urg'],
      segueSla: false,
      clienteId: 'c-hc',
      clienteNome: 'HCLONDRINA',
      laudosExtra: 30,
    });
    const { onSalvar } = montar();
    expect(await screen.findByRole('checkbox', { name: 'URGÊNCIA' })).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Só para o cliente' })).toHaveValue('HCLONDRINA');
    expect(screen.getByRole('textbox', { name: 'Laudos a mais deste cliente' })).toHaveValue('30');
    await userEvent.click(screen.getByRole('button', { name: 'Tirar ajuste' }));
    expect(onSalvar).toHaveBeenCalledWith({
      prioridadeIdsLiberadas: [],
      segueSla: false,
      clienteId: null,
      laudosExtra: 0,
    });
  });

  it('+N laudos só de um cliente: sem o cliente, aponta a produtividade do dia', async () => {
    const { onSalvar } = montar();
    await userEvent.type(
      await screen.findByRole('textbox', { name: 'Laudos a mais deste cliente' }),
      '30',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salvar ajuste' }));
    expect(
      await screen.findByText(
        'Escolha o cliente. O +N de todos os exames é a produtividade do dia.',
      ),
    ).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });
});
