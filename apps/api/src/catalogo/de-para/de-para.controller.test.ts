import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import {
  DeParaEspecialidadesController,
  DeParaModalidadesController,
  DeParaPrioridadesController,
  DeParaValoresExameController,
  SufixosClienteController,
} from './de-para.controller';

describe('controllers dos de-paras', () => {
  const reflector = new Reflector();

  // Os exames fora do padrão ficam na tela Exames (aba própria), com a permissão dela.
  it.each([
    [DeParaPrioridadesController, 'catalogo/de-para/prioridades', 'de-para'],
    [DeParaModalidadesController, 'catalogo/de-para/modalidades', 'de-para'],
    [DeParaEspecialidadesController, 'catalogo/de-para/especialidades', 'de-para'],
    [DeParaValoresExameController, 'catalogo/de-para/valores-exame', 'exames'],
    [SufixosClienteController, 'catalogo/de-para/sufixos-cliente', 'de-para'],
  ])(
    '%o fica em %s; ler exige %s.ver; criar, editar e excluir pelo verbo',
    (Controller, rota, tela) => {
      expect(reflector.get(PATH_METADATA, Controller)).toBe(rota);
      const exigidas = (m: string) =>
        reflector.get(PERMISSOES_EXIGIDAS, (Controller.prototype as never)[m]);
      expect([exigidas('listar'), exigidas('obter')]).toEqual([[`${tela}.ver`], [`${tela}.ver`]]);
      expect([exigidas('criar'), exigidas('atualizar'), exigidas('excluir')]).toEqual([
        [`${tela}.criar`],
        [`${tela}.editar`],
        [`${tela}.excluir`],
      ]);
    },
  );

  it('lista as variações de uma prioridade ou especialidade pelo destino', async () => {
    const listar = vi.fn(async () => ({ itens: [], total: 0 }));
    const prioridades = new DeParaPrioridadesController({ listar } as never);
    const especialidades = new DeParaEspecialidadesController({ listar } as never);
    const modalidades = new DeParaModalidadesController({ listar } as never);

    await prioridades.listar({ pagina: 1, porPagina: 50, prioridadeId: 'p-1' });
    await especialidades.listar({ pagina: 1, porPagina: 50, especialidadeId: 'e-1' });
    await modalidades.listar({ pagina: 1, porPagina: 50, modalidadeId: 'm-1' });

    expect(listar).toHaveBeenNthCalledWith(1, expect.objectContaining({ destinoId: 'p-1' }));
    expect(listar).toHaveBeenNthCalledWith(2, expect.objectContaining({ destinoId: 'e-1' }));
    expect(listar).toHaveBeenNthCalledWith(3, expect.objectContaining({ destinoId: 'm-1' }));
  });
});
