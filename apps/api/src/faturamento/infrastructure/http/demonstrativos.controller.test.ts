import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import { DemonstrativosController } from './demonstrativos.controller';

const reflector = new Reflector();
const exigidas = (alvo: object) => reflector.get(PERMISSOES_EXIGIDAS, alvo as never);

describe('controller dos demonstrativos', () => {
  it('toda leitura pede faturamento.ver', () => {
    const p = DemonstrativosController.prototype;
    expect(exigidas(p.listar)).toEqual(['faturamento.ver']);
    expect(exigidas(p.cliente)).toEqual(['faturamento.ver']);
    expect(exigidas(p.laudo)).toEqual(['faturamento.ver']);
  });
});
