import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { Mascara } from '../../lib/mascaras';
import { useAppForm } from './form';

function Formulario({ required }: { required?: boolean }) {
  const form = useAppForm({
    defaultValues: { nome: '' },
    validators: { onSubmit: z.object({ nome: z.string().min(1, 'Informe o nome.') }) },
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
        {(field) => (
          <field.TextField
            label="Nome"
            placeholder="Ex.: Maria Souza"
            required={required}
            description="Como aparece no menu."
          />
        )}
      </form.AppField>
      <button type="submit">Salvar</button>
    </form>
  );
}

function ComMascara({ mascara, inicial = '' }: { mascara: Mascara; inicial?: string }) {
  const form = useAppForm({ defaultValues: { doc: inicial } });
  return (
    <form.AppField name="doc">
      {(field) => <field.TextField label="Documento" placeholder="" mascara={mascara} />}
    </form.AppField>
  );
}

function SoCampo({
  type,
  mascara,
  autoComplete,
  spellCheck,
  inputMode,
}: {
  type?: 'text' | 'email' | 'search' | 'tel';
  mascara?: Mascara;
  autoComplete?: string;
  spellCheck?: boolean;
  inputMode?: 'numeric' | 'decimal';
}) {
  const form = useAppForm({ defaultValues: { v: '' } });
  return (
    <form.AppField name="v">
      {(field) => (
        <field.TextField
          label="Campo"
          placeholder=""
          type={type}
          mascara={mascara}
          autoComplete={autoComplete}
          inputMode={inputMode}
          spellCheck={spellCheck}
        />
      )}
    </form.AppField>
  );
}

describe('TextField: teclado e preenchimento', () => {
  it('e-mail: sem corretor, sem maiúscula automática e sem preencher sozinho', () => {
    render(<SoCampo type="email" />);
    const campo = screen.getByRole('textbox', { name: 'Campo' });
    expect(campo).toHaveAttribute('type', 'email');
    expect(campo).toHaveAttribute('spellcheck', 'false');
    expect(campo).toHaveAttribute('autocapitalize', 'none');
    expect(campo).toHaveAttribute('autocomplete', 'off');
  });

  it('valor em reais sem máscara: teclado decimal no celular', () => {
    render(<SoCampo inputMode="decimal" />);
    expect(screen.getByRole('textbox', { name: 'Campo' })).toHaveAttribute('inputmode', 'decimal');
  });

  it('respeita o autoComplete das telas de acesso', () => {
    render(<SoCampo type="email" autoComplete="email" />);
    expect(screen.getByRole('textbox', { name: 'Campo' })).toHaveAttribute('autocomplete', 'email');
  });

  it('documento com máscara: teclado numérico, sem corretor e sem preencher sozinho', () => {
    render(<SoCampo mascara="cpf" />);
    const campo = screen.getByRole('textbox', { name: 'Campo' });
    expect(campo).toHaveAttribute('inputmode', 'numeric');
    expect(campo).toHaveAttribute('spellcheck', 'false');
    expect(campo).toHaveAttribute('autocomplete', 'off');
  });

  it('telefone sem máscara abre o teclado de telefone', () => {
    render(<SoCampo type="tel" />);
    expect(screen.getByRole('textbox', { name: 'Campo' })).toHaveAttribute('inputmode', 'tel');
  });

  it('código ou chave: spellCheck desligado por prop', () => {
    render(<SoCampo spellCheck={false} />);
    expect(screen.getByRole('textbox', { name: 'Campo' })).toHaveAttribute('spellcheck', 'false');
  });

  it('sem corretor, também sem maiúscula automática no celular (ex.: e-mail ou CPF)', () => {
    render(<SoCampo spellCheck={false} />);
    expect(screen.getByRole('textbox', { name: 'Campo' })).toHaveAttribute(
      'autocapitalize',
      'none',
    );
  });
});

describe('TextField', () => {
  describe('com máscara', () => {
    it('ajusta enquanto digita, e abre o teclado numérico', async () => {
      render(<ComMascara mascara="telefone" />);
      const campo = screen.getByRole('textbox', { name: 'Documento' });

      await userEvent.type(campo, '67982060704');

      expect(campo).toHaveValue('(67) 98206-0704');
      expect(campo).toHaveAttribute('inputmode', 'numeric');
    });

    it('mostra formatado o valor que veio só com dígitos', () => {
      render(<ComMascara mascara="cnpj" inicial="11222333000181" />);

      expect(screen.getByRole('textbox', { name: 'Documento' })).toHaveValue('11.222.333/0001-81');
    });

    it('editar no meio não joga o cursor para o fim', async () => {
      render(<ComMascara mascara="cpf" inicial="12345678909" />);
      const campo = screen.getByRole('textbox', { name: 'Documento' }) as HTMLInputElement;

      // Cursor depois do "4" (123.4|56.789-09); apaga o 4.
      campo.focus();
      campo.setSelectionRange(5, 5);
      await userEvent.keyboard('{Backspace}');
      await new Promise((r) => requestAnimationFrame(r));

      expect(campo).toHaveValue('123.567.890-9');
      // Logo depois do 3 (o último dígito antes do que foi apagado), não no fim.
      expect(campo.selectionStart).toBe(3);
    });
  });

  it('marca o campo obrigatório com * escondido do leitor de tela e o atributo required', () => {
    render(<Formulario required />);

    const campo = screen.getByRole('textbox', { name: 'Nome' });
    expect(campo).toBeRequired();
    const asterisco = screen.getByText('*');
    expect(asterisco).toHaveAttribute('aria-hidden', 'true');
  });

  it('não mostra * em campo opcional', () => {
    render(<Formulario />);

    expect(screen.getByRole('textbox', { name: 'Nome' })).not.toBeRequired();
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('mostra o placeholder e a ajuda ligada ao campo', () => {
    render(<Formulario />);

    const campo = screen.getByRole('textbox', { name: 'Nome' });
    expect(campo).toHaveAttribute('placeholder', 'Ex.: Maria Souza');
    expect(campo).toHaveAccessibleDescription('Como aparece no menu.');
  });

  it('mostra o erro abaixo do campo e marca o campo como inválido', async () => {
    render(<Formulario required />);

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Informe o nome.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveAttribute('aria-invalid', 'true');
  });
});
