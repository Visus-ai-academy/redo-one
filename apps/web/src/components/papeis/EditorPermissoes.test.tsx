import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EditorPermissoes, type EditorPermissoesProps } from './EditorPermissoes';
import type { CatalogoMatriz } from './matriz-permissoes';

const padrao = (
  tela: string,
  acoes: ('ver' | 'criar' | 'editar' | 'excluir')[],
  sensiveis: string[] = [],
) =>
  acoes.map((acao) => ({
    acao,
    chave: `${tela}.${acao}`,
    rotulo: { ver: 'Ver', criar: 'Criar', editar: 'Editar', excluir: 'Excluir' }[acao],
    sensivel: sensiveis.includes(acao),
  }));

const catalogo: CatalogoMatriz = [
  {
    tela: 'volumetria',
    rotulo: 'Volumetria',
    area: 'Painéis',
    padrao: padrao('volumetria', ['ver']),
    especiais: [
      { chave: 'volumetria.exportar', rotulo: 'Exportar', descricao: '', sensivel: false },
    ],
    exige: [],
  },
  {
    tela: 'clientes',
    rotulo: 'Clientes',
    area: 'Cadastros',
    padrao: padrao('clientes', ['ver', 'criar', 'editar', 'excluir']),
    especiais: [],
    exige: [],
  },
  {
    tela: 'exames',
    rotulo: 'Exames',
    area: 'Cadastros',
    padrao: padrao('exames', ['ver', 'criar', 'editar', 'excluir'], ['editar', 'excluir']),
    especiais: [],
    exige: [],
  },
  {
    tela: 'repasse',
    rotulo: 'Repasse',
    area: 'Financeiro',
    padrao: padrao('repasse', ['ver']),
    especiais: [
      {
        chave: 'repasse.adicional.lancar',
        rotulo: 'Lançar adicional',
        descricao: '',
        sensivel: false,
      },
      {
        chave: 'repasse.fechar',
        rotulo: 'Fechar repasse',
        descricao: 'Fecha o repasse da competência.',
        sensivel: true,
      },
    ],
    exige: [],
  },
];

const ADMIN = { acessoTotal: true, permissoes: [] };

function montar(props: Partial<EditorPermissoesProps> = {}) {
  const onChange = vi.fn();
  render(
    <EditorPermissoes
      catalogo={catalogo}
      marcadas={new Set(['repasse.ver', 'repasse.fechar'])}
      onChange={onChange}
      acesso={ADMIN}
      {...props}
    />,
  );
  return onChange;
}

const caixa = (nome: string) => screen.getByRole('checkbox', { name: nome });

