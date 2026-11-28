import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FormRegrasFinanceiras } from './FormRegrasFinanceiras';

const configuracao = {
  empresaId: 'tele',
  empresaNome: '001 TELEIMAGEM',
  faixasInadimplencia: [1, 6, 16, 31],
  horizonteRecorrenciaMeses: 3,
  ajusteDiaNaoUtil: 'posterga' as const,
  padrao: true,
};

describe('FormRegrasFinanceiras', () => {
  it('mostra as faixas por extenso e salva os dias em ordem', async () => {
    const onSalvar = vi.fn(async () => undefined);
    render(<FormRegrasFinanceiras configuracao={configuracao} podeEditar onSalvar={onSalvar} />);

    expect(
      screen.getByText('Faixas: 1–5 dias, 6–15 dias, 16–30 dias e mais de 30 dias.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/ainda usa o padrão/)).toBeInTheDocument();
    const campo = screen.getByRole('textbox', { name: /Faixas da inadimplência/ });
    await userEvent.clear(campo);
    await userEvent.type(campo, '31, 1, 11');
    expect(
      screen.getByText('Faixas: 1–10 dias, 11–30 dias e mais de 30 dias.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(onSalvar).toHaveBeenCalledWith({
        faixasInadimplencia: [1, 11, 31],
        horizonteRecorrenciaMeses: 3,
        ajusteDiaNaoUtil: 'posterga',
      }),
    );
  });

  it('recusa a primeira faixa fora do dia 1; sem permissão, só leitura', async () => {
    const onSalvar = vi.fn();
    const { unmount } = render(
      <FormRegrasFinanceiras configuracao={configuracao} podeEditar onSalvar={onSalvar} />,
    );
    const campo = screen.getByRole('textbox', { name: /Faixas da inadimplência/ });
    await userEvent.clear(campo);
    await userEvent.type(campo, '2, 10');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(
      await screen.findByText('A primeira faixa começa no dia 1 de atraso.'),
    ).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
    unmount();

    render(
      <FormRegrasFinanceiras configuracao={configuracao} podeEditar={false} onSalvar={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
  });

  it('antecedência com a unidade fixa no campo, lado a lado com o vencimento na mesma grade', () => {
    render(<FormRegrasFinanceiras configuracao={configuracao} podeEditar onSalvar={vi.fn()} />);
    const antecedencia = screen.getByRole('textbox', {
      name: 'Antecedência para gerar os títulos (meses)',
    });
    expect(antecedencia).toHaveValue('3');
    expect(screen.queryByText(/\(meses\)/, { ignore: '.sr-only' })).not.toBeInTheDocument();
    expect(screen.getByText('meses')).toHaveAttribute('aria-hidden');
    const vencimento = screen.getByRole('combobox', {
      name: 'Vencimento em fim de semana ou feriado',
    });
    const linha = antecedencia.closest('.linha-de-campos');
    expect(linha).not.toBeNull();
    expect(vencimento.closest('.linha-de-campos')).toBe(linha);
  });
});
