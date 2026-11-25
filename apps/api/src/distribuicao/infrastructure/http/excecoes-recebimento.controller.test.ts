import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type * as Casos from '../../application/use-cases/excecoes-recebimento';
import { ConfiguracaoInvalidaError } from '../../domain/validacao';
import { ExcecoesRecebimentoController } from './excecoes-recebimento.controller';

const ator = { tipo: 'usuario', usuarioId: 'u1' } as PrincipalUsuario;
const quem = { tipo: 'usuario', id: 'u1' };
const reflector = new Reflector();
const exigidas = (alvo: object) => reflector.get(PERMISSOES_EXIGIDAS, alvo as never);
const caso = <T>(executar: (...a: never[]) => unknown) => ({ executar: vi.fn(executar) }) as T;

const criadoEm = new Date('2026-11-25T12:00:00Z');
const LISTADA = {
  id: 'x1',
  turnoId: 't-lista',
  frente: { tipo: 'especialidade' as const, especialidadeId: 'neuro', modalidadeId: null },
  prioridadeOperacaoId: null,
  regra: { tipo: 'prazo_minimo' as const, horas: 12 },
  de: '2026-11-25',
  ate: '2026-12-22',
  criadoEm,
  situacao: 'vigente' as const,
  podeExcluir: true,
  empatesIds: [],
};

const montar = () => {
  const casos = {
    listar: caso<Casos.ListarExcecoesRecebimento>(async () => [LISTADA]),
    criar: caso<Casos.CriarExcecaoRecebimento>(async () => 'x9'),
    editar: caso<Casos.EditarExcecaoRecebimento>(async () => undefined),
    encerrar: caso<Casos.EncerrarExcecaoRecebimento>(async () => undefined),
    excluir: caso<Casos.ExcluirExcecaoRecebimento>(async () => undefined),
  };
  const c = new ExcecoesRecebimentoController(
    casos.listar,
    casos.criar,
    casos.editar,
    casos.encerrar,
    casos.excluir,
  );
  return { c, casos };
};

describe('controller das exceções da grade de recebimento', () => {
  it('ler pede distribuicao-config.ver; mudar pede distribuicao-config.editar (quem edita a grade)', () => {
    const p = ExcecoesRecebimentoController.prototype;
    expect(reflector.get(PATH_METADATA, ExcecoesRecebimentoController)).toBe(
      'distribuicao/recebimento/excecoes',
    );
    expect(exigidas(p.listar)).toEqual(['distribuicao-config.ver']);
    for (const m of [p.criar, p.editar, p.encerrar, p.excluir])
      expect(exigidas(m)).toEqual(['distribuicao-config.editar']);
  });

  it('a frente vai e volta como especialidadeId/modalidadeId e a regra no formato da tela', async () => {
    const { c, casos } = montar();
    expect(await c.listar()).toEqual([
      {
        id: 'x1',
        turnoId: 't-lista',
        especialidadeId: 'neuro',
        modalidadeId: null,
        prioridadeOperacaoId: null,
        regra: { tipo: 'prazo_minimo', horas: 12 },
        de: '2026-11-25',
        ate: '2026-12-22',
        criadoEm: criadoEm.toISOString(),
        situacao: 'vigente',
        podeExcluir: true,
        empatesIds: [],
      },
    ]);
    const corpo = {
      turnoId: 't-lista',
      especialidadeId: null,
      modalidadeId: 'ct',
      prioridadeOperacaoId: 'op-rot',
      regra: { tipo: 'segue_sla' as const, horas: null },
      de: '2026-11-25',
      ate: '2026-12-22',
    };
    expect(await c.criar(ator, corpo)).toEqual({ id: 'x9' });
    expect(casos.criar.executar).toHaveBeenCalledWith(quem, {
      turnoId: 't-lista',
      frente: { tipo: 'modalidade', especialidadeId: null, modalidadeId: 'ct' },
      prioridadeOperacaoId: 'op-rot',
      regra: { tipo: 'segue_sla' },
      de: '2026-11-25',
      ate: '2026-12-22',
    });
    await c.editar(ator, 'x1', { ...corpo, modalidadeId: null });
    expect(casos.editar.executar).toHaveBeenCalledWith(
      quem,
      'x1',
      expect.objectContaining({ frente: null }),
    );
    expect(() => c.criar(ator, { ...corpo, especialidadeId: 'neuro' })).toThrow(
      ConfiguracaoInvalidaError,
    );
  });

  it('encerrar e excluir em nome de quem está logado', async () => {
    const { c, casos } = montar();
    await c.encerrar(ator, 'x1');
    await c.excluir(ator, 'x1');
    expect(casos.encerrar.executar).toHaveBeenCalledWith(quem, 'x1');
    expect(casos.excluir.executar).toHaveBeenCalledWith(quem, 'x1');
  });
});
