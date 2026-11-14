import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { contaControllerEncerrarOutrasSessoes } from '../../gen/clients/contaControllerEncerrarOutrasSessoes';
import { contaControllerEncerrarSessao } from '../../gen/clients/contaControllerEncerrarSessao';
import { contaControllerObterQueryKey } from '../../gen/hooks/useContaControllerObter';
import type { MinhaSessaoDto } from '../../gen/types/MinhaSessaoDto';
import { renderComRotas } from '../../test/render';
import { SessoesAbertas } from './SessoesAbertas';

vi.mock('../../gen/clients/contaControllerEncerrarSessao');
vi.mock('../../gen/clients/contaControllerEncerrarOutrasSessoes');

const encerrar = vi.mocked(contaControllerEncerrarSessao);
const encerrarOutras = vi.mocked(contaControllerEncerrarOutrasSessoes);

const AGORA = new Date('2026-11-14T15:00:00.000Z'); // 12:00 em Brasília

const atual: MinhaSessaoDto = {
  id: 's-atual',
  ip: '::ffff:177.32.10.200',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36',
  criadaEm: '2026-11-10T12:00:00.000Z',
  ultimoUsoEm: '2026-11-14T14:59:00.000Z',
  atual: true,
};
const iphone: MinhaSessaoDto = {
  id: 's-iphone',
  ip: '189.6.1.2',
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Mobile Safari/604.1',
  criadaEm: '2026-11-01T12:00:00.000Z',
  ultimoUsoEm: '2026-11-14T00:40:00.000Z',
  atual: false,
};

function montar(sessoes: MinhaSessaoDto[]) {
  return renderComRotas(<SessoesAbertas sessoes={sessoes} agora={AGORA} />);
}

describe('SessoesAbertas', () => {
  beforeEach(() => {
    for (const mock of [encerrar, encerrarOutras]) {
      mock.mockReset();
      mock.mockReturnValue({ unwrap: async () => undefined } as never);
    }
  });

  it('lista as sessões com aparelho, último uso e IP parcial, a atual primeiro', async () => {
    montar([iphone, atual]);

    const secao = await screen.findByRole('region', { name: /Sessões abertas/ });
    expect(within(secao).getByRole('heading')).toHaveTextContent('Sessões abertas 2');
    const itens = within(secao).getAllByRole('listitem');
    expect(itens[0]).toHaveTextContent('Chrome no Windows');
    expect(itens[0]).toHaveTextContent('Agora, IP 177.32.x.x');
    expect(itens[0]).toHaveTextContent('Esta sessão');
    expect(within(itens[0] as HTMLElement).queryByRole('button')).not.toBeInTheDocument();
    expect(itens[1]).toHaveTextContent('Safari no iPhone');
    expect(itens[1]).toHaveTextContent('Ontem, 21:40, IP 189.6.x.x');
  });

  it('encerra uma sessão de outro aparelho', async () => {
    const { queryClient } = montar([atual, iphone]);
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Encerrar sessão Safari no iPhone' }),
    );

    await waitFor(() =>
      expect(encerrar).toHaveBeenCalledWith(
        expect.objectContaining({ path: { sessaoId: 's-iphone' } }),
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Sessão encerrada.');
    expect(invalidar).toHaveBeenCalledWith({ queryKey: contaControllerObterQueryKey() });
  });

  it('encerra todas as outras de uma vez', async () => {
    montar([atual, iphone]);

    await userEvent.click(await screen.findByRole('button', { name: 'Encerrar as outras' }));

    await waitFor(() => expect(encerrarOutras).toHaveBeenCalled());
    expect(await screen.findByRole('status')).toHaveTextContent(
      'As outras sessões foram encerradas.',
    );
  });

  it('só com a sessão atual, não oferece encerrar', async () => {
    montar([atual]);

    await screen.findByRole('region', { name: /Sessões abertas/ });
    expect(screen.queryByRole('button', { name: 'Encerrar as outras' })).not.toBeInTheDocument();
  });

  it('avisa quando não consegue encerrar', async () => {
    encerrar.mockReturnValue({ unwrap: () => Promise.reject(new Error('rede')) } as never);
    montar([atual, iphone]);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Encerrar sessão Safari no iPhone' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível encerrar');
  });
});
