import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { useAppForm } from './form';

function Formulario({ onSubmit }: { onSubmit: () => Promise<void> }) {
  const form = useAppForm({ defaultValues: { nome: '' }, onSubmit });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <form.RequiredLegend />
        <form.SubmitButton pendingLabel="Entrando…">Entrar</form.SubmitButton>
      </form.AppForm>
    </form>
  );
}

describe('SubmitButton', () => {
  it('troca o texto e fica indisponível enquanto envia', async () => {
    let concluir = () => {};
    render(<Formulario onSubmit={() => new Promise<void>((resolve) => (concluir = resolve))} />);

    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    const botao = await screen.findByRole('button', { name: 'Entrando…' });
    expect(botao).toHaveAttribute('aria-disabled', 'true');
    concluir();
    expect(await screen.findByRole('button', { name: 'Entrar' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

describe('RequiredLegend', () => {
  it('explica o asterisco dos campos obrigatórios', () => {
    render(<Formulario onSubmit={async () => {}} />);

    expect(screen.getByText('Campo obrigatório')).toBeInTheDocument();
  });
});
