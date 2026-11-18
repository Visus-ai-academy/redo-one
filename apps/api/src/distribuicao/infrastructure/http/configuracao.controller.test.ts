import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type {
  DefinirConfiguracaoGlobal,
  ObterConfiguracaoGlobal,
} from '../../application/use-cases/configuracao-global';
import { CONFIGURACAO_INICIAL } from '../../domain/configuracao-global';
import { ConfiguracaoDistribuicaoController } from './configuracao.controller';

const ator = { tipo: 'usuario', usuarioId: 'u1' } as PrincipalUsuario;
const reflector = new Reflector();
const exigidas = (alvo: object) => reflector.get(PERMISSOES_EXIGIDAS, alvo as never);

describe('controller da configuração global', () => {
  it('ler pede distribuicao-config.ver, gravar pede distribuicao-config.editar', () => {
    const c = ConfiguracaoDistribuicaoController.prototype;
    expect(reflector.get(PATH_METADATA, ConfiguracaoDistribuicaoController)).toBe(
      'distribuicao/configuracao',
    );
    expect(exigidas(c.obter)).toEqual(['distribuicao-config.ver']);
    expect(exigidas(c.salvar)).toEqual(['distribuicao-config.editar']);
  });

  it('devolve a configuração e grava em nome de quem está logado', async () => {
    const obter = { executar: vi.fn(async () => CONFIGURACAO_INICIAL) };
    const definir = { executar: vi.fn(async () => undefined) };
    const c = new ConfiguracaoDistribuicaoController(
      obter as unknown as ObterConfiguracaoGlobal,
      definir as unknown as DefinirConfiguracaoGlobal,
    );
    expect(await c.obter()).toEqual(CONFIGURACAO_INICIAL);
    await c.salvar(ator, CONFIGURACAO_INICIAL);
    expect(definir.executar).toHaveBeenCalledWith(
      { tipo: 'usuario', id: 'u1' },
      CONFIGURACAO_INICIAL,
    );
  });
});
