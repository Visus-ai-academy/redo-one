import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Select } from './Select';

const opcoes = [
  { valor: '', rotulo: 'Todos os papéis' },
  { valor: 'p-fin', rotulo: 'Financeiro' },
  { valor: 'p-admin', rotulo: 'Administrador', desabilitada: true },
];

describe('Select', () => {
  it('mostra a opção escolhida no gatilho, com o nome acessível', () => {
    render(
      <Select
        aria-label="Filtrar por papel"
        value="p-fin"
        onValueChange={vi.fn()}
        opcoes={opcoes}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Filtrar por papel' })).toHaveTextContent(
      'Financeiro',
    );
  });

  it('abre a lista e escolhe uma opção', async () => {
    const onValueChange = vi.fn();
    render(
      <Select
        aria-label="Filtrar por papel"
        value=""
        onValueChange={onValueChange}
        opcoes={opcoes}
      />,
    );

    await userEvent.click(screen.getByRole('combobox', { name: 'Filtrar por papel' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Financeiro' }));

    expect(onValueChange).toHaveBeenCalledWith('p-fin');
  });

  it('opção desabilitada não se escolhe', async () => {
    const onValueChange = vi.fn();
    render(<Select aria-label="Papel" value="" onValueChange={onValueChange} opcoes={opcoes} />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Papel' }));
    const admin = await screen.findByRole('option', { name: 'Administrador' });
    expect(admin).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(admin);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('liga ao rótulo externo pelo id e à ajuda pelo aria-describedby', () => {
    render(
      <>
        <label htmlFor="papel">Papel</label>
        <Select
          id="papel"
          aria-describedby="ajuda"
          value="p-fin"
          onValueChange={vi.fn()}
          opcoes={opcoes}
        />
        <span id="ajuda">Ao trocar o papel, as sessões caem.</span>
      </>,
    );

    const campo = screen.getByRole('combobox', { name: 'Papel' });
    expect(campo).toHaveAccessibleDescription('Ao trocar o papel, as sessões caem.');
  });

  it('desabilitado não abre', () => {
    render(
      <Select aria-label="Papel" value="p-fin" onValueChange={vi.fn()} opcoes={opcoes} disabled />,
    );

    expect(screen.getByRole('combobox', { name: 'Papel' })).toBeDisabled();
  });

  it('sem valor, mostra o placeholder, que não é uma opção', async () => {
    render(
      <Select
        aria-label="Papel"
        value=""
        onValueChange={vi.fn()}
        placeholder="Escolha um papel"
        opcoes={[{ valor: 'p-fin', rotulo: 'Financeiro' }]}
      />,
    );

    const campo = screen.getByRole('combobox', { name: 'Papel' });
    expect(campo).toHaveTextContent('Escolha um papel');
    await userEvent.click(campo);
    expect(await screen.findAllByRole('option')).toHaveLength(1);
  });

  describe('com mais de 7 opções', () => {
    const categorias = [
      { valor: '', rotulo: 'A do exame' },
      ...['ANGIO', 'CABEÇA', 'COEFICIENTE', 'COLUNAS', 'ONCO', 'PESCOÇO', 'PROSTATA', 'SC'].map(
        (nome) => ({ valor: nome.toLowerCase(), rotulo: nome }),
      ),
    ];

    it('digita para filtrar, sem diferença de acento e maiúscula, e escolhe', async () => {
      const onValueChange = vi.fn();
      render(
        <Select
          aria-label="Categoria"
          value=""
          onValueChange={onValueChange}
          opcoes={categorias}
        />,
      );

      await userEvent.click(screen.getByRole('combobox', { name: 'Categoria' }));
      const busca = await screen.findByRole('combobox', { name: 'Buscar na lista' });
      await vi.waitFor(() => expect(busca).toHaveFocus());
      await userEvent.type(busca, 'cabeca');

      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['CABEÇA']);
      await userEvent.click(screen.getByRole('option', { name: 'CABEÇA' }));
      expect(onValueChange).toHaveBeenCalledWith('cabeça');
    });

    it('sem resultado, diz que nada foi encontrado', async () => {
      render(
        <Select aria-label="Categoria" value="onco" onValueChange={vi.fn()} opcoes={categorias} />,
      );

      expect(screen.getByRole('combobox', { name: 'Categoria' })).toHaveTextContent('ONCO');
      await userEvent.click(screen.getByRole('combobox', { name: 'Categoria' }));
      await userEvent.type(await screen.findByRole('combobox', { name: 'Buscar na lista' }), 'xyz');

      expect(screen.getByText('Nada encontrado para “xyz”.')).toBeInTheDocument();
    });
  });

  it('lista curta não tem busca', async () => {
    render(
      <Select aria-label="Filtrar por papel" value="" onValueChange={vi.fn()} opcoes={opcoes} />,
    );

    await userEvent.click(screen.getByRole('combobox', { name: 'Filtrar por papel' }));
    await screen.findByRole('option', { name: 'Financeiro' });
    expect(screen.queryByRole('combobox', { name: 'Buscar na lista' })).not.toBeInTheDocument();
  });
});
