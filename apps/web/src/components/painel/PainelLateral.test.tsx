import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Select } from '../select/Select';
import { BotaoCancelar } from './BotaoCancelar';
import { PainelLateral } from './PainelLateral';

function montar() {
  const onFechar = vi.fn();
  const naLista = vi.fn();
  render(
    <>
      <button type="button" onClick={naLista}>
        Linha da lista
      </button>
      <PainelLateral titulo="Ana Reis" subtitulo="ana@clinica.com" onFechar={onFechar}>
        <input aria-label="Nome" />
      </PainelLateral>
    </>,
  );
  return { onFechar, naLista };
}

describe('PainelLateral', () => {
  it('é um drawer com o título como nome', async () => {
    montar();

    const painel = await screen.findByRole('dialog', { name: 'Ana Reis' });
    expect(painel).toHaveTextContent('ana@clinica.com');
    expect(screen.getByRole('textbox', { name: 'Nome' })).toBeInTheDocument();
  });

  it('fecha pelo botão', async () => {
    const { onFechar } = montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Fechar painel' }));

    await waitFor(() => expect(onFechar).toHaveBeenCalledTimes(1));
  });

  it('fecha pelo Esc', async () => {
    const { onFechar } = montar();

    await userEvent.click(await screen.findByRole('textbox', { name: 'Nome' }));
    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(onFechar).toHaveBeenCalledTimes(1));
  });

  it('entra deslizando quando abre', async () => {
    montar();

    const painel = screen.getByRole('dialog', { name: 'Ana Reis' });
    expect(painel).toHaveAttribute('data-starting-style');
    await waitFor(() => expect(painel).not.toHaveAttribute('data-starting-style'));
  });

  it('trocando de linha, o painel novo aparece no lugar, sem deslizar de novo', async () => {
    const { rerender } = render(
      <PainelLateral key="a" titulo="Ana Reis" onFechar={vi.fn()}>
        conteúdo
      </PainelLateral>,
    );
    await screen.findByRole('dialog', { name: 'Ana Reis' });

    rerender(
      <PainelLateral key="b" titulo="Bruno Lima" onFechar={vi.fn()}>
        conteúdo
      </PainelLateral>,
    );

    expect(screen.getByRole('dialog', { name: 'Bruno Lima' })).not.toHaveAttribute(
      'data-starting-style',
    );
  });

  it('não bloqueia a lista: clicar fora não fecha e a lista responde', async () => {
    const { onFechar, naLista } = montar();
    await screen.findByRole('dialog', { name: 'Ana Reis' });

    await userEvent.click(screen.getByRole('button', { name: 'Linha da lista' }));

    expect(naLista).toHaveBeenCalled();
    expect(onFechar).not.toHaveBeenCalled();
  });

  it('o Esc numa lista de opções aberta dentro do painel fecha só a lista', async () => {
    const onFechar = vi.fn();
    render(
      <PainelLateral titulo="Ana Reis" onFechar={onFechar}>
        <Select
          aria-label="Nível"
          value=""
          onValueChange={vi.fn()}
          opcoes={[
            { valor: '', rotulo: 'Nenhum' },
            { valor: 'a', rotulo: 'Sênior' },
          ]}
        />
      </PainelLateral>,
    );

    await userEvent.click(await screen.findByRole('combobox', { name: 'Nível' }));
    await screen.findByRole('option', { name: 'Sênior' });
    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(onFechar).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Ana Reis' })).toBeInTheDocument();
  });

  it('largo para grades: 720px no computador; o padrão continua 400px', async () => {
    const { unmount } = render(
      <PainelLateral titulo="Grade" largura="larga" onFechar={vi.fn()}>
        conteúdo
      </PainelLateral>,
    );
    const largo = await screen.findByRole('dialog', { name: 'Grade' });
    expect(largo).toHaveClass('w-full', 'lg:w-[720px]');
    // A página reserva a faixa pela largura do painel aberto (`RESERVA_DO_PAINEL`).
    expect(largo).toHaveAttribute('data-painel-lateral', 'larga');
    expect(largo).not.toHaveClass('lg:w-[400px]');
    unmount();

    montar();
    const padrao = await screen.findByRole('dialog', { name: 'Ana Reis' });
    expect(padrao).toHaveClass('lg:w-[400px]');
    expect(padrao).toHaveAttribute('data-painel-lateral', 'padrao');
  });

  describe('com alterações não salvas', () => {
    function montarAlterado() {
      const onFechar = vi.fn();
      render(
        <PainelLateral titulo="Ana Reis" alterado onFechar={onFechar}>
          <input aria-label="Nome" />
          <BotaoCancelar onCancelar={vi.fn()} />
        </PainelLateral>,
      );
      return onFechar;
    }

    it('fechar pelo X pede para descartar; "Continuar editando" mantém o painel', async () => {
      const onFechar = montarAlterado();

      await userEvent.click(await screen.findByRole('button', { name: 'Fechar painel' }));

      expect(
        await screen.findByRole('alertdialog', { name: 'Descartar as alterações?' }),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(screen.getByRole('dialog', { name: 'Ana Reis' })).toBeInTheDocument();
      expect(onFechar).not.toHaveBeenCalled();
    });

    it('"Descartar" fecha o painel', async () => {
      const onFechar = montarAlterado();

      await userEvent.click(await screen.findByRole('textbox', { name: 'Nome' }));
      await userEvent.keyboard('{Escape}');
      await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));

      await waitFor(() => expect(onFechar).toHaveBeenCalledTimes(1));
    });

    it('o Cancelar do formulário também pede, em vez de fechar direto', async () => {
      const onFechar = montarAlterado();

      await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

      expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
      expect(onFechar).not.toHaveBeenCalled();
    });
  });

  it('sem alteração, o Cancelar do formulário fecha direto, deslizando', async () => {
    const onFechar = vi.fn();
    const onCancelar = vi.fn();
    render(
      <PainelLateral titulo="Ana Reis" onFechar={onFechar}>
        <BotaoCancelar onCancelar={onCancelar} />
      </PainelLateral>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(onFechar).toHaveBeenCalledTimes(1));
    expect(onCancelar).not.toHaveBeenCalled();
  });
});
