import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import { renderComRotas } from '../../test/render';
import { PainelCarregando } from './PainelCarregando';

describe('PainelCarregando', () => {
  it('abre o painel na hora, avisando que está carregando', async () => {
    const onFechar = vi.fn();
    render(<PainelCarregando onFechar={onFechar} />);

    const painel = screen.getByRole('dialog', { name: 'Carregando…' });
    expect(painel).toHaveAttribute('aria-busy', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Fechar painel' }));
    await waitFor(() => expect(onFechar).toHaveBeenCalled());
  });

  it('largo, já abre na largura do painel que vem (nada pula quando os dados chegam)', () => {
    render(<PainelCarregando onFechar={vi.fn()} largura="larga" />);
    expect(screen.getByRole('dialog', { name: 'Carregando…' })).toHaveAttribute(
      'data-painel-lateral',
      'larga',
    );
  });

  it('se falhar, diz o que houve e deixa tentar de novo', async () => {
    const tentar = vi.fn();
    render(<PainelCarregando onFechar={vi.fn()} erro onTentarDeNovo={tentar} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar');
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-busy', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(tentar).toHaveBeenCalled();
  });

  it('com o erro da API, mostra o estado do código HTTP (ex.: 404 com o caminho de volta)', async () => {
    const erro = new ResponseError({
      data: {},
      status: 404,
      statusText: '',
      request: new Request('http://api.test/x'),
      response: new Response(),
    });
    renderComRotas(
      <PainelCarregando
        onFechar={vi.fn()}
        erro={erro}
        oQue="o médico"
        voltar={{ to: '/', rotulo: 'Voltar para Médicos' }}
      />,
    );

    expect(await screen.findByText('Não encontramos o médico')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para Médicos' })).toBeInTheDocument();
  });

  it('as formas do carregamento só aparecem depois de 200ms (resposta rápida não pisca)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<PainelCarregando onFechar={vi.fn()} />);

    const formas = screen.getByTestId('formas-carregando');
    expect(formas).toHaveClass('invisible');
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(screen.getByTestId('formas-carregando')).not.toHaveClass('invisible');
    vi.useRealTimers();
  });
});
