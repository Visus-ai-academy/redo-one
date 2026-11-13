import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { useAppForm } from './form';

function Formulario({ acaoDoRotulo }: { acaoDoRotulo?: React.ReactNode }) {
  const form = useAppForm({ defaultValues: { senha: '' } });

  return (
    <form.AppField name="senha">
      {(field) => (
        <field.PasswordField
          label="Senha"
          placeholder="Digite sua senha"
          autoComplete="current-password"
          required
          labelAction={acaoDoRotulo}
        />
      )}
    </form.AppField>
  );
}

describe('PasswordField', () => {
  it('esconde a senha e marca o campo como obrigatório', () => {
    render(<Formulario />);

    const campo = screen.getByLabelText('Senha');
    expect(campo).toHaveAttribute('type', 'password');
    expect(campo).toHaveAttribute('placeholder', 'Digite sua senha');
    expect(campo).toBeRequired();
  });

  it('alterna entre mostrar e ocultar a senha', async () => {
    render(<Formulario />);

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
  });

  it('avisa quando o Caps Lock está ativado', () => {
    render(<Formulario />);

    const campo = screen.getByLabelText('Senha');
    fireEvent.keyUp(campo, { key: 'A', modifierCapsLock: true });
    expect(screen.getByText('Caps Lock está ativado.')).toBeInTheDocument();
    expect(campo).toHaveAccessibleDescription('Caps Lock está ativado.');

    fireEvent.keyUp(campo, { key: 'a', modifierCapsLock: false });
    expect(screen.queryByText('Caps Lock está ativado.')).not.toBeInTheDocument();
  });

  it('mostra uma ação ao lado do rótulo sem mudar o nome do campo', () => {
    render(<Formulario acaoDoRotulo={<a href="/recuperar-senha">Esqueci minha senha</a>} />);

    expect(screen.getByRole('link', { name: 'Esqueci minha senha' })).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
  });
});
