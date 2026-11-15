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
      <PainelExame opcoes={opcoes} podeEditar {...handlers} {...props} />
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

  it('sem permissão de editar, não oferece criar a quebra', () => {
    montar({ exame: { ...exame, quebra: null }, podeEditar: false });

    expect(screen.queryByRole('button', { name: 'Criar quebra' })).not.toBeInTheDocument();
  });
});
