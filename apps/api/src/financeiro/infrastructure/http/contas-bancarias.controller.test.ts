import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type {
  ConsultarContasBancarias,
  ExcluirContaBancaria,
  ListarEmpresas,
  SalvarContaBancaria,
} from '../../application/use-cases/contas-bancarias';
import {
  ContasBancariasController,
  EmpresasFinanceiroController,
} from './contas-bancarias.controller';

const reflector = new Reflector();
const exigidas = (alvo: object) => reflector.get(PERMISSOES_EXIGIDAS, alvo as never);
const ator = { tipo: 'usuario', usuarioId: 'u1' } as PrincipalUsuario;

describe('controller das contas bancárias', () => {
  it('cada rota pede a permissão da sua ação em contas-bancarias', () => {
    const p = ContasBancariasController.prototype;
    expect(reflector.get(PATH_METADATA, ContasBancariasController)).toBe(
      'financeiro/contas-bancarias',
    );
    expect(exigidas(p.listar)).toEqual(['contas-bancarias.ver']);
    expect(exigidas(p.obter)).toEqual(['contas-bancarias.ver']);
    expect(exigidas(p.criar)).toEqual(['contas-bancarias.criar']);
    expect(exigidas(p.atualizar)).toEqual(['contas-bancarias.editar']);
    expect(exigidas(p.excluir)).toEqual(['contas-bancarias.excluir']);
    expect(reflector.get(PATH_METADATA, EmpresasFinanceiroController)).toBe('financeiro/empresas');
    expect(exigidas(EmpresasFinanceiroController.prototype.listar)).toEqual([
      'contas-bancarias.ver',
    ]);
  });

  it('"todas" as empresas é escolha explícita; uma empresa vira o filtro por id', async () => {
    const consultar = { listar: vi.fn(async () => ({ itens: [], total: 0 })) };
    const salvar = { criar: vi.fn(async () => 'c1'), atualizar: vi.fn(async () => undefined) };
    const c = new ContasBancariasController(
      consultar as unknown as ConsultarContasBancarias,
      salvar as unknown as SalvarContaBancaria,
      {} as ExcluirContaBancaria,
    );

    await c.listar({ empresa: 'todas', situacao: 'todas', pagina: 1, porPagina: 25 });
    await c.listar({ empresa: 'e1', situacao: 'ativas', busca: 'itaú', pagina: 2, porPagina: 10 });
    expect(consultar.listar.mock.calls).toEqual([
      [{ empresa: 'todas', situacao: 'todas', busca: undefined, pagina: 1, porPagina: 25 }],
      [{ empresa: { id: 'e1' }, situacao: 'ativas', busca: 'itaú', pagina: 2, porPagina: 10 }],
    ]);
    const corpo = {} as never;
    expect(await c.criar(ator, corpo)).toEqual({ id: 'c1' });
    expect(salvar.criar).toHaveBeenCalledWith({ usuarioId: 'u1' }, corpo);
  });

  it('empresas: as que usam o financeiro', async () => {
    const listar = { executar: vi.fn(async () => [{ id: 'e1', nome: 'TeleImagem' }]) };
    expect(
      await new EmpresasFinanceiroController(listar as unknown as ListarEmpresas).listar(),
    ).toEqual([{ id: 'e1', nome: 'TeleImagem' }]);
  });
});
