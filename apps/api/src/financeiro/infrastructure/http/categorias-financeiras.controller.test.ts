import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type {
  ConsultarCategorias,
  ExcluirCategoria,
  SalvarCategoria,
} from '../../application/use-cases/categorias';
import { CategoriasFinanceirasController } from './categorias-financeiras.controller';

const reflector = new Reflector();
const exigidas = (alvo: object) => reflector.get(PERMISSOES_EXIGIDAS, alvo as never);
const ator = { tipo: 'usuario', usuarioId: 'u1' } as PrincipalUsuario;

describe('controller das categorias financeiras', () => {
  it('cada rota pede a permissão da sua ação em categorias-financeiras', () => {
    const p = CategoriasFinanceirasController.prototype;
    expect(reflector.get(PATH_METADATA, CategoriasFinanceirasController)).toBe(
      'financeiro/categorias',
    );
    expect(exigidas(p.listar)).toEqual(['categorias-financeiras.ver']);
    expect(exigidas(p.opcoes)).toEqual(['categorias-financeiras.ver']);
    expect(exigidas(p.obter)).toEqual(['categorias-financeiras.ver']);
    expect(exigidas(p.criar)).toEqual(['categorias-financeiras.criar']);
    expect(exigidas(p.atualizar)).toEqual(['categorias-financeiras.editar']);
    expect(exigidas(p.excluir)).toEqual(['categorias-financeiras.excluir']);
  });

  it('lista com a página pedida e grava em nome de quem está logado', async () => {
    const consultar = { listar: vi.fn(async () => ({ itens: [], total: 0 })) };
    const salvar = { criar: vi.fn(async () => 'c1'), atualizar: vi.fn(async () => undefined) };
    const excluir = { executar: vi.fn(async () => undefined) };
    const c = new CategoriasFinanceirasController(
      consultar as unknown as ConsultarCategorias,
      salvar as unknown as SalvarCategoria,
      excluir as unknown as ExcluirCategoria,
    );

    expect(
      await c.listar({ tipo: 'despesa', situacao: 'todas', pagina: 2, porPagina: 10 }),
    ).toEqual({ itens: [], total: 0, pagina: 2, porPagina: 10 });
    expect(consultar.listar).toHaveBeenCalledWith({
      tipo: 'despesa',
      situacao: 'todas',
      busca: undefined,
      pagina: 2,
      porPagina: 10,
    });

    const corpo = {
      tipo: 'despesa' as const,
      nome: 'A',
      paiId: null,
      codigoContabil: null,
      ativa: true,
    };
    expect(await c.criar(ator, corpo)).toEqual({ id: 'c1' });
    expect(salvar.criar).toHaveBeenCalledWith({ usuarioId: 'u1' }, corpo);
    await c.atualizar(ator, 'c1', corpo);
    expect(salvar.atualizar).toHaveBeenCalledWith({ usuarioId: 'u1' }, 'c1', corpo);
    await c.excluir(ator, 'c1');
    expect(excluir.executar).toHaveBeenCalledWith({ usuarioId: 'u1' }, 'c1');
  });
});
