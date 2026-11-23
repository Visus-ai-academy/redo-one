import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ResponseError } from '../../gen/.kubb/client';
import { mostrarErrosDoServidor } from './erros-do-servidor';
import { useAppForm } from './form';

const schema = z.object({
  nome: z.string().min(1, 'Informe o nome.'),
  email: z.email('Use um e-mail como nome@empresa.com.br.'),
  obs: z.string(),
});

type Valores = z.infer<typeof schema>;

function Formulario({
  onSubmit = () => {},
}: {
  onSubmit?: (valores: Valores, form: { setErro: (e: unknown) => void }) => unknown;
}) {
  const form = useAppForm({
    defaultValues: { nome: '', email: '', obs: '' },
    validators: { onSubmit: schema },
    onSubmit: ({ value, formApi }) =>
      onSubmit(value, { setErro: (e) => mostrarErrosDoServidor(formApi, e) }),
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="nome">
        {(field) => <field.TextField label="Nome" placeholder="Ex.: Maria Souza" required />}
      </form.AppField>
      <form.AppField name="email">
        {(field) => (
          <field.TextField label="E-mail" type="email" placeholder="nome@empresa.com.br" />
        )}
      </form.AppField>
      <form.AppField name="obs">
        {(field) => <field.TextAreaField label="Observações" placeholder="Ex.: atende à noite" />}
      </form.AppField>
      <form.AppForm>
        <form.SubmitButton pendingLabel="Salvando…">Salvar</form.SubmitButton>
      </form.AppForm>
    </form>
  );
}

describe('comportamento do formulário', () => {
  it('não mostra erro em campo que a pessoa ainda não tocou', async () => {
    render(<Formulario />);

    await userEvent.type(screen.getByLabelText('E-mail'), 'x');
    await userEvent.tab();

    expect(screen.queryByText('Informe o nome.')).not.toBeInTheDocument();
  });

  it('não mostra erro enquanto digita; valida ao sair do campo', async () => {
    render(<Formulario />);
    const email = screen.getByLabelText('E-mail');

    await userEvent.type(email, 'ana');
    expect(screen.queryByText(/Use um e-mail/)).not.toBeInTheDocument();

    await userEvent.tab();
    expect(screen.getByText('Use um e-mail como nome@empresa.com.br.')).toBeInTheDocument();
  });

  it('o erro some assim que o valor fica certo, sem sair do campo', async () => {
    render(<Formulario />);
    const email = screen.getByLabelText('E-mail');
    await userEvent.type(email, 'ana');
    await userEvent.tab();

    await userEvent.type(email, '@x.com');

    expect(screen.queryByText(/Use um e-mail/)).not.toBeInTheDocument();
  });

  it('campo que estava certo não mostra erro enquanto a pessoa volta a editar', async () => {
    render(<Formulario />);
    const email = screen.getByLabelText('E-mail');
    await userEvent.type(email, 'ana@x.com');
    await userEvent.tab();

    await userEvent.clear(email);
    await userEvent.type(email, 'an');

    expect(screen.queryByText(/Use um e-mail/)).not.toBeInTheDocument();
  });

  it('o botão de enviar fica disponível antes de enviar, mesmo com erro', async () => {
    render(<Formulario />);
    await userEvent.type(screen.getByLabelText('E-mail'), 'ana');
    await userEvent.tab();

    expect(screen.getByRole('button', { name: 'Salvar' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('ao enviar com erro, mostra os erros e põe o foco no primeiro campo errado', async () => {
    const enviar = vi.fn();
    render(<Formulario onSubmit={enviar} />);
    await userEvent.type(screen.getByLabelText('Observações'), 'oi');

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Informe o nome.')).toBeInTheDocument();
    expect(screen.getByText('Use um e-mail como nome@empresa.com.br.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/Nome/)).toHaveFocus());
    expect(screen.getByLabelText('Observações')).toHaveValue('oi');
    expect(enviar).not.toHaveBeenCalled();
  });

  it('tira os espaços das pontas ao sair do campo e antes de enviar', async () => {
    const enviar = vi.fn();
    render(<Formulario onSubmit={enviar} />);
    const nome = screen.getByLabelText(/Nome/);

    await userEvent.type(nome, '  Ana Souza ');
    await userEvent.tab();
    expect(nome).toHaveValue('Ana Souza');

    await userEvent.type(screen.getByLabelText('E-mail'), 'ana@x.com ');
    await userEvent.type(screen.getByLabelText('Observações'), ' noite ');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() =>
      expect(enviar).toHaveBeenCalledWith(
        { nome: 'Ana Souza', email: 'ana@x.com', obs: 'noite' },
        expect.anything(),
      ),
    );
  });

  it('Ctrl/⌘+Enter na caixa de texto envia; Enter sozinho quebra a linha', async () => {
    const enviar = vi.fn();
    render(<Formulario onSubmit={enviar} />);
    await userEvent.type(screen.getByLabelText(/Nome/), 'Ana');
    await userEvent.type(screen.getByLabelText('E-mail'), 'ana@x.com');
    const obs = screen.getByLabelText('Observações');

    await userEvent.type(obs, 'a{Enter}b');
    expect(enviar).not.toHaveBeenCalled();
    expect(obs).toHaveValue('a\nb');

    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');
    await waitFor(() => expect(enviar).toHaveBeenCalled());
  });

  it('mostra no campo o erro que o servidor devolve para ele e tira quando a pessoa muda', async () => {
    const erro = new ResponseError({
      data: { statusCode: 409, message: 'O e-mail já está em outro cadastro.', campo: 'email' },
      status: 409,
      statusText: 'Conflict',
      request: new Request('http://x'),
      response: new Response(),
    });
    render(<Formulario onSubmit={(_, { setErro }) => setErro(erro)} />);
    await userEvent.type(screen.getByLabelText(/Nome/), 'Ana');
    const email = screen.getByLabelText('E-mail');
    await userEvent.type(email, 'ana@x.com');

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('O e-mail já está em outro cadastro.')).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');

    await userEvent.type(email, 'r');
    expect(screen.queryByText('O e-mail já está em outro cadastro.')).not.toBeInTheDocument();
  });

  it('nunca bloqueia colar', async () => {
    render(<Formulario />);
    const nome = screen.getByLabelText(/Nome/);
    nome.focus();

    await userEvent.paste('Ana Souza');

    expect(nome).toHaveValue('Ana Souza');
  });
});
