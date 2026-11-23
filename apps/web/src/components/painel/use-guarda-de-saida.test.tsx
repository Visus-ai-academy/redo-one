import { useNavigate } from '@tanstack/react-router';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderComRotas } from '../../test/render';
import { useGuardaDeSaida } from './use-guarda-de-saida';

function Tela({ alterado }: { alterado: boolean }) {
  const { confirmacao, liberar } = useGuardaDeSaida(alterado);
  const navigate = useNavigate();
  return (
    <>
      <p>Formulário</p>
      <button
        type="button"
        onClick={() => {
          liberar();
          void navigate({ to: '/', search: { id: 'novo' } as never });
        }}
      >
        Salvar
      </button>
      {confirmacao}
    </>
  );
}

describe('useGuardaDeSaida', () => {
  it('sem alteração, sai da página direto', async () => {
    const { router } = renderComRotas(<Tela alterado={false} />, { caminho: '/' });

    await screen.findByText('Formulário');
    await router.navigate({ to: '/', search: { id: '2' } as never });

    await waitFor(() => expect(router.state.location.search).toEqual({ id: '2' }));
  });

  it('com alteração, pergunta antes; "Continuar editando" fica na página', async () => {
    const { router } = renderComRotas(<Tela alterado />, { caminho: '/' });

    await screen.findByText('Formulário');
    void router.navigate({ to: '/', search: { id: '2' } as never });

    expect(
      await screen.findByRole('alertdialog', { name: 'Descartar as alterações?' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(router.state.location.search).toEqual({});
  });

  it('"Descartar" segue para onde ia', async () => {
    const { router } = renderComRotas(<Tela alterado />, { caminho: '/' });

    await screen.findByText('Formulário');
    void router.navigate({ to: '/', search: { id: '2' } as never });
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));

    await waitFor(() => expect(router.state.location.search).toEqual({ id: '2' }));
  });

  it('depois de salvar, a navegação da própria tela passa sem perguntar', async () => {
    const { router } = renderComRotas(<Tela alterado />, { caminho: '/' });

    await userEvent.click(await screen.findByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(router.state.location.search).toEqual({ id: 'novo' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
