import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ExameDetalheDto } from '../../gen/types/ExameDetalheDto';
import { escolherOpcao } from '../../test/select';
import { PainelExame, type PainelExameProps } from './PainelExame';

const opcoes = {
  modalidades: [{ id: 'm-ct', nome: 'CT', cor: null }],
  especialidades: [
    { id: 'e-neuro', nome: 'NEURO', cor: null },
    { id: 'e-mi', nome: 'MEDICINA INTERNA', cor: null },
  ],
  subespecialidades: [
    { id: 's-avc', nome: 'AVC', cor: null, especialidadeIds: ['e-neuro'] },
    { id: 's-abd', nome: 'ABDOME', cor: null, especialidadeIds: ['e-mi'] },
  ],
  categoriasExame: [{ id: 'c-angio', nome: 'ANGIO', cor: null }],
  prioridades: [],
  contratados: [],
};

const exame: ExameDetalheDto = {
  id: 'x-1',
  nome: 'TC TORAX E ABDOME',
  codigo: null,
  descricao: null,
  modalidadeId: 'm-ct',
  especialidadeId: 'e-mi',
  subespecialidadeId: null,
  categoriaId: null,
  prioridadeId: null,
  permiteQuebra: true,
  exigeRevisaoManual: false,
  ativo: true,
  quebra: { id: 'q-1', totalPecas: 2 },
};

function montar(props: Partial<PainelExameProps> = {}) {
  const handlers = {
    onSalvar: vi.fn(async () => undefined),
    onAbrirQuebra: vi.fn(),
    onCriarQuebra: vi.fn(async () => undefined),
    onFechar: vi.fn(),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PainelExame opcoes={opcoes} podeEditar podeCriar {...handlers} {...props} />
    </QueryClientProvider>,
  );
  return handlers;
}

