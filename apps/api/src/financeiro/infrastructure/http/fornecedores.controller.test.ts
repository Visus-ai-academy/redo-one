import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type {
  ConsultarFornecedores,
  ExcluirFornecedor,
  SalvarFornecedor,
} from '../../application/use-cases/fornecedores';
import { FornecedoresController } from './fornecedores.controller';

const reflector = new Reflector();
const exigidas = (alvo: object) => reflector.get(PERMISSOES_EXIGIDAS, alvo as never);
const ator = { tipo: 'usuario', usuarioId: 'u1' } as PrincipalUsuario;

describe('controller dos fornecedores', () => {
  it('cada rota pede a permissão da sua ação em fornecedores', () => {
    const p = FornecedoresController.prototype;
    expect(reflector.get(PATH_METADATA, FornecedoresController)).toBe('financeiro/fornecedores');
    expect(exigidas(p.listar)).toEqual(['fornecedores.ver']);
    expect(exigidas(p.obter)).toEqual(['fornecedores.ver']);
    expect(exigidas(p.criar)).toEqual(['fornecedores.criar']);
    expect(exigidas(p.atualizar)).toEqual(['fornecedores.editar']);
    expect(exigidas(p.excluir)).toEqual(['fornecedores.excluir']);
  });

  it('"todas" as categorias é escolha explícita; grava em nome de quem está logado', async () => {
    const consultar = { listar: vi.fn(async () => ({ itens: [], total: 0 })) };
    const salvar = { criar: vi.fn(async () => 'f1'), atualizar: vi.fn(async () => undefined) };
    const excluir = { executar: vi.fn(async () => undefined) };
    const c = new FornecedoresController(
      consultar as unknown as ConsultarFornecedores,
      salvar as unknown as SalvarFornecedor,
      excluir as unknown as ExcluirFornecedor,
    );

    await c.listar({ categoria: 'todas', situacao: 'ativas', pagina: 1, porPagina: 25 });
    await c.listar({ categoria: 'c1', situacao: 'todas', busca: 'x', pagina: 1, porPagina: 25 });
    expect(consultar.listar.mock.calls).toEqual([
      [{ categoria: 'todas', situacao: 'ativas', busca: undefined, pagina: 1, porPagina: 25 }],
      [{ categoria: { id: 'c1' }, situacao: 'todas', busca: 'x', pagina: 1, porPagina: 25 }],
    ]);
    const corpo = {} as never;
    expect(await c.criar(ator, corpo)).toEqual({ id: 'f1' });
    await c.atualizar(ator, 'f1', corpo);
    expect(salvar.atualizar).toHaveBeenCalledWith({ usuarioId: 'u1' }, 'f1', corpo);
    await c.excluir(ator, 'f1');
    expect(excluir.executar).toHaveBeenCalledWith({ usuarioId: 'u1' }, 'f1');
  });
});
