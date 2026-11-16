import { describe, expect, it } from 'vitest';

import { ItemNaoEncontradoError } from '../../catalogo/comum/catalogo.errors';
import { FrentesService } from './frentes.service';
import { InMemoryFrentesRepository, umaFrente } from './testing';

describe('FrentesService', () => {
  it('lista o que o repositório devolve', async () => {
    const repo = new InMemoryFrentesRepository();
    repo.itens.push(umaFrente({ id: 'f-neuro', rotulo: 'NEURO' }));

    await expect(new FrentesService(repo).listar({ pagina: 1, porPagina: 10 })).resolves.toEqual({
      itens: [expect.objectContaining({ id: 'f-neuro', rotulo: 'NEURO' })],
      total: 1,
    });
  });

  it('obtém a frente e avisa quando ela não existe', async () => {
    const repo = new InMemoryFrentesRepository();
    repo.itens.push(umaFrente({ id: 'f-neuro' }));
    const service = new FrentesService(repo);

    await expect(service.obter('f-neuro')).resolves.toMatchObject({ id: 'f-neuro' });
    await expect(service.obter('f-sumiu')).rejects.toThrow(ItemNaoEncontradoError);
  });
});
