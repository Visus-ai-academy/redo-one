import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import { MudarParametrosDemonstrativoDto } from './dto/parametros-demonstrativo.dto';
import { ParametrosDemonstrativoController } from './parametros-demonstrativo.controller';

const reflector = new Reflector();
const exigidas = (alvo: object) => reflector.get(PERMISSOES_EXIGIDAS, alvo as never);

describe('controller dos parâmetros do demonstrativo', () => {
  it('ler pede faturamento.ver; mudar pede faturamento.parametros.editar', () => {
    const p = ParametrosDemonstrativoController.prototype;
    expect(exigidas(p.parametros)).toEqual(['faturamento.ver']);
    expect(exigidas(p.alternativas)).toEqual(['faturamento.ver']);
    expect(exigidas(p.mudarParametros)).toEqual(['faturamento.parametros.editar']);
    expect(exigidas(p.mudarAlternativa)).toEqual(['faturamento.parametros.editar']);
    expect(exigidas(p.reclassificacoes)).toEqual(['faturamento.ver']);
    expect(exigidas(p.criarReclassificacao)).toEqual(['faturamento.parametros.editar']);
    expect(exigidas(p.encerrarReclassificacao)).toEqual(['faturamento.parametros.editar']);
  });

  it('padrões aceitam vazio ou uuid; as marcas são obrigatórias', () => {
    const erros = (corpo: object) =>
      validateSync(plainToInstance(MudarParametrosDemonstrativoDto, corpo)).map((e) => e.property);
    const ok = {
      aPartirDe: '2026-12',
      cobraDuplicados: true,
      cobraClientesInativos: false,
      categoriaPadraoId: null,
      prioridadePadraoId: null,
    };
    expect(erros(ok)).toEqual([]);
    expect(erros({ ...ok, categoriaPadraoId: 'x' })).toEqual(['categoriaPadraoId']);
    expect(erros({ ...ok, cobraDuplicados: undefined })).toEqual(['cobraDuplicados']);
  });
});
