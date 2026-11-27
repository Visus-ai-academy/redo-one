import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { contaPorExtenso, formatarDia, invalidarFinanceiro, rotuloDaCategoria } from './financeiro';

describe('invalidarFinanceiro', () => {
  it('invalida só as consultas do financeiro', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData([{ url: '/financeiro/categorias' }], 1);
    queryClient.setQueryData([{ url: '/catalogo/contratados' }], 2);

    await invalidarFinanceiro(queryClient);

    expect(queryClient.getQueryState([{ url: '/financeiro/categorias' }])?.isInvalidated).toBe(
      true,
    );
    expect(queryClient.getQueryState([{ url: '/catalogo/contratados' }])?.isInvalidated).toBe(
      false,
    );
  });
});

describe('rotuloDaCategoria', () => {
  it('a categoria de um grupo leva o nome dele na frente', () => {
    expect(rotuloDaCategoria({ nome: 'Aluguel', grupoNome: 'Ocupação' })).toBe(
      'Ocupação › Aluguel',
    );
    expect(rotuloDaCategoria({ nome: 'Ocupação', grupoNome: null })).toBe('Ocupação');
  });
});

describe('formatarDia e contaPorExtenso', () => {
  it('dia no formato brasileiro', () => {
    expect(formatarDia('2026-12-01')).toBe('01/12/2026');
  });

  it('banco, agência e conta com dígito; o que falta some', () => {
    expect(
      contaPorExtenso({ bancoCodigo: '341', agencia: '0123', conta: '45678', digito: '9' }),
    ).toBe('341 · 0123 · 45678-9');
    expect(contaPorExtenso({ bancoCodigo: null, agencia: null, conta: null, digito: null })).toBe(
      '—',
    );
  });
});
