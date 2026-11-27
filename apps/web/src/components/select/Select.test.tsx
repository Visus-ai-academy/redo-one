import { render, screen, within } from '@testing-library/react';
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

  it('nome longo no gatilho corta com reticências e mostra o nome inteiro no title, sem alargar o campo', () => {
    const longa = 'Padrão da empresa (posterga para o próximo dia útil)';
    const { rerender } = render(
      <Select
        aria-label="Fim de semana ou feriado"
        value=""
        onValueChange={vi.fn()}
        opcoes={[{ valor: '', rotulo: longa }, ...opcoes.slice(1)]}
      />,
    );
    const verificar = () => {
      const gatilho = screen.getByRole('combobox', { name: 'Fim de semana ou feriado' });
      expect(gatilho).toHaveAttribute('title', longa);
      const texto = within(gatilho).getByText(longa);
      expect(texto).toHaveClass('truncate');
      // A largura 0 com flex-1 tira o texto da largura mínima do gatilho: o campo encolhe com o
      // painel (ou a linha) em vez de empurrá-lo e criar rolagem horizontal.
      expect(texto.parentElement).toHaveClass('w-0', 'flex-1', 'min-w-0');
    };
    verificar();

    // Com busca (mais de 7 opções), o mesmo.
    const muitas = Array.from({ length: 8 }, (_, i) => ({ valor: `o${i}`, rotulo: `Opção ${i}` }));
    rerender(
      <Select
        aria-label="Fim de semana ou feriado"
        value=""
        onValueChange={vi.fn()}
        opcoes={[{ valor: '', rotulo: longa }, ...muitas]}
      />,
    );
    verificar();
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

  describe('com grupos e cor', () => {
    const frentes = [
      { valor: 'neuro', rotulo: 'NEURO', grupo: 'Especialidades', cor: '#4E8C88' },
      { valor: 'mama', rotulo: 'MAMA', grupo: 'Especialidades', cor: null },
      { valor: 'tc', rotulo: 'TC', grupo: 'Modalidades', cor: '#8A4A4A' },
    ];

    it('lista curta: subtítulo por grupo e bolinha de cor', async () => {
      render(<Select aria-label="Frente" value="" onValueChange={vi.fn()} opcoes={frentes} />);
      await userEvent.click(screen.getByRole('combobox', { name: 'Frente' }));
      const esp = await screen.findByRole('group', { name: 'Especialidades' });
      expect(
        within(esp)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['NEURO', 'MAMA']);
      const mod = screen.getByRole('group', { name: 'Modalidades' });
      expect(within(mod).getByRole('option', { name: 'TC' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'NEURO' }).querySelector('[data-cor]')).toHaveStyle(
        { backgroundColor: '#4E8C88' },
      );
    });

    it('mostra a bolinha da cor da opção escolhida no gatilho, nas duas listas', () => {
      const comTodas = [{ valor: '', rotulo: 'Todas' }, ...frentes];
      const { rerender } = render(
        <Select aria-label="Frente" value="neuro" onValueChange={vi.fn()} opcoes={comTodas} />,
      );
      const gatilho = () => screen.getByRole('combobox', { name: 'Frente' });
      expect(gatilho()).toHaveTextContent('NEURO');
      expect(gatilho().querySelector('[data-cor]')).toHaveStyle({ backgroundColor: '#4E8C88' });

      rerender(<Select aria-label="Frente" value="" onValueChange={vi.fn()} opcoes={comTodas} />);
      expect(gatilho()).toHaveTextContent('Todas');
      expect(gatilho().querySelector('[data-cor]')).not.toBeInTheDocument();

      const muitas = [
        ...comTodas,
        ...['A1', 'A2', 'A3', 'A4', 'A5'].map((n) => ({ valor: n, rotulo: n })),
      ];
      rerender(<Select aria-label="Frente" value="tc" onValueChange={vi.fn()} opcoes={muitas} />);
      expect(gatilho()).toHaveTextContent('TC');
      expect(gatilho().querySelector('[data-cor]')).toHaveStyle({ backgroundColor: '#8A4A4A' });

      rerender(<Select aria-label="Frente" value="A1" onValueChange={vi.fn()} opcoes={muitas} />);
      expect(gatilho().querySelector('[data-cor]')).not.toBeInTheDocument();
    });

    it('com busca: filtra dentro dos grupos e some o subtítulo de grupo vazio', async () => {
      const muitas = [
        ...['A1', 'A2', 'A3', 'A4', 'A5'].map((n) => ({
          valor: n,
          rotulo: n,
          grupo: 'Especialidades',
          cor: null,
        })),
        ...['TC', 'RM', 'US'].map((n) => ({
          valor: n,
          rotulo: n,
          grupo: 'Modalidades',
          cor: null,
        })),
      ];
      const onValueChange = vi.fn();
      render(<Select aria-label="Frente" value="" onValueChange={onValueChange} opcoes={muitas} />);
      await userEvent.click(screen.getByRole('combobox', { name: 'Frente' }));
      expect(await screen.findByRole('group', { name: 'Especialidades' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Modalidades' })).toBeInTheDocument();
      await userEvent.type(screen.getByRole('combobox', { name: 'Buscar na lista' }), 'rm');
      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['RM']);
      expect(screen.queryByText('Especialidades')).not.toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Modalidades' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('option', { name: 'RM' }));
      expect(onValueChange).toHaveBeenCalledWith('RM');
    });
  });
});
