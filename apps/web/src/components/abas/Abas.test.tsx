import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useAppForm } from '../form/form';
import { useAlterado, useInformarAlterado } from '../painel/fechamento';
import { AbaMantida, Abas } from './Abas';

/** Formulário de uma aba que avisa, numa linha, que tem algo digitado e não salvo. */
function FormDaAba({ rotulo }: { rotulo: string }) {
  const form = useAppForm({ defaultValues: { texto: '' }, onSubmit: () => {} });
  useInformarAlterado(useAlterado(form, { texto: '' }));
  return (
    <form.AppField name="texto">
      {(field) => <field.TextField label={rotulo} placeholder="Ex.: 01/2026" />}
    </form.AppField>
  );
}

function AbasComForm() {
  const [aba, setAba] = useState('a');
  return (
    <Abas
      aria-label="Partes"
      valor={aba}
      onMudar={setAba}
      abas={[
        { valor: 'cadastro', rotulo: 'Cadastro' },
        { valor: 'a', rotulo: 'Corte' },
        { valor: 'b', rotulo: 'Preços' },
      ]}
    >
      <AbaMantida ativa={aba === 'cadastro'}>
        <FormDaAba rotulo="Nome" />
      </AbaMantida>
      {aba === 'a' && <FormDaAba rotulo="Vigência" />}
      {aba === 'b' && <p>Tabela de preços</p>}
    </Abas>
  );
}

describe('Abas', () => {
  it('marca a aba atual, troca pelo clique e mostra só o conteúdo dela', async () => {
    const onMudar = vi.fn();
    render(
      <Abas
        aria-label="Listas do catálogo"
        valor="modalidades"
        onMudar={onMudar}
        abas={[
          { valor: 'modalidades', rotulo: 'Modalidades' },
          { valor: 'prioridades', rotulo: 'Prioridades' },
        ]}
      >
        <p>Conteúdo das modalidades</p>
      </Abas>,
    );

    expect(screen.getByRole('tablist', { name: 'Listas do catálogo' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Modalidades' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Conteúdo das modalidades');

    await userEvent.click(screen.getByRole('tab', { name: 'Prioridades' }));
    expect(onMudar).toHaveBeenCalledWith('prioridades');
  });

  it('sem conteúdo, serve só de navegação (o conteúdo fica logo abaixo, sem espaço a mais)', () => {
    render(
      <Abas aria-label="Listas" valor="a" onMudar={vi.fn()} abas={[{ valor: 'a', rotulo: 'A' }]} />,
    );

    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  it('com mais abas do que cabem: sem barra de rolagem, esmaece a borda que tem mais abas', () => {
    render(
      <Abas
        aria-label="Abas largas"
        valor="a"
        onMudar={vi.fn()}
        abas={[
          { valor: 'a', rotulo: 'A' },
          { valor: 'b', rotulo: 'B' },
        ]}
      />,
    );
    const lista = screen.getByRole('tablist', { name: 'Abas largas' });
    expect(lista.className).toContain('[scrollbar-width:none]');
    // jsdom não mede: simula a lista mais larga que o espaço, rolada até o começo.
    Object.defineProperty(lista, 'scrollWidth', { configurable: true, value: 500 });
    Object.defineProperty(lista, 'clientWidth', { configurable: true, value: 300 });
    fireEvent.scroll(lista);

    expect(lista).toHaveAttribute('data-mais-a-direita');
    expect(lista).not.toHaveAttribute('data-mais-a-esquerda');
  });

  it('leva a aba atual para a vista', () => {
    const rolar = vi.fn();
    Element.prototype.scrollIntoView = rolar;
    render(
      <Abas
        aria-label="Abas"
        valor="b"
        onMudar={vi.fn()}
        abas={[
          { valor: 'a', rotulo: 'A' },
          { valor: 'b', rotulo: 'B' },
        ]}
      />,
    );

    expect(rolar).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });

  it('a roda vertical do mouse rola as abas para o lado quando elas não cabem', () => {
    render(
      <Abas
        aria-label="Abas"
        valor="a"
        onMudar={vi.fn()}
        abas={[
          { valor: 'a', rotulo: 'A' },
          { valor: 'b', rotulo: 'B' },
        ]}
      />,
    );
    const lista = screen.getByRole('tablist', { name: 'Abas' });
    Object.defineProperty(lista, 'scrollWidth', { configurable: true, value: 500 });
    Object.defineProperty(lista, 'clientWidth', { configurable: true, value: 300 });

    fireEvent.wheel(lista, { deltaY: 40, deltaX: 0 });

    expect(lista.scrollLeft).toBe(40);
  });

  describe('formulário da aba com algo digitado e não salvo', () => {
    it('trocar de aba pergunta; "Continuar editando" fica na aba com o texto', async () => {
      render(<AbasComForm />);
      await userEvent.type(screen.getByRole('textbox', { name: 'Vigência' }), '01/2026');

      await userEvent.click(screen.getByRole('tab', { name: 'Preços' }));

      expect(
        await screen.findByRole('alertdialog', { name: 'Descartar as alterações?' }),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(screen.getByRole('tab', { name: 'Corte' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('textbox', { name: 'Vigência' })).toHaveValue('01/2026');
    });

    it('"Descartar" troca de aba', async () => {
      render(<AbasComForm />);
      await userEvent.type(screen.getByRole('textbox', { name: 'Vigência' }), '01/2026');

      await userEvent.click(screen.getByRole('tab', { name: 'Preços' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));

      await waitFor(() =>
        expect(screen.getByRole('tab', { name: 'Preços' })).toHaveAttribute(
          'aria-selected',
          'true',
        ),
      );
      expect(screen.getByText('Tabela de preços')).toBeInTheDocument();
      // Voltou à aba: o formulário recomeça limpo e trocar de novo não pergunta.
      await userEvent.click(screen.getByRole('tab', { name: 'Corte' }));
      expect(screen.getByRole('textbox', { name: 'Vigência' })).toHaveValue('');
      await userEvent.click(screen.getByRole('tab', { name: 'Preços' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByText('Tabela de preços')).toBeInTheDocument();
    });

    it('sem nada digitado, troca direto', async () => {
      render(<AbasComForm />);

      await userEvent.click(screen.getByRole('tab', { name: 'Preços' }));

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByText('Tabela de preços')).toBeInTheDocument();
    });

    it('a aba que fica montada (o cadastro) não pergunta: o digitado não se perde', async () => {
      render(<AbasComForm />);
      await userEvent.click(screen.getByRole('tab', { name: 'Cadastro' }));
      await userEvent.type(screen.getByRole('textbox', { name: 'Nome' }), 'PRN');

      await userEvent.click(screen.getByRole('tab', { name: 'Preços' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('tab', { name: 'Corte' }));
      await userEvent.click(screen.getByRole('tab', { name: 'Cadastro' }));

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveValue('PRN');
    });
  });
});
