import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import { ContasPagarTitulosController, criarTitulosController } from './titulos.controller';

const reflector = new Reflector();
const exigidas = (alvo: unknown) => reflector.get(PERMISSOES_EXIGIDAS, alvo as never);
const ator = { tipo: 'usuario', usuarioId: 'u1' } as PrincipalUsuario;

type Rotas = Record<
  | 'listar'
  | 'listarFavorecidos'
  | 'obter'
  | 'criar'
  | 'atualizar'
  | 'prorrogar'
  | 'baixar'
  | 'estornar'
  | 'cancelar',
  (...args: unknown[]) => unknown
>;

describe('controller dos títulos', () => {
  it('cada rota pede a permissão da sua ação na tela do tipo, com operationId próprio', () => {
    const p = ContasPagarTitulosController.prototype as Rotas;
    expect(ContasPagarTitulosController.name).toBe('ContasPagarTitulosController');
    expect(reflector.get(PATH_METADATA, ContasPagarTitulosController)).toBe(
      'financeiro/contas-pagar',
    );
    expect(exigidas(p.listar)).toEqual(['contas-pagar.ver']);
    expect(exigidas(p.listarFavorecidos)).toEqual(['contas-pagar.ver']);
    expect(exigidas(p.obter)).toEqual(['contas-pagar.ver']);
    expect(exigidas(p.criar)).toEqual(['contas-pagar.criar']);
    expect(exigidas(p.atualizar)).toEqual(['contas-pagar.editar']);
    expect(exigidas(p.prorrogar)).toEqual(['contas-pagar.editar']);
    expect(exigidas(p.baixar)).toEqual(['contas-pagar.baixar']);
    expect(exigidas(p.estornar)).toEqual(['contas-pagar.estornar']);
    expect(exigidas(p.cancelar)).toEqual(['contas-pagar.cancelar']);
    expect(reflector.get('swagger/apiOperation', p.listar as never)).toMatchObject({
      operationId: 'ContasPagarTitulosController_listar',
    });
  });

  it('o outro tipo tem as suas rotas e permissões', () => {
    const Receber = criarTitulosController('receber');
    expect(reflector.get(PATH_METADATA, Receber)).toBe('financeiro/contas-receber');
    expect(exigidas((Receber.prototype as Rotas).baixar)).toEqual(['contas-receber.baixar']);
  });

  it('"todas" é escolha explícita; o tipo vem da rota e a escrita é de quem está logado', async () => {
    const consultar = {
      listar: vi.fn(async () => ({ itens: [], total: 0, totais: {} })),
      obter: vi.fn(),
    };
    const salvar = { criar: vi.fn(async () => 't1'), atualizar: vi.fn(), prorrogar: vi.fn() };
    const baixas = { baixar: vi.fn(async () => 'b1'), estornar: vi.fn() };
    const cancelar = { executar: vi.fn() };
    const Controller = ContasPagarTitulosController as unknown as new (...deps: unknown[]) => Rotas;
    const c = new Controller(consultar, salvar, baixas, cancelar, { listar: vi.fn() });

    await c.listar({
      empresa: 'todas',
      situacao: 'em_aberto',
      origem: 'todas',
      categoria: 'c1',
      favorecidoTipo: 'fornecedor',
      favorecidoId: 'f1',
      pagina: 2,
      porPagina: 10,
    });
    expect(consultar.listar).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'pagar',
        empresa: 'todas',
        categoria: { id: 'c1' },
        favorecido: { tipo: 'fornecedor', id: 'f1' },
        pagina: 2,
      }),
    );
    expect(await c.criar(ator, {})).toEqual({ id: 't1' });
    expect(salvar.criar).toHaveBeenCalledWith('pagar', { usuarioId: 'u1' }, {});
    expect(await c.baixar(ator, 't1', {})).toEqual({ id: 'b1' });
    await c.estornar(ator, 't1', 'b1', { motivo: 'm' });
    expect(baixas.estornar).toHaveBeenCalledWith('pagar', { usuarioId: 'u1' }, 't1', 'b1', 'm');
    await c.prorrogar(ator, 't1', { vencimento: '2026-12-01', motivo: 'm' });
    expect(salvar.prorrogar).toHaveBeenCalledWith(
      'pagar',
      { usuarioId: 'u1' },
      't1',
      '2026-12-01',
      'm',
    );
    await c.cancelar(ator, 't1', { motivo: 'm' });
    expect(cancelar.executar).toHaveBeenCalledWith('pagar', { usuarioId: 'u1' }, 't1', 'm');
  });
});