describe('PainelExame', () => {
  it('cria com os cadastros ligados; a subespecialidade mostra só as da especialidade escolhida', async () => {
    const { onSalvar } = montar();

    await userEvent.type(screen.getByRole('textbox', { name: 'Nome' }), 'TC CRANIO AVC');
    await escolherOpcao('Modalidade', 'CT');
    await escolherOpcao('Especialidade', 'NEURO');
    await userEvent.click(screen.getByRole('combobox', { name: 'Subespecialidade' }));
    const avc = await screen.findByRole('option', { name: 'AVC' });
    expect(screen.queryByRole('option', { name: 'ABDOME' })).not.toBeInTheDocument();
    await userEvent.click(avc);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Exige revisão manual' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar exame' }));

    expect(onSalvar).toHaveBeenCalledWith({
      nome: 'TC CRANIO AVC',
      codigo: null,
      descricao: null,
      modalidadeId: 'm-ct',
      especialidadeId: 'e-neuro',
      subespecialidadeId: 's-avc',
      categoriaId: null,
      prioridadeId: null,
      permiteQuebra: false,
      exigeRevisaoManual: true,
      ativo: true,
    });
    expect(screen.queryByRole('region', { name: 'Quebra' })).not.toBeInTheDocument();
  });

  it('editando, aponta a quebra do estudo com o mesmo nome', async () => {
    const { onAbrirQuebra } = montar({ exame });

    const quebra = screen.getByRole('region', { name: 'Quebra' });
    expect(quebra).toHaveTextContent('Laudado, este estudo vira 2 exames na cobrança.');
    await userEvent.click(within(quebra).getByRole('button', { name: 'Abrir a quebra' }));
    expect(onAbrirQuebra).toHaveBeenCalledWith('q-1');
  });

  it('sem quebra, oferece criar uma para o estudo', async () => {
    const { onCriarQuebra } = montar({ exame: { ...exame, quebra: null } });

    const quebra = screen.getByRole('region', { name: 'Quebra' });
    expect(quebra).toHaveTextContent('Este estudo não se quebra.');
    await userEvent.click(within(quebra).getByRole('button', { name: 'Criar quebra' }));
    expect(onCriarQuebra).toHaveBeenCalled();
  });

  it('sem permissão de criar, não oferece criar a quebra', () => {
    montar({ exame: { ...exame, quebra: null }, podeCriar: false });

    expect(screen.queryByRole('button', { name: 'Criar quebra' })).not.toBeInTheDocument();
  });

  it('sem editar mas com excluir, o painel só leitura mostra Excluir e confirma', async () => {
    const onExcluir = vi.fn(async () => undefined);
    montar({ exame, podeEditar: false, onExcluir });

    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Excluir exame' }));
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Excluir exame' }).at(-1) as HTMLElement,
    );

    expect(onExcluir).toHaveBeenCalled();
  });

  it('editando, o Histórico vem numa aba depois do cadastro (com a quebra)', async () => {
    montar({ exame, historico: <p>conteúdo do histórico</p> });

    expect(screen.getAllByRole('tab').map((aba) => aba.textContent)).toEqual([
      'Cadastro',
      'Histórico',
    ]);
    expect(screen.getByRole('button', { name: 'Abrir a quebra' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Histórico' }));
    expect(screen.getByText('conteúdo do histórico')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir a quebra' })).not.toBeInTheDocument();
  });

  describe('só a subespecialidade (exames.subespecialidade.editar)', () => {
    const restrito = (props: Partial<PainelExameProps> = {}) => {
      const onSalvarSubespecialidade = vi.fn(async () => undefined);
      const handlers = montar({
        exame,
        podeEditar: false,
        podeCriar: false,
        onSalvarSubespecialidade,
        ...props,
      });
      return { ...handlers, onSalvarSubespecialidade };
    };

    it('mostra os outros campos só para leitura e só a subespecialidade editável', () => {
      restrito();

      expect(screen.getByRole('combobox', { name: 'Subespecialidade' })).toBeInTheDocument();
      for (const campo of ['Nome', 'Código', 'Descrição']) {
        expect(screen.queryByRole('textbox', { name: campo })).not.toBeInTheDocument();
      }
      for (const campo of ['Modalidade', 'Especialidade', 'Categoria', 'Prioridade']) {
        expect(screen.queryByRole('combobox', { name: campo })).not.toBeInTheDocument();
      }
      expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
      const especialidade = screen.getByRole('textbox', { name: 'Especialidade' });
      expect(especialidade).toHaveValue('MEDICINA INTERNA');
      expect(especialidade).toHaveAttribute('readonly');
    });

    it('sem botões de criar, excluir ou mexer na quebra; só o salvar', () => {
      restrito({ exame: { ...exame, quebra: null } });

      expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
      for (const botao of ['Criar exame', 'Excluir exame', 'Criar quebra']) {
        expect(screen.queryByRole('button', { name: botao })).not.toBeInTheDocument();
      }
    });

    it('não mostra nada de quebras, nem o botão de abrir a quebra', () => {
      restrito();

      expect(screen.queryByRole('heading', { name: 'Quebra' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Abrir a quebra' })).not.toBeInTheDocument();
      expect(screen.queryByText(/vira 2 exames/)).not.toBeInTheDocument();
    });

    it('oferece só as subespecialidades da especialidade do exame e salva só ela', async () => {
      const { onSalvar, onSalvarSubespecialidade } = restrito();

      await userEvent.click(screen.getByRole('combobox', { name: 'Subespecialidade' }));
      const abdome = await screen.findByRole('option', { name: 'ABDOME' });
      expect(screen.queryByRole('option', { name: 'AVC' })).not.toBeInTheDocument();
      await userEvent.click(abdome);
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      expect(onSalvarSubespecialidade).toHaveBeenCalledWith('s-abd');
      expect(onSalvar).not.toHaveBeenCalled();
    });

    it('voltar para "Sem subespecialidade" salva nulo', async () => {
      const { onSalvarSubespecialidade } = restrito({
        exame: { ...exame, subespecialidadeId: 's-abd' },
      });

      await escolherOpcao('Subespecialidade', 'Sem subespecialidade');
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      expect(onSalvarSubespecialidade).toHaveBeenCalledWith(null);
    });

    it('sem a permissão, o painel só leitura não tem campo nem salvar', () => {
      montar({ exame, podeEditar: false, podeCriar: false });

      expect(screen.queryByRole('combobox', { name: 'Subespecialidade' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    });

    it('quem edita o exame inteiro continua com o formulário completo', () => {
      restrito({ podeEditar: true });

      expect(screen.getByRole('textbox', { name: 'Nome' })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Especialidade' })).toBeInTheDocument();
    });
  });
});
