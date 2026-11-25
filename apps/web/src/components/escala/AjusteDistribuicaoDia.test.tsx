import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ajustesDiaControllerObter } from '../../gen/clients/ajustesDiaControllerObter';
import { ajustesDiaControllerPeriodo } from '../../gen/clients/ajustesDiaControllerPeriodo';
import type { AjusteDiaDto } from '../../gen/types/AjusteDiaDto';
import { renderComRotas } from '../../test/render';
import { AjusteDistribuicaoDia } from './AjusteDistribuicaoDia';

vi.mock('../../gen/clients/ajustesDiaControllerObter', () => ({
  ajustesDiaControllerObter: vi.fn(),
}));

vi.mock('../../gen/clients/ajustesDiaControllerPeriodo', () => ({
  ajustesDiaControllerPeriodo: vi.fn(),
}));

const obter = vi.mocked(ajustesDiaControllerObter);
const periodo = vi.mocked(ajustesDiaControllerPeriodo);
/** Plantão às quartas e sextas; o dia 20 já tem ajuste. */
const PLANTOES = ['2026-11-18', '2026-11-20', '2026-11-25', '2026-11-27'];
function comPeriodo(diasComAjuste: string[] = []) {
  periodo.mockImplementation((({ query }: { query?: { ate?: string } }) => {
    const ate = query?.ate ?? '2026-11-18';
    return {
      unwrap: async () => ({
        dias: PLANTOES.filter((d) => d <= ate),
        diasComAjuste: diasComAjuste.filter((d) => d <= ate),
        ateMaximo: '2026-12-18',
      }),
    };
  }) as never);
}
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

beforeEach(() => {
  com(null);
  comPeriodo();
});

async function escolherAte(valor: string) {
  const campo = await screen.findByLabelText('Até');
  await userEvent.clear(campo);
  await userEvent.type(campo, valor);
}

describe('AjusteDistribuicaoDia', () => {
  it('libera uma prioridade e a Lista pelo SLA', async () => {
    const { onSalvar } = montar();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'URGÊNCIA' }));
    expect(screen.getByRole('checkbox', { name: 'INTERNADO' })).not.toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Segue o SLA' }));
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
    expect(await screen.findByText('Marque uma prioridade ou "Segue o SLA".')).toBeInTheDocument();
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

  it('"Até" começa no próprio dia: só neste dia, sem aviso de período', async () => {
    montar();
    expect(await screen.findByLabelText('Até')).toHaveValue('18/11/2026');
    expect(screen.getByText(/Só neste dia/)).toBeInTheDocument();
    expect(screen.queryByText(/dias de plantão/)).not.toBeInTheDocument();
  });

  it('com "Até", diz quantos dias serão gravados e quantos já tinham ajuste, e manda o "Até"', async () => {
    comPeriodo(['2026-11-20']);
    const { onSalvar } = montar();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'URGÊNCIA' }));
    await escolherAte('25/11/2026');
    expect(await screen.findByText(/De 18\/11 a 25\/11/)).toBeInTheDocument();
    expect(
      await screen.findByText('Grava em 3 dias de plantão; 1 já tinha ajuste e será substituído.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar ajuste' }));
    expect(onSalvar).toHaveBeenCalledWith({
      prioridadeIdsLiberadas: ['p-urg'],
      segueSla: false,
      clienteId: null,
      laudosExtra: 0,
      ate: '2026-11-25',
    });
  });

  it('"Até" antes do dia ou além do limite não salva', async () => {
    const { onSalvar } = montar();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'URGÊNCIA' }));
    await escolherAte('17/11/2026');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar ajuste' }));
    expect(
      await screen.findByText('"Até" não pode ser antes do dia aberto (18/11).'),
    ).toBeInTheDocument();
    await escolherAte('19/12/2026');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar ajuste' }));
    expect(
      await screen.findByText('Escolha "Até" até 18/12 (31 dias por vez).'),
    ).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('tirar ajuste com "Até" tira os do período e avisa quantos são', async () => {
    comPeriodo(['2026-11-20', '2026-11-25']);
    const { onSalvar } = montar();
    await escolherAte('27/11/2026');
    expect(
      await screen.findByText('Tirar ajuste tira o de 2 dias do período.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tirar ajuste' }));
    expect(onSalvar).toHaveBeenCalledWith({
      prioridadeIdsLiberadas: [],
      segueSla: false,
      clienteId: null,
      laudosExtra: 0,
      ate: '2026-11-27',
    });
  });
});
