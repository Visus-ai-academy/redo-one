import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { invalidarFinanceiro, rotuloDaCategoria } from './financeiro';

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
