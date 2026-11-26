import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import { AjustesLaudoController } from './ajustes-laudo.controller';

const reflector = new Reflector();
const exigidas = (alvo: object) => reflector.get(PERMISSOES_EXIGIDAS, alvo as never);

describe('controller dos ajustes de laudo', () => {
  it('ver pede faturamento.ver; criar e encerrar pedem a permissão própria', () => {
    const p = AjustesLaudoController.prototype;
    expect(exigidas(p.listar)).toEqual(['faturamento.ver']);
    expect(exigidas(p.criar)).toEqual(['faturamento.ajuste_laudo.editar']);
    expect(exigidas(p.encerrar)).toEqual(['faturamento.ajuste_laudo.editar']);
  });
});
