import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FormParametrosImportacao } from './FormParametrosImportacao';

const atuais = { travaRemocaoMinimo: 500, travaRemocaoFator: 2, retencaoLinhasBrutasDias: 90 };

describe('FormParametrosImportacao', () => {
  it('sem permissão de editar, só mostra os valores', () => {
    render(<FormParametrosImportacao parametros={atuais} podeEditar={false} onSalvar={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Salvar parâmetros' })).not.toBeInTheDocument();
    expect(screen.getByText('Retenção da linha da planilha').nextSibling).toHaveTextContent(
      '90 dias',
    );
  });

  it('salva os três valores como números', async () => {
    const onSalvar = vi.fn(async () => undefined);
    render(<FormParametrosImportacao parametros={atuais} podeEditar onSalvar={onSalvar} />);

    const retencao = screen.getByRole('textbox', { name: /Dias guardando a linha da planilha/ });
    await userEvent.clear(retencao);
    await userEvent.type(retencao, '30');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar parâmetros' }));

    expect(onSalvar).toHaveBeenCalledWith({ ...atuais, retencaoLinhasBrutasDias: 30 });
  });

  it('não salva com a retenção vazia (fora de 1 a 3650 o próprio campo ajusta)', async () => {
    const onSalvar = vi.fn(async () => undefined);
    render(<FormParametrosImportacao parametros={atuais} podeEditar onSalvar={onSalvar} />);

    const retencao = screen.getByRole('textbox', { name: /Dias guardando a linha da planilha/ });
    await userEvent.clear(retencao);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar parâmetros' }));

    expect(retencao).toBeInvalid();
    expect(onSalvar).not.toHaveBeenCalled();
  });
});
