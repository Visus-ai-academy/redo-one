import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
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

/** Tela com o botão que abre o painel, para conferir para onde o foco volta. */
function Tela() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAberto(true)}>
        Abrir Ana
      </button>
      {aberto && (
        <PainelLateral titulo="Ana Reis" onFechar={() => setAberto(false)}>
          <input aria-label="Nome" />
        </PainelLateral>
      )}
    </>
  );
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

  it('fica por cima com um fundo desfocado, sem escurecer, que não deixa clicar atrás', async () => {
    const { naLista } = montar();
    await screen.findByRole('dialog', { name: 'Ana Reis' });

    const fundo = document.querySelector('[data-fundo-painel]');
    expect(fundo).toHaveClass('backdrop-blur-[2px]', 'transition-opacity', 'duration-200');
    expect(fundo?.className).not.toMatch(/transition-\[|transition-all|bg-foreground\/[1-9]/);
    await userEvent.click(fundo as HTMLElement);
    expect(naLista).not.toHaveBeenCalled();
  });

  it('clicar fora fecha', async () => {
    const { onFechar } = montar();
    await screen.findByRole('dialog', { name: 'Ana Reis' });

    await userEvent.click(document.querySelector('[data-fundo-painel]') as HTMLElement);

    await waitFor(() => expect(onFechar).toHaveBeenCalledTimes(1));
  });

  it('clicar no aviso (toast), que fica por cima do fundo, não fecha o painel', async () => {
    const onFechar = vi.fn();
    const fecharAviso = vi.fn();
    render(
      <>
        <div className="faixa-avisos">
          <button type="button" onClick={fecharAviso}>
            Fechar aviso
          </button>
        </div>
        <PainelLateral titulo="Ana Reis" onFechar={onFechar}>
          conteúdo
        </PainelLateral>
      </>,
    );
    await screen.findByRole('dialog', { name: 'Ana Reis' });

    await userEvent.click(screen.getByText('Fechar aviso'));

    expect(fecharAviso).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 300));
    expect(onFechar).not.toHaveBeenCalled();
  });

  it('modal: o foco fica no painel e volta para quem abriu ao fechar', async () => {
    render(<Tela />);

    await userEvent.click(screen.getByRole('button', { name: 'Abrir Ana' }));
    const painel = await screen.findByRole('dialog', { name: 'Ana Reis' });
    await waitFor(() => expect(painel).toContainElement(document.activeElement as HTMLElement));
    await userEvent.tab();
    await userEvent.tab();
    expect(painel).toContainElement(document.activeElement as HTMLElement);

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Abrir Ana' })).toHaveFocus());
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
    // A faixa dos avisos (toast) se posiciona pela largura do painel aberto.
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

    it('clicar fora também pergunta', async () => {
      const onFechar = montarAlterado();
      await screen.findByRole('dialog', { name: 'Ana Reis' });

      await userEvent.click(document.querySelector('[data-fundo-painel]') as HTMLElement);

      expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
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
