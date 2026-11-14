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
  regrasQuebra: [
    { id: 'r-1', exameDestino: { id: 'x-2', nome: 'TC ABDOME' }, categoria: null, ativo: true },
  ],
};

function montar(props: Partial<PainelExameProps> = {}) {
  const handlers = {
    onSalvar: vi.fn(async () => undefined),
    onCriarRegra: vi.fn(async () => undefined),
    onAtualizarRegra: vi.fn(async () => undefined),
    onExcluirRegra: vi.fn(async () => undefined),
    onFechar: vi.fn(),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PainelExame
        opcoes={opcoes}
        buscarExames={async () => [{ valor: 'x-3', rotulo: 'TC TORAX' }]}
        podeEditar
        {...handlers}
        {...props}
      />
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
    expect(screen.queryByRole('region', { name: 'Regras de quebra' })).not.toBeInTheDocument();
  });

  it('editando, lista as regras de quebra, adiciona, desativa e remove', async () => {
    const { onCriarRegra, onAtualizarRegra, onExcluirRegra } = montar({ exame });

    const regras = screen.getByRole('region', { name: 'Regras de quebra' });
    expect(within(regras).getByText('TC ABDOME')).toBeInTheDocument();

    await userEvent.type(
      within(regras).getByRole('combobox', { name: 'Exame em que se quebra' }),
      'tc',
    );
    await userEvent.click(await screen.findByRole('option', { name: 'TC TORAX' }));
    await escolherOpcao('Categoria da linha quebrada', 'ANGIO');
    await userEvent.click(within(regras).getByRole('button', { name: 'Adicionar regra' }));
    expect(onCriarRegra).toHaveBeenCalledWith({
      exameDestinoId: 'x-3',
      categoriaId: 'c-angio',
      ativo: true,
    });

    await userEvent.click(
      within(regras).getByRole('checkbox', { name: 'Regra para TC ABDOME ativa' }),
    );
    expect(onAtualizarRegra).toHaveBeenCalledWith('r-1', {
      exameDestinoId: 'x-2',
      categoriaId: null,
      ativo: false,
    });

    await userEvent.click(
      within(regras).getByRole('button', { name: 'Remover regra para TC ABDOME' }),
    );
    expect(onExcluirRegra).toHaveBeenCalledWith('r-1');
  });
});
