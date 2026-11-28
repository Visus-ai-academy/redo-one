import { Field } from '@base-ui/react/field';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FieldLabel, MarcaObrigatorio } from './field-parts';

describe('FieldLabel', () => {
  it('cola o * ao fim do texto do rótulo, fora do nome do campo', () => {
    render(
      <Field.Root>
        <FieldLabel required>Vencimento em fim de semana ou feriado</FieldLabel>
        <Field.Control />
      </Field.Root>,
    );
    const marca = screen.getByText('*', { exact: false });
    // O * corre no mesmo texto do rótulo (inline, com espaço que não quebra), não como item de
    // um flex que fica solto na borda quando o rótulo quebra linha.
    expect(marca.textContent).toBe(' *');
    expect(marca.previousElementSibling?.tagName).toBe('LABEL');
    expect(marca.parentElement?.className).not.toMatch(/\bflex\b/);
    expect(
      screen.getByRole('textbox', { name: 'Vencimento em fim de semana ou feriado' }),
    ).toBeInTheDocument();
  });
});

describe('MarcaObrigatorio', () => {
  it('é decorativa e não quebra longe do texto', () => {
    render(
      <p>
        Prioridades
        <MarcaObrigatorio />
      </p>,
    );
    const marca = screen.getByText('*', { exact: false });
    expect(marca).toHaveAttribute('aria-hidden', 'true');
    expect(marca.textContent).toBe(' *');
  });
});
