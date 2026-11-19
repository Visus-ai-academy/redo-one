import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type * as Casos from '../../application/use-cases/prioridades-operacao';
import { ConfiguracaoInvalidaError } from '../../domain/validacao';
import {
  GradeRecebimentoController,
  PrioridadesOperacaoController,
} from './prioridades-operacao.controller';

const ator = { tipo: 'usuario', usuarioId: 'u1' } as PrincipalUsuario;
const quem = { tipo: 'usuario', id: 'u1' };
const reflector = new Reflector();
const exigidas = (alvo: object) => reflector.get(PERMISSOES_EXIGIDAS, alvo as never);
const caso = <T>(executar: (...a: never[]) => unknown) => ({ executar: vi.fn(executar) }) as T;

const AMBULATORIO = {
  id: 'op2',
  nome: 'AMBULATÓRIO',
  posicao: 2,
  urgencia: { tipo: 'prazo' as const, horas: 24 },
  furaGradeNaAlocacao: true,
  padrao: false,
  grafias: ['Ambulatório'],
  cor: '#5677B8',
};

describe('controller das prioridades da operação', () => {
  it('ler pede distribuicao-config.ver; criar, editar e excluir pedem distribuicao-config.editar', () => {
    const p = PrioridadesOperacaoController.prototype;
    expect(reflector.get(PATH_METADATA, PrioridadesOperacaoController)).toBe(
      'distribuicao/prioridades-operacao',
    );
    expect(exigidas(p.listar)).toEqual(['distribuicao-config.ver']);
    for (const m of [p.criar, p.editar, p.excluir])
      expect(exigidas(m)).toEqual(['distribuicao-config.editar']);
    const g = GradeRecebimentoController.prototype;
    expect(reflector.get(PATH_METADATA, GradeRecebimentoController)).toBe(
      'distribuicao/recebimento',
    );
    expect(exigidas(g.obter)).toEqual(['distribuicao-config.ver']);
    expect(exigidas(g.salvar)).toEqual(['distribuicao-config.editar']);
  });

  it('a urgência vai e volta no formato da tela (horas só no prazo)', async () => {
    const criar = caso<Casos.CriarPrioridadeOperacao>(async () => 'op9');
    const editar = caso<Casos.EditarPrioridadeOperacao>(async () => undefined);
    const c = new PrioridadesOperacaoController(
      caso<Casos.ListarPrioridadesOperacao>(async () => [AMBULATORIO]),
      criar,
      editar,
      caso<Casos.ExcluirPrioridadeOperacao>(async () => undefined),
    );
    const dto = { ...AMBULATORIO, urgencia: { tipo: 'prazo' as const, horas: 24 } };
    expect(await c.listar()).toEqual([dto]);
    const { id: _, ...edicao } = dto;
    expect(await c.criar(ator, { ...edicao, urgencia: { tipo: 'nunca', horas: null } })).toEqual({
      id: 'op9',
    });
    expect(criar.executar).toHaveBeenCalledWith(quem, {
      ...edicao,
      urgencia: { tipo: 'nunca' },
    });
    await c.editar(ator, 'op2', edicao);
    expect(editar.executar).toHaveBeenCalledWith(quem, 'op2', AMBULATORIO_SEM_ID);
    expect(() => c.criar(ator, { ...edicao, urgencia: { tipo: 'prazo', horas: null } })).toThrow(
      ConfiguracaoInvalidaError,
    );
  });

  it('a grade vai e volta e grava em nome de quem está logado', async () => {
    const celula = {
      prioridadeOperacaoId: 'op2',
      turnoId: 't',
      regra: { tipo: 'prazo_minimo' as const, horas: 24 },
    };
    const definir = caso<Casos.DefinirGradeRecebimento>(async () => undefined);
    const c = new GradeRecebimentoController(
      caso<Casos.ObterGradeRecebimento>(async () => [celula]),
      definir,
    );
    expect(await c.obter()).toEqual({ celulas: [celula] });
    await c.salvar(ator, {
      celulas: [{ ...celula, regra: { tipo: 'nao_recebe', horas: null } }],
    });
    expect(definir.executar).toHaveBeenCalledWith(quem, [
      { ...celula, regra: { tipo: 'nao_recebe' } },
    ]);
  });
});

const { id: _id, ...AMBULATORIO_SEM_ID } = AMBULATORIO;
