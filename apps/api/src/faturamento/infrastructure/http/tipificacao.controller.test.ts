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
        t.mudarFatura,
        t.removerFatura,
        c.salvar,
        c.previa,
        c.removerVersao,
      ].map(exigidas),
    ).toEqual(Array(10).fill(['faturamento.tipificacao.editar']));
  });

  it('grava em nome de quem está logado, a partir da competência pedida', async () => {
    const salvar = { executar: vi.fn(async () => undefined) };
    const c = new TipificacaoClienteController(
      {} as never,
      salvar as never,
      {} as never,
      {} as never,
    );
    const configuracao = { regraId: null, subregraDemaisId: null, linhas: [] };
    await c.salvar(ator, 'c1', { ...configuracao, aPartirDe: '2026-12' });
    expect(salvar.executar).toHaveBeenCalledWith('u1', 'c1', configuracao, '2026-12');
  });

  it('o "fatura" muda pela regra ou pela sub-regra do caminho', async () => {
    const fatura = { mudar: vi.fn(async () => undefined), remover: vi.fn(async () => undefined) };
    const t = new TipificacaoController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      fatura as never,
    );
    await t.mudarFatura(ator, 'subregras', 's1', { fatura: true, aPartirDe: '2026-12' });
    expect(fatura.mudar).toHaveBeenCalledWith(
      'u1',
      { tipo: 'subregra', id: 's1' },
      true,
      '2026-12',
    );
    await t.removerFatura(ator, 'regras', 'r1', 'v1');
    expect(fatura.remover).toHaveBeenCalledWith('u1', { tipo: 'regra', id: 'r1' }, 'v1');
  });
});
