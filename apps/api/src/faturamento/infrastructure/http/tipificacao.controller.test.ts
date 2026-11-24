import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import { TipificacaoClienteController, TipificacaoController } from './tipificacao.controller';

const reflector = new Reflector();
const exigidas = (alvo: object) => reflector.get(PERMISSOES_EXIGIDAS, alvo as never);
const ator = { tipo: 'usuario', usuarioId: 'u1' } as PrincipalUsuario;

describe('controllers da tipificação', () => {
  it('ver pede faturamento.ver; mudar e a prévia pedem faturamento.tipificacao.editar', () => {
    const t = TipificacaoController.prototype;
    const c = TipificacaoClienteController.prototype;
    expect(reflector.get(PATH_METADATA, TipificacaoController)).toBe('faturamento/tipificacao');
    expect(reflector.get(PATH_METADATA, TipificacaoClienteController)).toBe(
      'faturamento/clientes/:clienteId/tipificacao',
    );
    expect([t.listar, t.opcoes, c.obter].map(exigidas)).toEqual([
      ['faturamento.ver'],
      ['faturamento.ver'],
      ['faturamento.ver'],
    ]);
    expect(
      [
        t.criarRegra,
        t.alterarRegra,
        t.criarSubregra,
        t.alterarSubregra,
        t.medicos,
        c.salvar,
        c.previa,
      ].map(exigidas),
    ).toEqual(Array(7).fill(['faturamento.tipificacao.editar']));
  });

  it('grava em nome de quem está logado', async () => {
    const salvar = { executar: vi.fn(async () => undefined) };
    const c = new TipificacaoClienteController({} as never, salvar as never, {} as never);
    const corpo = { regraId: null, subregraDemaisId: null, linhas: [] };
    await c.salvar(ator, 'c1', corpo);
    expect(salvar.executar).toHaveBeenCalledWith('u1', 'c1', corpo);
  });
});
