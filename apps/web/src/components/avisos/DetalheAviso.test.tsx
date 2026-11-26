import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AvisoDto } from '../../gen/types/AvisoDto';
import { DetalheAviso } from './DetalheAviso';

const pendente: AvisoDto = {
  id: 'a1',
  tipo: 'cliente',
  valor: 'CLINICA NOVA',
  itens: [],
  status: 'pendente',
  origem: 'importacao',
  competencias: { desde: '2026-10', ate: '2026-11' },
  entidades: [],
  ocorrencias: 42,
  primeiraVezEm: '2026-11-10T12:00:00Z',
  ultimaVezEm: '2026-11-16T12:00:00Z',
  decididoPor: null,
  decididoEm: null,
  motivo: null,
};

describe('DetalheAviso', () => {
  it('mostra em quantos laudos e quando, sem repetir o texto do aviso (ele é o título do painel)', () => {
    render(<DetalheAviso aviso={pendente} podeTriar={false} />);
    expect(screen.queryByText('CLINICA NOVA')).not.toBeInTheDocument();
    expect(screen.getByText('Laudos na última importação').nextSibling).toHaveTextContent('42');
    expect(screen.getByText('Competência').nextSibling).toHaveTextContent('10/2026 a 11/2026');
    expect(screen.getByText('Encontrado por').nextSibling).toHaveTextContent(
      'Importação de laudos',
    );
    expect(screen.queryByRole('button', { name: 'Ignorar aviso' })).not.toBeInTheDocument();
  });

  it('ignora o pendente só com o motivo, que é obrigatório', async () => {
    const onIgnorar = vi.fn(async () => undefined);
    render(<DetalheAviso aviso={pendente} podeTriar onIgnorar={onIgnorar} />);

    expect(screen.getByRole('textbox', { name: /Motivo/ })).toBeRequired();
    await userEvent.type(screen.getByRole('textbox', { name: /Motivo/ }), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Ignorar aviso' }));
    expect(
      await screen.findByText('Informe por que o aviso vai ser ignorado.'),
    ).toBeInTheDocument();
    expect(onIgnorar).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByRole('textbox', { name: /Motivo/ }));
    await userEvent.type(
      screen.getByRole('textbox', { name: /Motivo/ }),
      'Cliente de teste da MobileMed',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ignorar aviso' }));

    expect(onIgnorar).toHaveBeenCalledWith('Cliente de teste da MobileMed');
  });

  it('o ignorado mostra quem decidiu e o motivo, e pode ser reaberto', async () => {
    const onReabrir = vi.fn(async () => undefined);
    render(
      <DetalheAviso
        aviso={{
          ...pendente,
          status: 'ignorado',
          motivo: 'Teste',
          decididoPor: { id: 'u1', nome: 'Maria Souza' },
          decididoEm: '2026-11-16T13:00:00Z',
        }}
        podeTriar
        onReabrir={onReabrir}
      />,
    );

    expect(screen.getByText('Ignorado por').nextSibling).toHaveTextContent('Maria Souza');
    expect(screen.getByText('Motivo').nextSibling).toHaveTextContent('Teste');
    await userEvent.click(screen.getByRole('button', { name: 'Reabrir aviso' }));
    expect(onReabrir).toHaveBeenCalled();
  });

  it('se a triagem falha, mostra o erro no painel', async () => {
    render(
      <DetalheAviso
        aviso={pendente}
        podeTriar
        onIgnorar={vi.fn(async () => Promise.reject(new Error('x')))}
      />,
    );
    await userEvent.type(screen.getByRole('textbox', { name: /Motivo/ }), 'Teste');
    await userEvent.click(screen.getByRole('button', { name: 'Ignorar aviso' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível ignorar o aviso.');
  });

  it('o resolvido explica que o cadastro foi feito, sem ações', () => {
    render(<DetalheAviso aviso={{ ...pendente, status: 'resolvido' }} podeTriar />);
    expect(screen.getByRole('status')).toHaveTextContent('Uma importação achou o cadastro');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('a grafia sem de-para da distribuição fala da rodada, não da importação', () => {
    const daRodada = {
      ...pendente,
      tipo: 'prioridade_operacao' as const,
      origem: 'rodada' as const,
      valor: 'Eletivo',
    };
    const { unmount } = render(
      <DetalheAviso aviso={daRodada} podeTriar={false} procurar={<a href="/x">Abrir</a>} />,
    );
    expect(screen.getByText('Exames na última rodada').nextSibling).toHaveTextContent('42');
    expect(screen.getByText(/A próxima rodada resolve o aviso/)).toBeInTheDocument();
    unmount();
    render(<DetalheAviso aviso={{ ...daRodada, status: 'resolvido' }} podeTriar={false} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'A grafia entrou no de-para das prioridades da operação',
    );
  });

  it('a conta não liberada na unidade diz o que fazer e que nada mudou sozinho', () => {
    const conta = {
      ...pendente,
      tipo: 'conta_unidade' as const,
      origem: 'rodada' as const,
      valor: 'Dr. Fulano sem conta liberada na unidade CEDI_RJ',
      ocorrencias: 3,
    };
    const { unmount } = render(
      <DetalheAviso aviso={conta} podeTriar={false} procurar={<a href="/x">Abrir</a>} />,
    );
    expect(screen.getByText('Exames na última rodada').nextSibling).toHaveTextContent('3');
    expect(
      screen.getByText(/Libere a conta do médico nesta unidade na MobileMed/),
    ).toBeInTheDocument();
    unmount();
    render(<DetalheAviso aviso={{ ...conta, status: 'resolvido' }} podeTriar={false} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Uma rodada encontrou a conta do médico liberada nesta unidade',
    );
  });

  it('o item criado pela carga lista as tabelas de preço que o usam, recolhidas', async () => {
    const tabelas = Array.from({ length: 40 }, (_, i) => `CLIENTE ${i + 1}`);
    render(
      <DetalheAviso
        aviso={{
          ...pendente,
          tipo: 'catalogo_criado_carga',
          origem: 'carga',
          valor:
            'Categoria SUBCLAVIA: só os preços do dashboards-one a usam (592 linhas, em 40 tabelas)',
          itens: tabelas,
        }}
        podeTriar={false}
      />,
    );
    expect(
      screen.getByRole('list', { name: 'Tabelas de preço que o usam' }).children.length,
    ).toBeLessThan(40);
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar todos os 40' }));
    expect(screen.getByText('CLIENTE 40')).toBeVisible();
  });

  it('sem itens, não mostra a lista', () => {
    render(<DetalheAviso aviso={pendente} podeTriar={false} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('com o motivo digitado e não enviado, avisa quem usa (o painel pergunta antes de fechar)', async () => {
    const onAlterado = vi.fn();
    render(<DetalheAviso aviso={pendente} podeTriar onIgnorar={vi.fn()} onAlterado={onAlterado} />);

    await userEvent.type(screen.getByRole('textbox', { name: /Motivo/ }), 'teste');

    expect(onAlterado).toHaveBeenLastCalledWith(true);
  });
});
