import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import {
  ContasPagarRecorrenciasController,
  ContasReceberRecorrenciasController,
} from './recorrencias.controller';

const reflector = new Reflector();
const exigidas = (alvo: unknown) => reflector.get(PERMISSOES_EXIGIDAS, alvo as never);
const ator = { tipo: 'usuario', usuarioId: 'u1' } as PrincipalUsuario;
const METODOS = [
  'listar',
  'obter',
  'previa',
  'criar',
  'gerarProximo',
  'ajustaveis',
  'atualizar',
  'pausar',
  'retomar',
  'encerrar',
] as const;
type Rotas = Record<(typeof METODOS)[number], (...args: unknown[]) => unknown>;

describe('controller das recorrências', () => {
  it('criar e gerar o próximo pedem criar; editar, pausar e retomar pedem editar; encerrar pede cancelar', () => {
    const p = ContasPagarRecorrenciasController.prototype as Rotas;
    expect(reflector.get(PATH_METADATA, ContasPagarRecorrenciasController)).toBe(
      'financeiro/contas-pagar/recorrencias',
    );
    expect(METODOS.map((m) => exigidas(p[m]))).toEqual([
      ['contas-pagar.ver'],
      ['contas-pagar.ver'],
      ['contas-pagar.criar'],
      ['contas-pagar.criar'],
      ['contas-pagar.criar'],
      ['contas-pagar.editar'],
      ['contas-pagar.editar'],
      ['contas-pagar.editar'],
      ['contas-pagar.editar'],
      ['contas-pagar.cancelar'],
    ]);
    expect(exigidas((ContasReceberRecorrenciasController.prototype as Rotas).encerrar)).toEqual([
      'contas-receber.cancelar',
    ]);
  });

  it('"todas" é explícito e a edição separa o "vale para os gerados"', async () => {
    const consultar = { listar: vi.fn(async () => ({ itens: [], total: 0 })) };
    const salvar = { atualizar: vi.fn(async () => ({ titulosAtualizados: 2 })) };
    const Controller = ContasPagarRecorrenciasController as unknown as new (
      ...deps: unknown[]
    ) => Rotas;
    const c = new Controller(consultar, salvar, {});
    await c.listar({
      empresa: 'todas',
      situacao: 'ativa',
      frequencia: 'todas',
      pagina: 1,
      porPagina: 25,
    });
    expect(consultar.listar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'pagar', empresa: 'todas', situacao: 'ativa' }),
    );
    await c.atualizar(ator, 'r1', { aplicarAosGerados: true, descricao: 'x' });
    expect(salvar.atualizar).toHaveBeenCalledWith(
      'pagar',
      { usuarioId: 'u1' },
      'r1',
      { descricao: 'x' },
      true,
    );
  });
});