describe('EditorPermissoes', () => {
  it('mostra as telas por área, com uma caixa por ação e "—" onde a tela não tem a ação', () => {
    montar();

    expect(screen.getByRole('button', { name: /Cadastros/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(caixa('Repasse: Ver')).toBeChecked();
    expect(caixa('Clientes: Criar')).not.toBeChecked();
    const linha = screen.getByRole('row', { name: /Volumetria/ });
    expect(within(linha).queryByRole('checkbox', { name: /Criar/ })).not.toBeInTheDocument();
    expect(within(linha).getAllByText('Não se aplica')).toHaveLength(3);
  });

  it('marcar uma ação marca o ver da tela', async () => {
    const onChange = montar();

    await userEvent.click(caixa('Clientes: Criar'));

    expect(onChange).toHaveBeenCalledWith(
      new Set(['repasse.ver', 'repasse.fechar', 'clientes.criar', 'clientes.ver']),
    );
  });

  it('desmarcar o ver limpa a linha', async () => {
    const onChange = montar();

    await userEvent.click(caixa('Repasse: Ver'));

    expect(onChange).toHaveBeenCalledWith(new Set());
  });

  it('a ação sensível leva o indicador no nome e a explicação na dica', async () => {
    montar();

    await userEvent.hover(caixa('Exames: Editar (sensível)'));

    expect(await screen.findByText(/^Ação sensível/)).toBeInTheDocument();
  });

  it('o rótulo próprio da ação vai na dica e no nome da caixa, não na célula', async () => {
    montar({
      catalogo: [
        {
          tela: 'importacao',
          rotulo: 'Importação',
          area: 'Operação',
          padrao: [
            ...padrao('importacao', ['ver']),
            {
              acao: 'criar',
              chave: 'importacao.criar',
              rotulo: 'Enviar planilha',
              sensivel: false,
            },
          ],
          especiais: [],
          exige: [],
        },
      ],
    });

    const linha = screen.getByRole('row', { name: /Importação/ });
    expect(linha).not.toHaveTextContent('Enviar planilha');
    await userEvent.hover(caixa('Importação: Enviar planilha'));
    expect(await screen.findByText('Enviar planilha')).toBeInTheDocument();
  });

  it('clicar no nome da tela marca a linha toda', async () => {
    const onChange = montar();

    await userEvent.click(screen.getByRole('button', { name: 'Clientes' }));

    expect(onChange).toHaveBeenCalledWith(
      new Set([
        'repasse.ver',
        'repasse.fechar',
        'clientes.ver',
        'clientes.criar',
        'clientes.editar',
        'clientes.excluir',
      ]),
    );
  });

  it('a caixa do cabeçalho da área marca a coluna na área', async () => {
    const onChange = montar();

    await userEvent.click(caixa('Excluir em Cadastros'));

    expect(onChange).toHaveBeenCalledWith(
      new Set([
        'repasse.ver',
        'repasse.fechar',
        'clientes.excluir',
        'clientes.ver',
        'exames.excluir',
        'exames.ver',
      ]),
    );
  });

  it('a área fechada mostra o resumo', async () => {
    montar();

    await userEvent.click(screen.getByRole('button', { name: /Financeiro/ }));

    const area = screen.getByRole('button', { name: /Financeiro/ });
    expect(area).toHaveAttribute('aria-expanded', 'false');
    expect(area).toHaveTextContent('1 de 1 tela');
    expect(screen.getByRole('button', { name: /Cadastros/ })).not.toHaveTextContent('Sem acesso');
  });

  it('as especiais abrem num popover com o contador', async () => {
    const onChange = montar();

    await userEvent.click(screen.getByRole('button', { name: 'Especiais de Repasse: 1 de 2' }));

    const popover = await screen.findByRole('dialog');
    expect(within(popover).getByRole('checkbox', { name: /Fechar repasse/ })).toBeChecked();
    expect(popover).toHaveTextContent('Fecha o repasse da competência.');
    expect(popover).toHaveTextContent('Sensível');

    await userEvent.click(within(popover).getByRole('checkbox', { name: /Lançar adicional/ }));

    expect(onChange).toHaveBeenCalledWith(
      new Set(['repasse.ver', 'repasse.fechar', 'repasse.adicional.lancar']),
    );
  });

  it('"Só leitura" marca o ver de todas as telas', async () => {
    const onChange = montar();

    await userEvent.click(screen.getByRole('button', { name: 'Só leitura' }));

    expect(onChange).toHaveBeenCalledWith(
      new Set(['repasse.ver', 'repasse.fechar', 'volumetria.ver', 'clientes.ver', 'exames.ver']),
    );
  });

  it('copia as permissões de outro papel', async () => {
    const obterPapel = vi.fn().mockResolvedValue({
      acessoTotal: false,
      permissoes: ['clientes.editar'],
    });
    const onChange = montar({ papeisParaCopiar: [{ id: 'p1', nome: 'Financeiro' }], obterPapel });

    await userEvent.click(screen.getByRole('button', { name: /Copiar de outro papel/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Financeiro' }));

    expect(obterPapel).toHaveBeenCalledWith('p1');
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(new Set(['clientes.editar', 'clientes.ver'])),
    );
  });

  it('busca a tela pelo nome', async () => {
    montar();

    await userEvent.type(screen.getByLabelText('Buscar tela'), 'exam');

    expect(screen.queryByRole('button', { name: 'Clientes' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exames' })).toBeInTheDocument();
  });

  it('o que quem edita não tem fica travado', () => {
    montar({ acesso: { acessoTotal: false, permissoes: ['repasse.ver'] } });

    expect(caixa('Repasse: Ver')).not.toHaveAttribute('aria-disabled');
    expect(caixa('Clientes: Ver')).toHaveAttribute('aria-disabled', 'true');
  });

  it('só leitura trava tudo e esconde as ações em massa', () => {
    montar({ somenteLeitura: true });

    for (const controle of screen.getAllByRole('checkbox')) {
      expect(controle).toHaveAttribute('aria-disabled', 'true');
    }
    expect(screen.queryByRole('button', { name: 'Só leitura' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clientes' })).toBeDisabled();
  });
});
