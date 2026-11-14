import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { invalidarMedicos } from './medicos';

describe('invalidarMedicos', () => {
  it('refaz as consultas de médicos, equipes, níveis e usuários, e só elas', async () => {
    const queryClient = new QueryClient();
    const urls = [
      '/medicos',
      '/medicos/{id}',
      '/equipes',
      '/niveis-medico',
      '/usuarios',
      '/catalogo/clientes',
    ];
    for (const url of urls) queryClient.setQueryData([{ url }], 1);

    await invalidarMedicos(queryClient);

    const invalidadas = urls.filter((url) => queryClient.getQueryState([{ url }])?.isInvalidated);
    expect(invalidadas).toEqual([
      '/medicos',
      '/medicos/{id}',
      '/equipes',
      '/niveis-medico',
      '/usuarios',
    ]);
  });
});
