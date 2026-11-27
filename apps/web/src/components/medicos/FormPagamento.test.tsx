import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PagamentoMedicoDto } from '../../gen/types/PagamentoMedicoDto';
import { escolherOpcao, escolherSegmento } from '../../test/select';
import { FormPagamento } from './FormPagamento';

const vazio: PagamentoMedicoDto = {
  cpf: null,
  cnpj: null,
  razaoSocial: null,
  tipoChavePix: null,
  chavePix: null,
  socio: null,
  optanteSimples: null,
};

describe('FormPagamento', () => {
  it('salva com documentos em dígitos e sócio escolhido', async () => {
    const onSalvar = vi.fn(async () => undefined);
    render(<FormPagamento dados={vazio} podeEditar onSalvar={onSalvar} />);

    expect(
      screen.getByText(/Cada vez que esta aba abre, fica registrado na auditoria/),
    ).toBeInTheDocument();
    await escolherSegmento('Sócio', 'Sim');
    await userEvent.type(screen.getByRole('textbox', { name: 'CPF' }), '123.456.789-01');
    await escolherOpcao('Tipo da chave Pix', 'E-mail');
    await userEvent.type(screen.getByRole('textbox', { name: 'Chave Pix' }), 'a@pix.com');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar pagamento' }));

    expect(onSalvar).toHaveBeenCalledWith({
      ...vazio,
      cpf: '12345678901',
      socio: true,
      tipoChavePix: 'EMAIL',
      chavePix: 'a@pix.com',
    });
  });

  it('não tem nada do Omie, nem editando nem só lendo', () => {
    const { container, rerender } = render(
      <FormPagamento dados={vazio} podeEditar onSalvar={vi.fn()} />,
    );
    expect(container).not.toHaveTextContent(/omie/i);
    rerender(<FormPagamento dados={vazio} podeEditar={false} onSalvar={vi.fn()} />);
    expect(container).not.toHaveTextContent(/omie/i);
  });

  it('exige o tipo junto com a chave Pix e confere o CPF', async () => {
    const onSalvar = vi.fn(async () => undefined);
    render(<FormPagamento dados={vazio} podeEditar onSalvar={onSalvar} />);

    await userEvent.type(screen.getByRole('textbox', { name: 'CPF' }), '123');
    await userEvent.type(screen.getByRole('textbox', { name: 'Chave Pix' }), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar pagamento' }));

    expect(await screen.findByText('O CPF tem 11 dígitos.')).toBeInTheDocument();
    expect(screen.getByText('Escolha o tipo da chave Pix.')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('sem permissão de editar, só mostra', () => {
    render(
      <FormPagamento
        dados={{ ...vazio, cnpj: '12345678000190', socio: false }}
        podeEditar={false}
        onSalvar={vi.fn()}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'CNPJ' })).toHaveValue('12.345.678/0001-90');
    expect(screen.getByRole('textbox', { name: 'Sócio' })).toHaveValue('Não');
    expect(screen.queryByRole('button', { name: 'Salvar pagamento' })).not.toBeInTheDocument();
  });
});
