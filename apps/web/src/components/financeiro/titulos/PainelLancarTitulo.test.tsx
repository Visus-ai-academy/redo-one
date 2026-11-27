import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { CategoriaItemDto } from '../../../gen/types/CategoriaItemDto';
import type { ContaBancariaItemDto } from '../../../gen/types/ContaBancariaItemDto';
import type { TituloDetalheDto } from '../../../gen/types/TituloDetalheDto';
import { escolherOpcao } from '../../../test/select';
import { PainelLancarTitulo } from './PainelLancarTitulo';

const empresas = [{ id: 'tele', nome: '001 TELEIMAGEM' }];
const categoria = (id: string, nome: string): CategoriaItemDto =>
  ({ id, nome, tipo: 'despesa', grupoNome: null, paiId: null, ativa: true }) as CategoriaItemDto;
const categorias = [categoria('cat-cont', 'Contabilidade'), categoria('cat-alu', 'Aluguel')];
const contas = [
  { id: 'cb-1', contratadoId: 'tele', apelido: 'Itaú movimento' },
  { id: 'cb-2', contratadoId: 'outra', apelido: 'Outra empresa' },
] as ContaBancariaItemDto[];
const buscarFavorecidos = vi.fn(async () => [
  {
    tipo: 'fornecedor' as const,
    id: 'f-1',
    nome: 'Contabilidade Ômega',
    detalhe: null,
    categoriaPadraoId: 'cat-cont',
  },
  { tipo: 'medico' as const, id: 'm-1', nome: 'Ana Prado', detalhe: null, categoriaPadraoId: null },
]);

const comQuery = (ui: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('PainelLancarTitulo', () => {
  it('lança a despesa com a categoria padrão do fornecedor e o valor em centavos', async () => {
    const onSalvar = vi.fn(async () => undefined);
    comQuery(
      <PainelLancarTitulo
        tipo="pagar"
        empresas={empresas}
        categorias={categorias}
        contas={contas}
        buscarFavorecidos={buscarFavorecidos}
        onSalvar={onSalvar}
        onFechar={vi.fn()}
      />,
    );

    await userEvent.type(await screen.findByRole('combobox', { name: 'Favorecido' }), 'ome');
    await userEvent.click(await screen.findByRole('option', { name: /Contabilidade Ômega/ }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Descrição' }), 'Honorários');
    await userEvent.clear(screen.getByRole('textbox', { name: 'Emissão' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Emissão' }), '01/12/2026');
    await userEvent.type(screen.getByRole('textbox', { name: 'Vencimento' }), '05/12/2026');
    await userEvent.type(screen.getByRole('textbox', { name: 'Valor (R$)' }), '3.800,00');
    await userEvent.type(screen.getByRole('textbox', { name: 'Competência' }), '12/2026');
    await escolherOpcao('Conta prevista', 'Itaú movimento');
    expect(screen.queryByRole('option', { name: 'Outra empresa' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Lançar despesa' }));

    await waitFor(() =>
      expect(onSalvar).toHaveBeenCalledWith({
        contratadoId: 'tele',
        favorecido: { tipo: 'fornecedor', id: 'f-1' },
        categoriaId: 'cat-cont',
        descricao: 'Honorários',
        documento: null,
        competencia: '2026-12',
        emissaoEm: '2026-12-01',
        vencimento: '2026-12-05',
        valorCentavos: 380_000,
        contaPrevistaId: 'cb-1',
        observacoes: null,
      }),
    );
  });

  it('diz o que falta e recusa vencimento antes da emissão', async () => {
    const onSalvar = vi.fn();
    comQuery(
      <PainelLancarTitulo
        tipo="pagar"
        empresas={empresas}
        categorias={categorias}
        contas={contas}
        buscarFavorecidos={buscarFavorecidos}
        onSalvar={onSalvar}
        onFechar={vi.fn()}
      />,
    );
    await userEvent.clear(screen.getByRole('textbox', { name: 'Emissão' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Emissão' }), '10/12/2026');
    await userEvent.type(screen.getByRole('textbox', { name: 'Vencimento' }), '05/12/2026');
    await userEvent.click(screen.getByRole('button', { name: 'Lançar despesa' }));

    expect(await screen.findByText('Escolha o favorecido.')).toBeInTheDocument();
    expect(screen.getByText('Escolha a categoria.')).toBeInTheDocument();
    expect(screen.getByText('Informe a descrição.')).toBeInTheDocument();
    expect(screen.getByText('O vencimento não pode ser antes da emissão.')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('editando título de outra origem, valor e favorecido ficam só leitura', () => {
    const titulo = {
      id: 't1',
      tipo: 'receber',
      numero: 7,
      contratadoId: 'tele',
      empresaNome: '001 TELEIMAGEM',
      favorecido: { tipo: 'cliente', id: 'c1', nome: 'HCLONDRINA' },
      categoriaId: 'cat-cont',
      categoriaNome: 'Contabilidade',
      descricao: 'Laudos',
      documento: null,
      competencia: '2026-10',
      emissaoEm: '2026-11-01',
      vencimento: '2026-11-10',
      valorCentavos: 1_245_000,
      pagoCentavos: 0,
      situacao: 'aberto',
      origem: 'faturamento',
      contaPrevistaId: null,
      contaPrevistaNome: null,
      vencimentoOriginal: null,
      observacoes: null,
      canceladoEm: null,
      motivoCancelamento: null,
      criadoEm: '2026-11-01T12:00:00Z',
      diasDeAtraso: 0,
      baixas: [],
    } as unknown as TituloDetalheDto;
    comQuery(
      <PainelLancarTitulo
        tipo="receber"
        titulo={titulo}
        empresas={empresas}
        categorias={categorias}
        contas={contas}
        buscarFavorecidos={buscarFavorecidos}
        onSalvar={vi.fn()}
        onFechar={vi.fn()}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Valor (R$)' })).toHaveAttribute('readonly');
    expect(screen.getByRole('textbox', { name: 'Cliente' })).toHaveValue('HCLONDRINA');
    expect(screen.getByRole('textbox', { name: 'Competência' })).toHaveValue('10/2026');
    expect(screen.getByText(/Cliente e valor não se editam aqui/)).toBeInTheDocument();
  });
});
