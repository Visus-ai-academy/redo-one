import { describe, expect, it } from 'vitest';

import {
  type AlternativaPreco,
  type ArranjoRepasse,
  buscarPrecoRepasse,
  type PrecoRepasse,
} from './busca-preco';

const ARRANJO: ArranjoRepasse = {
  modalidadeId: 'mr',
  especialidadeId: 'neuro',
  categoriaId: 'colunas',
  prioridadeId: 'rotina',
};
const LAUDO = { clienteId: 'cli', unidadeId: null };
let seq = 0;
const preco = (p: Partial<PrecoRepasse> = {}): PrecoRepasse => ({
  id: `p-${++seq}`,
  modalidadeId: 'mr',
  especialidadeId: 'neuro',
  categoriaId: 'colunas',
  prioridadeId: 'rotina',
  clienteId: null,
  valorCentavos: 5000,
  ...p,
});
const SEM: AlternativaPreco[] = [];

describe('buscarPrecoRepasse', () => {
  it('usa o preço do médico para todos os clientes', () => {
    const p = preco();
    expect(buscarPrecoRepasse(ARRANJO, LAUDO, [p], SEM, null)).toEqual({
      encontrado: true,
      valorCentavos: 5000,
      origem: 'todos',
      precoId: p.id,
      categoriaPrecoId: null,
    });
  });

  it('o preço do cliente vence o de todos', () => {
    const cliente = preco({ clienteId: 'cli', valorCentavos: 7000 });
    const r = buscarPrecoRepasse(ARRANJO, LAUDO, [preco(), cliente], SEM, null);
    expect(r).toMatchObject({ valorCentavos: 7000, origem: 'cliente', precoId: cliente.id });
  });

  it('o preço da unidade vence o do principal', () => {
    const unidade = preco({ clienteId: 'uni', valorCentavos: 8000 });
    const r = buscarPrecoRepasse(
      ARRANJO,
      { clienteId: 'cli', unidadeId: 'uni' },
      [preco({ clienteId: 'cli' }), unidade],
      SEM,
      null,
    );
    expect(r).toMatchObject({ valorCentavos: 8000, origem: 'unidade' });
  });

  it('ignora o preço de outro cliente', () => {
    const r = buscarPrecoRepasse(ARRANJO, LAUDO, [preco({ clienteId: 'outro' })], SEM, null);
    expect(r).toEqual({ encontrado: false });
  });

  it('exige o arranjo inteiro: outra prioridade não serve', () => {
    const r = buscarPrecoRepasse(ARRANJO, LAUDO, [preco({ prioridadeId: 'urgencia' })], SEM, null);
    expect(r).toEqual({ encontrado: false });
  });

  it('a tarifa própria substitui os preços', () => {
    expect(buscarPrecoRepasse(ARRANJO, LAUDO, [preco()], SEM, 4700)).toEqual({
      encontrado: true,
      valorCentavos: 4700,
      origem: 'tarifa_propria',
      precoId: null,
      categoriaPrecoId: null,
    });
  });

  it('sem preço no arranjo, tenta a categoria alternativa da especialidade', () => {
    const sc = preco({ categoriaId: 'sc', valorCentavos: 6000 });
    const alternativas: AlternativaPreco[] = [
      {
        especialidadeId: 'neuro',
        semCategoria: false,
        categoriaOrigemId: 'colunas',
        categoriaDestinoId: 'sc',
      },
    ];
    expect(buscarPrecoRepasse(ARRANJO, LAUDO, [sc], alternativas, null)).toEqual({
      encontrado: true,
      valorCentavos: 6000,
      origem: 'todos',
      precoId: sc.id,
      categoriaPrecoId: 'sc',
    });
  });

  it('a alternativa de outra especialidade não vale', () => {
    const alternativas: AlternativaPreco[] = [
      {
        especialidadeId: 'mi',
        semCategoria: false,
        categoriaOrigemId: 'colunas',
        categoriaDestinoId: 'sc',
      },
    ];
    const r = buscarPrecoRepasse(
      ARRANJO,
      LAUDO,
      [preco({ categoriaId: 'sc' })],
      alternativas,
      null,
    );
    expect(r).toEqual({ encontrado: false });
  });

  it('o preço do próprio arranjo vem antes da alternativa', () => {
    const exato = preco({ valorCentavos: 5000 });
    const alternativas: AlternativaPreco[] = [
      {
        especialidadeId: null,
        semCategoria: false,
        categoriaOrigemId: 'colunas',
        categoriaDestinoId: 'sc',
      },
    ];
    const r = buscarPrecoRepasse(
      ARRANJO,
      LAUDO,
      [exato, preco({ categoriaId: 'sc', valorCentavos: 1 })],
      alternativas,
      null,
    );
    expect(r).toMatchObject({ precoId: exato.id, categoriaPrecoId: null });
  });

  it('laudo sem categoria usa a alternativa de "sem categoria"', () => {
    const sc = preco({ categoriaId: 'sc' });
    const alternativas: AlternativaPreco[] = [
      {
        especialidadeId: null,
        semCategoria: true,
        categoriaOrigemId: null,
        categoriaDestinoId: 'sc',
      },
    ];
    const r = buscarPrecoRepasse(
      { ...ARRANJO, categoriaId: null },
      LAUDO,
      [sc],
      alternativas,
      null,
    );
    expect(r).toMatchObject({ encontrado: true, precoId: sc.id, categoriaPrecoId: 'sc' });
  });

  it('laudo sem modalidade, especialidade ou prioridade fica sem preço', () => {
    for (const falta of ['modalidadeId', 'especialidadeId', 'prioridadeId'] as const) {
      const r = buscarPrecoRepasse({ ...ARRANJO, [falta]: null }, LAUDO, [preco()], SEM, null);
      expect(r).toEqual({ encontrado: false });
    }
  });

  it('preço zero é preço, não "sem preço"', () => {
    const r = buscarPrecoRepasse(ARRANJO, LAUDO, [preco({ valorCentavos: 0 })], SEM, null);
    expect(r).toMatchObject({ encontrado: true, valorCentavos: 0 });
  });
});
