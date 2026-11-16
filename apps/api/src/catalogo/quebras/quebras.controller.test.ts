import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import { QuebrasController } from './quebras.controller';

describe('QuebrasController', () => {
  const reflector = new Reflector();

  it('fica em /catalogo/quebras; ler exige exames.ver; mudar (inclusive peças) segue o verbo', () => {
    expect(reflector.get(PATH_METADATA, QuebrasController)).toBe('catalogo/quebras');
    const exigidas = (m: keyof QuebrasController) =>
      reflector.get(PERMISSOES_EXIGIDAS, QuebrasController.prototype[m]);
    expect([exigidas('listar'), exigidas('obter')]).toEqual([['exames.ver'], ['exames.ver']]);
    const esperado = {
      criar: 'exames.criar',
      atualizar: 'exames.editar',
      excluir: 'exames.excluir',
      adicionarPeca: 'exames.criar',
      atualizarPeca: 'exames.editar',
      removerPeca: 'exames.excluir',
    } as const;
    for (const [m, chave] of Object.entries(esperado)) {
      expect(exigidas(m as keyof typeof esperado)).toEqual([chave]);
    }
  });
});
