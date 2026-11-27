import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FormParametrosImportacao } from './FormParametrosImportacao';

const atuais = {
  travaRemocaoMinimo: 500,
  travaRemocaoFator: 2,
  retencaoLinhasBrutasDias: 90,
  mobilemedIntervaloMinutos: 30,
  mobilemedMesesAnteriores: 1,
  mobilemedJanelaDias: 7,
  mobilemedTeto: 50_000,
  mobilemedCompartilhamentoUnidades: ['CRD_APOIO'],
};

describe('FormParametrosImportacao', () => {
  it('sem permissão de editar, só mostra os valores', () => {
    render(<FormParametrosImportacao parametros={atuais} podeEditar={false} onSalvar={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Salvar parâmetros' })).not.toBeInTheDocument();
    expect(screen.getByText('Retenção da linha da planilha').nextSibling).toHaveTextContent(
      '90 dias',
    );
    expect(screen.getByText('Importação automática').nextSibling).toHaveTextContent(
      'A cada 30 minutos',
    );
    expect(screen.getByText('Período').nextSibling).toHaveTextContent(
      'Do dia 1º do mês anterior até hoje',
    );
    expect(screen.getByText('Compartilhamento de').nextSibling).toHaveTextContent('CRD_APOIO');
  });

  it('desmarcar a importação automática salva o intervalo vazio; marcar de novo pede o intervalo', async () => {
    const onSalvar = vi.fn(async () => undefined);
    render(<FormParametrosImportacao parametros={atuais} podeEditar onSalvar={onSalvar} />);

    await userEvent.click(screen.getByRole('switch', { name: 'Importar automaticamente' }));
    expect(screen.queryByRole('textbox', { name: /Intervalo/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar parâmetros' }));

    expect(onSalvar).toHaveBeenCalledWith({ ...atuais, mobilemedIntervaloMinutos: null });
  });

  it('salva o período, a janela e o teto da MobileMed', async () => {
    const onSalvar = vi.fn(async () => undefined);
    render(<FormParametrosImportacao parametros={atuais} podeEditar onSalvar={onSalvar} />);

    const meses = screen.getByRole('textbox', { name: /Meses anteriores/ });
    await userEvent.clear(meses);
    await userEvent.type(meses, '0');
    const janela = screen.getByRole('textbox', { name: /Dias por consulta/ });
    await userEvent.clear(janela);
    await userEvent.type(janela, '3');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar parâmetros' }));

    expect(onSalvar).toHaveBeenCalledWith({
      ...atuais,
      mobilemedMesesAnteriores: 0,
      mobilemedJanelaDias: 3,
    });
  });

  it('as unidades do compartilhamento são etiquetas: Enter adiciona, × tira; sem nenhuma, lista vazia', async () => {
    const onSalvar = vi.fn(async () => undefined);
    render(<FormParametrosImportacao parametros={atuais} podeEditar onSalvar={onSalvar} />);

    const unidades = screen.getByRole('combobox', { name: /Unidades do compartilhamento/ });
    expect(screen.getByRole('button', { name: 'Remover CRD_APOIO' })).toBeInTheDocument();
    await userEvent.type(unidades, 'OUTRA{enter}CRD_APOIO{enter}');
    expect(screen.getByRole('status')).toHaveTextContent('“CRD_APOIO” já está na lista.');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar parâmetros' }));
    expect(onSalvar).toHaveBeenLastCalledWith({
      ...atuais,
      mobilemedCompartilhamentoUnidades: ['CRD_APOIO', 'OUTRA'],
    });

    await userEvent.click(screen.getByRole('button', { name: 'Remover CRD_APOIO' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remover OUTRA' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar parâmetros' }));
    expect(onSalvar).toHaveBeenLastCalledWith({ ...atuais, mobilemedCompartilhamentoUnidades: [] });
  });

  it('desligada no ambiente, avisa que os valores só valem quando ligarem', () => {
    render(
      <FormParametrosImportacao
        parametros={atuais}
        podeEditar
        mobilemedLigada={false}
        onSalvar={vi.fn()}
      />,
    );

    expect(screen.getByText(/desligada neste ambiente/)).toBeInTheDocument();
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

  it('avisa quem usa quando há valor mudado e não salvo (a página pergunta antes de sair)', async () => {
    const onAlterado = vi.fn();
    render(
      <FormParametrosImportacao
        parametros={atuais}
        podeEditar
        onSalvar={vi.fn()}
        onAlterado={onAlterado}
      />,
    );
    expect(onAlterado).toHaveBeenLastCalledWith(false);

    await userEvent.type(screen.getByRole('textbox', { name: /Dias por consulta/ }), '1');

    expect(onAlterado).toHaveBeenLastCalledWith(true);
  });
});
