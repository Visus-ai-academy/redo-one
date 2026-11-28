import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LinhaDeCampos } from './LinhaDeCampos';

describe('LinhaDeCampos', () => {
  it('põe os campos na grade que alinha rótulo, controle e descrição entre si', () => {
    render(
      <LinhaDeCampos className="@md:grid-cols-[3fr_1fr]">
        <div>Logradouro</div>
        <div>Número</div>
      </LinhaDeCampos>,
    );
    const grade = screen.getByText('Logradouro').parentElement;
    expect(grade).toHaveClass('linha-de-campos', '@md:grid-cols-[3fr_1fr]');
    expect(screen.getByText('Número').parentElement).toBe(grade);
    // A grade mede a largura do pai (container query), para as colunas por largura disponível.
    expect(grade?.parentElement).toHaveClass('@container');
  });
});
